"""M06 Copilot tests — both modes.

Mode 1 (deterministic) runs against the real dev DB with no API key.
Mode 2 (LLM) is exercised by monkeypatching the provider call — no network,
no key required, per the milestone rule that development never depends on
an Anthropic key.
"""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import copilot_service

client = TestClient(app, raise_server_exceptions=False)
V1 = "/api/v1"
PW = "Demo@1234"

USERS = {
    "ministry": "ministry@mplads.demo",
    "district": "district.pune@mplads.demo",
}


@pytest.fixture(scope="module")
def tokens():
    out = {}
    for role, email in USERS.items():
        r = client.post(f"{V1}/auth/login", json={"email": email, "password": PW})
        assert r.status_code == 200
        out[role] = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return out


@pytest.fixture(scope="module")
def case(tokens):
    q = client.get(f"{V1}/investigations/queue",
                   params={"page_size": 10, "has_open_case": False},
                   headers=tokens["ministry"]).json()
    item = q["items"][0]
    r = client.post(f"{V1}/investigations", json={
        "project_id": item["project_id"],
        "reason": "Copilot test case opened from the queue."}, headers=tokens["ministry"])
    assert r.status_code == 201, r.text
    body = r.json()
    yield body
    client.post(f"{V1}/investigations/{body['id']}/transition", json={
        "to_status": "dismissed", "reason": "Copilot test cleanup dismissal.",
        "outcome": "inconclusive", "outcome_note": "Test case only."},
        headers=tokens["ministry"])


def _fake_settings(key="", groq_key=""):
    return SimpleNamespace(anthropic_api_key=key, anthropic_model="claude-test",
                           groq_api_key=groq_key, groq_model="groq-test",
                           copilot_timeout_seconds=1.0)


# ── scenario 1: no API key -> deterministic fallback ──────────────────────
def test_status_reports_deterministic_without_key(tokens, monkeypatch):
    monkeypatch.setattr(copilot_service, "get_settings", lambda: _fake_settings(""))
    r = client.get(f"{V1}/copilot/status", headers=tokens["ministry"])
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "deterministic" and body["key_configured"] is False
    assert body["retrieval_method"] in ("vector", "lexical")
    assert "decision-support" in body["disclaimer"]


def test_ask_deterministic_grounded(tokens, case, monkeypatch):
    monkeypatch.setattr(copilot_service, "get_settings", lambda: _fake_settings(""))
    r = client.post(f"{V1}/investigations/{case['id']}/copilot/ask",
                    json={"question": "Why is this project risky?"},
                    headers=tokens["ministry"])
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "deterministic"
    assert body["citations"], "deterministic answers must cite evidence"
    # every citation resolves to a real fact/guideline provided in context
    from app.database.session import SessionLocal
    from app.models import User as UserModel
    db = SessionLocal()
    try:
        user = db.query(UserModel).filter_by(email=USERS["ministry"]).one()
        ctx = copilot_service.build_context(db, user, case["id"])
        guidelines, _ = copilot_service.retrieve_guidelines(db, "Why is this project risky?")
        valid = ctx["source_refs"] | {g["source_ref"] for g in guidelines}
        assert {c["source_ref"] for c in body["citations"]} <= valid
    finally:
        db.close()
    assert "decision-support" in body["disclaimer"]
    assert "risk" in body["answer"].lower()


def test_copilot_denied_roles(tokens, case):
    invalid_headers = {"Authorization": "Bearer invalid_token_xyz"}
    r = client.post(f"{V1}/investigations/{case['id']}/copilot/ask",
                    json={"question": "why risky"}, headers=invalid_headers)
    assert r.status_code == 401


def test_copilot_scope(tokens, case):
    if case["district"] != "Pune":
        r = client.post(f"{V1}/investigations/{case['id']}/copilot/ask",
                        json={"question": "why risky"}, headers=tokens["district"])
        assert r.status_code == 403


def test_context_never_contains_ground_truth(tokens, case):
    """The ledger must be structurally unreachable from the Copilot."""
    import json as _json

    from app.database.session import SessionLocal
    from app.models import User as UserModel
    db = SessionLocal()
    try:
        user = db.query(UserModel).filter_by(email=USERS["ministry"]).one()
        ctx = copilot_service.build_context(db, user, case["id"])
        serialized = _json.dumps(ctx["facts"], default=str).lower()
        assert "ground_truth" not in serialized
        assert "anomaly_ground_truth" not in serialized
        assert "injected" not in serialized
        # source refs only point at approved tables
        allowed_prefixes = ("project:", "risk_assessments:", "risk_factors:",
                            "anomaly_results:", "reconciliation_results:",
                            "duplicate_candidates:", "network_signals:",
                            "alerts:", "investigations:")
        assert all(r.startswith(allowed_prefixes) for r in ctx["source_refs"])
    finally:
        db.close()


def test_copilot_query_logged(tokens, case):
    acts = client.get(f"{V1}/investigations/{case['id']}/actions",
                      params={"page_size": 200}, headers=tokens["ministry"]).json()
    logged = [a for a in acts["items"] if a["action_type"] == "copilot_queried"]
    assert logged
    assert all(a["detail"].get("qa_sha256") for a in logged)


# ── scenario 2: key configured -> provider path ───────────────────────────
def test_llm_path_used_when_configured(tokens, case, monkeypatch):
    monkeypatch.setattr(copilot_service, "get_settings", lambda: _fake_settings("test-key"))
    monkeypatch.setattr(copilot_service, "_llm_available", lambda: True)

    def fake_llm(question, ctx, guidelines):
        ref = next(iter(ctx["source_refs"]))
        return {"answer": "This project shows risk indicators that require review.",
                "citations": [{"source_ref": ref}], "cannot_answer": False}

    monkeypatch.setattr(copilot_service, "_ask_llm", fake_llm)
    r = client.post(f"{V1}/investigations/{case['id']}/copilot/ask",
                    json={"question": "Summarize the risk."}, headers=tokens["ministry"])
    body = r.json()
    assert r.status_code == 200
    assert body["mode"] == "llm" and body["model_version"] == "anthropic:claude-test"
    assert body["fallback_reason"] is None


# ── scenario 3: provider failure -> deterministic fallback ────────────────
def test_provider_failure_falls_back(tokens, case, monkeypatch):
    monkeypatch.setattr(copilot_service, "get_settings", lambda: _fake_settings("test-key"))
    monkeypatch.setattr(copilot_service, "_llm_available", lambda: True)

    def boom(question, ctx, guidelines):
        raise TimeoutError("provider timeout")

    monkeypatch.setattr(copilot_service, "_ask_llm", boom)
    r = client.post(f"{V1}/investigations/{case['id']}/copilot/ask",
                    json={"question": "Why is this project risky?"},
                    headers=tokens["ministry"])
    body = r.json()
    assert r.status_code == 200
    assert body["mode"] == "deterministic"
    assert body["fallback_reason"] == "TimeoutError"
    assert body["citations"]  # still a full evidence-based answer


# ── scenario 4: malformed LLM output -> safe fallback ─────────────────────
def test_malformed_output_falls_back(tokens, case, monkeypatch):
    monkeypatch.setattr(copilot_service, "get_settings", lambda: _fake_settings("test-key"))
    monkeypatch.setattr(copilot_service, "_llm_available", lambda: True)

    def malformed(question, ctx, guidelines):
        raise ValueError("malformed structured output")

    monkeypatch.setattr(copilot_service, "_ask_llm", malformed)
    r = client.post(f"{V1}/investigations/{case['id']}/copilot/ask",
                    json={"question": "Why is this project risky?"},
                    headers=tokens["ministry"])
    assert r.json()["mode"] == "deterministic"
    assert r.json()["fallback_reason"] == "ValueError"


# ── scenario 5: unsupported claim -> validation failure -> fallback ───────
def test_unverifiable_citation_rejected(tokens, case, monkeypatch):
    monkeypatch.setattr(copilot_service, "get_settings", lambda: _fake_settings("test-key"))
    monkeypatch.setattr(copilot_service, "_llm_available", lambda: True)

    def hallucinating(question, ctx, guidelines):
        return {"answer": "Project X-999 spent twice its sanction.",
                "citations": [{"source_ref": "projects:999999999"}],
                "cannot_answer": False}

    monkeypatch.setattr(copilot_service, "_ask_llm", hallucinating)
    r = client.post(f"{V1}/investigations/{case['id']}/copilot/ask",
                    json={"question": "Anything unusual?"}, headers=tokens["ministry"])
    body = r.json()
    assert body["mode"] == "deterministic"
    assert "unverifiable citation" in body["fallback_reason"]


def test_guilt_vocabulary_rejected(tokens, case, monkeypatch):
    monkeypatch.setattr(copilot_service, "get_settings", lambda: _fake_settings("test-key"))
    monkeypatch.setattr(copilot_service, "_llm_available", lambda: True)

    def guilty(question, ctx, guidelines):
        ref = next(iter(ctx["source_refs"]))
        return {"answer": "The vendor committed fraud on this project.",
                "citations": [{"source_ref": ref}], "cannot_answer": False}

    monkeypatch.setattr(copilot_service, "_ask_llm", guilty)
    r = client.post(f"{V1}/investigations/{case['id']}/copilot/ask",
                    json={"question": "Is the vendor a problem?"}, headers=tokens["ministry"])
    body = r.json()
    assert body["mode"] == "deterministic"
    assert body["fallback_reason"] == "vocabulary violation"


# ── validation unit tests ─────────────────────────────────────────────────
def test_validate_answer_units():
    refs = {"risk_factors:1", "guideline:2"}
    ok, _ = copilot_service.validate_answer(
        {"answer": "Requires review. This is not a finding of fraud.",
         "citations": [{"source_ref": "risk_factors:1"}]}, refs)
    assert ok  # neutral mention of fraud in a disclaimer must pass
    ok, why = copilot_service.validate_answer(
        {"answer": "Fraud confirmed at this site.", "citations": []}, refs)
    assert not ok and why == "vocabulary violation"
    ok, why = copilot_service.validate_answer(
        {"answer": "Fine.", "citations": [{"source_ref": "users:1"}]}, refs)
    assert not ok and "unverifiable" in why
    ok, why = copilot_service.validate_answer({"answer": "  ", "citations": []}, refs)
    assert not ok


def test_retrieval_returns_relevant_guidelines(tokens):
    from app.database.session import SessionLocal
    db = SessionLocal()
    try:
        chunks, method = copilot_service.retrieve_guidelines(
            db, "How should duplicate funding of the same work be handled?")
        assert method in ("vector", "lexical")
        assert chunks
        assert any("duplicate" in c["excerpt"].lower() for c in chunks)
    finally:
        db.close()


def test_summary_draft_not_persisted(tokens, case):
    r = client.post(f"{V1}/investigations/{case['id']}/copilot/summary",
                    headers=tokens["ministry"])
    assert r.status_code == 200
    assert case["case_number"] in r.json()["answer"]
    detail = client.get(f"{V1}/investigations/{case['id']}",
                        headers=tokens["ministry"]).json()
    # drafting alone must not write the case summary
    assert detail["summary"] is None or "draft summary" not in detail["summary"]


# ── conversational intent routing (chatbot behavior) ──────────────────────
def test_classify_intent():
    ci = copilot_service.classify_intent
    assert ci("hi can i ask u somthing?") == "greeting"
    assert ci("Hello!") == "greeting"
    assert ci("what can you do") == "meta"
    assert ci("thanks a lot") == "thanks"
    assert ci("what is the time") == "other"
    assert ci("tell me a joke") == "other"
    # "this" must not trigger the greeting via a bare "hi" substring
    assert ci("Why is this project risky?") == "case"
    assert ci("Show the strongest evidence.") == "case"


def test_off_topic_gets_conversational_reply_no_llm(tokens, case, monkeypatch):
    monkeypatch.setattr(copilot_service, "get_settings",
                        lambda: _fake_settings("test-key"))
    monkeypatch.setattr(copilot_service, "_llm_available", lambda: True)

    def explode(*a, **k):
        raise AssertionError("LLM must not be called for off-topic questions")
    monkeypatch.setattr(copilot_service, "_ask_llm", explode)
    monkeypatch.setattr(copilot_service, "_ask_llm_groq", explode)

    r = client.post(f"{V1}/investigations/{case['id']}/copilot/ask",
                    json={"question": "what is the time"}, headers=tokens["ministry"])
    body = r.json()
    assert r.status_code == 200
    assert body["cannot_answer"] is True and body["citations"] == []
    assert "outside what I can help with" in body["answer"]
    # no evidence dump
    assert "risk_factors:" not in body["answer"]


def test_greeting_gets_conversational_reply(tokens, case, monkeypatch):
    monkeypatch.setattr(copilot_service, "get_settings", lambda: _fake_settings(""))
    r = client.post(f"{V1}/investigations/{case['id']}/copilot/ask",
                    json={"question": "hi can i ask u somthing?"},
                    headers=tokens["ministry"])
    body = r.json()
    assert r.status_code == 200
    assert "Sakshi" in body["answer"] and body["citations"] == []
    assert "risk_factors:" not in body["answer"]


def test_groq_provider_selected_and_used(tokens, case, monkeypatch):
    monkeypatch.setattr(copilot_service, "get_settings",
                        lambda: _fake_settings(key="", groq_key="groq-test-key"))

    def fake_groq(question, ctx, guidelines):
        ref = next(iter(ctx["source_refs"]))
        return {"answer": "Evidence-based reply requiring review.",
                "citations": [{"source_ref": ref}], "cannot_answer": False}
    monkeypatch.setattr(copilot_service, "_ask_llm_groq", fake_groq)

    r = client.post(f"{V1}/investigations/{case['id']}/copilot/ask",
                    json={"question": "Summarize the risk."}, headers=tokens["ministry"])
    body = r.json()
    assert r.status_code == 200
    assert body["mode"] == "llm" and body["model_version"] == "groq:groq-test"

    s = client.get(f"{V1}/copilot/status", headers=tokens["ministry"]).json()
    assert s["mode"] == "llm" and s["provider"] == "groq"
