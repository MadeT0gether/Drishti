"""Dashboard aggregations. Single grouped queries — no per-row loops over
projects. All aggregates respect the caller's scope."""
from sqlalchemy import Integer, case, func, select, text
from sqlalchemy.orm import Session

from app.models import (
    Alert,
    AnomalyResult,
    DataQualityIssue,
    District,
    Project,
    RiskAssessment,
    State,
    User,
)
from app.services.scope import scope_label, scoped_projects

ra = RiskAssessment


def _completed_late():
    return case((
        (Project.status == "completed")
        & Project.actual_end.isnot(None)
        & Project.planned_end.isnot(None)
        & (Project.actual_end > Project.planned_end), 1), else_=0)


def overview(db: Session, user: User) -> dict:
    base = scoped_projects(select(Project.id), user).subquery()

    status_rows = db.execute(
        select(Project.status, func.count()).where(Project.id.in_(select(base.c.id)))
        .group_by(Project.status)).all()
    status_counts = {s.value: c for s, c in status_rows}

    sums = db.execute(select(
        func.coalesce(func.sum(Project.sanctioned_cost), 0),
        func.coalesce(func.sum(Project.expenditure), 0),
        func.coalesce(func.sum(_completed_late()), 0),
    ).where(Project.id.in_(select(base.c.id)))).first()

    risk_rows = db.execute(
        select(ra.level, func.count()).where(ra.is_current.is_(True),
                                             ra.project_id.in_(select(base.c.id)))
        .group_by(ra.level)).all()
    risk_distribution = {lvl.value: c for lvl, c in risk_rows}
    delayed_pred = db.scalar(select(func.count()).where(
        ra.is_current.is_(True), ra.project_id.in_(select(base.c.id)),
        ra.delay_risk.in_(["medium", "high"]))) or 0

    anomaly_rows = db.execute(
        select(AnomalyResult.detector, func.count())
        .where(AnomalyResult.project_id.in_(select(base.c.id)))
        .group_by(AnomalyResult.detector)).all()

    open_alerts = db.scalar(select(func.count()).where(
        Alert.status == "open", Alert.project_id.in_(select(base.c.id)))) or 0
    dq_issues = db.scalar(select(func.count()).where(
        DataQualityIssue.project_id.in_(select(base.c.id)))) or 0

    return {
        "total_projects": sum(status_counts.values()),
        "total_sanctioned": float(sums[0]), "total_expenditure": float(sums[1]),
        "status_counts": status_counts,
        "delayed_projects": int(sums[2]) + delayed_pred,
        "risk_distribution": risk_distribution,
        "high_risk_count": risk_distribution.get("high", 0),
        "critical_count": risk_distribution.get("critical", 0),
        "open_alerts": open_alerts,
        "anomaly_counts": {d: c for d, c in anomaly_rows},
        "data_quality_issues": dq_issues,
        "scope": scope_label(user),
    }


def _agg_rows(db: Session, user: User, group_entity, name_col, extra_cols=()):
    """Shared aggregation for state/district rollups."""
    base = scoped_projects(select(Project.id), user).subquery()
    completed = func.sum(case((Project.status == "completed", 1), else_=0))
    stmt = (
        select(
            group_entity.id, name_col, *extra_cols,
            func.count(Project.id),
            func.coalesce(func.sum(Project.sanctioned_cost), 0),
            func.coalesce(func.sum(Project.expenditure), 0),
            completed,
            func.sum(_completed_late()),
            func.avg(ra.score),
            func.sum(case((ra.level == "high", 1), else_=0)),
            func.sum(case((ra.level == "critical", 1), else_=0)),
        )
        .join(Project, Project.district_id == group_entity.id
              if group_entity is District else Project.state_id == group_entity.id)
        .outerjoin(ra, (ra.project_id == Project.id) & ra.is_current.is_(True))
        .where(Project.id.in_(select(base.c.id)))
        .group_by(group_entity.id, name_col, *extra_cols)
        .order_by(func.count(Project.id).desc())
    )
    return db.execute(stmt).all()


def _pct(n, d):
    return round(n / d * 100, 1) if d else None


def states(db: Session, user: User) -> list[dict]:
    base = scoped_projects(select(Project.id), user).subquery()
    anom = dict(db.execute(
        select(Project.state_id, func.count()).select_from(AnomalyResult)
        .join(Project, Project.id == AnomalyResult.project_id)
        .where(Project.id.in_(select(base.c.id))).group_by(Project.state_id)).all())
    out = []
    for sid, name, count, sanc, exp, comp, late, avg_risk, high, crit in _agg_rows(
            db, user, State, State.name):
        out.append({
            "state_id": sid, "state": name, "project_count": count,
            "sanctioned": float(sanc), "expenditure": float(exp),
            "utilization_pct": _pct(float(exp), float(sanc)),
            "completion_rate_pct": _pct(comp or 0, count),
            "delay_rate_pct": _pct(late or 0, comp or 0),
            "avg_risk": round(float(avg_risk), 1) if avg_risk is not None else None,
            "high_risk_count": int(high or 0), "critical_count": int(crit or 0),
            "anomaly_count": anom.get(sid, 0),
        })
    return out


def districts(db: Session, user: User, state_id: int | None = None) -> list[dict]:
    base = scoped_projects(select(Project.id), user).subquery()
    anom = dict(db.execute(
        select(Project.district_id, func.count()).select_from(AnomalyResult)
        .join(Project, Project.id == AnomalyResult.project_id)
        .where(Project.id.in_(select(base.c.id))).group_by(Project.district_id)).all())
    state_names = dict(db.execute(select(State.id, State.name)).all())
    out = []
    for did, name, st_id, count, sanc, exp, comp, late, avg_risk, high, crit in _agg_rows(
            db, user, District, District.name, extra_cols=(District.state_id,)):
        if state_id is not None and st_id != state_id:
            continue
        out.append({
            "district_id": did, "district": name,
            "state_id": st_id, "state": state_names.get(st_id, ""),
            "project_count": count, "sanctioned": float(sanc), "expenditure": float(exp),
            "utilization_pct": _pct(float(exp), float(sanc)),
            "completion_rate_pct": _pct(comp or 0, count),
            "delay_rate_pct": _pct(late or 0, comp or 0),
            "avg_risk": round(float(avg_risk), 1) if avg_risk is not None else None,
            "high_risk_count": int(high or 0), "critical_count": int(crit or 0),
            "anomaly_count": anom.get(did, 0),
        })
    return out


def district_health(db: Session, user: User, state_id: int | None = None) -> list[dict]:
    """Composite District Health Score (M07) over the raw components. The
    formula lives in ml/health_config.py and docs/DISTRICT_HEALTH.md — a
    deterministic weighted sum, no ML, full per-component breakdown."""
    from app.ml.health_config import health_score

    rows = districts(db, user, state_id)
    out = []
    for d in rows:
        components = {
            "completion_rate_pct": d["completion_rate_pct"],
            "delay_rate_pct": d["delay_rate_pct"],
            "utilization_pct": d["utilization_pct"],
            "avg_risk": d["avg_risk"],
            "high_or_critical": d["high_risk_count"] + d["critical_count"],
            "anomaly_rate_pct": _pct(d["anomaly_count"], d["project_count"]),
        }
        hs = health_score(components, d["project_count"])
        out.append({
            "district_id": d["district_id"], "district": d["district"], "state": d["state"],
            "health_score": hs["health_score"] if hs else None,
            "band": hs["band"] if hs else None,
            "confidence": hs["confidence"] if hs else None,
            "score_breakdown": {
                "subscores": hs["subscores"], "weights_used": hs["weights_used"],
                "contributions": hs["contributions"],
                "components_missing": hs["components_missing"],
                "formula": hs["formula"],
            } if hs else None,
            "components": components,
            "project_count": d["project_count"],
            "disclaimer": ("The health score summarizes implementation performance of the "
                           "district's project portfolio. It is a decision-support signal, "
                           "not a finding about any official or agency."),
        })
    out.sort(key=lambda r: (r["health_score"] is None, r["health_score"] or 0))
    return out


MAP_PROJECT_CAP = 2000

# ~400 m simplification for map serving; source geometry in DB stays full-res
BOUNDARY_SIMPLIFY_TOLERANCE = 0.004

BOUNDARY_ATTRIBUTION = ("India boundaries by DataMeet India community (CC BY 4.0) — "
                        "https://github.com/datameet/maps · Boundaries: Census 2011")


def map_boundaries(db: Session, user: User, state_id: int | None = None) -> dict:
    """District boundary polygons as GeoJSON (simplified server-side).
    Administrative boundaries are not scope-sensitive data, but the endpoint
    still requires authentication like the rest of the API."""
    import json as _json

    stmt_txt = (
        "SELECT d.id, d.name, d.state_id, s.name, "
        "ST_AsGeoJSON(ST_SimplifyPreserveTopology(d.boundary, :tol), 5) "
        "FROM districts d JOIN states s ON s.id = d.state_id "
        "WHERE d.boundary IS NOT NULL")
    params = {"tol": BOUNDARY_SIMPLIFY_TOLERANCE}
    if state_id is not None:
        stmt_txt += " AND d.state_id = :sid"
        params["sid"] = state_id
    rows = db.execute(text(stmt_txt + " ORDER BY d.id"), params).all()
    return {
        "type": "FeatureCollection",
        "attribution": BOUNDARY_ATTRIBUTION,
        "features": [{
            "type": "Feature",
            "properties": {"district_id": did, "district": dname,
                           "state_id": sid, "state": sname},
            "geometry": _json.loads(geom),
        } for did, dname, sid, sname, geom in rows],
    }


def map_data(db: Session, user: User, *, state_id=None, district_id=None,
             risk_level=None, min_risk=None, category_id=None, mode=None) -> dict:
    """District aggregation by default; project points when narrowed (or requested)."""
    wants_projects = mode == "projects" or district_id is not None
    base = scoped_projects(select(Project.id), user)
    if state_id is not None:
        base = base.where(Project.state_id == state_id)
    if district_id is not None:
        base = base.where(Project.district_id == district_id)
    if category_id is not None:
        base = base.where(Project.category_id == category_id)
    sub = base.subquery()

    if not wants_projects:
        from app.models import Investigation
        from app.services.investigation_service import ACTIVE_STATUSES

        stmt = (
            select(District.id, District.name, District.state_id, State.name,
                   text("ST_Y(districts.centroid::geometry)"),
                   text("ST_X(districts.centroid::geometry)"),
                   func.count(Project.id), func.avg(ra.score),
                   func.sum(case((ra.level == "high", 1), else_=0)),
                   func.sum(case((ra.level == "critical", 1), else_=0)),
                   func.sum(case((ra.level == "moderate", 1), else_=0)),
                   func.sum(case((ra.level == "low", 1), else_=0)),
                   func.coalesce(func.sum(Project.expenditure), 0))
            .join(State, State.id == District.state_id)
            .join(Project, Project.district_id == District.id)
            .outerjoin(ra, (ra.project_id == Project.id) & ra.is_current.is_(True))
            .where(Project.id.in_(select(sub.c.id)))
            .group_by(District.id, District.name, District.state_id, State.name, District.centroid)
        )
        rows = db.execute(stmt).all()
        inv_counts = dict(db.execute(
            select(Project.district_id, func.count(Investigation.id))
            .join(Project, Project.id == Investigation.project_id)
            .where(Investigation.status.in_(ACTIVE_STATUSES),
                   Investigation.project_id.in_(select(sub.c.id)))
            .group_by(Project.district_id)).all())
        return {"mode": "districts", "projects": [], "truncated": False, "districts": [
            {"district_id": did, "district": dname, "state_id": sid, "state": sname,
             "latitude": float(lat) if lat is not None else None,
             "longitude": float(lon) if lon is not None else None,
             "project_count": n, "avg_risk": round(float(avg), 1) if avg is not None else None,
             "high_risk_count": int(h or 0), "critical_count": int(c or 0),
             "moderate_count": int(m or 0), "low_count": int(lo or 0),
             "expenditure": float(exp),
             "active_investigations": inv_counts.get(did, 0)}
            for did, dname, sid, sname, lat, lon, n, avg, h, c, m, lo, exp in rows]}

    from app.models import ProjectLocation

    stmt = (
        select(Project.id, Project.code, Project.district_id, Project.state_id,
               text("ST_Y(project_locations.geom::geometry)"),
               text("ST_X(project_locations.geom::geometry)"),
               ra.score, ra.level)
        .join(ProjectLocation, ProjectLocation.project_id == Project.id)
        .outerjoin(ra, (ra.project_id == Project.id) & ra.is_current.is_(True))
        .where(Project.id.in_(select(sub.c.id)), ProjectLocation.geom.isnot(None))
    )
    if risk_level:
        stmt = stmt.where(ra.level == risk_level)
    if min_risk is not None:
        stmt = stmt.where(ra.score >= min_risk)
    rows = db.execute(stmt.limit(MAP_PROJECT_CAP + 1)).all()
    truncated = len(rows) > MAP_PROJECT_CAP
    return {"mode": "projects", "districts": [], "truncated": truncated, "projects": [
        {"project_id": pid, "code": code, "district_id": did, "state_id": sid,
         "latitude": float(lat), "longitude": float(lon),
         "risk_score": float(score) if score is not None else None,
         "risk_level": level.value if level is not None else None}
        for pid, code, did, sid, lat, lon, score, level in rows[:MAP_PROJECT_CAP]]}


# ─── Executive Summary ────────────────────────────────────────────────────────

def executive_summary(db: Session, user: User) -> dict:
    """Aggregate all KPIs needed for the Executive Summary modal.

    Uses the same underlying queries as the dashboard — data is always
    consistent with what the Command Center displays.  Scope is enforced
    via scoped_projects, so a state/district/MP official only sees their slice.
    """
    from datetime import datetime, timezone

    ov = overview(db, user)

    # Top-5 priority projects (highest risk score, current assessment only)
    from app.models import RiskAssessment as RA
    base_ids = scoped_projects(select(Project.id), user).scalar_subquery()
    priority_rows = db.execute(
        select(
            Project.id, Project.code, Project.title,
            District.name, State.name,
            RA.score, RA.level, Project.sanctioned_cost,
        )
        .join(District, District.id == Project.district_id)
        .join(State, State.id == Project.state_id)
        .outerjoin(RA, (RA.project_id == Project.id) & RA.is_current.is_(True))
        .where(Project.id.in_(base_ids))
        .order_by(RA.score.desc().nullslast())
        .limit(5)
    ).all()

    priority = [
        {
            "project_id": pid, "code": code, "title": title,
            "district": dist, "state": st,
            "risk_score": round(float(score), 1) if score is not None else None,
            "risk_level": level.value if level is not None else None,
            "sanctioned_cost": float(sanc) if sanc else None,
        }
        for pid, code, title, dist, st, score, level, sanc in priority_rows
    ]

    # Top-5 states by risk (descending avg risk)
    state_rows = states(db, user)
    top_states = sorted(
        [s for s in state_rows if s.get("avg_risk") is not None],
        key=lambda s: s["avg_risk"] or 0,
        reverse=True,
    )[:5]

    # Recent open alerts (up to 3)
    from app.models import Alert
    alert_rows = db.execute(
        select(Alert, Project.code, Project.title, District.name, State.name)
        .join(Project, Project.id == Alert.project_id)
        .join(District, District.id == Project.district_id)
        .join(State, State.id == Project.state_id)
        .where(
            Alert.status == "open",
            Alert.project_id.in_(base_ids),
        )
        .order_by(Alert.curr_score.desc())
        .limit(3)
    ).all()
    recent_alerts = [
        {
            "project_code": code, "project_title": title,
            "district": dist, "state": st,
            "severity": a.severity.value,
            "risk_score": float(a.curr_score),
            "reason": a.reason,
        }
        for a, code, title, dist, st in alert_rows
    ]

    total_san = ov["total_sanctioned"]
    total_exp = ov["total_expenditure"]
    util_pct = round(total_exp / total_san * 100, 1) if total_san else None
    unspent = total_san - total_exp

    risk_dist = ov.get("risk_distribution", {})

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": ov["scope"],
        "dataset_note": "Prototype Dataset — Synthetic Data",
        "disclaimer": (
            "This Executive Summary is a decision-support document generated by the DRISHTI "
            "AI Risk & Intelligence Platform. Risk scores and anomaly signals are "
            "decision-support indicators, not findings of fraud, misconduct, or guilt. "
            "All determinations remain with authorized officials."
        ),

        # ── 1. Overview KPIs
        "overview": {
            "total_projects": ov["total_projects"],
            "total_sanctioned": total_san,
            "total_expenditure": total_exp,
            "utilization_pct": util_pct,
            "unspent_balance": unspent,
            "status_counts": ov["status_counts"],
            "delayed_projects": ov["delayed_projects"],
        },

        # ── 2. Risk
        "risk": {
            "distribution": risk_dist,
            "critical_count": ov["critical_count"],
            "high_risk_count": ov["high_risk_count"],
            "moderate_count": risk_dist.get("moderate", 0),
            "low_count": risk_dist.get("low", 0),
        },

        # ── 3. Signals
        "signals": {
            "open_alerts": ov["open_alerts"],
            "anomaly_counts": ov["anomaly_counts"],
            "data_quality_issues": ov["data_quality_issues"],
        },

        # ── 4. Priority projects
        "priority_projects": priority,

        # ── 5. State performance
        "top_risk_states": top_states,

        # ── 6. Recent alerts
        "recent_alerts": recent_alerts,
    }


# ─── Authorised dashboard CSV export ──────────────────────────────────────────

def dashboard_csv(db: Session, user: User) -> str:
    """CSV export for authorised officials.

    Unlike the public /data/export routes (which strip risk/anomaly data),
    this includes risk scores and levels.  Scope is enforced via scoped_projects.
    """
    import csv as _csv
    import io

    from app.models import AnomalyResult, RiskAssessment as RA

    base_ids = scoped_projects(select(Project.id), user).scalar_subquery()

    rows = db.execute(
        select(
            Project.code, Project.title,
            State.name, District.name,
            Project.financial_year, Project.status,
            Project.sanctioned_cost, Project.expenditure,
            Project.physical_progress_pct, Project.actual_end,
            RA.score, RA.level,
        )
        .join(State, State.id == Project.state_id)
        .join(District, District.id == Project.district_id)
        .outerjoin(RA, (RA.project_id == Project.id) & RA.is_current.is_(True))
        .where(Project.id.in_(base_ids))
        .order_by(RA.score.desc().nullslast(), Project.code)
    ).all()

    header = [
        "project_code", "title", "state", "district",
        "financial_year", "status",
        "sanctioned_cost_inr", "expenditure_inr", "utilization_pct",
        "physical_progress_pct", "completed_on",
        "risk_score", "risk_level",
    ]

    buf = io.StringIO()
    w = _csv.writer(buf, lineterminator="\n")
    w.writerow(header)
    for (code, title, st, dist, fy, status,
         sanc, exp, prog, end, score, level) in rows:
        util = round(float(exp) / float(sanc) * 100, 2) if sanc else ""
        w.writerow([
            code, title, st, dist, fy, status.value,
            sanc, exp, util, prog or "",
            end.isoformat() if end else "",
            round(float(score), 2) if score is not None else "",
            level.value if level is not None else "",
        ])
    return buf.getvalue()
