"""Service layer for Citizen Issue Reports (DRISHTI Transparency Portal).

Implements:
- Unique Reference ID generation (e.g. DRISHTI-F93A12)
- Submission creation with validation and photo persistence
- Public tracking by Reference ID (privacy-safe, no personal info exposed)
- Scoped report querying for government console
- Status review lifecycle management and resolution remarks
"""
import os
import random
import string
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import Select, desc, func, select
from sqlalchemy.orm import Session, joinedload

from app.config import get_settings
from app.models import CitizenReport, District, Project, Role, State, User
from app.schemas.citizen_report import (
    CitizenReportCreate,
    CitizenReportOut,
    CitizenReportPublicStatus,
    CitizenReportUpdate,
)
from app.schemas.common import Paginated, paginate_meta
from app.services.geotag_service import extract_exif, _sniff_mime

ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def generate_reference_id(db: Session) -> str:
    """Generate a unique DRISHTI-XXXXXX reference ID."""
    chars = string.ascii_uppercase + string.digits
    for _ in range(20):
        code = "".join(random.choices(chars, k=6))
        ref_id = f"DRISHTI-{code}"
        exists = db.scalar(select(func.count()).select_from(CitizenReport).where(CitizenReport.reference_id == ref_id))
        if not exists:
            return ref_id
    # Fallback to UUID prefix
    return f"DRISHTI-{uuid.uuid4().hex[:6].upper()}"


def save_citizen_upload(file_bytes: bytes, filename: str) -> dict[str, Any]:
    """Save an uploaded citizen photo, extract EXIF/GPS if available."""
    settings = get_settings()
    upload_dir = os.path.join(settings.upload_dir, "citizen_reports")
    os.makedirs(upload_dir, exist_ok=True)

    ext = os.path.splitext(filename)[1].lower() or ".jpg"
    unique_name = f"{uuid.uuid4().hex}{ext}"
    target_path = os.path.join(upload_dir, unique_name)

    with open(target_path, "wb") as f:
        f.write(file_bytes)

    # Extract metadata using geotag_service.extract_exif
    mime = _sniff_mime(file_bytes, ext) or "image/jpeg"
    exif_res = extract_exif(file_bytes, mime)
    lat = exif_res.get("latitude")
    lon = exif_res.get("longitude")
    exif_data = exif_res.get("exif_data") or {}

    return {
        "original_filename": filename,
        "stored_filename": unique_name,
        "file_size": len(file_bytes),
        "url": f"/uploads/citizen_reports/{unique_name}",
        "latitude": lat,
        "longitude": lon,
        "has_gps": lat is not None and lon is not None,
        "exif_summary": {
            "make": exif_data.get("Make"),
            "model": exif_data.get("Model"),
            "datetime": exif_data.get("DateTime"),
        } if exif_data else None,
    }


def create_report(db: Session, data: CitizenReportCreate) -> CitizenReport:
    """Create a new citizen issue report."""
    ref_id = generate_reference_id(db)

    # If project_id is given, pull state & district if not provided
    project = None
    if data.project_id:
        project = db.get(Project, data.project_id)
        if project:
            if not data.state_id and project.state_id:
                data.state_id = project.state_id
            if not data.district_id and project.district_id:
                data.district_id = project.district_id

    report = CitizenReport(
        reference_id=ref_id,
        issue_type=data.issue_type,
        project_id=data.project_id,
        custom_project_name=data.custom_project_name,
        state_id=data.state_id,
        district_id=data.district_id,
        village_locality=data.village_locality,
        description=data.description,
        photos=data.photos,
        latitude=data.latitude,
        longitude=data.longitude,
        location_confirmed=data.location_confirmed,
        observation_datetime=data.observation_datetime or datetime.now(timezone.utc),
        reporter_name=data.reporter_name,
        reporter_mobile=data.reporter_mobile,
        reporter_email=data.reporter_email,
        reporter_relationship=data.reporter_relationship,
        status="submitted",
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


def get_public_tracking(db: Session, reference_id: str) -> CitizenReportPublicStatus:
    """Lookup a report by Reference ID with privacy protection (NO personal reporter info)."""
    clean_ref = reference_id.strip().upper()
    report = (
        db.query(CitizenReport)
        .options(
            joinedload(CitizenReport.project),
            joinedload(CitizenReport.state),
            joinedload(CitizenReport.district),
        )
        .filter(CitizenReport.reference_id == clean_ref)
        .first()
    )
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report with Reference ID '{clean_ref}' not found.",
        )

    project_title = report.project.title if report.project else report.custom_project_name
    project_code = report.project.code if report.project else None
    state_name = report.state.name if report.state else None
    district_name = report.district.name if report.district else None

    return CitizenReportPublicStatus(
        reference_id=report.reference_id,
        issue_type=report.issue_type,
        status=report.status,
        created_at=report.created_at,
        updated_at=report.updated_at,
        resolved_at=report.resolved_at,
        project_title=project_title,
        project_code=project_code,
        district_name=district_name,
        state_name=state_name,
        resolution_remarks=report.resolution_remarks,
    )


def _to_report_out(r: CitizenReport) -> CitizenReportOut:
    return CitizenReportOut(
        id=r.id,
        reference_id=r.reference_id,
        issue_type=r.issue_type,
        project_id=r.project_id,
        project_code=r.project.code if r.project else None,
        project_title=r.project.title if r.project else r.custom_project_name,
        custom_project_name=r.custom_project_name,
        state_id=r.state_id,
        state_name=r.state.name if r.state else None,
        district_id=r.district_id,
        district_name=r.district.name if r.district else None,
        village_locality=r.village_locality,
        description=r.description,
        photos=r.photos or [],
        latitude=float(r.latitude) if r.latitude is not None else None,
        longitude=float(r.longitude) if r.longitude is not None else None,
        location_confirmed=r.location_confirmed,
        observation_datetime=r.observation_datetime,
        reporter_name=r.reporter_name,
        reporter_mobile=r.reporter_mobile,
        reporter_email=r.reporter_email,
        reporter_relationship=r.reporter_relationship,
        status=r.status,
        assigned_to_id=r.assigned_to_id,
        assigned_to_name=r.assigned_to.name if r.assigned_to else None,
        resolution_remarks=r.resolution_remarks,
        resolved_at=r.resolved_at,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


def list_reports(
    db: Session,
    user: User,
    page: int = 1,
    page_size: int = 25,
    status_filter: Optional[str] = None,
    issue_type: Optional[str] = None,
    state_id: Optional[int] = None,
    district_id: Optional[int] = None,
    search: Optional[str] = None,
) -> Paginated[CitizenReportOut]:
    """List citizen reports with RBAC scope enforcement."""
    stmt = (
        select(CitizenReport)
        .options(
            joinedload(CitizenReport.project),
            joinedload(CitizenReport.state),
            joinedload(CitizenReport.district),
            joinedload(CitizenReport.assigned_to),
        )
        .order_by(desc(CitizenReport.created_at))
    )

    # Apply RBAC user scope
    if user.role == Role.state and user.state_id:
        stmt = stmt.where(CitizenReport.state_id == user.state_id)
    elif user.role == Role.district and user.district_id:
        stmt = stmt.where(CitizenReport.district_id == user.district_id)

    # Optional query filters
    if status_filter:
        stmt = stmt.where(CitizenReport.status == status_filter)
    if issue_type:
        stmt = stmt.where(CitizenReport.issue_type == issue_type)
    if state_id and user.role in (Role.ministry, Role.officer, Role.viewer):
        stmt = stmt.where(CitizenReport.state_id == state_id)
    if district_id and user.role in (Role.ministry, Role.officer, Role.state, Role.viewer):
        stmt = stmt.where(CitizenReport.district_id == district_id)

    if search:
        s = f"%{search.strip()}%"
        stmt = stmt.where(
            (CitizenReport.reference_id.ilike(s))
            | (CitizenReport.description.ilike(s))
            | (CitizenReport.village_locality.ilike(s))
            | (CitizenReport.custom_project_name.ilike(s))
        )

    # Count total
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(count_stmt) or 0

    items = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()

    meta = paginate_meta(page, page_size, total)
    return Paginated(
        items=[_to_report_out(r) for r in items],
        **meta,
    )


def get_report_detail(db: Session, user: User, report_id: int) -> CitizenReportOut:
    """Get single citizen report detail with scope check."""
    report = (
        db.query(CitizenReport)
        .options(
            joinedload(CitizenReport.project),
            joinedload(CitizenReport.state),
            joinedload(CitizenReport.district),
            joinedload(CitizenReport.assigned_to),
        )
        .filter(CitizenReport.id == report_id)
        .first()
    )
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    # Scope validation
    if user.role == Role.state and user.state_id and report.state_id != user.state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Report outside your authorized scope")
    if user.role == Role.district and user.district_id and report.district_id != user.district_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Report outside your authorized scope")

    return _to_report_out(report)


def update_report(db: Session, user: User, report_id: int, payload: CitizenReportUpdate) -> CitizenReportOut:
    """Update citizen report status, assign officer, or add resolution remarks."""
    report = db.get(CitizenReport, report_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    # Scope validation
    if user.role == Role.state and user.state_id and report.state_id != user.state_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Report outside your authorized scope")
    if user.role == Role.district and user.district_id and report.district_id != user.district_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Report outside your authorized scope")

    if payload.status:
        report.status = payload.status
        if payload.status == "resolved":
            report.resolved_at = datetime.now(timezone.utc)
        elif report.resolved_at and payload.status != "resolved":
            report.resolved_at = None

    if payload.assigned_to_id is not None:
        report.assigned_to_id = payload.assigned_to_id

    if payload.resolution_remarks is not None:
        report.resolution_remarks = payload.resolution_remarks

    db.commit()
    db.refresh(report)
    return get_report_detail(db, user, report_id)
