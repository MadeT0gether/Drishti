from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth.rbac import get_current_user, require_roles
from app.database.session import get_db
from app.models import Role, User
from app.schemas.common import Paginated
from app.schemas.misc import AlertOut, ModelVersionOut
from app.services import misc_service

alerts_router = APIRouter(prefix="/alerts", tags=["Alerts"])
models_router = APIRouter(prefix="/models", tags=["Models"])

# Model governance is an internal technical/admin function: ministry only.
# Every other role — monitoring officers included — consumes the models'
# OUTPUTS (risk scores, alert explanations, case evidence) in context.
MODEL_GOVERNANCE = (Role.ministry,)


@alerts_router.get("", response_model=Paginated[AlertOut],
                   summary="Alerts (paginated, scope-enforced)")
def list_alerts(
    severity: str | None = Query(None, pattern="^(low|medium|high|critical)$"),
    status: str | None = Query(None, pattern="^(open|acknowledged|closed)$"),
    state_id: int | None = None,
    district_id: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return misc_service.list_alerts(db, user, severity=severity, status=status,
                                    state_id=state_id, district_id=district_id,
                                    page=page, page_size=page_size)


@alerts_router.get("/stats", summary="Scoped alert summary for the header tiles")
def alert_stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Open-alert counts by severity, multi-signal count, and highest current
    risk score — all restricted to the caller's authorized scope."""
    return misc_service.alert_stats(db, user)


@alerts_router.get("/rules", summary="Alerting rules as configured in the ML pipeline")
def alert_rules(user: User = Depends(get_current_user)):
    """Read-only: when alerts fire, their severity mapping, and routing —
    sourced from the pipeline's own config, not hand-maintained copy."""
    return misc_service.alert_rules()


@alerts_router.get("/{alert_id}", response_model=AlertOut, summary="Alert detail")
def get_alert(alert_id: int, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    return misc_service.get_alert(db, user, alert_id)


@models_router.get("", response_model=list[ModelVersionOut],
                   summary="Model registry with genuine evaluation metrics")
def list_models(db: Session = Depends(get_db),
                user: User = Depends(require_roles(*MODEL_GOVERNANCE))):
    """All metrics come from actual evaluation runs against the ground-truth
    ledger (data/evaluation/metrics.json) — nothing is fabricated."""
    return misc_service.list_models(db)


@models_router.get("/evaluation", summary="Full evaluation report (measured metrics only)")
def evaluation_report(db: Session = Depends(get_db),
                      user: User = Depends(require_roles(*MODEL_GOVERNANCE))):
    """Complete metrics.json artifact: P@K series, confusion matrices, feature
    importances, per-variant recalls, methodology notes. Aggregates only —
    the ground-truth ledger itself is never exposed."""
    return misc_service.evaluation_report(db)


ACT_ROLES = (Role.ministry, Role.officer, Role.state, Role.district)


@models_router.get("/risk/simulation",
                   summary="Risk-threshold what-if data (SIMULATION only, read-only)")
def risk_threshold_simulation(db: Session = Depends(get_db),
                              user: User = Depends(require_roles(*ACT_ROLES))):
    """Scoped risk-score histogram + documented level boundaries for the
    client-side what-if slider. No production score, level, or priority is
    modified or recomputed."""
    return misc_service.risk_threshold_simulation(db, user)


@models_router.get("/{name}", response_model=ModelVersionOut, summary="Model version detail")
def get_model(name: str, db: Session = Depends(get_db),
              user: User = Depends(require_roles(*MODEL_GOVERNANCE))):
    return misc_service.get_model(db, name)
