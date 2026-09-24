"""M06 investigation endpoints. Viewers and MPs are read-only; all mutations
require an acting role and pass server-side scope checks in the service."""
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.auth.rbac import get_current_user, require_roles
from app.database.session import get_db
from app.investigation.playbook_loader import load_playbooks
from app.models import Role, User
from app.schemas.common import Paginated
from app.schemas.investigation import (
    ActionCreate,
    ActionOut,
    AssignRequest,
    InvestigationCreate,
    InvestigationDetail,
    InvestigationOut,
    PlaybookOut,
    QueueItem,
    SummaryUpdate,
    TransitionRequest,
)
from app.services import investigation_service

router = APIRouter(prefix="/investigations", tags=["Investigations"])

ACT = (Role.ministry, Role.state, Role.district, Role.officer)
QUEUE_ROLES = (Role.ministry, Role.officer, Role.state, Role.district)
CASE_SORT_KEYS = sorted(investigation_service.CASE_SORT_COLUMNS)


# NOTE: static paths (/queue, /playbooks) are declared before /{investigation_id}
@router.get("/queue", response_model=Paginated[QueueItem],
            summary="Smart investigation queue (risk x financial impact x evidence)")
def investigation_queue(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    risk_level: str | None = Query(None, pattern="^(low|moderate|high|critical)$"),
    state_id: int | None = None,
    district_id: int | None = None,
    has_open_case: bool | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*QUEUE_ROLES)),
):
    """Ranked live from current risk assessments; the breakdown explains every
    score. Restricted to the caller's authorized scope."""
    return investigation_service.queue(
        db, user, page=page, page_size=page_size, risk_level=risk_level,
        state_id=state_id, district_id=district_id, has_open_case=has_open_case)


@router.get("/playbooks", response_model=list[PlaybookOut],
            summary="Investigation playbooks")
def list_playbooks_route(user: User = Depends(get_current_user)):
    return [pb.model_dump() for pb in load_playbooks().values()]


@router.get("/playbooks/{playbook_id}", response_model=PlaybookOut,
            summary="Single playbook")
def get_playbook(playbook_id: str, user: User = Depends(get_current_user)):
    pb = load_playbooks().get(playbook_id)
    if pb is None:
        raise HTTPException(status_code=404, detail="Playbook not found")
    return pb.model_dump()


@router.get("", response_model=Paginated[InvestigationOut],
            summary="List investigation cases (scope-enforced)")
def list_cases(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: str | None = Query(None, pattern="^(open|in_progress|pending_info|closed|dismissed)$"),
    outcome: str | None = Query(
        None, pattern="^(verified_issue|no_issue_found|data_corrected|escalated|inconclusive)$"),
    assigned_to_id: int | None = None,
    project_id: int | None = None,
    overdue: bool | None = None,
    active: bool | None = None,
    sort_by: str = Query("priority", pattern="^(" + "|".join(CASE_SORT_KEYS) + ")$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return investigation_service.list_cases(
        db, user, page=page, page_size=page_size, status=status, outcome=outcome,
        assigned_to_id=assigned_to_id, project_id=project_id, overdue=overdue,
        active=active, sort_by=sort_by, sort_order=sort_order)


@router.post("", response_model=InvestigationDetail, status_code=201,
             summary="Open an investigation case (written reason required)")
def open_case(body: InvestigationCreate, db: Session = Depends(get_db),
              user: User = Depends(require_roles(*ACT))):
    return investigation_service.open_case(
        db, user, project_id=body.project_id, reason=body.reason, alert_id=body.alert_id)


@router.get("/{investigation_id}", response_model=InvestigationDetail,
            summary="Case detail with risk snapshot and playbooks")
def case_detail(investigation_id: int, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    return investigation_service.get_case(db, user, investigation_id)


@router.get("/{investigation_id}/report.pdf",
            summary="Export the investigation package as PDF (audit-logged)",
            response_class=Response)
def export_report(investigation_id: int, db: Session = Depends(get_db),
                  user: User = Depends(require_roles(*ACT))):
    """Complete case package built from the same scoped services the API
    serves. Contains the responsible-AI disclaimer on every page; AI content
    is labeled decision support. Viewers and MPs cannot export."""
    from app.reports import investigation_report

    pdf, case_number = investigation_report.generate(db, user, investigation_id)
    investigation_service.record_report_generated(db, user, investigation_id)
    return Response(content=pdf, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="{case_number}.pdf"'})


@router.get("/{investigation_id}/report.xlsx",
            summary="Export the investigation package as XLSX (audit-logged)",
            response_class=Response)
def export_report_xlsx(investigation_id: int, db: Session = Depends(get_db),
                       user: User = Depends(require_roles(*ACT))):
    """Structured spreadsheet form of the same package (PDF remains the
    primary report). Same RBAC, same audit logging."""
    from app.reports import investigation_xlsx

    content, case_number = investigation_xlsx.generate(db, user, investigation_id)
    investigation_service.record_report_generated(db, user, investigation_id)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{case_number}.xlsx"'})


@router.get("/{investigation_id}/actions", response_model=Paginated[ActionOut],
            summary="Chronological action timeline")
def case_actions(investigation_id: int, page: int = Query(1, ge=1),
                 page_size: int = Query(100, ge=1, le=200),
                 db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return investigation_service.list_actions(db, user, investigation_id,
                                              page=page, page_size=page_size)


@router.post("/{investigation_id}/actions", response_model=ActionOut, status_code=201,
             summary="Record an investigation action (written reason required)")
def add_action(investigation_id: int, body: ActionCreate, db: Session = Depends(get_db),
               user: User = Depends(require_roles(*ACT))):
    return investigation_service.add_action(
        db, user, investigation_id, action_type=body.action_type,
        reason=body.reason, detail=body.detail)


@router.post("/{investigation_id}/transition", response_model=InvestigationDetail,
             summary="Move the case through the state machine (human decision)")
def transition(investigation_id: int, body: TransitionRequest,
               db: Session = Depends(get_db), user: User = Depends(require_roles(*ACT))):
    """Closing statuses additionally require an outcome and outcome note.
    Reopening a closed case requires ministry or officer role."""
    return investigation_service.transition(
        db, user, investigation_id, to_status=body.to_status, reason=body.reason,
        outcome=body.outcome, outcome_note=body.outcome_note)


@router.get("/{investigation_id}/assignees",
            summary="Officers eligible to be assigned this case")
def list_assignees(investigation_id: int, db: Session = Depends(get_db),
                   user: User = Depends(require_roles(*ACT))):
    """Active acting-role users whose own scope covers the case's project —
    the same eligibility rule the assign endpoint enforces."""
    return investigation_service.list_assignees(db, user, investigation_id)


@router.post("/{investigation_id}/assign", response_model=InvestigationDetail,
             summary="Assign the case to an officer")
def assign(investigation_id: int, body: AssignRequest, db: Session = Depends(get_db),
           user: User = Depends(require_roles(*ACT))):
    return investigation_service.assign(
        db, user, investigation_id, assignee_id=body.assignee_id, reason=body.reason)


@router.patch("/{investigation_id}", response_model=InvestigationDetail,
              summary="Update the case summary (the human commits it, incl. Copilot drafts)")
def update_summary(investigation_id: int, body: SummaryUpdate,
                   db: Session = Depends(get_db), user: User = Depends(require_roles(*ACT))):
    return investigation_service.update_summary(
        db, user, investigation_id, summary=body.summary, reason=body.reason,
        source=body.source)
