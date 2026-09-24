"""M07 District Health Score tests — formula units (hand-computed fixtures)
plus the live API contract against the dev database."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.ml.health_config import BANDS, WEIGHTS, health_score, subscores

client = TestClient(app, raise_server_exceptions=False)
V1 = "/api/v1"
PW = "Demo@1234"


# ── formula units ─────────────────────────────────────────────────────────
def test_weights_sum_to_100():
    assert sum(WEIGHTS.values()) == 100


def test_full_components_hand_computed():
    components = {
        "completion_rate_pct": 80.0,   # delivery 80
        "delay_rate_pct": 10.0,        # timeliness 90
        "avg_risk": 20.0,              # risk_exposure 80
        "anomaly_rate_pct": 40.0,      # signal_load 60
        "utilization_pct": 95.0,       # financial_discipline 95
    }
    hs = health_score(components, project_count=100)
    # 0.25*80 + 0.20*90 + 0.30*80 + 0.15*60 + 0.10*95 = 20+18+24+9+9.5 = 80.5
    assert hs["health_score"] == 80.5
    assert hs["band"] == "steady"
    assert hs["confidence"] == "full"
    assert hs["components_missing"] == []
    assert abs(sum(hs["contributions"].values()) - hs["health_score"]) < 0.1


def test_missing_component_renormalizes():
    components = {
        "completion_rate_pct": 50.0,
        "delay_rate_pct": None,        # no completed-late data
        "avg_risk": 50.0,
        "anomaly_rate_pct": 50.0,
        "utilization_pct": 50.0,
    }
    hs = health_score(components, project_count=100)
    # all present subscores are 50 -> renormalized weighted mean is exactly 50
    assert hs["health_score"] == 50.0
    assert hs["components_missing"] == ["timeliness"]
    assert "timeliness" not in hs["weights_used"]


def test_overspend_penalized_with_grace():
    base = {"completion_rate_pct": None, "delay_rate_pct": None,
            "avg_risk": None, "anomaly_rate_pct": None}
    # 105% utilization: inside the 10-point grace band -> full credit
    assert subscores({**base, "utilization_pct": 105.0})["financial_discipline"] == 100.0
    # 130% utilization: 20 points beyond grace -> 80
    assert subscores({**base, "utilization_pct": 130.0})["financial_discipline"] == 80.0


def test_subscores_clamped():
    s = subscores({"completion_rate_pct": 120.0, "delay_rate_pct": 150.0,
                   "avg_risk": -5.0, "anomaly_rate_pct": 250.0,
                   "utilization_pct": 400.0})
    assert all(0.0 <= v <= 100.0 for v in s.values())


def test_no_components_returns_none():
    assert health_score({"completion_rate_pct": None, "delay_rate_pct": None,
                         "avg_risk": None, "anomaly_rate_pct": None,
                         "utilization_pct": None}, 0) is None


def test_low_confidence_flag():
    hs = health_score({"completion_rate_pct": 50.0, "delay_rate_pct": 0.0,
                       "avg_risk": 10.0, "anomaly_rate_pct": 5.0,
                       "utilization_pct": 60.0}, project_count=5)
    assert hs["confidence"] == "low"


def test_bands_are_neutral_vocabulary():
    labels = [label for _, label in BANDS]
    assert labels == ["steady", "watch", "needs_attention"]
    for bad in ("fraud", "corrupt", "guilty"):
        assert all(bad not in label for label in labels)


# ── live API contract ─────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def tokens():
    out = {}
    for role, email in [("ministry", "ministry@mplads.demo"),
                        ("state", "state.mh@mplads.demo"),
                        ("district", "district.pune@mplads.demo")]:
        r = client.post(f"{V1}/auth/login", json={"email": email, "password": PW})
        assert r.status_code == 200
        out[role] = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return out


def test_health_endpoint_contract(tokens):
    r = client.get(f"{V1}/dashboard/health", headers=tokens["ministry"])
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 80  # all districts, national scope
    scored = [x for x in rows if x["health_score"] is not None]
    assert scored, "at least some districts must have a score"
    for row in scored[:10]:
        bd = row["score_breakdown"]
        assert abs(sum(bd["contributions"].values()) - row["health_score"]) < 0.15
        assert row["band"] in ("steady", "watch", "needs_attention")
        assert "decision-support" in row["disclaimer"]
    # sorted lowest health first (nulls last)
    scores = [x["health_score"] for x in scored]
    assert scores == sorted(scores)


def test_health_scope(tokens):
    st = client.get(f"{V1}/dashboard/health", headers=tokens["state"]).json()
    assert {x["state"] for x in st} == {"Maharashtra"}
    d = client.get(f"{V1}/dashboard/health", headers=tokens["district"]).json()
    assert [x["district"] for x in d] == ["Pune"]


def test_health_requires_auth():
    assert client.get(f"{V1}/dashboard/health").status_code == 401


# ── what-if simulation data (M07 P3) ──────────────────────────────────────
def test_risk_simulation_endpoint(tokens):
    r = client.get(f"{V1}/models/risk/simulation", headers=tokens["ministry"])
    assert r.status_code == 200
    body = r.json()
    assert body["bucket_size"] == 5
    assert body["total_assessed"] == sum(h["count"] for h in body["histogram"])
    assert body["total_assessed"] > 0
    assert "SIMULATION" in body["note"]
    levels = {b["level"] for b in body["level_boundaries"]}
    assert levels == {"low", "moderate", "high", "critical"}
    # exact current high+critical count matches the histogram's upper region
    # within one boundary bucket (levels split at 61, buckets at 60)
    ge60 = sum(h["count"] for h in body["histogram"] if h["bucket_start"] >= 60)
    ge65 = sum(h["count"] for h in body["histogram"] if h["bucket_start"] >= 65)
    assert ge65 <= body["current_high_or_critical"] <= ge60

    # scoped: district user sees a subset
    d = client.get(f"{V1}/models/risk/simulation", headers=tokens["district"]).json()
    assert d["total_assessed"] < body["total_assessed"]
