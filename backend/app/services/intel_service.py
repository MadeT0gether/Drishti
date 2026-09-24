"""Read services over M03 AI-derived tables. The API never recomputes ML —
it serves the authoritative pipeline results, with model versions attached.
The ground-truth ledger (anomaly_ground_truth) is NEVER exposed here."""
from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models import (
    AIAssessment,
    Alert,
    AnomalyResult,
    District,
    DuplicateCandidate,
    ImplementingAgency,
    ModelVersion,
    NetworkSignal,
    Project,
    ReconciliationResult,
    RiskAssessment,
    RiskFactor,
    User,
    Vendor,
)
from app.ml.risk_config import DUP_STRONG_MIN
from app.services.scope import assert_project_access

RECON_GROUPS = {
    "reconciled": "RECONCILED",
    "timing_mismatch": "PARTIAL",
    "amount_mismatch": "MISMATCH",
    "status_mismatch": "MISMATCH",
    "missing_transaction": "MISSING",
    "missing_reference": "MISSING",
}


def _project(db: Session, user: User, project_id: int) -> Project:
    return assert_project_access(db.get(Project, project_id), user)


def _mv_name(db: Session, mv_id: int) -> str:
    mv = db.get(ModelVersion, mv_id)
    return mv.name if mv else "unknown"


def get_risk(db: Session, user: User, project_id: int, include_factors: bool = True) -> dict:
    _project(db, user, project_id)
    ra = db.scalar(select(RiskAssessment).where(
        RiskAssessment.project_id == project_id, RiskAssessment.is_current.is_(True)))
    if ra is None:
        raise HTTPException(status_code=404, detail="No risk assessment available for this project")
    factors = []
    if include_factors:
        rows = db.scalars(select(RiskFactor).where(RiskFactor.assessment_id == ra.id)
                          .order_by(RiskFactor.contribution.desc())).all()
        factors = [{
            "factor_type": f.factor_type, "contribution": float(f.contribution),
            "severity": f.severity.value, "evidence": f.evidence,
            "explanation": f.explanation, "source_ref": f.source_ref,
        } for f in rows]
    return {
        "project_id": project_id, "risk_score": float(ra.score), "risk_level": ra.level.value,
        "evidence_strength": ra.evidence_strength.value,
        "data_completeness_pct": float(ra.data_completeness_pct),
        "signal_count": ra.signal_count,
        "predicted_delay_days": float(ra.predicted_delay_days) if ra.predicted_delay_days is not None else None,
        "delay_risk": ra.delay_risk, "overrun_risk": ra.overrun_risk,
        "model_version": _mv_name(db, ra.model_version_id), "assessed_at": ra.created_at,
        "factors": factors,
    }


def get_risk_timeline(db: Session, user: User, project_id: int) -> list[dict]:
    _project(db, user, project_id)
    rows = db.scalars(select(AIAssessment).where(AIAssessment.project_id == project_id)
                      .order_by(AIAssessment.created_at)).all()
    return [{
        "assessed_at": a.created_at, "risk_score": float(a.score), "risk_level": a.level,
        "model_version": _mv_name(db, a.model_version_id), "signals": a.signals,
    } for a in rows]


def get_anomalies(db: Session, user: User, project_id: int, detector: str | None = None) -> list[dict]:
    _project(db, user, project_id)
    stmt = select(AnomalyResult).where(AnomalyResult.project_id == project_id)
    if detector:
        stmt = stmt.where(AnomalyResult.detector == detector)
    rows = db.scalars(stmt.order_by(AnomalyResult.score.desc())).all()
    return [{
        "id": a.id, "detector": a.detector, "score": float(a.score),
        "severity": a.severity.value, "values": a.values, "explanation": a.explanation,
        "model_version": _mv_name(db, a.model_version_id), "detected_at": a.created_at,
    } for a in rows]


def get_similar(db: Session, user: User, project_id: int, limit: int = 20) -> list[dict]:
    _project(db, user, project_id)
    dc = DuplicateCandidate
    stmt = (select(dc, Project, District.name)
            .join(Project, Project.id == func.coalesce(
                func.nullif(dc.project_id_a, project_id), dc.project_id_b))
            .join(District, District.id == Project.district_id)
            .where((dc.project_id_a == project_id) | (dc.project_id_b == project_id))
            .order_by(dc.composite_score.desc())
            .limit(min(limit, 50)))
    out = []
    for cand, other, district in db.execute(stmt).all():
        strong = float(cand.composite_score) >= DUP_STRONG_MIN
        out.append({
            "project_id": other.id, "code": other.code, "title": other.title,
            "district": district, "status": other.status.value,
            "sanctioned_cost": float(other.sanctioned_cost) if other.sanctioned_cost is not None else None,
            "classification": "duplicate_candidate" if strong else "similar_project",
            "composite_score": float(cand.composite_score),
            "text_similarity": float(cand.text_sim),
            "geo_distance_km": float(cand.geo_km) if cand.geo_km is not None else None,
            "cost_similarity": float(cand.cost_sim) if cand.cost_sim is not None else None,
            "same_agency": cand.same_agency, "time_overlap": cand.time_overlap,
            "review_status": cand.status,
        })
    return out


def get_relationships(db: Session, user: User, project_id: int) -> dict:
    project = _project(db, user, project_id)
    edges = []
    agency = db.get(ImplementingAgency, project.agency_id)
    if agency:
        n = db.scalar(select(func.count()).where(Project.agency_id == agency.id)) or 0
        edges.append({"relationship_type": "implemented_by", "entity_type": "agency",
                      "entity_id": agency.id, "entity_name": agency.name,
                      "detail": {"agency_total_projects": n, "agency_type": agency.type}})
    if project.vendor_id:
        vendor = db.get(Vendor, project.vendor_id)
        n = db.scalar(select(func.count()).where(Project.vendor_id == vendor.id)) or 0
        shared = db.scalar(select(func.count()).where(
            Project.vendor_id == vendor.id, Project.agency_id == project.agency_id)) or 0
        edges.append({"relationship_type": "contracted_to", "entity_type": "vendor",
                      "entity_id": vendor.id, "entity_name": vendor.name,
                      "detail": {"vendor_total_projects": n,
                                 "projects_with_same_agency": shared}})
    signals = db.scalars(select(NetworkSignal).where(NetworkSignal.project_id == project_id)
                         .order_by(NetworkSignal.score.desc())).all()

    # local neighborhood for the graph view: other projects sharing this
    # project's vendor (existing relationships rendered, not new detection);
    # scope-limited like everything else
    related = []
    if project.vendor_id:
        from app.services.scope import scoped_projects
        rows = db.execute(
            scoped_projects(
                select(Project.id, Project.code, Project.title, Project.agency_id)
                .where(Project.vendor_id == project.vendor_id, Project.id != project.id),
                user).limit(8)).all()
        related = [{
            "project_id": rid, "code": code, "title": title,
            "shared": "agency_vendor" if agency_id == project.agency_id else "vendor",
        } for rid, code, title, agency_id in rows]

    return {
        "project_id": project_id,
        "edges": edges,
        "signals": [{"signal_type": s.signal_type, "score": float(s.score),
                     "severity": s.severity.value, "detail": s.detail} for s in signals],
        "related_projects": related,
    }


def get_reconciliation(db: Session, user: User, project_id: int) -> dict:
    _project(db, user, project_id)
    rr = db.scalar(select(ReconciliationResult).where(ReconciliationResult.project_id == project_id))
    if rr is None:
        return {"project_id": project_id, "status": "not_analyzed", "status_group": "MISSING",
                "project_side_total": None, "matched_total": None, "mismatch_amount": None,
                "detail": {"note": "No payments recorded for this project yet."},
                "severity": "low", "model_version": None}
    expected = float(rr.expected) if rr.expected is not None else None
    found = float(rr.found) if rr.found is not None else None
    return {
        "project_id": project_id, "status": rr.status,
        "status_group": RECON_GROUPS.get(rr.status, "MISMATCH"),
        "project_side_total": expected, "matched_total": found,
        "mismatch_amount": round(expected - found, 2) if expected is not None and found is not None else None,
        "detail": rr.detail,
        "severity": "high" if rr.status in ("missing_transaction", "amount_mismatch")
                    else ("low" if rr.status == "reconciled" else "medium"),
        "model_version": _mv_name(db, rr.model_version_id),
    }


def get_predictions(db: Session, user: User, project_id: int) -> dict:
    _project(db, user, project_id)
    ra = db.scalar(select(RiskAssessment).where(
        RiskAssessment.project_id == project_id, RiskAssessment.is_current.is_(True)))
    delay_mv = db.scalar(select(ModelVersion.name).where(ModelVersion.component == "delay"))
    overrun_mv = db.scalar(select(ModelVersion.name).where(ModelVersion.component == "overrun"))
    return {
        "project_id": project_id,
        "predicted_delay_days": float(ra.predicted_delay_days)
            if ra and ra.predicted_delay_days is not None else None,
        "delay_risk": ra.delay_risk if ra else None,
        "delay_model_version": delay_mv,
        "overrun_risk": ra.overrun_risk if ra else None,
        "overrun_model_version": overrun_mv,
        "predicted_at": ra.created_at if ra else None,
    }


def get_early_warning(db: Session, user: User, project_id: int) -> dict:
    _project(db, user, project_id)
    warnings = []
    ra = db.scalar(select(RiskAssessment).where(
        RiskAssessment.project_id == project_id, RiskAssessment.is_current.is_(True)))
    if ra:
        if ra.predicted_delay_days is not None and float(ra.predicted_delay_days) >= 45:
            warnings.append({
                "warning_type": "delay",
                "severity": "high" if float(ra.predicted_delay_days) >= 90 else "medium",
                "message": f"Predicted completion is ~{float(ra.predicted_delay_days):.0f} days "
                           "behind schedule — review recommended.",
                "evidence": {"predicted_delay_days": float(ra.predicted_delay_days)},
                "model_version": _mv_name(db, ra.model_version_id), "timestamp": ra.created_at})
        if ra.overrun_risk in ("medium", "high"):
            warnings.append({
                "warning_type": "overrun", "severity": ra.overrun_risk,
                "message": "Elevated cost-overrun risk predicted for this project.",
                "evidence": {"overrun_risk": ra.overrun_risk},
                "model_version": _mv_name(db, ra.model_version_id), "timestamp": ra.created_at})
    for a in db.scalars(select(AnomalyResult).where(
            AnomalyResult.project_id == project_id,
            AnomalyResult.severity.in_(["high", "critical"]))).all():
        warnings.append({
            "warning_type": "anomaly", "severity": a.severity.value,
            "message": a.explanation, "evidence": a.values,
            "model_version": _mv_name(db, a.model_version_id), "timestamp": a.created_at})
    # risk escalation: compare consecutive snapshots when history exists
    snaps = db.scalars(select(AIAssessment).where(AIAssessment.project_id == project_id)
                       .order_by(AIAssessment.created_at.desc()).limit(2)).all()
    if len(snaps) == 2 and float(snaps[0].score) - float(snaps[1].score) >= 15:
        warnings.append({
            "warning_type": "risk_escalation", "severity": "high",
            "message": f"Risk trajectory increasing rapidly "
                       f"({snaps[1].score:.0f} → {snaps[0].score:.0f}) — review recommended.",
            "evidence": {"previous": float(snaps[1].score), "current": float(snaps[0].score)},
            "model_version": _mv_name(db, snaps[0].model_version_id),
            "timestamp": snaps[0].created_at})
    return {"project_id": project_id, "warnings": warnings}
