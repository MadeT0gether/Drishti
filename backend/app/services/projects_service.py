"""Project listing/detail queries. All queries are scope-filtered."""
from datetime import date

from sqlalchemy import String, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.models import (
    Constituency,
    District,
    ImplementingAgency,
    MP,
    Project,
    ProjectCategory,
    ProjectLocation,
    Recommendation,
    RiskAssessment,
    Sanction,
    State,
    User,
    Vendor,
)
from app.schemas.common import MAX_PAGE_SIZE, paginate_meta
from app.services.scope import assert_project_access, scoped_projects

# allowlisted sort keys -> ORDER BY expressions
SORT_COLUMNS = {
    "risk_score": RiskAssessment.score,
    "expenditure": Project.expenditure,
    "sanctioned_cost": Project.sanctioned_cost,
    "progress": Project.physical_progress_pct,
    "planned_end": Project.planned_end,
    "created_at": Project.created_at,
    "updated_at": Project.updated_at,
    "title": Project.title,
    "code": Project.code,
}


def list_categories(db: Session) -> list[dict]:
    rows = db.execute(
        select(ProjectCategory.id, ProjectCategory.name, ProjectCategory.sector)
        .order_by(ProjectCategory.name)).all()
    return [{"id": i, "name": n, "sector": s} for i, n, s in rows]


def list_agencies(db: Session) -> list[dict]:
    rows = db.execute(
        select(ImplementingAgency.id, ImplementingAgency.name, ImplementingAgency.type)
        .order_by(ImplementingAgency.name)).all()
    return [{"id": i, "name": n, "type": t} for i, n, t in rows]


def list_projects(
    db: Session,
    user: User,
    *,
    page: int = 1,
    page_size: int = 50,
    search: str | None = None,
    state_id: int | None = None,
    district_id: int | None = None,
    constituency_id: int | None = None,
    category_id: int | None = None,
    agency_id: int | None = None,
    status: str | None = None,
    risk_level: str | None = None,
    min_risk: float | None = None,
    max_risk: float | None = None,
    min_expenditure: float | None = None,
    max_expenditure: float | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    sort_by: str = "risk_score",
    sort_order: str = "desc",
) -> dict:
    page = max(page, 1)
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)

    ra = RiskAssessment
    base = (
        select(Project, ra.score, ra.level, ProjectCategory.name, District.name, State.name)
        .join(ProjectCategory, ProjectCategory.id == Project.category_id)
        .join(District, District.id == Project.district_id)
        .join(State, State.id == Project.state_id)
        .outerjoin(ra, (ra.project_id == Project.id) & ra.is_current.is_(True))
    )
    base = scoped_projects(base, user)

    if search:
        term = f"%{search.strip()[:80]}%"
        loc_match = select(ProjectLocation.project_id).where(
            ProjectLocation.village.ilike(term)).scalar_subquery()
        base = base.where(or_(
            Project.code.ilike(term), Project.title.ilike(term),
            ProjectCategory.name.ilike(term), Project.id.in_(loc_match),
        ))
    if state_id is not None:
        base = base.where(Project.state_id == state_id)
    if district_id is not None:
        base = base.where(Project.district_id == district_id)
    if constituency_id is not None:
        base = base.where(Project.constituency_id == constituency_id)
    if category_id is not None:
        base = base.where(Project.category_id == category_id)
    if agency_id is not None:
        base = base.where(Project.agency_id == agency_id)
    if status:
        base = base.where(Project.status == status)
    if risk_level:
        base = base.where(ra.level == risk_level)
    if min_risk is not None:
        base = base.where(ra.score >= min_risk)
    if max_risk is not None:
        base = base.where(ra.score <= max_risk)
    if min_expenditure is not None:
        base = base.where(Project.expenditure >= min_expenditure)
    if max_expenditure is not None:
        base = base.where(Project.expenditure <= max_expenditure)
    if start_date is not None:
        base = base.where(Project.planned_start >= start_date)
    if end_date is not None:
        base = base.where(Project.planned_start <= end_date)

    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0

    sort_col = SORT_COLUMNS.get(sort_by, RiskAssessment.score)
    ordering = sort_col.desc().nulls_last() if sort_order != "asc" else sort_col.asc().nulls_first()
    rows = db.execute(
        base.order_by(ordering, Project.id).offset((page - 1) * page_size).limit(page_size)
    ).all()

    items = [
        {
            "id": p.id, "code": p.code, "title": p.title, "status": p.status.value,
            "category": cat, "state": st, "district": dist,
            "financial_year": p.financial_year,
            "sanctioned_cost": float(p.sanctioned_cost) if p.sanctioned_cost is not None else None,
            "expenditure": float(p.expenditure),
            "physical_progress_pct": float(p.physical_progress_pct),
            "risk_score": float(score) if score is not None else None,
            "risk_level": level.value if level is not None else None,
        }
        for p, score, level, cat, dist, st in rows
    ]
    return {"items": items, **paginate_meta(page, page_size, total)}


def get_project_detail(db: Session, user: User, project_id: int) -> dict:
    project = db.get(Project, project_id)
    assert_project_access(project, user)

    cat = db.get(ProjectCategory, project.category_id)
    district = db.get(District, project.district_id)
    state = db.get(State, project.state_id)
    const = db.get(Constituency, project.constituency_id)
    mp = db.get(MP, project.mp_id)
    agency = db.get(ImplementingAgency, project.agency_id)
    vendor = db.get(Vendor, project.vendor_id) if project.vendor_id else None
    loc = db.scalar(select(ProjectLocation).where(ProjectLocation.project_id == project.id))
    rec = db.scalar(select(Recommendation).where(Recommendation.project_id == project.id)
                    .order_by(Recommendation.date).limit(1))
    sanc = db.scalar(select(Sanction).where(Sanction.project_id == project.id)
                     .order_by(Sanction.date).limit(1))

    lat = lon = None
    if loc is not None and loc.geom is not None:
        point = db.execute(select(
            func.ST_Y(func.ST_GeomFromWKB(func.ST_AsBinary(loc.geom), 4326)),
            func.ST_X(func.ST_GeomFromWKB(func.ST_AsBinary(loc.geom), 4326)),
        )).first()
        lat, lon = (float(point[0]), float(point[1])) if point else (None, None)

    fin_prog = (
        round(float(project.expenditure) / float(project.sanctioned_cost) * 100, 1)
        if project.sanctioned_cost else None
    )
    return {
        "id": project.id, "code": project.code, "title": project.title,
        "description": project.description, "status": project.status.value,
        "data_source": project.data_source.value, "financial_year": project.financial_year,
        "category": cat.name if cat else None,
        "state": state.name if state else None,
        "district": district.name if district else None,
        "constituency": const.name if const else None,
        "mp": mp.name if mp else None,
        "agency": agency.name if agency else None,
        "vendor": vendor.name if vendor else None,
        "location": {
            "latitude": lat, "longitude": lon,
            "village": loc.village if loc else None,
            "address": loc.address if loc else None,
        } if loc else None,
        "recommended_cost": float(project.recommended_cost) if project.recommended_cost is not None else None,
        "sanctioned_cost": float(project.sanctioned_cost) if project.sanctioned_cost is not None else None,
        "revised_cost": float(project.revised_cost) if project.revised_cost is not None else None,
        "expenditure": float(project.expenditure),
        "physical_progress_pct": float(project.physical_progress_pct),
        "financial_progress_pct": fin_prog,
        "planned_start": project.planned_start, "planned_end": project.planned_end,
        "actual_start": project.actual_start, "actual_end": project.actual_end,
        "recommendation_date": rec.date if rec else None,
        "recommendation_amount": float(rec.amount) if rec else None,
        "sanction_no": sanc.sanction_no if sanc else None,
        "sanction_date": sanc.date if sanc else None,
        "sanction_amount": float(sanc.amount) if sanc else None,
        "created_at": project.created_at,
    }
