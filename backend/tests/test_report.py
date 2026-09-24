"""M07 investigation PDF report tests."""
import io

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

from app.main import app

client = TestClient(app, raise_server_exceptions=False)
V1 = "/api/v1"
PW = "Demo@1234"

USERS = {"ministry": "ministry@mplads.demo", "district": "district.pune@mplads.demo"}


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
    inv = client.post(f"{V1}/investigations", json={
        "project_id": item["project_id"],
        "reason": "Report test case opened from the queue."}, headers=tokens["ministry"]).json()
    client.post(f"{V1}/investigations/{inv['id']}/actions", json={
        "action_type": "note_added", "reason": "Note for the report test."},
        headers=tokens["ministry"])
    yield inv
    client.post(f"{V1}/investigations/{inv['id']}/transition", json={
        "to_status": "dismissed", "reason": "Report test cleanup dismissal.",
        "outcome": "inconclusive", "outcome_note": "Test case only."},
        headers=tokens["ministry"])


def test_pdf_content(tokens, case):
    r = client.get(f"{V1}/investigations/{case['id']}/report.pdf", headers=tokens["ministry"])
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content.startswith(b"%PDF-")
    assert case["case_number"] in r.headers["content-disposition"]

    txt = "\n".join(p.extract_text() for p in PdfReader(io.BytesIO(r.content)).pages)
    for needle in (case["case_number"], "AI-generated decision-support content",
                   "Final decisions remain with", "Reason for investigation",
                   "AI Risk Assessment", "Anomaly Indicators", "Reconciliation",
                   "Playbook Progress", "Investigation Actions", "Audit Timeline",
                   "Generated at", "Synthetic Data"):
        assert needle.lower() in txt.lower(), f"missing: {needle}"
    # never asserts guilt
    for banned in ("fraud confirmed", "corruption confirmed", "guilty"):
        assert banned not in txt.lower()


def test_pdf_rbac(tokens, case):
    invalid_headers = {"Authorization": "Bearer invalid_token"}
    assert client.get(f"{V1}/investigations/{case['id']}/report.pdf",
                      headers=invalid_headers).status_code == 401


def test_pdf_scope(tokens, case):
    if case["district"] != "Pune":
        assert client.get(f"{V1}/investigations/{case['id']}/report.pdf",
                          headers=tokens["district"]).status_code == 403


def test_pdf_export_is_audited(tokens, case):
    client.get(f"{V1}/investigations/{case['id']}/report.pdf", headers=tokens["ministry"])
    acts = client.get(f"{V1}/investigations/{case['id']}/actions",
                      params={"page_size": 200}, headers=tokens["ministry"]).json()
    assert any(a["action_type"] == "report_generated" for a in acts["items"])
    audit = client.get(f"{V1}/audit/{case['project_id']}", headers=tokens["ministry"]).json()
    assert any(e["action"] == "investigation.report_generated" for e in audit)


def test_pdf_unknown_case(tokens):
    assert client.get(f"{V1}/investigations/999999/report.pdf",
                      headers=tokens["ministry"]).status_code == 404


def test_xlsx_export(tokens, case):
    r = client.get(f"{V1}/investigations/{case['id']}/report.xlsx",
                   headers=tokens["ministry"])
    assert r.status_code == 200
    assert r.content[:2] == b"PK"  # zip container
    assert case["case_number"] in r.headers["content-disposition"]

    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(r.content))
    assert wb.sheetnames == ["Summary", "Financials", "Risk Factors", "Anomalies",
                             "Investigation Actions", "Audit Trail"]
    summary = {row[0].value: row[1].value for row in wb["Summary"].iter_rows(min_row=2)}
    assert summary["Case number"] == case["case_number"]
    assert "decision-support" in summary["Responsible-AI notice"]
    invalid_headers = {"Authorization": "Bearer invalid_token"}
    assert client.get(f"{V1}/investigations/{case['id']}/report.xlsx",
                      headers=invalid_headers).status_code == 401
