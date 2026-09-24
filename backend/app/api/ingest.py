from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.auth.rbac import get_current_user, require_roles
from app.database.session import get_db
from app.models import Role, User
from app.services.data_quality import quality_report
from app.services.ingestion import commit_csv, validate_csv

router = APIRouter(prefix="/data", tags=["data"])

MAX_UPLOAD_BYTES = 10 * 1024 * 1024


async def _read_csv_upload(file: UploadFile) -> bytes:
    if file.filename and not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are accepted")
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 10 MB limit")
    return content


@router.post("/upload")
async def upload_preview(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.ministry, Role.state, Role.district)),
):
    """Validate a CSV and return mapping, preview, and per-row errors. No writes."""
    content = await _read_csv_upload(file)
    result = validate_csv(content, db)
    result.pop("rows", None)  # full clean rows not needed in the preview response
    return result


@router.post("/upload/commit")
async def upload_commit(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.ministry, Role.state, Role.district)),
):
    """Validate and insert the valid rows. Rejected rows are reported with reasons."""
    content = await _read_csv_upload(file)
    return commit_csv(content, db)


@router.get("/quality")
def data_quality(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return quality_report(db)
