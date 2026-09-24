from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.rbac import get_current_user
from app.database.session import get_db
from app.models import Project, User
from app.schemas.common import Paginated
from app.schemas.intel import (
    AnomalyOut,
    EarlyWarningOut,
    PredictionsOut,
    ReconciliationOut,
    RelationshipsOut,
    RiskOut,
    RiskFactorOut,
    RiskTimelinePoint,
    SimilarProjectOut,
)
from app.schemas.project import AgencyOut, CategoryOut, ProjectDetail, ProjectListItem
from app.services import intel_service, projects_service

router = APIRouter(prefix="/projects", tags=["Projects"])

SORT_KEYS = sorted(projects_service.SORT_COLUMNS)


def project_pk(project_id: str, db: Session = Depends(get_db)) -> int:
    """Path-param resolver: accepts a numeric id or a project code
    (e.g. MPL-2025-025001), so dossier URLs can use the readable code.
    Scope is NOT checked here — every service already enforces it via
    assert_project_access on the resolved id."""
    if project_id.isdigit():
        return int(project_id)
    pk = db.scalar(select(Project.id).where(Project.code == project_id))
    if pk is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return pk


@router.get("/categories", response_model=list[CategoryOut],
            summary="List project categories (sector lookup for filters)")
def list_categories(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return projects_service.list_categories(db)


@router.get("/agencies", response_model=list[AgencyOut],
            summary="List implementing agencies (department lookup for filters)")
def list_agencies(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return projects_service.list_agencies(db)


@router.get("", response_model=Paginated[ProjectListItem],
            summary="List projects (paginated, filtered, scope-enforced)")
def list_projects(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: str | None = Query(None, max_length=80),
    state_id: int | None = None,
    district_id: int | None = None,
    constituency_id: int | None = None,
    category_id: int | None = None,
    agency_id: int | None = None,
    status: str | None = Query(None, pattern="^(recommended|sanctioned|in_progress|completed|cancelled)$"),
    risk_level: str | None = Query(None, pattern="^(low|moderate|high|critical)$"),
    min_risk: float | None = Query(None, ge=0, le=100),
    max_risk: float | None = Query(None, ge=0, le=100),
    min_expenditure: float | None = Query(None, ge=0),
    max_expenditure: float | None = Query(None, ge=0),
    start_date: date | None = None,
    end_date: date | None = None,
    sort_by: str = Query("risk_score", pattern="^(" + "|".join(SORT_KEYS) + ")$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Results are always restricted to the caller's authorized scope; filter
    parameters can only narrow that scope, never widen it."""
    return projects_service.list_projects(
        db, user, page=page, page_size=page_size, search=search, state_id=state_id,
        district_id=district_id, constituency_id=constituency_id, category_id=category_id,
        agency_id=agency_id,
        status=status, risk_level=risk_level, min_risk=min_risk, max_risk=max_risk,
        min_expenditure=min_expenditure, max_expenditure=max_expenditure,
        start_date=start_date, end_date=end_date, sort_by=sort_by, sort_order=sort_order)


@router.get("/{project_id}", response_model=ProjectDetail, summary="Project detail")
def project_detail(project_id: int = Depends(project_pk), db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    return projects_service.get_project_detail(db, user, project_id)


@router.get("/{project_id}/risk", response_model=RiskOut, tags=["Risk"],
            summary="Current risk assessment with contributing factors")
def project_risk(project_id: int = Depends(project_pk), db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    return intel_service.get_risk(db, user, project_id)


@router.get("/{project_id}/risk/factors", response_model=list[RiskFactorOut], tags=["Risk"],
            summary="Contributing risk factors with evidence")
def project_risk_factors(project_id: int = Depends(project_pk), db: Session = Depends(get_db),
                         user: User = Depends(get_current_user)):
    return intel_service.get_risk(db, user, project_id)["factors"]


@router.get("/{project_id}/risk/timeline", response_model=list[RiskTimelinePoint], tags=["Risk"],
            summary="Chronological risk assessment history")
def project_risk_timeline(project_id: int = Depends(project_pk), db: Session = Depends(get_db),
                          user: User = Depends(get_current_user)):
    return intel_service.get_risk_timeline(db, user, project_id)


@router.get("/{project_id}/anomalies", response_model=list[AnomalyOut], tags=["Anomalies"],
            summary="Detected anomalies (AI decision-support signals)")
def project_anomalies(project_id: int = Depends(project_pk), detector: str | None = Query(None, max_length=40),
                      db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return intel_service.get_anomalies(db, user, project_id, detector)


@router.get("/{project_id}/similar", response_model=list[SimilarProjectOut],
            tags=["Similar Projects"],
            summary="Ranked similar projects / duplicate candidates")
def project_similar(project_id: int = Depends(project_pk), limit: int = Query(20, ge=1, le=50),
                    db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Candidates for human verification — never confirmed duplicates."""
    return intel_service.get_similar(db, user, project_id, limit)


@router.get("/{project_id}/relationships", response_model=RelationshipsOut,
            tags=["Relationships"], summary="Entity relationships and network signals")
def project_relationships(project_id: int = Depends(project_pk), db: Session = Depends(get_db),
                          user: User = Depends(get_current_user)):
    return intel_service.get_relationships(db, user, project_id)


@router.get("/{project_id}/reconciliation", response_model=ReconciliationOut,
            tags=["Reconciliation"], summary="Cross-system reconciliation result")
def project_reconciliation(project_id: int = Depends(project_pk), db: Session = Depends(get_db),
                           user: User = Depends(get_current_user)):
    return intel_service.get_reconciliation(db, user, project_id)


@router.get("/{project_id}/predictions", response_model=PredictionsOut, tags=["Predictions"],
            summary="Delay and cost-overrun predictions")
def project_predictions(project_id: int = Depends(project_pk), db: Session = Depends(get_db),
                        user: User = Depends(get_current_user)):
    return intel_service.get_predictions(db, user, project_id)


@router.get("/{project_id}/early-warning", response_model=EarlyWarningOut, tags=["Predictions"],
            summary="Early-warning signals for this project")
def project_early_warning(project_id: int = Depends(project_pk), db: Session = Depends(get_db),
                          user: User = Depends(get_current_user)):
    return intel_service.get_early_warning(db, user, project_id)
