from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.rbac import get_current_user, require_roles
from app.config import get_settings
from app.database.session import get_db
from app.models import Role, User
from app.services import geotag_service

router = APIRouter(prefix="/geotag", tags=["GeoTag-1"])

# Roles that may upload evidence or update review status
_CAN_UPLOAD = require_roles(
    Role.ministry, Role.officer, Role.state, Role.district,
)


class ReviewUpdatePayload(BaseModel):
    review_status: Optional[str] = Field(
        None,
        description="New review status: 'pending_review' or 'reviewed'",
        pattern="^(pending_review|reviewed)$",
    )
    officer_review: Optional[str] = Field(
        None,
        description="Human observation / review notes (max 2000 chars)",
        max_length=2000,
    )


@router.get("/config", summary="GeoTag-1 upload configuration (public settings)")
def geotag_config(user: User = Depends(get_current_user)):
    """Return upload constraints so the frontend can display accurate limits."""
    s = get_settings()
    return {
        "max_file_mb": s.geotag_max_file_mb,
        "accepted_formats": ["JPG", "JPEG", "PNG", "WEBP", "SVG"],
        "accepted_mime_types": list(geotag_service.ALLOWED_MIMES),
    }


@router.get("/projects/search", summary="Search projects by ID or Name for association")
def search_projects(
    q: str = Query(..., min_length=1, max_length=80, description="Project ID, code, or name query"),
    limit: int = Query(10, ge=1, le=20),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Autocomplete endpoint to find projects by ID or title/name."""
    return geotag_service.search_projects(db, q, limit=limit)


@router.post("/upload", summary="Upload an image for geo-tag evidence processing")
async def upload_evidence(
    file: UploadFile = File(..., description="Image file (JPG, JPEG, PNG, WEBP, SVG)"),
    project_id: Optional[int] = Form(
        None,
        description="Optional project ID to associate with this evidence",
    ),
    officer_review: Optional[str] = Form(
        None,
        description="Optional officer review or human observation notes (max 2000 chars)",
    ),
    db: Session = Depends(get_db),
    user: User = Depends(_CAN_UPLOAD),
):
    """Upload and process an image file as geo-tagged evidence.

    The image is validated, EXIF/GPS metadata is extracted (if present),
    and a standardised PDF evidence record is generated.

    Optionally links to a project ID and includes officer review / observation notes.
    Initial review_status is 'pending_review'.

    Geo-location signals are decision-support only, not findings of misconduct.
    """
    return await geotag_service.create_evidence(
        db, user, file, project_id=project_id, officer_review=officer_review
    )


@router.get("", summary="List geo-tagged evidence records")
def list_evidence(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    project_id: Optional[int] = None,
    status: Optional[str] = None,
    review_status: Optional[str] = Query(None, pattern="^(pending_review|reviewed)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Paginated list of evidence records.

    Ministry and Monitoring Officer roles see all records.
    Other roles see only their own uploads.
    """
    return geotag_service.list_evidence(
        db, user, page=page, page_size=page_size, project_id=project_id, status=status, review_status=review_status
    )


@router.get("/{evidence_id}", summary="Get a single evidence record")
def get_evidence(
    evidence_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return geotag_service.get_evidence(db, user, evidence_id)


@router.patch("/{evidence_id}/review", summary="Update officer review observation or review status")
def update_review(
    evidence_id: int,
    payload: ReviewUpdatePayload,
    db: Session = Depends(get_db),
    user: User = Depends(_CAN_UPLOAD),
):
    """Update officer review / human observation text and/or update review status ('reviewed' vs 'pending_review')."""
    return geotag_service.update_review(
        db,
        user,
        evidence_id,
        review_status=payload.review_status,
        officer_review=payload.officer_review,
    )


@router.get("/{evidence_id}/metadata", summary="Get full EXIF metadata for an evidence record")
def get_evidence_metadata(
    evidence_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return the full extracted EXIF metadata dictionary."""
    return geotag_service.get_evidence_metadata(db, user, evidence_id)


@router.get("/{evidence_id}/pdf", summary="Download the standardised PDF evidence record")
def download_pdf(
    evidence_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Serve the generated PDF evidence document."""
    pdf_bytes, filename = geotag_service.serve_pdf(db, user, evidence_id)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )

