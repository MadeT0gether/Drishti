"""M06 investigation workflow: smart queue, case lifecycle, actions, audit.

Rules enforced here (not just in the UI):
- every state-affecting call requires a written human reason;
- the state machine below is the only path between statuses;
- one active case per project (DB partial unique index is the backstop);
- investigation_actions is append-only;
- every event is mirrored to audit_logs with entity_type="project" so the
  existing /audit/{project_id} trail shows investigation history unchanged.
"""
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, aliased

from app.investigation.playbook_loader import load_playbooks, playbooks_for_factors
from app.investigation.queue_config import (
    EVIDENCE_WEIGHTS,
    FINANCIAL_FLOOR,
    FINANCIAL_SPAN,
    SLA_DAYS,
    priority_breakdown,
)
from app.models import (
    Alert,
    AuditLog,
    District,
    Investigation,
    InvestigationAction,
    InvestigationOutcome,
    InvestigationStatus,
    Project,
    RiskAssessment,
    RiskFactor,
    Role,
    State,
    User,
)
from app.schemas.common import MAX_PAGE_SIZE, paginate_meta
from app.services.scope import assert_project_access, scoped_projects

ACTIVE_STATUSES = (InvestigationStatus.open, InvestigationStatus.in_progress,
                   InvestigationStatus.pending_info)

VALID_TRANSITIONS: dict[InvestigationStatus, set[InvestigationStatus]] = {
    InvestigationStatus.open: {InvestigationStatus.in_progress, InvestigationStatus.dismissed},
    InvestigationStatus.in_progress: {InvestigationStatus.pending_info,
                                      InvestigationStatus.closed, InvestigationStatus.dismissed},
    InvestigationStatus.pending_info: {InvestigationStatus.in_progress, InvestigationStatus.closed},
    InvestigationStatus.closed: {InvestigationStatus.in_progress},      # reopen
    InvestigationStatus.dismissed: {InvestigationStatus.in_progress},   # reopen
}

TERMINAL = {InvestigationStatus.closed, InvestigationStatus.dismissed}
REOPEN_ROLES = {Role.ministry, Role.officer}


def _require_officer_authority(user: User, inv, *, final: bool = False) -> None:
    """'See broadly, act narrowly': monitoring officers hold national READ
    visibility, but may act only on investigations assigned to them, and may
    never record final decisions (close/dismiss) — those rest with the
    accountable operational roles. Reopening is the one oversight exception,
    handled by REOPEN_ROLES in transition()."""
    if user.role != Role.officer:
        return
    if final:
        raise HTTPException(
            status_code=403,
            detail="Monitoring officers cannot close or dismiss investigations — "
                   "final decisions rest with the authorized operational officials")
    if inv.assigned_to_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="Monitoring officers may act only on investigations assigned to them")

# action types an officer may create directly via POST /actions
USER_ACTION_TYPES = {"note_added", "evidence_reviewed", "info_requested",
                     "playbook_step_completed"}

CASE_SORT_COLUMNS = {
    "priority": Investigation.priority_score,
    "sla_due_at": Investigation.sla_due_at,
    "created_at": Investigation.created_at,
    "updated_at": Investigation.updated_at,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _audit(db: Session, user: User, action: str, project_id: int, detail: dict) -> None:
    """Same-transaction audit row; entity_type='project' so the existing
    project audit trail picks investigation events up without query changes."""
    db.add(AuditLog(user_id=user.id, action=action, entity_type="project",
                    entity_id=project_id, detail=detail))


def _require_reason(reason: str | None) -> str:
    if not reason or not reason.strip():
        raise HTTPException(status_code=422, detail="A written reason is required for this action")
    return reason.strip()


def _get_case(db: Session, user: User, investigation_id: int) -> tuple[Investigation, Project]:
    inv = db.get(Investigation, investigation_id)
    if inv is None:
        raise HTTPException(status_code=404, detail="Investigation not found")
    project = assert_project_access(db.get(Project, inv.project_id), user)
    return inv, project


def _scope_p95(db: Session, user: User) -> float | None:
    scoped_ids = scoped_projects(select(Project.id), user).scalar_subquery()
    val = db.scalar(select(func.percentile_cont(0.95).within_group(Project.expenditure))
                    .where(Project.id.in_(scoped_ids)))
    return float(val) if val is not None else None


def _priority_sql(p95: float | None, ra):
    """SQL expression mirroring queue_config.priority_breakdown (used for
    ORDER BY/pagination; the displayed values come from the Python formula)."""
    if p95 and p95 > 0:
        ratio = func.least(1.0, func.ln(1.0 + func.greatest(Project.expenditure, 0)) / func.ln(1.0 + p95))
        fin_w = FINANCIAL_FLOOR + FINANCIAL_SPAN * ratio
    else:
        fin_w = 1.0
    ev_w = case(
        *[(ra.evidence_strength == k, w) for k, w in EVIDENCE_WEIGHTS.items()],
        else_=1.0,
    )
    return ra.score * fin_w * ev_w


# ── smart queue ───────────────────────────────────────────────────────────
def queue(db: Session, user: User, *, page=1, page_size=50, risk_level=None,
          state_id=None, district_id=None, has_open_case=None) -> dict:
    page = max(page, 1)
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)
    ra = RiskAssessment
    p95 = _scope_p95(db, user)
    priority = _priority_sql(p95, ra).label("priority")

    active_case = aliased(Investigation)
    base = (
        select(Project, ra.score, ra.level, ra.evidence_strength, priority,
               active_case.id, active_case.case_number, active_case.status,
               District.name, State.name)
        .join(ra, (ra.project_id == Project.id) & ra.is_current.is_(True))
        .outerjoin(active_case, (active_case.project_id == Project.id)
                   & active_case.status.in_(ACTIVE_STATUSES))
        .join(District, District.id == Project.district_id)
        .join(State, State.id == Project.state_id)
    )
    base = scoped_projects(base, user)

    if risk_level:
        base = base.where(ra.level == risk_level)
    if state_id is not None:
        base = base.where(Project.state_id == state_id)
    if district_id is not None:
        base = base.where(Project.district_id == district_id)
    if has_open_case is True:
        base = base.where(active_case.id.isnot(None))
    elif has_open_case is False:
        base = base.where(active_case.id.is_(None))

    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.execute(base.order_by(priority.desc(), ra.score.desc(), Project.id)
                      .offset((page - 1) * page_size).limit(page_size)).all()

    items = []
    for p, score, level, ev, _prio, inv_id, case_no, inv_status, district, state in rows:
        bd = priority_breakdown(float(score), float(p.expenditure), p95, ev.value)
        items.append({
            "project_id": p.id, "code": p.code, "title": p.title, "status": p.status.value,
            "district": district, "state": state,
            "sanctioned_cost": float(p.sanctioned_cost) if p.sanctioned_cost is not None else None,
            "expenditure": float(p.expenditure),
            "risk_score": float(score), "risk_level": level.value,
            "evidence_strength": ev.value,
            "priority_score": bd["priority"], "priority_breakdown": bd,
            "has_open_case": inv_id is not None,
            "investigation_id": inv_id, "case_number": case_no,
            "investigation_status": inv_status.value if inv_status else None,
        })
    return {"items": items, **paginate_meta(page, page_size, total)}


# ── case lifecycle ────────────────────────────────────────────────────────
def open_case(db: Session, user: User, *, project_id: int, reason: str,
              alert_id: int | None = None) -> dict:
    reason = _require_reason(reason)
    project = assert_project_access(db.get(Project, project_id), user)

    existing = db.scalar(select(Investigation).where(
        Investigation.project_id == project_id,
        Investigation.status.in_(ACTIVE_STATUSES)))
    if existing:
        raise HTTPException(status_code=409,
                            detail=f"An active investigation already exists: {existing.case_number}")

    alert = None
    if alert_id is not None:
        alert = db.get(Alert, alert_id)
        if alert is None or alert.project_id != project_id:
            raise HTTPException(status_code=422, detail="Alert does not belong to this project")

    ra = db.scalar(select(RiskAssessment).where(
        RiskAssessment.project_id == project_id, RiskAssessment.is_current.is_(True)))
    if ra is not None:
        p95 = _scope_p95(db, user)
        bd = priority_breakdown(float(ra.score), float(project.expenditure), p95,
                                ra.evidence_strength.value)
        level = ra.level.value
    else:
        bd = {"priority": 0.0, "note": "no current risk assessment at open time"}
        level = "low"

    inv = Investigation(
        case_number=f"PENDING-{secrets.token_hex(6)}",
        project_id=project_id, alert_id=alert_id,
        status=InvestigationStatus.open,
        priority_score=bd["priority"], priority_breakdown=bd,
        risk_assessment_id=ra.id if ra else None,
        assigned_to_id=user.id if user.role == Role.officer else None,
        opened_by_id=user.id,
        sla_due_at=_now() + timedelta(days=SLA_DAYS.get(level, 30)),
    )
    db.add(inv)
    db.flush()
    inv.case_number = f"INV-{_now().year}-{inv.id:05d}"

    db.add(InvestigationAction(
        investigation_id=inv.id, user_id=user.id, action_type="opened",
        reason=reason, from_status=None, to_status=InvestigationStatus.open.value,
        detail={"alert_id": alert_id, "priority": bd["priority"]}))
    if alert is not None and alert.status == "open":
        alert.status = "acknowledged"
    _audit(db, user, "investigation.opened", project_id,
           {"case_number": inv.case_number, "investigation_id": inv.id, "reason": reason})
    db.commit()
    return get_case(db, user, inv.id)


def transition(db: Session, user: User, investigation_id: int, *, to_status: str,
               reason: str, outcome: str | None = None,
               outcome_note: str | None = None) -> dict:
    reason = _require_reason(reason)
    inv, project = _get_case(db, user, investigation_id)
    try:
        target = InvestigationStatus(to_status)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Unknown status '{to_status}'")

    allowed = VALID_TRANSITIONS[inv.status]
    if target not in allowed:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot move from '{inv.status.value}' to '{target.value}'. "
                   f"Allowed: {sorted(s.value for s in allowed)}")

    is_reopen = inv.status in TERMINAL

    if target in TERMINAL:
        if not outcome or not (outcome_note and outcome_note.strip()):
            raise HTTPException(
                status_code=422,
                detail="Closing a case requires an outcome and a written outcome note")
        try:
            inv.outcome = InvestigationOutcome(outcome)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Unknown outcome '{outcome}'")
        inv.outcome_note = outcome_note.strip()
        inv.closed_at = _now()
        action_type = "outcome_recorded"
        detail = {"outcome": inv.outcome.value, "outcome_note": inv.outcome_note}
    elif is_reopen:
        if user.role not in REOPEN_ROLES:
            raise HTTPException(status_code=403,
                                detail="Only ministry or monitoring officers may reopen a case")
        inv.outcome = None
        inv.outcome_note = None
        inv.closed_at = None
        action_type = "reopened"
        detail = {}
    else:
        _require_officer_authority(user, inv, final=False)
        action_type = "status_changed"
        detail = {}

    if not is_reopen and target in TERMINAL:
        _require_officer_authority(user, inv, final=True)

    from_status = inv.status
    inv.status = target
    db.add(InvestigationAction(
        investigation_id=inv.id, user_id=user.id, action_type=action_type,
        reason=reason, from_status=from_status.value, to_status=target.value, detail=detail))
    _audit(db, user, f"investigation.{action_type}", project.id,
           {"case_number": inv.case_number, "from": from_status.value,
            "to": target.value, "reason": reason, **detail})
    db.commit()
    return get_case(db, user, inv.id)


def list_assignees(db: Session, user: User, investigation_id: int) -> list[dict]:
    """Officers eligible to work this case: active, an acting role, and their
    own scope covers the case's project — the same rule assign() enforces."""
    inv, project = _get_case(db, user, investigation_id)
    candidates = db.scalars(
        select(User).where(
            User.is_active.is_(True),
            User.role.notin_([Role.viewer, Role.mp]))
        .order_by(User.full_name)).all()
    out = []
    for c in candidates:
        in_scope = (
            c.role in (Role.ministry, Role.officer)
            or (c.role == Role.state and c.state_id == project.state_id)
            or (c.role == Role.district and c.district_id == project.district_id)
        )
        if in_scope:
            out.append({
                "id": c.id, "full_name": c.full_name, "email": c.email,
                "role": c.role.value,
                "is_current_assignee": c.id == inv.assigned_to_id,
            })
    return out


def assign(db: Session, user: User, investigation_id: int, *, assignee_id: int,
           reason: str) -> dict:
    reason = _require_reason(reason)
    inv, project = _get_case(db, user, investigation_id)
    if inv.status in TERMINAL:
        raise HTTPException(status_code=422, detail="Cannot assign a closed case")
    # Officers may take ownership of an UNASSIGNED case (picking work from the
    # queue is a monitoring function) but cannot reassign someone else's case.
    if not (inv.assigned_to_id is None and assignee_id == user.id):
        _require_officer_authority(user, inv)

    assignee = db.get(User, assignee_id)
    if assignee is None or not assignee.is_active:
        raise HTTPException(status_code=422, detail="Assignee not found or inactive")
    if assignee.role in (Role.viewer, Role.mp):
        raise HTTPException(status_code=422, detail="Assignee role cannot work investigations")
    # assignee's own scope must cover the project
    in_scope = (
        assignee.role in (Role.ministry, Role.officer)
        or (assignee.role == Role.state and assignee.state_id == project.state_id)
        or (assignee.role == Role.district and assignee.district_id == project.district_id)
    )
    if not in_scope:
        raise HTTPException(status_code=422, detail="Assignee's scope does not cover this project")

    inv.assigned_to_id = assignee.id
    db.add(InvestigationAction(
        investigation_id=inv.id, user_id=user.id, action_type="assigned",
        reason=reason, detail={"assignee_id": assignee.id, "assignee_email": assignee.email}))
    _audit(db, user, "investigation.assigned", project.id,
           {"case_number": inv.case_number, "assignee": assignee.email, "reason": reason})
    db.commit()
    return get_case(db, user, inv.id)


def add_action(db: Session, user: User, investigation_id: int, *, action_type: str,
               reason: str, detail: dict | None = None) -> dict:
    reason = _require_reason(reason)
    inv, project = _get_case(db, user, investigation_id)
    if inv.status in TERMINAL:
        raise HTTPException(status_code=422,
                            detail="Case is closed — reopen it before recording actions")
    _require_officer_authority(user, inv)
    if action_type not in USER_ACTION_TYPES:
        raise HTTPException(status_code=422,
                            detail=f"action_type must be one of {sorted(USER_ACTION_TYPES)}")
    detail = detail or {}
    if action_type == "playbook_step_completed":
        books = load_playbooks()
        pb = books.get(detail.get("playbook_id", ""))
        if pb is None or not any(s.id == detail.get("step_id") for s in pb.steps):
            raise HTTPException(status_code=422, detail="Unknown playbook or step id")

    row = InvestigationAction(investigation_id=inv.id, user_id=user.id,
                              action_type=action_type, reason=reason, detail=detail)
    db.add(row)
    _audit(db, user, "investigation.action_added", project.id,
           {"case_number": inv.case_number, "action_type": action_type, "reason": reason})
    db.commit()
    return _action_out(row, user.email)


def record_report_generated(db: Session, user: User, investigation_id: int) -> None:
    """Log a PDF export. Allowed on closed cases too (exporting a closed
    package is normal) — hence not routed through add_action's terminal check."""
    inv, project = _get_case(db, user, investigation_id)
    db.add(InvestigationAction(
        investigation_id=inv.id, user_id=user.id, action_type="report_generated",
        reason="Investigation package (PDF) exported.",
        detail={"case_number": inv.case_number}))
    _audit(db, user, "investigation.report_generated", project.id,
           {"case_number": inv.case_number})
    db.commit()


def update_summary(db: Session, user: User, investigation_id: int, *, summary: str,
                   reason: str, source: str = "manual") -> dict:
    """The only write path for the case summary — including accepting a Copilot
    draft. The human commits it explicitly; the provenance is logged."""
    reason = _require_reason(reason)
    if not summary or not summary.strip():
        raise HTTPException(status_code=422, detail="Summary text is required")
    inv, project = _get_case(db, user, investigation_id)
    if inv.status in TERMINAL:
        raise HTTPException(status_code=422, detail="Case is closed — reopen it to edit")
    _require_officer_authority(user, inv)
    inv.summary = summary.strip()
    action_type = "copilot_summary_accepted" if source == "copilot" else "summary_updated"
    db.add(InvestigationAction(
        investigation_id=inv.id, user_id=user.id, action_type=action_type,
        reason=reason, detail={"source": source, "length": len(inv.summary)}))
    _audit(db, user, f"investigation.{action_type}", project.id,
           {"case_number": inv.case_number, "source": source, "reason": reason})
    db.commit()
    return get_case(db, user, inv.id)


# ── reads ─────────────────────────────────────────────────────────────────
def list_cases(db: Session, user: User, *, page=1, page_size=50, status=None,
               outcome=None, assigned_to_id=None, project_id=None, overdue=None,
               active=None, sort_by="priority", sort_order="desc") -> dict:
    page = max(page, 1)
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)
    base = (
        select(Investigation, Project.code, Project.title, District.name, State.name)
        .join(Project, Project.id == Investigation.project_id)
        .join(District, District.id == Project.district_id)
        .join(State, State.id == Project.state_id)
        .where(Investigation.project_id.in_(
            scoped_projects(select(Project.id), user).scalar_subquery()))
    )
    if status:
        base = base.where(Investigation.status == status)
    if outcome:
        base = base.where(Investigation.outcome == outcome)
    if assigned_to_id is not None:
        base = base.where(Investigation.assigned_to_id == assigned_to_id)
    if project_id is not None:
        base = base.where(Investigation.project_id == project_id)
    if overdue is True:
        base = base.where(Investigation.status.in_(ACTIVE_STATUSES),
                          Investigation.sla_due_at < _now())
    if active is True:
        base = base.where(Investigation.status.in_(ACTIVE_STATUSES))

    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    sort_col = CASE_SORT_COLUMNS.get(sort_by, Investigation.priority_score)
    ordering = sort_col.desc().nulls_last() if sort_order != "asc" else sort_col.asc().nulls_first()
    rows = db.execute(base.order_by(ordering, Investigation.id)
                      .offset((page - 1) * page_size).limit(page_size)).all()
    items = [_case_out(db, inv, code, title, district, state)
             for inv, code, title, district, state in rows]
    return {"items": items, **paginate_meta(page, page_size, total)}


def get_case(db: Session, user: User, investigation_id: int) -> dict:
    inv, project = _get_case(db, user, investigation_id)
    district = db.get(District, project.district_id)
    state = db.get(State, project.state_id)
    out = _case_out(db, inv, project.code, project.title,
                    district.name if district else None, state.name if state else None)

    # pinned risk snapshot (falls back to current if the pin is gone)
    ra = db.get(RiskAssessment, inv.risk_assessment_id) if inv.risk_assessment_id else None
    if ra is None:
        ra = db.scalar(select(RiskAssessment).where(
            RiskAssessment.project_id == inv.project_id, RiskAssessment.is_current.is_(True)))
    factor_types: list[str] = []
    if ra is not None:
        factor_types = list(db.scalars(
            select(RiskFactor.factor_type).where(RiskFactor.assessment_id == ra.id)))
        out["risk_snapshot"] = {
            "risk_score": float(ra.score), "risk_level": ra.level.value,
            "evidence_strength": ra.evidence_strength.value,
            "assessed_at": ra.created_at, "is_current": ra.is_current,
        }
    else:
        out["risk_snapshot"] = None

    completed = {(a.detail.get("playbook_id"), a.detail.get("step_id"))
                 for a in db.scalars(select(InvestigationAction).where(
                     InvestigationAction.investigation_id == inv.id,
                     InvestigationAction.action_type == "playbook_step_completed"))}
    out["playbooks"] = [{
        **pb.model_dump(),
        "steps": [{**s.model_dump(), "completed": (pb.id, s.id) in completed}
                  for s in pb.steps],
    } for pb in playbooks_for_factors(factor_types)]
    out["priority_breakdown"] = inv.priority_breakdown
    out["action_count"] = db.scalar(select(func.count(InvestigationAction.id)).where(
        InvestigationAction.investigation_id == inv.id)) or 0
    return out


def list_actions(db: Session, user: User, investigation_id: int, *, page=1,
                 page_size=100) -> dict:
    inv, _ = _get_case(db, user, investigation_id)
    page = max(page, 1)
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)
    base = (select(InvestigationAction, User.email)
            .join(User, User.id == InvestigationAction.user_id)
            .where(InvestigationAction.investigation_id == inv.id))
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.execute(base.order_by(InvestigationAction.created_at, InvestigationAction.id)
                      .offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [_action_out(a, email) for a, email in rows],
            **paginate_meta(page, page_size, total)}


def _user_email(db: Session, user_id: int | None) -> str | None:
    if user_id is None:
        return None
    u = db.get(User, user_id)
    return u.email if u else None


def _case_out(db: Session, inv: Investigation, code, title, district, state) -> dict:
    now = _now()
    return {
        "id": inv.id, "case_number": inv.case_number, "project_id": inv.project_id,
        "project_code": code, "project_title": title, "district": district, "state": state,
        "alert_id": inv.alert_id, "status": inv.status.value,
        "priority_score": float(inv.priority_score),
        "assigned_to": _user_email(db, inv.assigned_to_id),
        "opened_by": _user_email(db, inv.opened_by_id),
        "sla_due_at": inv.sla_due_at,
        "overdue": bool(inv.sla_due_at and inv.status in ACTIVE_STATUSES
                        and inv.sla_due_at < now),
        "summary": inv.summary,
        "outcome": inv.outcome.value if inv.outcome else None,
        "outcome_note": inv.outcome_note,
        "created_at": inv.created_at, "closed_at": inv.closed_at,
    }


def _action_out(a: InvestigationAction, email: str | None) -> dict:
    return {
        "id": a.id, "investigation_id": a.investigation_id, "action_type": a.action_type,
        "reason": a.reason, "from_status": a.from_status, "to_status": a.to_status,
        "detail": a.detail, "user": email, "created_at": a.created_at,
    }
