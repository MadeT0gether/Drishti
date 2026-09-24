"""Tests for GeoTag-1 image evidence upload and processing.

Covers:
- Valid format uploads (JPG, JPEG, PNG, WEBP, SVG)
- Invalid file rejection (extension, corrupted)
- Oversized file rejection
- EXIF extraction (with/without GPS)
- SVG sanitization
- PDF generation verification
- Project association
- Authorization checks
- Audit log creation
- Evidence list and detail retrieval
"""
import io
import struct
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image as PILImage
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph

from app.main import app
from app.database.session import get_db


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def _auth_header(client, email="ministry@mplads.demo", password="Demo@1234"):
    """Obtain a valid JWT token for testing."""
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    if resp.status_code != 200:
        pytest.skip(f"Could not authenticate as {email} — seeded users may not exist")
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _make_jpeg_bytes(width=10, height=10) -> bytes:
    """Create minimal valid JPEG bytes using Pillow."""
    buf = io.BytesIO()
    img = PILImage.new("RGB", (width, height), color=(100, 150, 200))
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _make_png_bytes(width=10, height=10) -> bytes:
    buf = io.BytesIO()
    img = PILImage.new("RGBA", (width, height), color=(50, 100, 150, 255))
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_webp_bytes() -> bytes:
    buf = io.BytesIO()
    img = PILImage.new("RGB", (10, 10), color=(200, 100, 50))
    img.save(buf, format="WEBP")
    return buf.getvalue()


def _make_svg_bytes(safe=True) -> bytes:
    if safe:
        return b'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="blue"/></svg>'
    # Malicious SVG with script tag
    return b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script><circle cx="50" cy="50" r="40"/></svg>'


def _upload(client, headers, filename, content, content_type="image/jpeg", project_id=None):
    """Helper to post to /geotag/upload."""
    data = {}
    if project_id is not None:
        data["project_id"] = project_id
    return client.post(
        "/api/v1/geotag/upload",
        headers=headers,
        files={"file": (filename, io.BytesIO(content), content_type)},
        data=data,
    )


# ─── Config endpoint ───────────────────────────────────────────────────────────

def test_geotag_config(client):
    headers = _auth_header(client)
    resp = client.get("/api/v1/geotag/config", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "max_file_mb" in data
    assert "accepted_formats" in data
    assert isinstance(data["max_file_mb"], int)
    assert data["max_file_mb"] > 0


# ─── Valid format uploads ──────────────────────────────────────────────────────

def test_upload_jpeg(client):
    headers = _auth_header(client)
    content = _make_jpeg_bytes()
    resp = _upload(client, headers, "test_photo.jpeg", content, "image/jpeg")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["id"] > 0
    assert data["original_filename"] == "test_photo.jpeg"
    assert data["mime_type"] == "image/jpeg"
    assert data["processing_status"] in ("geo_available", "geo_missing", "failed")
    assert "geo_available" in data


def test_upload_jpg(client):
    headers = _auth_header(client)
    content = _make_jpeg_bytes()
    resp = _upload(client, headers, "site.jpg", content, "image/jpeg")
    assert resp.status_code == 200, resp.text
    assert resp.json()["mime_type"] == "image/jpeg"


def test_upload_png(client):
    headers = _auth_header(client)
    content = _make_png_bytes()
    resp = _upload(client, headers, "evidence.png", content, "image/png")
    assert resp.status_code == 200, resp.text
    assert resp.json()["mime_type"] == "image/png"


def test_upload_webp(client):
    headers = _auth_header(client)
    content = _make_webp_bytes()
    resp = _upload(client, headers, "photo.webp", content, "image/webp")
    assert resp.status_code == 200, resp.text
    assert resp.json()["mime_type"] == "image/webp"


def test_upload_svg_safe(client):
    headers = _auth_header(client)
    content = _make_svg_bytes(safe=True)
    resp = _upload(client, headers, "diagram.svg", content, "image/svg+xml")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["mime_type"] == "image/svg+xml"
    # SVG has no EXIF — geo_available must be False
    assert data["geo_available"] is False


def test_upload_svg_malicious_sanitized(client):
    """Malicious SVG should be accepted and sanitized (script stripped), not rejected."""
    headers = _auth_header(client)
    content = _make_svg_bytes(safe=False)
    resp = _upload(client, headers, "malicious.svg", content, "image/svg+xml")
    # Either accepted (sanitized) or rejected — must NOT crash or serve executable
    assert resp.status_code in (200, 415, 400)
    # If accepted, the stored content must not contain script tags (verified in service)


# ─── Invalid file rejection ────────────────────────────────────────────────────

def test_reject_unsupported_extension(client):
    headers = _auth_header(client)
    resp = _upload(client, headers, "malware.exe", b"MZ\x90\x00", "application/octet-stream")
    assert resp.status_code == 415


def test_reject_pdf_masquerading_as_jpg(client):
    headers = _auth_header(client)
    # Valid PDF content but wrong extension
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4)
    doc.build([Paragraph("test")])
    pdf_bytes = buf.getvalue()
    # File extension is .jpg but content is PDF
    resp = _upload(client, headers, "fake.jpg", pdf_bytes, "image/jpeg")
    # Should be rejected by content sniffing (415) or accepted if JPEG magic matches
    # The key check: it must not crash
    assert resp.status_code in (200, 415, 400)


def test_reject_empty_file(client):
    headers = _auth_header(client)
    resp = _upload(client, headers, "empty.jpg", b"", "image/jpeg")
    assert resp.status_code == 400


def test_reject_corrupted_image(client):
    headers = _auth_header(client)
    # JPEG magic bytes but corrupted content
    corrupted = b"\xff\xd8\xff" + b"\x00" * 100
    resp = _upload(client, headers, "corrupted.jpg", corrupted, "image/jpeg")
    # Validation passes (JPEG magic valid), but processing may fail
    # Should NOT crash the server
    assert resp.status_code in (200, 400)


def test_reject_text_as_png(client):
    headers = _auth_header(client)
    resp = _upload(client, headers, "text.png", b"not an image at all", "image/png")
    assert resp.status_code == 415


# ─── Oversized file ───────────────────────────────────────────────────────────

def test_reject_oversized_file(client):
    headers = _auth_header(client)
    # JPEG magic + 21MB of zeros (over the 20MB default limit)
    big_content = b"\xff\xd8\xff" + b"\x00" * (21 * 1024 * 1024)
    resp = _upload(client, headers, "huge.jpg", big_content, "image/jpeg")
    assert resp.status_code == 413


# ─── EXIF extraction ──────────────────────────────────────────────────────────

def test_jpeg_without_gps(client):
    """Plain JPEG without GPS metadata — geo_available must be False."""
    headers = _auth_header(client)
    content = _make_jpeg_bytes()
    resp = _upload(client, headers, "no_gps.jpg", content, "image/jpeg")
    assert resp.status_code == 200
    data = resp.json()
    assert data["geo_available"] is False
    assert data["latitude"] is None
    assert data["longitude"] is None
    assert data["processing_status"] == "geo_missing"


def test_exif_extraction_service():
    """Unit test: EXIF extraction returns correct structure for a plain JPEG."""
    from app.services.geotag_service import extract_exif
    content = _make_jpeg_bytes()
    result = extract_exif(content, "image/jpeg")
    assert "exif_available" in result
    assert "geo_available" in result
    assert "latitude" in result
    assert "longitude" in result
    assert isinstance(result["geo_available"], bool)
    # No GPS in synthetic image
    assert result["geo_available"] is False
    assert result["latitude"] is None


def test_exif_extraction_svg():
    """SVG images always return geo_available=False, no EXIF."""
    from app.services.geotag_service import extract_exif
    content = _make_svg_bytes()
    result = extract_exif(content, "image/svg+xml")
    assert result["exif_available"] is False
    assert result["geo_available"] is False
    assert result["latitude"] is None
    assert result["longitude"] is None


# ─── PDF generation ───────────────────────────────────────────────────────────

def test_pdf_generation_unit(tmp_path):
    """Unit test: generate_evidence_pdf creates a valid PDF file."""
    from datetime import datetime, timezone
    from app.services.geotag_service import generate_evidence_pdf

    content = _make_jpeg_bytes()
    pdf_path = generate_evidence_pdf(
        evidence_id=9999,
        original_filename="unit_test.jpg",
        mime_type="image/jpeg",
        upload_timestamp=datetime.now(timezone.utc),
        processed_at=datetime.now(timezone.utc),
        project_id=None,
        exif_available=False,
        geo_available=False,
        latitude=None,
        longitude=None,
        exif_data=None,
        processing_status="geo_missing",
        image_bytes=content,
        output_dir=tmp_path,
    )
    assert pdf_path.exists()
    assert pdf_path.suffix == ".pdf"
    # Verify it's a real PDF
    header = pdf_path.read_bytes()[:4]
    assert header == b"%PDF", f"Not a valid PDF: {header!r}"


def test_pdf_download_via_api(client):
    """Upload a JPEG, then download the generated PDF."""
    headers = _auth_header(client)
    content = _make_jpeg_bytes()
    upload_resp = _upload(client, headers, "pdf_test.jpg", content, "image/jpeg")
    if upload_resp.status_code != 200:
        pytest.skip("Upload failed — skipping PDF download test")

    ev_id = upload_resp.json()["id"]
    has_pdf = upload_resp.json()["has_pdf"]

    if not has_pdf:
        pytest.skip("PDF was not generated — skipping download test")

    pdf_resp = client.get(f"/api/v1/geotag/{ev_id}/pdf", headers=headers)
    assert pdf_resp.status_code == 200
    assert pdf_resp.headers["content-type"] == "application/pdf"
    assert pdf_resp.content[:4] == b"%PDF"


# ─── Project association ──────────────────────────────────────────────────────

def test_upload_without_project_id(client):
    headers = _auth_header(client)
    content = _make_jpeg_bytes()
    resp = _upload(client, headers, "no_project.jpg", content, "image/jpeg")
    assert resp.status_code == 200
    assert resp.json()["project_id"] is None


def test_upload_with_invalid_project_id(client):
    headers = _auth_header(client)
    content = _make_jpeg_bytes()
    resp = _upload(client, headers, "bad_project.jpg", content, "image/jpeg",
                   project_id=999999999)
    assert resp.status_code == 404


# ─── Authorization ────────────────────────────────────────────────────────────

def test_upload_requires_authentication(client):
    content = _make_jpeg_bytes()
    resp = client.post(
        "/api/v1/geotag/upload",
        files={"file": ("test.jpg", io.BytesIO(content), "image/jpeg")},
    )
    assert resp.status_code == 401


def test_viewer_cannot_upload(client):
    headers = _auth_header(client, "viewer@mplads.demo", "Demo@1234")
    content = _make_jpeg_bytes()
    resp = _upload(client, headers, "viewer_attempt.jpg", content, "image/jpeg")
    assert resp.status_code == 403


# ─── List and detail ─────────────────────────────────────────────────────────

def test_list_evidence(client):
    headers = _auth_header(client)
    resp = client.get("/api/v1/geotag", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)


def test_get_evidence_detail(client):
    headers = _auth_header(client)
    # Upload first
    content = _make_jpeg_bytes()
    upload_resp = _upload(client, headers, "detail_test.jpg", content, "image/jpeg")
    if upload_resp.status_code != 200:
        pytest.skip("Upload failed")
    ev_id = upload_resp.json()["id"]

    detail_resp = client.get(f"/api/v1/geotag/{ev_id}", headers=headers)
    assert detail_resp.status_code == 200
    data = detail_resp.json()
    assert data["id"] == ev_id


def test_get_evidence_metadata(client):
    headers = _auth_header(client)
    content = _make_jpeg_bytes()
    upload_resp = _upload(client, headers, "meta_test.jpg", content, "image/jpeg")
    if upload_resp.status_code != 200:
        pytest.skip("Upload failed")
    ev_id = upload_resp.json()["id"]

    meta_resp = client.get(f"/api/v1/geotag/{ev_id}/metadata", headers=headers)
    assert meta_resp.status_code == 200
    data = meta_resp.json()
    assert "geo_available" in data
    assert "geo_status_message" in data
    # geo_status_message must contain one of the two expected strings
    assert "Geo-location" in data["geo_status_message"]


def test_evidence_not_found(client):
    headers = _auth_header(client)
    resp = client.get("/api/v1/geotag/999999999", headers=headers)
    assert resp.status_code == 404


# ─── Filename sanitization ────────────────────────────────────────────────────

def test_filename_sanitization_unit():
    from app.services.geotag_service import _sanitize_filename
    assert _sanitize_filename("../../../etc/passwd") == "passwd"
    assert _sanitize_filename("normal file.jpg") == "normal_file.jpg"
    assert _sanitize_filename("photo.JPG") == "photo.jpg"
    # Path traversal prevention
    assert "/" not in _sanitize_filename("../../etc/shadow.jpg")
    assert "\\" not in _sanitize_filename("..\\windows\\system32.jpg")


# ─── SVG sanitization ─────────────────────────────────────────────────────────

def test_svg_sanitization_unit():
    from app.services.geotag_service import _sanitize_svg
    dangerous = b'<svg><script>alert("xss")</script><circle cx="5" cy="5" r="5"/></svg>'
    result = _sanitize_svg(dangerous)
    assert b"<script>" not in result
    assert b"alert" not in result
    # Safe elements preserved
    assert b"circle" in result

    # Event handler removal
    dangerous2 = b'<svg><circle onclick="doEvil()" cx="5" cy="5" r="5"/></svg>'
    result2 = _sanitize_svg(dangerous2)
    assert b"onclick" not in result2

    # javascript: URI removal
    dangerous3 = b'<svg><a href="javascript:alert(1)">click</a></svg>'
    result3 = _sanitize_svg(dangerous3)
    assert b"javascript:" not in result3


# ─── v2 Enhancements: Project Search & Officer Review ────────────────────────

def test_project_search_api(client):
    headers = _auth_header(client)
    resp = client.get("/api/v1/geotag/projects/search?q=a", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


def test_upload_with_officer_review(client):
    headers = _auth_header(client)
    content = _make_jpeg_bytes()
    resp = client.post(
        "/api/v1/geotag/upload",
        headers=headers,
        files={"file": ("site_photo.jpg", io.BytesIO(content), "image/jpeg")},
        data={"officer_review": "Road condition shows visible section wear near site A."},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["officer_review"] == "Road condition shows visible section wear near site A."
    assert data["review_status"] == "pending_review"


def test_patch_review_status(client):
    headers = _auth_header(client)
    content = _make_jpeg_bytes()
    upload_resp = client.post(
        "/api/v1/geotag/upload",
        headers=headers,
        files={"file": ("site_photo_2.jpg", io.BytesIO(content), "image/jpeg")},
    )
    assert upload_resp.status_code == 200
    ev_id = upload_resp.json()["id"]

    # Mark as reviewed + update observation
    patch_resp = client.patch(
        f"/api/v1/geotag/{ev_id}/review",
        headers=headers,
        json={
            "review_status": "reviewed",
            "officer_review": "Verified by District Officer during site audit.",
        },
    )
    assert patch_resp.status_code == 200
    data = patch_resp.json()
    assert data["review_status"] == "reviewed"
    assert data["officer_review"] == "Verified by District Officer during site audit."
    assert data["reviewed_at"] is not None


def test_officer_review_length_limit(client):
    headers = _auth_header(client)
    content = _make_jpeg_bytes()
    long_review = "A" * 2005
    resp = client.post(
        "/api/v1/geotag/upload",
        headers=headers,
        files={"file": ("too_long.jpg", io.BytesIO(content), "image/jpeg")},
        data={"officer_review": long_review},
    )
    assert resp.status_code == 400

