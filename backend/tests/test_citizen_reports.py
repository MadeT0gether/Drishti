"""Automated tests for Citizen Issue Reports (Public & Government Console)."""
import pytest
from fastapi.testclient import TestClient

from app.main import app

V1 = "/api/v1"


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def _auth_header(client, email="ministry@mplads.demo", password="Demo@1234"):
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    if resp.status_code != 200:
        pytest.skip(f"Could not authenticate as {email}")
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_public_submit_and_track_report(client):
    # 1. Citizen submits report
    payload = {
        "issue_type": "work_not_happening",
        "custom_project_name": "Rampur Community Health Center",
        "village_locality": "Rampur Ward 4",
        "description": "Observed that construction has been halted for over 6 months despite official claims.",
        "latitude": 28.6139,
        "longitude": 77.2090,
        "location_confirmed": True,
        "reporter_name": "Rajesh Sharma",
        "reporter_mobile": "+91 9876543210",
        "reporter_email": "rajesh@example.com",
        "reporter_relationship": "resident",
    }

    res = client.post(f"{V1}/citizen-reports", json=payload)
    assert res.status_code == 201, res.text
    data = res.json()
    assert "reference_id" in data
    ref_id = data["reference_id"]
    assert ref_id.startswith("DRISHTI-")
    assert data["status"] == "submitted"
    assert data["issue_type"] == "work_not_happening"
    # Reporter private details must NOT be returned in public response
    assert "reporter_mobile" not in data
    assert "reporter_name" not in data

    # 2. Public tracking by reference ID
    track_res = client.get(f"{V1}/citizen-reports/track/{ref_id}")
    assert track_res.status_code == 200
    track_data = track_res.json()
    assert track_data["reference_id"] == ref_id
    assert track_data["status"] == "submitted"
    assert "reporter_name" not in track_data
    assert "reporter_mobile" not in track_data


def test_authorized_list_and_update_report(client):
    headers = _auth_header(client, "ministry@mplads.demo")

    # 1. Create a sample report
    payload = {
        "issue_type": "funding_concern",
        "custom_project_name": "Solar Lighting Project Sector 12",
        "description": "Financial expenditure reported 100% but foundation work incomplete.",
        "village_locality": "Sector 12",
        "reporter_name": "Sunita Devi",
        "reporter_mobile": "9988776655",
        "reporter_email": "sunita@example.com",
        "reporter_relationship": "beneficiary",
    }
    create_res = client.post(f"{V1}/citizen-reports", json=payload)
    assert create_res.status_code == 201
    ref_id = create_res.json()["reference_id"]

    # 2. Ministry lists reports
    list_res = client.get(f"{V1}/citizen-reports", headers=headers)
    assert list_res.status_code == 200
    list_data = list_res.json()
    assert list_data["total"] >= 1
    report_item = next((r for r in list_data["items"] if r["reference_id"] == ref_id), None)
    assert report_item is not None
    assert report_item["reporter_name"] == "Sunita Devi"
    assert report_item["reporter_mobile"] == "9988776655"

    report_id = report_item["id"]

    # 3. Update report status and remarks
    update_res = client.patch(
        f"{V1}/citizen-reports/{report_id}",
        json={
            "status": "under_review",
            "resolution_remarks": "Forwarded to District Collector for physical verification.",
        },
        headers=headers,
    )
    assert update_res.status_code == 200
    updated_data = update_res.json()
    assert updated_data["status"] == "under_review"
    assert "Forwarded to District Collector" in updated_data["resolution_remarks"]

    # 4. Public tracking should reflect the status change
    track_res = client.get(f"{V1}/citizen-reports/track/{ref_id}")
    assert track_res.status_code == 200
    assert track_res.json()["status"] == "under_review"
