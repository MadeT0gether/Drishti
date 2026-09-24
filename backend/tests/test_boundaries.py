"""M07 boundary/choropleth backend tests."""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, raise_server_exceptions=False)
V1 = "/api/v1"
PW = "Demo@1234"


@pytest.fixture(scope="module")
def hm():
    r = client.post(f"{V1}/auth/login", json={"email": "ministry@mplads.demo", "password": PW})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_boundaries_all_80(hm):
    r = client.get(f"{V1}/dashboard/map/boundaries", headers=hm)
    assert r.status_code == 200
    body = r.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) == 80
    assert "DataMeet" in body["attribution"] and "CC BY 4.0" in body["attribution"]
    ids = [f["properties"]["district_id"] for f in body["features"]]
    assert len(set(ids)) == 80, "each district appears exactly once"
    for f in body["features"][:5]:
        assert f["geometry"]["type"] in ("Polygon", "MultiPolygon")
        assert f["geometry"]["coordinates"]
        for k in ("district_id", "district", "state_id", "state"):
            assert k in f["properties"]
    # simplified payload stays lean
    assert len(r.content) < 3_000_000


def test_boundaries_state_filter(hm):
    r = client.get(f"{V1}/dashboard/map/boundaries", params={"state_id": 1}, headers=hm)
    feats = r.json()["features"]
    assert len(feats) == 8
    assert {f["properties"]["state_id"] for f in feats} == {1}


def test_boundaries_require_auth():
    assert client.get(f"{V1}/dashboard/map/boundaries").status_code == 401


def test_map_district_aggregates_enriched(hm):
    r = client.get(f"{V1}/dashboard/map", headers=hm)
    assert r.status_code == 200
    d = r.json()["districts"][0]
    for k in ("moderate_count", "low_count", "expenditure", "active_investigations"):
        assert k in d
    # risk distribution counts never exceed the project count
    total_leveled = d["high_risk_count"] + d["critical_count"] + d["moderate_count"] + d["low_count"]
    assert total_leveled <= d["project_count"]


def test_boundary_ids_join_map_districts(hm):
    bounds = client.get(f"{V1}/dashboard/map/boundaries", headers=hm).json()
    mapd = client.get(f"{V1}/dashboard/map", headers=hm).json()
    boundary_ids = {f["properties"]["district_id"] for f in bounds["features"]}
    district_ids = {d["district_id"] for d in mapd["districts"]}
    assert district_ids <= boundary_ids, "every aggregated district has a polygon"
