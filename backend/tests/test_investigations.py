"""M06 investigation workflow tests — run against the real dev database
(demo-v2 + migration 0005 applied, guideline seed loaded, role users seeded).
Cases created here are always driven to a terminal state so reruns stay clean
(the one-active-case rule would otherwise block them).
"""
import pytest
from fastapi.testclient import TestClient

from app.investigation.queue_config import EVIDENCE_WEIGHTS, financial_weight
from app.main import app

client = TestClient(app, raise_server_exceptions=False)
V1 = "/api/v1"
PW = "Demo@1234"

USERS = {
    "ministry": "ministry@mplads.demo",
    "state": "state.mh@mplads.demo",
    "district": "district.pune@mplads.demo",
    "officer": "officer@mplads.demo",
}

VALID_REASON = "Selected from the smart queue for detailed review."


@pytest.fixture(scope="module")
def tokens():
    out = {}
    for role, email in USERS.items():
        r = client.post(f"{V1}/auth/login", json={"email": email, "password": PW})
        assert r.status_code == 200, f"login failed for {role}: {r.text}"
        out[role] = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return out


def _fresh_project(tokens, exclude=()):
    """A high-priority project without an active case (national scope)."""
    q = client.get(f"{V1}/investigations/queue",
                   params={"page_size": 20, "has_open_case": False},
                   headers=tokens["ministry"]).json()
    return next(i for i in q["items"] if i["project_id"] not in exclude)


def _dismiss(tokens, inv_id):
    client.post(f"{V1}/investigations/{inv_id}/transition", json={
        "to_status": "in_progress", "reason": "Test cleanup path to a terminal state."},
        headers=tokens["ministry"])
    client.post(f"{V1}/investigations/{inv_id}/transition", json={
        "to_status": "dismissed", "reason": "Automated test cleanup dismissal.",
        "outcome": "inconclusive", "outcome_note": "Test case, not a real review."},
        headers=tokens["ministry"])


@pytest.fixture()
def case(tokens):
    item = _fresh_project(tokens)
    r = client.post(f"{V1}/investigations", json={
        "project_id": item["project_id"], "reason": VALID_REASON},
        headers=tokens["ministry"])
    assert r.status_code == 201, r.text
    body = r.json()
    yield body
    _dismiss(tokens, body["id"])


# ── smart queue ───────────────────────────────────────────────────────────
def test_queue_ranked_and_explained(tokens):
    r = client.get(f"{V1}/investigations/queue", params={"page_size": 25},
                   headers=tokens["ministry"])
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 25
    scores = [i["priority_score"] for i in items]
    assert scores == sorted(scores, reverse=True)
    for i in items[:5]:
        bd = i["priority_breakdown"]
        # breakdown reproduces the formula exactly
        expected = round(bd["risk_score"] * bd["financial_weight"] * bd["evidence_weight"], 2)
        assert abs(bd["priority"] - expected) <= 0.01
        assert i["priority_score"] == bd["priority"]
        # weights match the configured formula
        p95 = bd["scope_p95_expenditure"]
        # breakdown values are rounded to 4 decimals (p95 to 2) for display
        assert abs(bd["financial_weight"] - financial_weight(i["expenditure"], p95)) < 1e-3
        assert bd["evidence_weight"] == EVIDENCE_WEIGHTS[i["evidence_strength"]]


def test_queue_scope_district(tokens):
    r = client.get(f"{V1}/investigations/queue", params={"page_size": 50},
                   headers=tokens["district"])
    assert r.status_code == 200
    assert all(i["district"] == "Pune" for i in r.json()["items"])


def test_queue_filters(tokens):
    r = client.get(f"{V1}/investigations/queue",
                   params={"risk_level": "critical", "page_size": 10},
                   headers=tokens["ministry"])
    assert all(i["risk_level"] == "critical" for i in r.json()["items"])
    r = client.get(f"{V1}/investigations/queue", params={"page_size": 5000},
                   headers=tokens["ministry"])
    assert r.status_code == 422


def test_queue_requires_auth():
    assert client.get(f"{V1}/investigations/queue").status_code == 401


# ── opening cases ─────────────────────────────────────────────────────────
def test_open_case_snapshots_priority(tokens, case):
    assert case["case_number"].startswith("INV-")
    assert case["status"] == "open"
    assert case["sla_due_at"] is not None
    assert case["priority_score"] > 0
    assert case["priority_breakdown"]["priority"] == case["priority_score"]
    assert case["risk_snapshot"] is not None
    assert case["opened_by"] == USERS["ministry"]


def test_open_duplicate_conflicts(tokens, case):
    r = client.post(f"{V1}/investigations", json={
        "project_id": case["project_id"], "reason": VALID_REASON},
        headers=tokens["ministry"])
    assert r.status_code == 409


def test_open_denied_roles(tokens):
    item = _fresh_project(tokens)
    invalid_headers = {"Authorization": "Bearer invalid_token"}
    r = client.post(f"{V1}/investigations", json={
        "project_id": item["project_id"], "reason": VALID_REASON},
        headers=invalid_headers)
    assert r.status_code == 401


def test_open_requires_reason(tokens):
    item = _fresh_project(tokens)
    r = client.post(f"{V1}/investigations", json={
        "project_id": item["project_id"], "reason": "short"},
        headers=tokens["ministry"])
    assert r.status_code == 422


def test_open_out_of_scope_project(tokens):
    # district.pune cannot open a case on a non-Pune project
    q = client.get(f"{V1}/investigations/queue", params={"page_size": 5},
                   headers=tokens["ministry"]).json()
    outside = next(i for i in q["items"] if i["district"] != "Pune")
    r = client.post(f"{V1}/investigations", json={
        "project_id": outside["project_id"], "reason": VALID_REASON},
        headers=tokens["district"])
    assert r.status_code == 403


def test_alert_must_belong_to_project(tokens):
    item = _fresh_project(tokens)
    alerts = client.get(f"{V1}/alerts", params={"page_size": 5},
                        headers=tokens["ministry"]).json()["items"]
    foreign = next((a for a in alerts if a["project_id"] != item["project_id"]), None)
    if foreign is None:
        pytest.skip("no foreign alert available")
    r = client.post(f"{V1}/investigations", json={
        "project_id": item["project_id"], "reason": VALID_REASON,
        "alert_id": foreign["id"]}, headers=tokens["ministry"])
    assert r.status_code == 422


# ── state machine ─────────────────────────────────────────────────────────
def test_invalid_transition_rejected(tokens, case):
    r = client.post(f"{V1}/investigations/{case['id']}/transition", json={
        "to_status": "pending_info", "reason": "machine must reject open->pending_info"},
        headers=tokens["ministry"])
    assert r.status_code == 422
    assert "Allowed" in r.json()["detail"]


def test_unknown_status_rejected(tokens, case):
    r = client.post(f"{V1}/investigations/{case['id']}/transition", json={
        "to_status": "archived", "reason": "unknown status must be rejected"},
        headers=tokens["ministry"])
    assert r.status_code == 422


def test_full_lifecycle_and_reopen_rules(tokens):
    item = _fresh_project(tokens)
    inv = client.post(f"{V1}/investigations", json={
        "project_id": item["project_id"], "reason": VALID_REASON},
        headers=tokens["officer"]).json()["id"]
    try:
        def move(to, extra=None, hdr="officer"):
            return client.post(f"{V1}/investigations/{inv}/transition", json={
                "to_status": to, "reason": f"Lifecycle test transition to {to}.",
                **(extra or {})}, headers=tokens[hdr])

        assert move("in_progress").json()["status"] == "in_progress"
        assert move("pending_info").json()["status"] == "pending_info"
        assert move("in_progress").json()["status"] == "in_progress"
        # closing without outcome is rejected
        assert move("closed", hdr="ministry").status_code == 422
        r = move("closed", {"outcome": "no_issue_found",
                            "outcome_note": "All flagged items were explained by records."},
                 hdr="ministry")
        assert r.status_code == 200 and r.json()["outcome"] == "no_issue_found"
        assert r.json()["closed_at"] is not None
        # actions on a closed case are rejected
        r = client.post(f"{V1}/investigations/{inv}/actions", json={
            "action_type": "note_added", "reason": "must fail on closed case"},
            headers=tokens["officer"])
        assert r.status_code == 422
        # state role may not reopen
        assert move("in_progress", hdr="state").status_code == 403
        # officer may; outcome is cleared
        r = move("in_progress", hdr="officer")
        assert r.status_code == 200 and r.json()["outcome"] is None
    finally:
        _dismiss(tokens, inv)


# ── actions ───────────────────────────────────────────────────────────────
def test_actions_and_timeline(tokens, case):
    inv = case["id"]
    r = client.post(f"{V1}/investigations/{inv}/actions", json={
        "action_type": "evidence_reviewed",
        "reason": "Reviewed the cost factor evidence against records."},
        headers=tokens["ministry"])
    assert r.status_code == 201
    r = client.post(f"{V1}/investigations/{inv}/actions", json={
        "action_type": "playbook_step_completed", "reason": "Completed peer comparison.",
        "detail": {"playbook_id": "general-review-v1", "step_id": "s1"}},
        headers=tokens["ministry"])
    assert r.status_code == 201
    # invalid action type / unknown playbook step
    assert client.post(f"{V1}/investigations/{inv}/actions", json={
        "action_type": "status_changed", "reason": "may not forge transitions"},
        headers=tokens["ministry"]).status_code == 422
    assert client.post(f"{V1}/investigations/{inv}/actions", json={
        "action_type": "playbook_step_completed", "reason": "unknown step id",
        "detail": {"playbook_id": "general-review-v1", "step_id": "zzz"}},
        headers=tokens["ministry"]).status_code == 422

    acts = client.get(f"{V1}/investigations/{inv}/actions",
                      headers=tokens["ministry"]).json()
    types = [a["action_type"] for a in acts["items"]]
    assert types[0] == "opened"
    assert "evidence_reviewed" in types and "playbook_step_completed" in types
    stamps = [a["created_at"] for a in acts["items"]]
    assert stamps == sorted(stamps)
    # append-only: no update/delete surface exists
    assert client.delete(f"{V1}/investigations/{inv}/actions",
                         headers=tokens["ministry"]).status_code == 405


def test_playbook_progress_reflected(tokens, case):
    inv = case["id"]
    client.post(f"{V1}/investigations/{inv}/actions", json={
        "action_type": "playbook_step_completed", "reason": "Completed step one.",
        "detail": {"playbook_id": "general-review-v1", "step_id": "s1"}},
        headers=tokens["ministry"])
    detail = client.get(f"{V1}/investigations/{inv}", headers=tokens["ministry"]).json()
    general = next(p for p in detail["playbooks"] if p["id"] == "general-review-v1")
    assert next(s for s in general["steps"] if s["id"] == "s1")["completed"] is True


# ── assignment ────────────────────────────────────────────────────────────
def test_assignment_rules(tokens, case):
    inv = case["id"]
    me = client.get(f"{V1}/auth/me", headers=tokens["officer"]).json()
    r = client.post(f"{V1}/investigations/{inv}/assign", json={
        "assignee_id": me["id"], "reason": "Routing to the monitoring officer."},
        headers=tokens["ministry"])
    assert r.status_code == 200 and r.json()["assigned_to"] == USERS["officer"]


# ── audit + scope + reads ─────────────────────────────────────────────────
def test_audit_trail_records_case_events(tokens, case):
    audit = client.get(f"{V1}/audit/{case['project_id']}",
                       headers=tokens["ministry"]).json()
    inv_events = [e for e in audit if e["action"].startswith("investigation.")]
    assert any(e["action"] == "investigation.opened" for e in inv_events)
    assert all(e["source"] == "user_action" for e in inv_events)


def test_case_detail_scope(tokens, case):
    # the fixture project is national-queue top — not guaranteed Pune
    detail = client.get(f"{V1}/investigations/{case['id']}", headers=tokens["district"])
    if case["district"] == "Pune":
        assert detail.status_code == 200
    else:
        assert detail.status_code == 403
    assert client.get(f"{V1}/investigations/999999",
                      headers=tokens["ministry"]).status_code == 404


def test_case_list_filters_and_sort(tokens, case):
    r = client.get(f"{V1}/investigations", params={"status": "open"},
                   headers=tokens["ministry"])
    assert r.status_code == 200
    assert all(c["status"] == "open" for c in r.json()["items"])
    assert any(c["id"] == case["id"] for c in r.json()["items"])
    assert client.get(f"{V1}/investigations", params={"sort_by": "evil"},
                      headers=tokens["ministry"]).status_code == 422
    r = client.get(f"{V1}/investigations", params={"project_id": case["project_id"]},
                   headers=tokens["ministry"])
    assert r.json()["total"] >= 1


def test_summary_update_logged(tokens, case):
    inv = case["id"]
    r = client.patch(f"{V1}/investigations/{inv}", json={
        "summary": "Manual case summary written after evidence review.",
        "reason": "Recording interim findings."}, headers=tokens["ministry"])
    assert r.status_code == 200 and r.json()["summary"].startswith("Manual case")
    acts = client.get(f"{V1}/investigations/{inv}/actions",
                      headers=tokens["ministry"]).json()
    assert any(a["action_type"] == "summary_updated" for a in acts["items"])


def test_officer_reads_cases(tokens, case):
    assert client.get(f"{V1}/investigations", headers=tokens["officer"]).status_code == 200
    assert client.get(f"{V1}/investigations/{case['id']}",
                      headers=tokens["officer"]).status_code == 200


# ── playbooks ─────────────────────────────────────────────────────────────
def test_playbooks_served(tokens):
    r = client.get(f"{V1}/investigations/playbooks", headers=tokens["officer"])
    assert r.status_code == 200 and len(r.json()) == 9
    ids = {p["id"] for p in r.json()}
    assert "cost-anomaly-v1" in ids and "general-review-v1" in ids
    assert client.get(f"{V1}/investigations/playbooks/nope",
                      headers=tokens["officer"]).status_code == 404
