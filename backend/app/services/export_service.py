"""Public-safe dataset exports for the transparency portal.

Every export carries public information only: project identity, location,
sector, financial summary, and reported progress. Risk scores, anomaly
signals, investigation records, and officer identities are never included.
Queries pass through scoped_projects like every other project read.
"""
import csv
import io

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    MP,
    Constituency,
    District,
    Project,
    ProjectCategory,
    ProjectStatus,
    State,
    User,
)
from app.services.scope import scoped_projects

EXPORT_DATASETS = {
    "completed-works": "Completed public works (CSV)",
    "recommended-works": "Recommended public works (CSV)",
    "expenditures": "Per-project financial summary (CSV)",
    "mp-summary": "Per-MP portfolio summary (CSV)",
    "current": "Current public snapshot (JSON)",
}

_PROJECT_HEADER = [
    "project_code", "title", "sector", "state", "district", "financial_year",
    "status", "sanctioned_cost", "expenditure", "physical_progress_pct",
    "completed_on",
]


def _csv(header: list[str], rows) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(header)
    for r in rows:
        w.writerow(r)
    return buf.getvalue()


def _project_select():
    return (
        select(Project.code, Project.title, ProjectCategory.name, State.name,
               District.name, Project.financial_year, Project.status,
               Project.sanctioned_cost, Project.expenditure,
               Project.physical_progress_pct, Project.actual_end)
        .join(ProjectCategory, ProjectCategory.id == Project.category_id)
        .join(State, State.id == Project.state_id)
        .join(District, District.id == Project.district_id)
        .order_by(Project.code)
    )


def _project_csv(db: Session, user: User, status: ProjectStatus) -> str:
    stmt = scoped_projects(_project_select().where(Project.status == status), user)
    rows = (
        (code, title, cat, st, d, fy, s.value, sanc, exp, prog,
         end.isoformat() if end else "")
        for code, title, cat, st, d, fy, s, sanc, exp, prog, end in db.execute(stmt)
    )
    return _csv(_PROJECT_HEADER, rows)


def completed_works_csv(db: Session, user: User) -> str:
    return _project_csv(db, user, ProjectStatus.completed)


def recommended_works_csv(db: Session, user: User) -> str:
    return _project_csv(db, user, ProjectStatus.recommended)


def expenditures_csv(db: Session, user: User) -> str:
    stmt = scoped_projects(
        select(Project.code, State.name, District.name, ProjectCategory.name,
               Project.financial_year, Project.status, Project.sanctioned_cost,
               Project.expenditure)
        .join(ProjectCategory, ProjectCategory.id == Project.category_id)
        .join(State, State.id == Project.state_id)
        .join(District, District.id == Project.district_id)
        .order_by(Project.code), user)
    header = ["project_code", "state", "district", "sector", "financial_year",
              "status", "sanctioned_cost", "expenditure", "utilization_pct"]
    rows = (
        (code, st, d, cat, fy, s.value, sanc, exp,
         round(float(exp) / float(sanc) * 100, 2) if sanc else "")
        for code, st, d, cat, fy, s, sanc, exp in db.execute(stmt)
    )
    return _csv(header, rows)


def mp_summary_csv(db: Session, user: User) -> str:
    stmt = scoped_projects(
        select(MP.name, Constituency.name, State.name,
               func.count(Project.id),
               func.coalesce(func.sum(Project.sanctioned_cost), 0),
               func.coalesce(func.sum(Project.expenditure), 0),
               func.count(Project.id).filter(Project.status == ProjectStatus.completed))
        .join(MP, MP.id == Project.mp_id)
        .join(Constituency, Constituency.id == MP.constituency_id)
        .join(State, State.id == Project.state_id)
        .group_by(MP.name, Constituency.name, State.name)
        .order_by(State.name, Constituency.name), user)
    header = ["mp_name", "constituency", "state", "project_count",
              "sanctioned_total", "expenditure_total", "completed_count"]
    return _csv(header, db.execute(stmt))


def current_snapshot_json(db: Session, user: User) -> dict:
    """Public snapshot: portfolio totals, status mix, and per-state figures.
    Deliberately excludes risk, anomaly and investigation aggregates."""
    base = scoped_projects(select(Project.id), user).subquery()

    status_rows = db.execute(
        select(Project.status, func.count())
        .where(Project.id.in_(select(base.c.id))).group_by(Project.status)).all()
    sums = db.execute(select(
        func.coalesce(func.sum(Project.sanctioned_cost), 0),
        func.coalesce(func.sum(Project.expenditure), 0),
    ).where(Project.id.in_(select(base.c.id)))).first()

    state_rows = db.execute(
        select(State.name, func.count(Project.id),
               func.coalesce(func.sum(Project.sanctioned_cost), 0),
               func.coalesce(func.sum(Project.expenditure), 0))
        .join(State, State.id == Project.state_id)
        .where(Project.id.in_(select(base.c.id)))
        .group_by(State.name).order_by(State.name)).all()

    return {
        "dataset": "DRISHTI public transparency snapshot",
        "note": "Prototype dataset - synthetic data. Public information only.",
        "total_projects": sum(c for _, c in status_rows),
        "status_counts": {s.value: c for s, c in status_rows},
        "total_sanctioned": float(sums[0]),
        "total_expenditure": float(sums[1]),
        "states": [
            {"state": name, "project_count": count,
             "sanctioned": float(sanc), "expenditure": float(exp)}
            for name, count, sanc, exp in state_rows
        ],
    }
