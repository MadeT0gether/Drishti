"""Milestone 04 API tests — run against the real dev database (demo-v2 loaded)
and the seeded role users. Read-only except audit rows written by logins.
"""
import pytest
from fastapi.testclient import TestClient

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


@pytest.fixture(scope="module")
def tokens():
    out = {}
    for role, email in USERS.items():
        r = client.post(f"{V1}/auth/login", json={"email": email, "password": PW})
        assert r.status_code == 200, f"login failed for {role}: {r.text}"
        out[role] = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return out


@pytest.fixture(scope="module")
def ctx(tokens):
    """Discover representative ids through the API itself."""
    h = tokens["ministry"]
    top = client.get(f"{V1}/projects", params={"sort_by": "risk_score", "page_size": 5}, headers=h).json()
    risky = top["items"][0]
    pune = client.get(f"{V1}/projects", params={"search": "Pune", "page_size": 1}, headers=h)
    districts = client.get(f"{V1}/dashboard/districts", headers=h).json()
    pune_district = next(d for d in districts if d["district"] == "Pune")
    other_district = next(d for d in districts if d["district"] != "Pune")
    pune_project = client.get(f"{V1}/projects", params={
        "district_id": pune_district["district_id"], "page_size": 1}, headers=h).json()["items"][0]
    outside_project = client.get(f"{V1}/projects", params={
        "district_id": other_district["district_id"], "page_size": 1}, headers=h).json()["items"][0]
    alerts = client.get(f"{V1}/alerts", headers=h).json()
    return {
        "risky": risky, "pune_district": pune_district, "other_district": other_district,
        "pune_project": pune_project, "outside_project": outside_project,
        "alert": alerts["items"][0] if alerts["items"] else None,
    }


# ── auth ──────────────────────────────────────────────────────────────────
def test_login_wrong_password():
    r = client.post(f"{V1}/auth/login", json={"email": USERS["ministry"], "password": "nope"})
    assert r.status_code == 401


def test_missing_jwt_rejected():
    assert client.get(f"{V1}/projects").status_code == 401


def test_invalid_jwt_rejected():
    r = client.get(f"{V1}/projects", headers={"Authorization": "Bearer not.a.jwt"})
    assert r.status_code == 401


def test_me(tokens):
    r = client.get(f"{V1}/auth/me", headers=tokens["district"])
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "district"
    assert "password" not in str(body).lower()


# ── projects: list/filter/sort/search/detail ──────────────────────────────
def test_project_list_pagination(tokens):
    r = client.get(f"{V1}/projects", params={"page_size": 10, "page": 2}, headers=tokens["ministry"])
    body = r.json()
    assert r.status_code == 200 and len(body["items"]) == 10
    assert body["page"] == 2 and body["total"] > 20000 and body["total_pages"] > 2000


def test_page_size_capped(tokens):
    r = client.get(f"{V1}/projects", params={"page_size": 5000}, headers=tokens["ministry"])
    assert r.status_code == 422  # ge/le validation rejects over-limit


def test_sort_allowlist_rejects_arbitrary(tokens):
    r = client.get(f"{V1}/projects", params={"sort_by": "1;DROP TABLE projects"},
                   headers=tokens["ministry"])
    assert r.status_code == 422


def test_filter_and_sort(tokens):
    r = client.get(f"{V1}/projects", params={
        "status": "in_progress", "risk_level": "high", "sort_by": "expenditure",
        "sort_order": "desc", "page_size": 20}, headers=tokens["ministry"])
    body = r.json()
    assert r.status_code == 200
    exps = [i["expenditure"] for i in body["items"]]
    assert exps == sorted(exps, reverse=True)
    assert all(i["status"] == "in_progress" and i["risk_level"] == "high" for i in body["items"])


def test_search(tokens):
    r = client.get(f"{V1}/projects", params={"search": "community hall", "page_size": 5},
                   headers=tokens["ministry"])
    assert r.status_code == 200 and r.json()["total"] > 0


def test_project_detail(tokens, ctx):
    r = client.get(f"{V1}/projects/{ctx['risky']['id']}", headers=tokens["ministry"])
    assert r.status_code == 200
    body = r.json()
    for key in ("code", "title", "category", "state", "district", "agency",
                "sanctioned_cost", "physical_progress_pct", "location"):
        assert key in body
    assert "password" not in str(body)


def test_project_not_found(tokens):
    assert client.get(f"{V1}/projects/99999999", headers=tokens["ministry"]).status_code == 404


def test_categories_lookup(tokens):
    r = client.get(f"{V1}/projects/categories", headers=tokens["officer"])
    assert r.status_code == 200
    cats = r.json()
    assert len(cats) >= 1
    assert {"id", "name", "sector"} <= set(cats[0])
    names = [c["name"] for c in cats]
    assert names == sorted(names)


def test_categories_require_auth():
    assert client.get(f"{V1}/projects/categories").status_code == 401


def test_agencies_lookup(tokens):
    r = client.get(f"{V1}/projects/agencies", headers=tokens["officer"])
    assert r.status_code == 200
    ags = r.json()
    assert len(ags) >= 1
    assert {"id", "name", "type"} <= set(ags[0])
    names = [a["name"] for a in ags]
    assert names == sorted(names)


def test_agency_filter_narrows_and_matches(tokens):
    h = tokens["ministry"]
    total_all = client.get(f"{V1}/projects", params={"page_size": 1}, headers=h).json()["total"]
    agency = client.get(f"{V1}/projects/agencies", headers=h).json()[0]
    r = client.get(f"{V1}/projects", params={"agency_id": agency["id"], "page_size": 5},
                   headers=h)
    body = r.json()
    assert r.status_code == 200 and 0 < body["total"] < total_all
    detail = client.get(f"{V1}/projects/{body['items'][0]['id']}", headers=h).json()
    assert detail["agency"] == agency["name"]


def test_export_csv_datasets(tokens):
    for dataset, first_col in [("completed-works", "project_code"),
                               ("recommended-works", "project_code"),
                               ("expenditures", "project_code"),
                               ("mp-summary", "mp_name")]:
        r = client.get(f"{V1}/data/export/{dataset}", headers=tokens["officer"])
        assert r.status_code == 200, dataset
        assert r.headers["content-type"].startswith("text/csv")
        assert "attachment" in r.headers["content-disposition"]
        header = r.text.splitlines()[0]
        assert header.startswith(first_col), dataset
        # public-safe: never a risk/anomaly/investigation column
        assert "risk" not in header and "anomal" not in header
        assert len(r.text.splitlines()) > 1, f"{dataset} exported no rows"


def test_export_current_json(tokens):
    r = client.get(f"{V1}/data/export/current", headers=tokens["officer"])
    assert r.status_code == 200
    snap = r.json()
    assert snap["total_projects"] > 0
    assert set(snap["status_counts"]) <= {"recommended", "sanctioned", "in_progress",
                                          "completed", "cancelled"}
    assert "risk" not in str(snap.keys())
    assert len(snap["states"]) >= 1


def test_export_unknown_dataset_404(tokens):
    assert client.get(f"{V1}/data/export/nope", headers=tokens["officer"]).status_code == 404


def test_export_requires_auth():
    assert client.get(f"{V1}/data/export/completed-works").status_code == 401


def test_export_respects_scope(tokens):
    """A district-scoped user's export contains only their district."""
    r = client.get(f"{V1}/data/export/expenditures", headers=tokens["district"])
    assert r.status_code == 200
    lines = r.text.splitlines()[1:]
    districts = {line.split(",")[2] for line in lines if line}
    assert districts == {"Pune"}


# ── RBAC scope ────────────────────────────────────────────────────────────
def test_district_scope_filters_list(tokens, ctx):
    r = client.get(f"{V1}/projects", params={"page_size": 50}, headers=tokens["district"])
    items = r.json()["items"]
    assert items and all(i["district"] == "Pune" for i in items)


def test_district_scope_bypass_via_param_blocked(tokens, ctx):
    """District user requesting another district must NOT receive its rows."""
    r = client.get(f"{V1}/projects", params={
        "district_id": ctx["other_district"]["district_id"]}, headers=tokens["district"])
    assert r.status_code == 200
    assert r.json()["total"] == 0  # intersection of scope and filter is empty


def test_state_scope_bypass_via_param_blocked(tokens, ctx):
    r = client.get(f"{V1}/projects", headers=tokens["state"])
    assert all(i["state"] == "Maharashtra" for i in r.json()["items"])
    other_state = next(s for s in client.get(f"{V1}/dashboard/states",
                       headers=tokens["ministry"]).json() if s["state"] != "Maharashtra")
    r2 = client.get(f"{V1}/projects", params={"state_id": other_state["state_id"]},
                    headers=tokens["state"])
    assert r2.json()["total"] == 0


def test_district_direct_detail_access_blocked(tokens, ctx):
    r = client.get(f"{V1}/projects/{ctx['outside_project']['id']}", headers=tokens["district"])
    assert r.status_code == 403


def test_district_intel_endpoints_blocked_outside_scope(tokens, ctx):
    pid = ctx["outside_project"]["id"]
    for suffix in ("risk", "anomalies", "similar", "relationships",
                   "reconciliation", "predictions", "early-warning"):
        r = client.get(f"{V1}/projects/{pid}/{suffix}", headers=tokens["district"])
        assert r.status_code == 403, suffix


def test_officer_scope(tokens):
    r = client.get(f"{V1}/projects", headers=tokens["officer"])
    assert r.status_code == 200
    assert r.json()["total"] >= 0


def test_officer_can_read(tokens, ctx):
    assert client.get(f"{V1}/projects", headers=tokens["officer"]).status_code == 200


def test_dashboard_scope(tokens):
    nat = client.get(f"{V1}/dashboard/overview", headers=tokens["ministry"]).json()
    dist = client.get(f"{V1}/dashboard/overview", headers=tokens["district"]).json()
    assert nat["scope"] == "national" and dist["scope"] == "district"
    assert dist["total_projects"] < nat["total_projects"]
    states = client.get(f"{V1}/dashboard/states", headers=tokens["state"]).json()
    assert [s["state"] for s in states] == ["Maharashtra"]


# ── risk / intel ──────────────────────────────────────────────────────────
def test_risk_endpoint(tokens, ctx):
    r = client.get(f"{V1}/projects/{ctx['risky']['id']}/risk", headers=tokens["officer"])
    assert r.status_code == 200
    body = r.json()
    assert body["risk_score"] > 60 and body["risk_level"] in ("high", "critical")
    assert body["model_version"].startswith("risk-")
    assert body["factors"] and all(f["explanation"] for f in body["factors"])
    # responsible-AI: no assertive fraud/corruption claims (the disclaimer's
    # "findings of fraud" phrasing is the only permitted occurrence)
    blob = str(body).lower()
    for banned in ("fraud confirmed", "is fraudulent", "corruption confirmed", "collusion"):
        assert banned not in blob
    assert "decision-support signals" in body["disclaimer"]


def test_risk_factors_endpoint(tokens, ctx):
    r = client.get(f"{V1}/projects/{ctx['risky']['id']}/risk/factors", headers=tokens["ministry"])
    assert r.status_code == 200 and len(r.json()) >= 3
    assert all("contribution" in f and "evidence" in f for f in r.json())


def test_risk_timeline(tokens, ctx):
    r = client.get(f"{V1}/projects/{ctx['risky']['id']}/risk/timeline", headers=tokens["ministry"])
    assert r.status_code == 200
    points = r.json()
    assert points and all("risk_score" in p and "model_version" in p for p in points)


def test_anomalies_and_filter(tokens, ctx):
    pid = ctx["risky"]["id"]
    allr = client.get(f"{V1}/projects/{pid}/anomalies", headers=tokens["ministry"]).json()
    assert allr
    one = client.get(f"{V1}/projects/{pid}/anomalies",
                     params={"detector": allr[0]["detector"]}, headers=tokens["ministry"]).json()
    assert all(a["detector"] == allr[0]["detector"] for a in one)


def test_ground_truth_not_exposed():
    spec = client.get("/openapi.json").json()
    assert "ground_truth" not in str(spec.get("paths", {}).keys())


def test_similar_projects(tokens, ctx):
    r = client.get(f"{V1}/projects/{ctx['risky']['id']}/similar", headers=tokens["ministry"])
    assert r.status_code == 200
    for cand in r.json():
        assert cand["classification"] in ("duplicate_candidate", "similar_project")
        assert "verification required" in cand["note"].lower()


def test_relationships(tokens, ctx):
    r = client.get(f"{V1}/projects/{ctx['risky']['id']}/relationships", headers=tokens["ministry"])
    body = r.json()
    assert r.status_code == 200
    assert any(e["relationship_type"] == "implemented_by" for e in body["edges"])
    assert "collusion" not in str(body).lower()


def test_reconciliation(tokens, ctx):
    r = client.get(f"{V1}/projects/{ctx['risky']['id']}/reconciliation", headers=tokens["ministry"])
    assert r.status_code == 200
    assert r.json()["status_group"] in ("RECONCILED", "PARTIAL", "MISMATCH", "MISSING")


def test_predictions(tokens, ctx):
    r = client.get(f"{V1}/projects/{ctx['risky']['id']}/predictions", headers=tokens["ministry"])
    body = r.json()
    assert r.status_code == 200
    assert body["delay_model_version"] and body["overrun_model_version"]


def test_early_warning(tokens, ctx):
    r = client.get(f"{V1}/projects/{ctx['risky']['id']}/early-warning", headers=tokens["ministry"])
    assert r.status_code == 200
    warnings = r.json()["warnings"]
    assert warnings and all(w["severity"] in ("low", "medium", "high", "critical") for w in warnings)


# ── dashboard ─────────────────────────────────────────────────────────────
def test_overview_shape(tokens):
    body = client.get(f"{V1}/dashboard/overview", headers=tokens["ministry"]).json()
    assert body["total_projects"] > 20000
    assert body["risk_distribution"] and body["anomaly_counts"]
    assert body["dataset_note"] == "Prototype Dataset — Synthetic Data"


def test_states_and_districts(tokens):
    states = client.get(f"{V1}/dashboard/states", headers=tokens["ministry"]).json()
    assert len(states) == 10 and all(s["project_count"] > 0 for s in states)
    dists = client.get(f"{V1}/dashboard/districts",
                       params={"state_id": states[0]["state_id"]}, headers=tokens["ministry"]).json()
    assert dists and all(d["state_id"] == states[0]["state_id"] for d in dists)


def test_openapi_generation_intact():
    # regression guard: a bad response_class on any route breaks /docs entirely
    r = client.get("/openapi.json")
    assert r.status_code == 200
    paths = r.json()["paths"]
    assert "/api/v1/investigations/{investigation_id}/report.pdf" in paths
    assert "/api/v1/dashboard/map/boundaries" in paths
    assert client.get("/docs").status_code == 200


def test_district_health_components(tokens):
    # M07: the composite health score is now computed (see test_health_score.py
    # for the formula contract); components remain served alongside it.
    body = client.get(f"{V1}/dashboard/health", headers=tokens["ministry"]).json()
    assert body and any(d["health_score"] is not None for d in body)
    assert "completion_rate_pct" in body[0]["components"]


def test_map_districts_mode(tokens):
    body = client.get(f"{V1}/dashboard/map", headers=tokens["ministry"]).json()
    assert body["mode"] == "districts" and len(body["districts"]) == 80
    assert all(d["latitude"] is not None for d in body["districts"])


def test_map_projects_mode_capped(tokens, ctx):
    body = client.get(f"{V1}/dashboard/map", params={
        "district_id": ctx["pune_district"]["district_id"]}, headers=tokens["ministry"]).json()
    assert body["mode"] == "projects" and 0 < len(body["projects"]) <= 2000


# ── alerts ────────────────────────────────────────────────────────────────
def test_alerts_list_and_detail(tokens, ctx):
    body = client.get(f"{V1}/alerts", headers=tokens["ministry"]).json()
    assert body["total"] > 0
    a = body["items"][0]
    detail = client.get(f"{V1}/alerts/{a['id']}", headers=tokens["ministry"]).json()
    assert detail["id"] == a["id"] and detail["project_code"]


def test_alerts_severity_filter(tokens):
    body = client.get(f"{V1}/alerts", params={"severity": "critical"},
                      headers=tokens["ministry"]).json()
    assert all(i["severity"] == "critical" for i in body["items"])


# ── data quality / models / audit ─────────────────────────────────────────
def test_data_quality(tokens):
    body = client.get(f"{V1}/data/quality", headers=tokens["officer"]).json()
    assert body["total_projects"] > 20000 and "completeness_pct" in body


def test_models_registry(tokens):
    body = client.get(f"{V1}/models", headers=tokens["ministry"]).json()
    names = {m["component"] for m in body}
    assert {"risk", "delay", "overrun", "duplicate"} <= names
    risk = next(m for m in body if m["component"] == "risk")
    assert "risk_ranking" in risk["metrics"]
    blob = str(body).lower()
    assert "secret" not in blob and "c:\\" not in blob


def test_model_detail_and_404(tokens):
    assert client.get(f"{V1}/models/risk-v0.1", headers=tokens["ministry"]).status_code == 200
    assert client.get(f"{V1}/models/nope-v9", headers=tokens["ministry"]).status_code == 404


def test_audit_authorized(tokens, ctx):
    r = client.get(f"{V1}/audit/{ctx['risky']['id']}", headers=tokens["officer"])
    assert r.status_code == 200
    events = r.json()
    assert events and any(e["source"] == "ai_assessment" for e in events)


def test_audit_unauthorized_denied(tokens, ctx):
    invalid_headers = {"Authorization": "Bearer invalid_token"}
    assert client.get(f"{V1}/audit/{ctx['risky']['id']}",
                      headers=invalid_headers).status_code == 401


def test_audit_scope_enforced(tokens, ctx):
    r = client.get(f"{V1}/audit/{ctx['outside_project']['id']}", headers=tokens["district"])
    assert r.status_code == 403


# ── security hygiene ──────────────────────────────────────────────────────
def test_no_sensitive_fields_in_responses(tokens, ctx):
    for path in (f"{V1}/auth/me", f"{V1}/projects/{ctx['risky']['id']}",
                 f"{V1}/dashboard/overview"):
        text = client.get(path, headers=tokens["ministry"]).text.lower()
        for banned in ("password_hash", "jwt_secret", "database_url", "traceback"):
            assert banned not in text, f"{banned} leaked in {path}"


def test_legacy_paths_still_work(tokens):
    r = client.post("/auth/login", json={"email": USERS["officer"], "password": PW})
    assert r.status_code == 200
    assert client.get("/health").status_code == 200
