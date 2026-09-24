"""FastAPI endpoints for Citizen Issue Reports & Government Review Integration."""
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.auth.rbac import get_current_user, require_roles
from app.database.session import get_db
from app.models import Role, User
from app.schemas.citizen_report import (
    CitizenReportCreate,
    CitizenReportOut,
    CitizenReportPublicStatus,
    CitizenReportUpdate,
)
from app.schemas.common import Paginated
from app.services import citizen_reports_service

router = APIRouter(prefix="/citizen-reports", tags=["Citizen Reports"])

# Roles authorized to review citizen reports and resolve issues
CAN_REVIEW = (Role.ministry, Role.officer, Role.state, Role.district)


# ── 1. PUBLIC CITIZEN ENDPOINTS (NO AUTH REQUIRED) ──────────────────────────


@router.post(
    "",
    response_model=CitizenReportPublicStatus,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a citizen issue report",
)
def submit_citizen_report(
    data: CitizenReportCreate,
    db: Session = Depends(get_db),
):
    """Public portal endpoint allowing citizens to submit ground observations."""
    report = citizen_reports_service.create_report(db, data)
    return citizen_reports_service.get_public_tracking(db, report.reference_id)


@router.post(
    "/upload-photo",
    summary="Upload citizen evidence photo with automatic EXIF/GPS detection",
)
async def upload_citizen_photo(
    file: UploadFile = File(...),
):
    """Public upload endpoint for citizen evidence photos."""
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No file provided")

    file_bytes = await file.read()
    if len(file_bytes) > 15 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File exceeds 15MB limit")

    return citizen_reports_service.save_citizen_upload(file_bytes, file.filename)


@router.get(
    "/track/{reference_id}",
    response_model=CitizenReportPublicStatus,
    summary="Track a citizen report by Reference ID (privacy-safe)",
)
def track_citizen_report(
    reference_id: str,
    db: Session = Depends(get_db),
):
    """Public tracking endpoint to view report status without leaking confidential reporter data."""
    return citizen_reports_service.get_public_tracking(db, reference_id)


# ── 2. AUTHORIZED GOVERNMENT CONSOLE ENDPOINTS (LOGIN REQUIRED) ─────────────


@router.get(
    "",
    response_model=Paginated[CitizenReportOut],
    summary="List citizen reports (scope-enforced)",
)
def list_citizen_reports(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    issue_type: Optional[str] = Query(None),
    state_id: Optional[int] = Query(None),
    district_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Authenticated endpoint for government officials to review citizen reports."""
    return citizen_reports_service.list_reports(
        db,
        user,
        page=page,
        page_size=page_size,
        status_filter=status_filter,
        issue_type=issue_type,
        state_id=state_id,
        district_id=district_id,
        search=search,
    )


@router.get(
    "/{report_id}",
    response_model=CitizenReportOut,
    summary="Get citizen report detail including restricted reporter info",
)
def get_citizen_report_detail(
    report_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Authenticated detail endpoint for government officials."""
    return citizen_reports_service.get_report_detail(db, user, report_id)


@router.patch(
    "/{report_id}",
    response_model=CitizenReportOut,
    summary="Update report review status, assign officer, or add resolution remarks",
)
def update_citizen_report(
    report_id: int,
    payload: CitizenReportUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*CAN_REVIEW)),
):
    """Update citizen report review lifecycle."""
    return citizen_reports_service.update_report(db, user, report_id, payload)
