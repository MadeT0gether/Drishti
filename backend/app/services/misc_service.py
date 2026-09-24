"""Alerts, model registry, audit services."""
import json
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AIAssessment,
    Alert,
    AnomalyResult,
    AuditLog,
    District,
    Investigation,
    InvestigationOutcome,
    InvestigationStatus,
    ModelVersion,
    Project,
    RiskAssessment,
    RiskFactor,
    State,
    User,
)
from app.schemas.common import MAX_PAGE_SIZE, paginate_meta
from app.services.scope import assert_project_access, scoped_projects

METRICS_FILE = Path(__file__).resolve().parents[3] / "data" / "evaluation" / "metrics.json"

# maps model component -> relevant metrics.json keys served with it
COMPONENT_METRICS = {
    "cost": ["cost_anomaly"],
    "payment": ["payment_anomaly"],
    "mismatch": ["progress_payment_mismatch"],
    "duplicate": ["duplicate_detection_pairs", "duplicate_ranked_queue"],
    "delay": ["delay_model_heldout", "delay_anomaly_ranking"],
    "overrun": ["overrun_model_heldout"],
    "network": ["vendor_concentration_districts", "relationship_patterns_pairs"],
    "reconciliation": ["reconciliation"],
    "data_quality": ["data_quality"],
    "risk": ["risk_ranking"],
}


def _eval_metrics() -> dict:
    if METRICS_FILE.exists():
        return json.loads(METRICS_FILE.read_text())
    return {}


def list_alerts(db: Session, user: User, *, severity=None, status=None, state_id=None,
                district_id=None, page=1, page_size=50) -> dict:
    page = max(page, 1)
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)
    from app.models import RiskAssessment as RA
    base = (
        select(Alert, Project.code, Project.title, District.name, State.name,
               RA.signal_count, RA.evidence_strength)
        .join(Project, Project.id == Alert.project_id)
        .join(District, District.id == Project.district_id)
        .join(State, State.id == Project.state_id)
        .outerjoin(RA, (RA.project_id == Alert.project_id) & RA.is_current.is_(True))
    )
    base = base.where(Alert.project_id.in_(
        scoped_projects(select(Project.id), user).scalar_subquery()))
    if severity:
        base = base.where(Alert.severity == severity)
    if status:
        base = base.where(Alert.status == status)
    if state_id is not None:
        base = base.where(Project.state_id == state_id)
    if district_id is not None:
        base = base.where(Project.district_id == district_id)

    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.execute(base.order_by(Alert.curr_score.desc(), Alert.id)
                      .offset((page - 1) * page_size).limit(page_size)).all()
    items = [
        {**_alert_out(a, code, title, dist, st),
         "signal_count": int(sc) if sc is not None else None,
         "evidence_strength": ev.value if ev is not None else None}
        for a, code, title, dist, st, sc, ev in rows
    ]
    return {"items": items, **paginate_meta(page, page_size, total)}


def alert_stats(db: Session, user: User) -> dict:
    """Scoped summary for the Risk & Alerts header tiles. Everything is
    computed over OPEN alerts within the caller's scope — a state auditor's
    tiles describe their state, never the national pile."""
    scoped_ids = scoped_projects(select(Project.id), user).scalar_subquery()
    open_alerts = (Alert.status == "open") & Alert.project_id.in_(scoped_ids)

    severity_rows = db.execute(
        select(Alert.severity, func.count()).where(open_alerts)
        .group_by(Alert.severity)).all()
    by_severity = {s.value: c for s, c in severity_rows}
    active = sum(by_severity.values())

    highest = db.scalar(select(func.max(Alert.curr_score)).where(open_alerts))

    # open alerts whose project carries 5+ independent anomaly signals
    signal_counts = (
        select(AnomalyResult.project_id)
        .group_by(AnomalyResult.project_id)
        .having(func.count() >= 5)
        .scalar_subquery())
    multi_signal = db.scalar(
        select(func.count()).where(open_alerts, Alert.project_id.in_(signal_counts))) or 0

    return {
        "active": active,
        "by_severity": by_severity,
        "multi_signal": int(multi_signal),
        "highest_score": float(highest) if highest is not None else None,
    }


def alert_rules() -> dict:
    """The REAL alerting rules, read from the same config the ML pipeline
    uses (app/ml/risk_config.py + scripts/run_pipeline.py) — nothing here is
    hand-maintained, so the panel can never drift from the pipeline."""
    from app.ml.risk_config import ALERT_MIN_SCORE, RISK_LEVELS

    levels = {lvl: (lo, hi) for lo, hi, lvl in RISK_LEVELS}
    return {
        "source": ("Deterministic ML risk pipeline — alerts are regenerated on every "
                   "pipeline run from current risk assessments."),
        "risk_levels": [
            {"level": lvl, "min_score": lo, "max_score": hi}
            for lo, hi, lvl in RISK_LEVELS
        ],
        "rules": [
            {
                "id": "critical-risk",
                "name": "Critical implementation/review risk",
                "trigger": (f"Project risk score {levels['critical'][0]}–"
                            f"{levels['critical'][1]} (CRITICAL level)"),
                "severity": "critical",
                "routed_to": "district",
                "created_as": "open",
            },
            {
                "id": "high-risk",
                "name": "High implementation/review risk",
                "trigger": (f"Project risk score {levels['high'][0]}–"
                            f"{levels['high'][1]} (HIGH level)"),
                "severity": "high",
                "routed_to": "district",
                "created_as": "open",
            },
            {
                "id": "elevated-moderate-risk",
                "name": "Elevated moderate risk",
                "trigger": (f"Project risk score {ALERT_MIN_SCORE}–"
                            f"{levels['moderate'][1]} (upper MODERATE band)"),
                "severity": "medium",
                "routed_to": "district",
                "created_as": "open",
            },
        ],
        "notes": [
            "Each alert carries the assessed score and the number of independent model signals.",
            "Opening an investigation on the project acknowledges its open alert.",
            "Rule changes are a model-governance function (System Administrator).",
        ],
    }


def _alert_out(a: Alert, code=None, title=None, district=None, state=None) -> dict:
    return {
        "id": a.id, "project_id": a.project_id, "project_code": code, "project_title": title,
        "district": district, "state": state, "severity": a.severity.value,
        "reason": a.reason, "prev_score": float(a.prev_score) if a.prev_score is not None else None,
        "curr_score": float(a.curr_score), "status": a.status,
        "assigned_role": a.assigned_role, "created_at": a.created_at,
    }


def get_alert(db: Session, user: User, alert_id: int) -> dict:
    a = db.get(Alert, alert_id)
    if a is None:
        raise HTTPException(status_code=404, detail="Alert not found")
    project = db.get(Project, a.project_id)
    assert_project_access(project, user)
    district = db.get(District, project.district_id)
    state = db.get(State, project.state_id)
    return _alert_out(a, project.code, project.title,
                      district.name if district else None, state.name if state else None)


def list_models(db: Session) -> list[dict]:
    metrics = _eval_metrics()
    out = []
    for mv in db.scalars(select(ModelVersion).order_by(ModelVersion.component)).all():
        served = {k: metrics[k] for k in COMPONENT_METRICS.get(mv.component, []) if k in metrics}
        # params may carry training metrics (delay/overrun) — safe, no secrets/paths
        if mv.params:
            served["training_run"] = mv.params
        out.append({
            "name": mv.name, "component": mv.component,
            "dataset_version": mv.dataset_version, "created_at": mv.created_at,
            "status": "active", "metrics": served,
        })
    return out


def evaluation_report(db: Session) -> dict:
    """The full evaluation artifact (aggregates + methodology only — computed
    against the ground-truth ledger by scripts/evaluate; never hand-edited)."""
    metrics = _eval_metrics()
    if not metrics:
        raise HTTPException(status_code=404, detail="No evaluation artifact available")
    meta_keys = ("dataset_version", "dataset_seed", "methodology_notes", "n_projects_evaluable")
    return {
        "dataset_version": metrics.get("dataset_version"),
        "dataset_seed": metrics.get("dataset_seed"),
        "n_projects_evaluable": metrics.get("n_projects_evaluable"),
        "methodology_notes": metrics.get("methodology_notes", []),
        "metrics": {k: v for k, v in metrics.items() if k not in meta_keys},
        "field_feedback": field_feedback(db),
        "model_versions": [
            {"name": mv.name, "component": mv.component, "dataset_version": mv.dataset_version}
            for mv in db.scalars(select(ModelVersion).order_by(ModelVersion.component)).all()
        ],
    }


# ── stage ⑦ Feedback Loop: outcome agreement ─────────────────────────────
# Closed-case outcomes are the only legitimate learning signal: did the human
# review confirm the flagged signal family was worth reviewing? Confirmed =
# verified_issue / data_corrected / escalated. Refuted = no_issue_found.
# Inconclusive cases are counted but excluded from the agreement rate.
# This report is ADVISORY: scoring thresholds stay versioned (risk-v0.1) and
# are never modified by it.
CONFIRMED_OUTCOMES = (
    InvestigationOutcome.verified_issue,
    InvestigationOutcome.data_corrected,
    InvestigationOutcome.escalated,
)
REFUTED_OUTCOMES = (InvestigationOutcome.no_issue_found,)


def field_feedback(db: Session) -> dict:
    """Per-signal agreement between AI flags and human case outcomes.

    For each closed/dismissed case with a recorded outcome, the signal
    families are resolved exactly like case detail does: the pinned
    risk_assessment_id first, falling back to the project's current
    assessment (pins are detached on pipeline regeneration)."""
    cases = db.scalars(select(Investigation).where(
        Investigation.status.in_(
            (InvestigationStatus.closed, InvestigationStatus.dismissed)),
        Investigation.outcome.is_not(None),
    )).all()

    # resolve one assessment id per case (pinned, else current for the project)
    need_current: dict[int, list[int]] = {}  # project_id -> case indexes
    assessment_of: list[int | None] = [c.risk_assessment_id for c in cases]
    for i, c in enumerate(cases):
        if c.risk_assessment_id is None:
            need_current.setdefault(c.project_id, []).append(i)
    if need_current:
        current = {
            pid: aid for pid, aid in db.execute(select(
                RiskAssessment.project_id, RiskAssessment.id).where(
                    RiskAssessment.project_id.in_(need_current),
                    RiskAssessment.is_current.is_(True)))
        }
        for pid, idxs in need_current.items():
            for i in idxs:
                assessment_of[i] = current.get(pid)

    factors_by_assessment: dict[int, list[str]] = {}
    aids = sorted({a for a in assessment_of if a is not None})
    if aids:
        for aid, ftype in db.execute(select(
                RiskFactor.assessment_id, RiskFactor.factor_type).where(
                    RiskFactor.assessment_id.in_(aids))):
            factors_by_assessment.setdefault(aid, []).append(ftype)

    per_signal: dict[str, dict[str, int]] = {}
    confirmed = refuted = inconclusive = 0
    for case, aid in zip(cases, assessment_of):
        if case.outcome in CONFIRMED_OUTCOMES:
            bucket = "confirmed"
            confirmed += 1
        elif case.outcome in REFUTED_OUTCOMES:
            bucket = "refuted"
            refuted += 1
        else:
            bucket = "inconclusive"
            inconclusive += 1
        for ftype in factors_by_assessment.get(aid, []) if aid else []:
            cell = per_signal.setdefault(
                ftype, {"confirmed": 0, "refuted": 0, "inconclusive": 0})
            cell[bucket] += 1

    by_signal = {}
    for ftype, cell in sorted(per_signal.items()):
        decisive = cell["confirmed"] + cell["refuted"]
        by_signal[ftype] = {
            **cell,
            "agreement_rate": round(cell["confirmed"] / decisive, 3) if decisive else None,
        }
    decisive_total = confirmed + refuted
    return {
        "closed_cases_with_outcome": len(cases),
        "confirmed": confirmed,
        "refuted": refuted,
        "inconclusive": inconclusive,
        "agreement_rate": round(confirmed / decisive_total, 3) if decisive_total else None,
        "by_signal": by_signal,
        "note": ("Advisory calibration signal from closed-case outcomes. "
                 "Scoring thresholds stay versioned and are not modified by this report."),
    }


def risk_threshold_simulation(db: Session, user: User) -> dict:
    """Read-only data for the what-if threshold SIMULATION: the scoped
    distribution of current risk scores in 5-point buckets, plus the
    documented level boundaries. Nothing is recomputed or persisted — the
    client slides a hypothetical threshold over this histogram."""
    from sqlalchemy import Integer

    from app.ml.risk_config import RISK_LEVELS
    from app.models import RiskAssessment

    scoped_ids = scoped_projects(select(Project.id), user).scalar_subquery()
    bucket = (func.floor(RiskAssessment.score / 5) * 5).cast(Integer)
    rows = db.execute(
        select(bucket, func.count()).where(
            RiskAssessment.is_current.is_(True),
            RiskAssessment.project_id.in_(scoped_ids))
        .group_by(bucket).order_by(bucket)).all()
    current_high_crit = db.scalar(
        select(func.count()).where(
            RiskAssessment.is_current.is_(True),
            RiskAssessment.level.in_(("high", "critical")),
            RiskAssessment.project_id.in_(scoped_ids))) or 0
    return {
        "bucket_size": 5,
        "histogram": [{"bucket_start": int(b), "count": int(c)} for b, c in rows],
        "total_assessed": sum(int(c) for _, c in rows),
        "current_high_or_critical": int(current_high_crit),
        "level_boundaries": [
            {"level": lvl, "min_score": lo, "max_score": hi} for lo, hi, lvl in RISK_LEVELS],
        "note": ("SIMULATION data only. Changing the slider changes nothing in the "
                 "system: production risk scores, levels and queue priorities are "
                 "untouched."),
    }


def get_model(db: Session, name: str) -> dict:
    mv = db.scalar(select(ModelVersion).where(ModelVersion.name == name))
    if mv is None:
        raise HTTPException(status_code=404, detail="Model version not found")
    return next(m for m in list_models(db) if m["name"] == name)


def log_action(db: Session, user_id: int | None, action: str, entity_type=None,
               entity_id=None, detail=None, ip=None):
    db.add(AuditLog(user_id=user_id, action=action, entity_type=entity_type,
                    entity_id=entity_id, detail=detail or {}, ip=ip))
    db.commit()


def project_audit(db: Session, user: User, project_id: int) -> list[dict]:
    project = db.get(Project, project_id)
    assert_project_access(project, user)
    events = []
    for a in db.scalars(select(AIAssessment).where(AIAssessment.project_id == project_id)
                        .order_by(AIAssessment.created_at)).all():
        mv = db.get(ModelVersion, a.model_version_id)
        events.append({
            "event_id": f"ai-{a.id}", "project_id": project_id, "source": "ai_assessment",
            "actor": mv.name if mv else "unknown", "action": "risk_assessed",
            "timestamp": a.created_at,
            "metadata": {"score": float(a.score), "level": a.level, "signals": a.signals},
        })
    logs = db.execute(
        select(AuditLog, User.email).outerjoin(User, User.id == AuditLog.user_id)
        .where(AuditLog.entity_type == "project", AuditLog.entity_id == project_id)
        .order_by(AuditLog.created_at)).all()
    for log, email in logs:
        events.append({
            "event_id": f"log-{log.id}", "project_id": project_id, "source": "user_action",
            "actor": email or "system", "action": log.action,
            "timestamp": log.created_at, "metadata": log.detail,
        })
    events.sort(key=lambda e: e["timestamp"])
    return events
