"""GeoTag-1 evidence service.

Handles image validation, EXIF/GPS extraction, PDF generation, and CRUD
for the geotag_evidence table.

Responsible-AI principle: geo-data and processing signals are decision-support
only and do not constitute findings of fraud, misconduct or legal liability.
"""
from __future__ import annotations

import io
import mimetypes
import os
import re
import struct
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, UploadFile
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image as RLImage,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import GeoTagEvidence, User
from app.models.geo import District, State
from app.models.project import Project
from app.schemas.common import MAX_PAGE_SIZE, paginate_meta


def search_projects(db: Session, q: str, limit: int = 10) -> list[dict]:
    """Search projects by name (title), code, or ID for evidence association.

    Autocomplete helper for GeoTag-1.
    """
    q_str = q.strip()
    if not q_str:
        return []

    stmt = (
        select(
            Project.id,
            Project.code,
            Project.title,
            District.name.label("district_name"),
            State.name.label("state_name"),
        )
        .outerjoin(District, Project.district_id == District.id)
        .outerjoin(State, Project.state_id == State.id)
    )

    if q_str.isdigit():
        stmt = stmt.where(
            (Project.id == int(q_str))
            | (Project.code.ilike(f"%{q_str}%"))
            | (Project.title.ilike(f"%{q_str}%"))
        )
    else:
        stmt = stmt.where(
            (Project.code.ilike(f"%{q_str}%"))
            | (Project.title.ilike(f"%{q_str}%"))
        )

    rows = db.execute(stmt.limit(min(limit, 20))).all()

    return [
        {
            "id": r.id,
            "code": r.code,
            "title": r.title,
            "district_name": r.district_name or "Not available",
            "state_name": r.state_name or "Not available",
        }
        for r in rows
    ]


# ─── Constants ────────────────────────────────────────────────────────────────

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".svg"}
ALLOWED_MIMES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/svg+xml",
}
# Map extension → canonical MIME (for content sniffing fallback)
EXT_MIME = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
}

# Magic bytes for raster format detection (first N bytes)
MAGIC_BYTES = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"RIFF": "image/webp",  # RIFF????WEBP — checked more carefully below
}

ACCENT = colors.HexColor("#1e3a5f")
MUTED = colors.HexColor("#64748b")
BORDER = colors.HexColor("#cbd5e1")
DISCLAIMER = (
    "Decision-support signal only. Geo-location data, metadata and processing "
    "status are verification signals, not findings of fraud, misconduct, "
    "corruption or legal liability. Final decisions remain with authorized officials."
)

NA = "Not available"


# ─── Path helpers ──────────────────────────────────────────────────────────────

def _upload_dir() -> Path:
    settings = get_settings()
    backend_root = Path(__file__).resolve().parents[2]
    d = backend_root / settings.geotag_upload_dir
    d.mkdir(parents=True, exist_ok=True)
    return d


def _max_bytes() -> int:
    return get_settings().geotag_max_file_mb * 1024 * 1024


# ─── Filename sanitization ─────────────────────────────────────────────────────

def _sanitize_filename(name: str) -> str:
    """Return a safe display filename: strip path components, keep extension."""
    # Strip any directory component (path traversal prevention)
    name = os.path.basename(name)
    # Remove or replace unsafe characters; allow alphanum, dash, underscore, dot
    name = re.sub(r"[^\w.\-]", "_", name)
    # Collapse multiple dots (prevent extension tricks like .jpg.exe)
    parts = name.rsplit(".", 1)
    if len(parts) == 2:
        stem = re.sub(r"[^\w\-]", "_", parts[0]) or "file"
        ext = parts[1].lower()
        return f"{stem}.{ext}"
    return re.sub(r"[^\w\-]", "_", name) or "file"


def _safe_stored_name(ext: str) -> str:
    """Generate a UUID-based stored filename with the given extension."""
    return f"{uuid.uuid4().hex}{ext}"


# ─── Content-type validation ───────────────────────────────────────────────────

def _sniff_mime(content: bytes, declared_ext: str) -> str:
    """Detect MIME from content bytes; fall back to extension-based mapping.

    Security: SVG detection only applies when the declared extension is .svg —
    we never accept arbitrary text content as SVG when the file claims to be
    a raster format.
    """
    # WebP: RIFF????WEBP
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    # JPEG: FF D8 FF
    if content[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    # PNG: 89 50 4E 47 0D 0A 1A 0A
    if content[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    # SVG: only if the extension is .svg (text-based format cannot be content-sniffed
    # reliably by magic bytes — we trust the extension + basic text pattern check)
    if declared_ext == ".svg":
        try:
            head = content[:512].decode("utf-8", errors="ignore").lstrip()
            if "<svg" in head.lower() or "<?xml" in head.lower():
                return "image/svg+xml"
        except Exception:
            pass
        # SVG extension declared but content doesn't look like SVG
        return "image/svg+xml"  # Let downstream SVG sanitizer handle it
    # No magic match
    return ""


# ─── SVG sanitization ─────────────────────────────────────────────────────────

_SVG_DANGEROUS = re.compile(
    r"<\s*script[\s\S]*?</\s*script\s*>|"
    r"<\s*script[^>]*/?>|"
    r"\bon\w+\s*=|"
    r"javascript\s*:",
    re.IGNORECASE,
)


def _sanitize_svg(content: bytes) -> bytes:
    """Strip script tags, event handlers and javascript: URIs from SVG."""
    text = content.decode("utf-8", errors="replace")
    cleaned = _SVG_DANGEROUS.sub("", text)
    return cleaned.encode("utf-8")


# ─── Validation ────────────────────────────────────────────────────────────────

async def validate_image_upload(file: UploadFile) -> tuple[bytes, str, str]:
    """Read, validate and return (content_bytes, safe_ext, detected_mime).

    Raises HTTPException on:
      - unsupported extension (415)
      - oversized file (413)
      - unsupported/unrecognised MIME (415)
      - empty file (400)
    """
    # 1. Extension check
    raw_name = file.filename or ""
    _safe_display = _sanitize_filename(raw_name)
    _, raw_ext = os.path.splitext(_safe_display)
    ext = raw_ext.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=(
                f"Unsupported file type '{ext}'. "
                f"Accepted formats: JPG, JPEG, PNG, WEBP, SVG."
            ),
        )

    # 2. Read content (bounded to prevent memory exhaustion)
    max_bytes = _max_bytes()
    content = await file.read(max_bytes + 1)
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=(
                f"File exceeds the maximum allowed size of "
                f"{get_settings().geotag_max_file_mb} MB."
            ),
        )

    # 3. MIME sniff (server-side; do not trust Content-Type header)
    detected_mime = _sniff_mime(content, ext)
    if detected_mime not in ALLOWED_MIMES:
        raise HTTPException(
            status_code=415,
            detail=(
                f"File content does not match a supported image format. "
                f"Detected: '{detected_mime or 'unknown'}'."
            ),
        )

    return content, ext, detected_mime


# ─── EXIF / GPS extraction ─────────────────────────────────────────────────────

def _dms_to_decimal(dms, ref: str) -> float:
    """Convert EXIF DMS tuple to signed decimal degrees."""
    try:
        def to_float(v):
            if hasattr(v, "numerator"):
                return v.numerator / v.denominator
            return float(v)
        degrees, minutes, seconds = (to_float(x) for x in dms)
        decimal = degrees + minutes / 60 + seconds / 3600
        if ref in ("S", "W"):
            decimal = -decimal
        return round(decimal, 7)
    except Exception:
        return 0.0


def extract_exif(content: bytes, mime_type: str) -> dict:
    """Extract EXIF metadata and GPS from raster image bytes.

    Returns a dict:
      {
        "exif_available": bool,
        "geo_available": bool,
        "latitude": float | None,
        "longitude": float | None,
        "exif_data": dict | None,
      }

    GPS data is NEVER fabricated. If absent, geo_available is False.
    SVG files have no EXIF; this function returns sensible defaults.
    """
    if mime_type == "image/svg+xml":
        return {
            "exif_available": False,
            "geo_available": False,
            "latitude": None,
            "longitude": None,
            "exif_data": None,
        }

    try:
        from PIL import Image, ExifTags  # type: ignore
        from PIL.ExifTags import TAGS, GPSTAGS  # type: ignore
    except ImportError:
        return {
            "exif_available": False,
            "geo_available": False,
            "latitude": None,
            "longitude": None,
            "exif_data": {"note": "Pillow not available — EXIF extraction skipped"},
        }

    try:
        img = Image.open(io.BytesIO(content))
        raw_exif = img._getexif() if hasattr(img, "_getexif") else None
    except Exception:
        return {
            "exif_available": False,
            "geo_available": False,
            "latitude": None,
            "longitude": None,
            "exif_data": None,
        }

    if not raw_exif:
        return {
            "exif_available": False,
            "geo_available": False,
            "latitude": None,
            "longitude": None,
            "exif_data": None,
        }

    # Decode human-readable EXIF (skip GPS IFD — handled separately)
    exif_data: dict = {}
    gps_info: dict = {}
    for tag_id, value in raw_exif.items():
        tag_name = TAGS.get(tag_id, str(tag_id))
        if tag_name == "GPSInfo":
            for gps_tag_id, gps_val in (value or {}).items():
                gps_name = GPSTAGS.get(gps_tag_id, str(gps_tag_id))
                gps_info[gps_name] = str(gps_val)
        else:
            # Serialize safely — skip binary blobs
            try:
                str_val = str(value)
                if len(str_val) < 500:
                    exif_data[tag_name] = str_val
            except Exception:
                pass

    # Extract GPS coordinates
    latitude: float | None = None
    longitude: float | None = None
    geo_available = False

    if gps_info:
        exif_data["GPS"] = gps_info
        try:
            lat_dms = raw_exif.get(
                next(k for k in raw_exif if TAGS.get(k) == "GPSInfo"), {}
            ).get(2)  # GPSLatitude
            lat_ref = raw_exif.get(
                next(k for k in raw_exif if TAGS.get(k) == "GPSInfo"), {}
            ).get(1)  # GPSLatitudeRef
            lon_dms = raw_exif.get(
                next(k for k in raw_exif if TAGS.get(k) == "GPSInfo"), {}
            ).get(4)  # GPSLongitude
            lon_ref = raw_exif.get(
                next(k for k in raw_exif if TAGS.get(k) == "GPSInfo"), {}
            ).get(3)  # GPSLongitudeRef

            if lat_dms and lat_ref and lon_dms and lon_ref:
                latitude = _dms_to_decimal(lat_dms, lat_ref)
                longitude = _dms_to_decimal(lon_dms, lon_ref)
                geo_available = True
        except Exception:
            pass

    return {
        "exif_available": bool(exif_data),
        "geo_available": geo_available,
        "latitude": latitude,
        "longitude": longitude,
        "exif_data": exif_data or None,
    }


# ─── PDF generation ────────────────────────────────────────────────────────────

def _img_to_pdf_bytes(content: bytes, mime_type: str) -> bytes | None:
    """Convert image bytes to a PIL-compatible bytes object for embedding.

    For SVG this returns None — we embed a placeholder text instead.
    """
    if mime_type == "image/svg+xml":
        return None  # reportlab cannot embed SVG natively; handled below
    try:
        from PIL import Image  # type: ignore
        img = Image.open(io.BytesIO(content))
        # Normalise format for reportlab
        buf = io.BytesIO()
        fmt = "JPEG" if mime_type == "image/jpeg" else "PNG"
        if img.mode in ("RGBA", "P") and fmt == "JPEG":
            img = img.convert("RGB")
        img.save(buf, format=fmt)
        buf.seek(0)
        return buf.read()
    except Exception:
        return None


def generate_evidence_pdf(
    evidence_id: int,
    original_filename: str,
    mime_type: str,
    upload_timestamp: datetime,
    processed_at: datetime,
    project_id: Optional[int],
    exif_available: bool,
    geo_available: bool,
    latitude: Optional[float],
    longitude: Optional[float],
    exif_data: Optional[dict],
    processing_status: str,
    image_bytes: bytes,
    output_dir: Path,
    officer_review: Optional[str] = None,
    review_status: str = "pending_review",
    project_name: Optional[str] = None,
) -> Path:
    """Generate a standardised PDF evidence record using reportlab.

    Returns the path to the generated PDF file.
    """
    pdf_filename = f"GeoTag_Evidence_{evidence_id}.pdf"
    pdf_path = output_dir / pdf_filename

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"GeoTag-1 Evidence Record — {original_filename}",
        author="DRISHTI · MPLADS AI Risk & Intelligence Platform",
    )

    styles = getSampleStyleSheet()
    heading1 = ParagraphStyle(
        "h1", parent=styles["Heading1"],
        fontSize=14, textColor=ACCENT, spaceAfter=4,
        fontName="Helvetica-Bold",
    )
    heading2 = ParagraphStyle(
        "h2", parent=styles["Heading2"],
        fontSize=10, textColor=ACCENT, spaceAfter=3,
        fontName="Helvetica-Bold",
    )
    normal = ParagraphStyle(
        "norm", parent=styles["Normal"],
        fontSize=8.5, leading=13, textColor=colors.black,
    )
    muted = ParagraphStyle(
        "muted", parent=styles["Normal"],
        fontSize=7.5, leading=11, textColor=MUTED,
    )
    disclaimer_style = ParagraphStyle(
        "disc", parent=styles["Normal"],
        fontSize=7, leading=10, textColor=MUTED,
        borderColor=BORDER, borderWidth=0.5,
        borderPadding=(4, 6, 4, 6),
    )

    story = []

    # ── Header ──────────────────────────────────────────────────────────────
    story.append(Paragraph("DRISHTI · GeoTag-1 Evidence Record", heading1))
    story.append(Paragraph(
        "Image Evidence Verification — MPLADS AI Risk &amp; Intelligence Platform", muted))
    story.append(Spacer(1, 4 * mm))

    # ── Responsible AI Banner ───────────────────────────────────────────────
    disc_table = Table(
        [[Paragraph(f"⚠ {DISCLAIMER}", disclaimer_style)]],
        colWidths=[174 * mm],
    )
    disc_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(disc_table)
    story.append(Spacer(1, 5 * mm))

    # ── File Identity ────────────────────────────────────────────────────────
    story.append(Paragraph("1. File Identity & Review Status", heading2))
    proj_str = "Not linked"
    if project_id:
        proj_str = f"#{project_id}" + (f" — {project_name}" if project_name else "")

    identity_data = [
        ["Evidence ID", str(evidence_id)],
        ["Original Filename", original_filename],
        ["MIME Type", mime_type],
        ["Project Association", proj_str],
        ["Upload Timestamp", upload_timestamp.strftime("%d %b %Y %H:%M:%S UTC")],
        ["Processed At", processed_at.strftime("%d %b %Y %H:%M:%S UTC") if processed_at else NA],
        ["Verification Signal", processing_status.replace("_", " ").title()],
        ["Review Status", review_status.replace("_", " ").title()],
    ]
    id_table = Table(identity_data, colWidths=[52 * mm, 122 * mm])
    id_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TEXTCOLOR", (0, 0), (0, -1), ACCENT),
        ("TEXTCOLOR", (1, 0), (1, -1), colors.black),
        ("GRID", (0, 0), (-1, -1), 0.3, BORDER),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f9")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(id_table)
    story.append(Spacer(1, 4 * mm))

    # ── Officer Review / Observation ─────────────────────────────────────────
    if officer_review:
        story.append(Paragraph("2. Officer Review / Observation", heading2))
        rev_table = Table(
            [[Paragraph(officer_review, normal)]],
            colWidths=[174 * mm],
        )
        rev_table.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(rev_table)
        story.append(Spacer(1, 4 * mm))

    # ── Geo-location ─────────────────────────────────────────────────────────
    section_num = 3 if officer_review else 2
    story.append(Paragraph(f"{section_num}. Geo-location Information", heading2))
    if geo_available and latitude is not None and longitude is not None:
        geo_status = "Geo-location Available"
        lat_str = f"{latitude:.7f}°"
        lon_str = f"{longitude:.7f}°"
    else:
        geo_status = "Geo-location data not available"
        lat_str = NA
        lon_str = NA

    geo_data = [
        ["Geo-location Status", geo_status],
        ["Latitude", lat_str],
        ["Longitude", lon_str],
        ["EXIF Metadata Present", "Yes" if exif_available else "No"],
    ]
    geo_table = Table(geo_data, colWidths=[52 * mm, 122 * mm])
    geo_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TEXTCOLOR", (0, 0), (0, -1), ACCENT),
        ("TEXTCOLOR", (1, 0), (1, -1), colors.black),
        ("GRID", (0, 0), (-1, -1), 0.3, BORDER),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f9")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(geo_table)
    story.append(Spacer(1, 4 * mm))

    # ── EXIF Details ──────────────────────────────────────────────────────────
    if exif_data:
        section_num += 1
        story.append(Paragraph(f"{section_num}. EXIF Metadata", heading2))
        exif_rows = []
        skip_keys = {"GPS"}  # GPS already handled above
        for k, v in list(exif_data.items())[:30]:  # limit rows
            if k in skip_keys:
                continue
            exif_rows.append([str(k)[:40], str(v)[:80]])
        if exif_rows:
            exif_table = Table(exif_rows, colWidths=[60 * mm, 114 * mm])
            exif_table.setStyle(TableStyle([
                ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                ("GRID", (0, 0), (-1, -1), 0.3, BORDER),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f8fafc")),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("WORDWRAP", (0, 0), (-1, -1), "LTR"),
            ]))
            story.append(exif_table)
        story.append(Spacer(1, 4 * mm))

    # ── Embedded Image ────────────────────────────────────────────────────────
    section_num += 1
    story.append(Paragraph(f"{section_num}. Original Image", heading2))
    if mime_type == "image/svg+xml":
        story.append(Paragraph(
            "[SVG image — cannot be embedded directly in PDF. "
            "Original file is preserved in the evidence store.]", muted))
    else:
        img_bytes = _img_to_pdf_bytes(image_bytes, mime_type)
        if img_bytes:
            try:
                max_w = 155 * mm
                max_h = 90 * mm
                pil_img_buf = io.BytesIO(img_bytes)
                from PIL import Image as PILImage  # type: ignore
                with PILImage.open(pil_img_buf) as pi:
                    w, h = pi.size
                scale = min(max_w / w, max_h / h, 1.0)
                rl_img = RLImage(io.BytesIO(img_bytes), width=w * scale, height=h * scale)
                story.append(rl_img)
            except Exception:
                story.append(Paragraph("[Image could not be embedded in PDF.]", muted))
        else:
            story.append(Paragraph("[Image could not be embedded in PDF.]", muted))

    story.append(Spacer(1, 5 * mm))

    # ── Footer disclaimer ─────────────────────────────────────────────────────
    story.append(Paragraph(
        f"Generated by DRISHTI GeoTag-1 on "
        f"{datetime.now(timezone.utc).strftime('%d %b %Y %H:%M UTC')}. "
        "All data sourced from uploaded evidence. "
        "Prototype — Synthetic Data.",
        muted,
    ))

    doc.build(story)
    return pdf_path


# ─── CRUD ──────────────────────────────────────────────────────────────────────

def _evidence_out(ev: GeoTagEvidence, db: Optional[Session] = None) -> dict:
    project_name = None
    project_code = None
    if ev.project:
        project_name = ev.project.title
        project_code = ev.project.code
    elif db and ev.project_id:
        proj = db.get(Project, ev.project_id)
        if proj:
            project_name = proj.title
            project_code = proj.code

    return {
        "id": ev.id,
        "project_id": ev.project_id,
        "project_name": project_name or ("Not linked" if not ev.project_id else f"Project #{ev.project_id}"),
        "project_code": project_code,
        "original_filename": ev.original_filename,
        "stored_filename": ev.stored_filename,
        "mime_type": ev.mime_type,
        "file_size_bytes": ev.file_size_bytes,
        "exif_available": ev.exif_available,
        "geo_available": ev.geo_available,
        "latitude": float(ev.latitude) if ev.latitude is not None else None,
        "longitude": float(ev.longitude) if ev.longitude is not None else None,
        "processing_status": ev.processing_status,
        "error_message": ev.error_message,
        "uploaded_by_id": ev.uploaded_by_id,
        "officer_review": ev.officer_review,
        "review_status": ev.review_status,
        "reviewed_at": ev.reviewed_at,
        "reviewed_by_id": ev.reviewed_by_id,
        "has_pdf": ev.pdf_path is not None,
        "created_at": ev.created_at,
        "processed_at": ev.processed_at,
        "updated_at": ev.updated_at,
    }


async def create_evidence(
    db: Session,
    user: User,
    file: UploadFile,
    project_id: Optional[int] = None,
    officer_review: Optional[str] = None,
) -> dict:
    """Full pipeline: validate → store → extract EXIF → generate PDF → persist."""
    from app.services.misc_service import log_action

    # 1. Validate project association
    project_name = None
    if project_id is not None:
        proj = db.get(Project, project_id)
        if proj is None:
            raise HTTPException(status_code=404, detail="Project not found.")
        project_name = proj.title

    # 2. Validate officer review text length
    clean_review: str | None = None
    if officer_review:
        clean_review = officer_review.strip()
        if len(clean_review) > 2000:
            raise HTTPException(
                status_code=400,
                detail="Officer review text cannot exceed 2000 characters.",
            )
        if not clean_review:
            clean_review = None

    # 3. Validate upload
    content, ext, mime_type = await validate_image_upload(file)

    # 4. Sanitize SVG
    if mime_type == "image/svg+xml":
        content = _sanitize_svg(content)

    # 5. Store file
    upload_dir = _upload_dir()
    stored_name = _safe_stored_name(ext)
    safe_display_name = _sanitize_filename(file.filename or "upload")
    file_path = upload_dir / stored_name
    file_path.write_bytes(content)

    # 6. Create initial DB record
    ev = GeoTagEvidence(
        project_id=project_id,
        original_filename=safe_display_name,
        stored_filename=stored_name,
        mime_type=mime_type,
        file_size_bytes=len(content),
        upload_path=str(file_path.relative_to(Path(__file__).resolve().parents[2])),
        processing_status="processing",
        uploaded_by_id=user.id,
        officer_review=clean_review,
        review_status="pending_review",
    )
    db.add(ev)
    db.flush()  # get the ID before PDF generation

    # 7. Extract EXIF/GPS
    exif_result = extract_exif(content, mime_type)

    # 8. Generate PDF
    pdf_path_rel: str | None = None
    error_msg: str | None = None
    status = "geo_available" if exif_result["geo_available"] else "geo_missing"
    processed_at = datetime.now(timezone.utc)

    try:
        pdf_path = generate_evidence_pdf(
            evidence_id=ev.id,
            original_filename=safe_display_name,
            mime_type=mime_type,
            upload_timestamp=ev.created_at,
            processed_at=processed_at,
            project_id=project_id,
            exif_available=exif_result["exif_available"],
            geo_available=exif_result["geo_available"],
            latitude=exif_result["latitude"],
            longitude=exif_result["longitude"],
            exif_data=exif_result["exif_data"],
            processing_status=status,
            image_bytes=content,
            output_dir=upload_dir,
            officer_review=clean_review,
            review_status="pending_review",
            project_name=project_name,
        )
        backend_root = Path(__file__).resolve().parents[2]
        pdf_path_rel = str(pdf_path.relative_to(backend_root))
    except Exception as exc:
        status = "failed"
        error_msg = f"PDF generation failed: {exc}"

    # 9. Update record
    ev.exif_available = exif_result["exif_available"]
    ev.geo_available = exif_result["geo_available"]
    ev.latitude = exif_result["latitude"]
    ev.longitude = exif_result["longitude"]
    ev.exif_data = exif_result["exif_data"]
    ev.processing_status = status
    ev.error_message = error_msg
    ev.processed_at = processed_at
    ev.pdf_path = pdf_path_rel

    db.commit()
    db.refresh(ev)

    # 10. Audit log
    log_action(
        db, user.id, "geotag_upload",
        entity_type="geotag_evidence", entity_id=ev.id,
        detail={
            "original_filename": safe_display_name,
            "mime_type": mime_type,
            "geo_available": exif_result["geo_available"],
            "processing_status": status,
            "project_id": project_id,
            "has_officer_review": bool(clean_review),
        },
    )

    return _evidence_out(ev, db=db)


def list_evidence(
    db: Session,
    user: User,
    page: int = 1,
    page_size: int = 50,
    project_id: Optional[int] = None,
    status: Optional[str] = None,
    review_status: Optional[str] = None,
) -> dict:
    """Paginated list of evidence records. Ministry/officer see all; others see their own."""
    page = max(page, 1)
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)

    q = select(GeoTagEvidence)

    # Scope: non-ministry non-officer users see only their own uploads
    if user.role not in ("ministry", "officer"):
        q = q.where(GeoTagEvidence.uploaded_by_id == user.id)

    if project_id is not None:
        q = q.where(GeoTagEvidence.project_id == project_id)
    if status:
        q = q.where(GeoTagEvidence.processing_status == status)
    if review_status:
        q = q.where(GeoTagEvidence.review_status == review_status)

    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(
        q.order_by(GeoTagEvidence.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return {
        "items": [_evidence_out(ev, db=db) for ev in rows],
        **paginate_meta(page, page_size, total),
    }


def get_evidence(db: Session, user: User, evidence_id: int) -> dict:
    ev = db.get(GeoTagEvidence, evidence_id)
    if ev is None:
        raise HTTPException(status_code=404, detail="Evidence record not found.")
    # Scope check
    if user.role not in ("ministry", "officer") and ev.uploaded_by_id != user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions.")
    return _evidence_out(ev, db=db)


def get_evidence_metadata(db: Session, user: User, evidence_id: int) -> dict:
    ev = db.get(GeoTagEvidence, evidence_id)
    if ev is None:
        raise HTTPException(status_code=404, detail="Evidence record not found.")
    if user.role not in ("ministry", "officer") and ev.uploaded_by_id != user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions.")
    return {
        "id": ev.id,
        "exif_available": ev.exif_available,
        "geo_available": ev.geo_available,
        "latitude": float(ev.latitude) if ev.latitude is not None else None,
        "longitude": float(ev.longitude) if ev.longitude is not None else None,
        "exif_data": ev.exif_data,
        "geo_status_message": (
            "Geo-location available" if ev.geo_available
            else "Geo-location data not available"
        ),
    }


def update_review(
    db: Session,
    user: User,
    evidence_id: int,
    review_status: Optional[str] = None,
    officer_review: Optional[str] = None,
) -> dict:
    """Update officer review / observation text and/or review status."""
    from app.services.misc_service import log_action

    ev = db.get(GeoTagEvidence, evidence_id)
    if ev is None:
        raise HTTPException(status_code=404, detail="Evidence record not found.")

    if user.role not in ("ministry", "officer") and ev.uploaded_by_id != user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions.")

    if review_status is not None:
        if review_status not in ("pending_review", "reviewed"):
            raise HTTPException(
                status_code=400,
                detail="Invalid review_status. Allowed values: 'pending_review', 'reviewed'",
            )
        ev.review_status = review_status
        if review_status == "reviewed":
            ev.reviewed_at = datetime.now(timezone.utc)
            ev.reviewed_by_id = user.id
        else:
            ev.reviewed_at = None
            ev.reviewed_by_id = None

    if officer_review is not None:
        clean_text = officer_review.strip()
        if len(clean_text) > 2000:
            raise HTTPException(
                status_code=400,
                detail="Officer review text cannot exceed 2000 characters.",
            )
        ev.officer_review = clean_text or None

    db.commit()
    db.refresh(ev)

    log_action(
        db, user.id, "geotag_review_update",
        entity_type="geotag_evidence", entity_id=ev.id,
        detail={
            "review_status": ev.review_status,
            "has_officer_review": bool(ev.officer_review),
        },
    )

    return _evidence_out(ev, db=db)


def serve_pdf(db: Session, user: User, evidence_id: int) -> tuple[bytes, str]:
    """Return (pdf_bytes, filename). Raises 404/403/400 on failure."""
    ev = db.get(GeoTagEvidence, evidence_id)
    if ev is None:
        raise HTTPException(status_code=404, detail="Evidence record not found.")
    if user.role not in ("ministry", "officer") and ev.uploaded_by_id != user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions.")
    if not ev.pdf_path:
        raise HTTPException(status_code=404, detail="PDF not yet generated for this evidence.")

    backend_root = Path(__file__).resolve().parents[2]
    pdf_path = backend_root / ev.pdf_path
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found on server.")

    return pdf_path.read_bytes(), f"GeoTag_Evidence_{evidence_id}.pdf"

