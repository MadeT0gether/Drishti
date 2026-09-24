from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy.orm import Session

from app.api.ingest import _read_csv_upload
from app.auth.rbac import get_current_user, require_roles
from app.database.session import get_db
from app.models import Role, User
from app.services import export_service, misc_service
from app.services.data_quality import quality_report
from app.services.ingestion import commit_csv, validate_csv

router = APIRouter(prefix="/data", tags=["Data Quality"])


@router.get("/quality", summary="Data-quality intelligence report")
def data_quality(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return quality_report(db)


_EXPORTERS = {
    "completed-works": ("completed_works.csv", export_service.completed_works_csv),
    "recommended-works": ("recommended_works.csv", export_service.recommended_works_csv),
    "expenditures": ("expenditures.csv", export_service.expenditures_csv),
    "mp-summary": ("mp_summary.csv", export_service.mp_summary_csv),
}


@router.get("/export/{dataset}", summary="Public dataset export (CSV/JSON)")
def export_dataset(dataset: str, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    """Public-safe transparency exports: project identity, location, sector,
    financial summary and reported progress only. Scope-enforced like every
    other project read; no risk, anomaly or investigation data is included."""
    if dataset == "current":
        return JSONResponse(
            content=export_service.current_snapshot_json(db, user),
            headers={"Content-Disposition": 'attachment; filename="current_data.json"'})
    entry = _EXPORTERS.get(dataset)
    if entry is None:
        raise HTTPException(status_code=404, detail="Unknown export dataset")
    filename, fn = entry
    return PlainTextResponse(
        content=fn(db, user), media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.post("/upload", summary="Validate a CSV and preview (no writes)")
async def upload_preview(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.ministry, Role.state, Role.district)),
):
    content = await _read_csv_upload(file)
    result = validate_csv(content, db)
    result.pop("rows", None)
    return result


@router.post("/upload/commit", summary="Validate and import CSV rows")
async def upload_commit(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(Role.ministry, Role.state, Role.district)),
):
    content = await _read_csv_upload(file)
    result = commit_csv(content, db)
    misc_service.log_action(db, user.id, "csv_upload_commit", detail={
        "inserted": result.get("inserted"), "rejected": result.get("rejected")})
    return result
