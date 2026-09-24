"""CSV ingestion: parse → auto-map columns → validate per row → preview/commit.

Invalid rows are never silently discarded: every rejected row is reported with
its row number and reasons. Committed rows become projects with
data_source='csv_import'.
"""
import io
from datetime import date, datetime

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Constituency,
    District,
    ImplementingAgency,
    Project,
    ProjectCategory,
    ProjectLocation,
    State,
)

# canonical field -> acceptable column aliases (lowercased, stripped)
COLUMN_ALIASES = {
    "title": ["title", "project_title", "work_name", "name_of_work"],
    "category": ["category", "project_category", "work_category"],
    "state": ["state", "state_name"],
    "district": ["district", "district_name"],
    "recommended_cost": ["recommended_cost", "recommended_amount", "estimated_cost", "cost"],
    "sanctioned_cost": ["sanctioned_cost", "sanctioned_amount"],
    "planned_start": ["planned_start", "start_date", "commencement_date"],
    "planned_end": ["planned_end", "end_date", "completion_date"],
    "latitude": ["latitude", "lat"],
    "longitude": ["longitude", "lon", "lng"],
    "village": ["village", "location", "place"],
    "financial_year": ["financial_year", "fy", "year"],
}
REQUIRED = ["title", "category", "state", "district", "recommended_cost"]


def detect_mapping(columns: list[str]) -> dict[str, str]:
    norm = {c.strip().lower().replace(" ", "_"): c for c in columns}
    mapping = {}
    for field, aliases in COLUMN_ALIASES.items():
        for a in aliases:
            if a in norm:
                mapping[field] = norm[a]
                break
    return mapping


def _parse_date(v):
    if pd.isna(v) or v == "":
        return None
    if isinstance(v, (date, datetime)):
        return v.date() if isinstance(v, datetime) else v
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(str(v).strip(), fmt).date()
        except ValueError:
            continue
    raise ValueError(f"unparseable date: {v!r}")


def validate_csv(content: bytes, db: Session) -> dict:
    """Parses and validates. Returns mapping, preview, per-row errors, clean rows."""
    try:
        df = pd.read_csv(io.BytesIO(content), dtype=str).fillna("")
    except Exception as e:
        return {"ok": False, "error": f"Could not parse CSV: {e}", "rows": []}

    mapping = detect_mapping(list(df.columns))
    missing = [f for f in REQUIRED if f not in mapping]
    if missing:
        return {"ok": False, "error": f"Missing required columns: {missing}",
                "mapping": mapping, "columns": list(df.columns), "rows": []}

    states = {s.name.lower(): s for s in db.scalars(select(State)).all()}
    districts = {(d.state_id, d.name.lower()): d for d in db.scalars(select(District)).all()}
    categories = {c.name.lower(): c for c in db.scalars(select(ProjectCategory)).all()}

    clean, errors = [], []
    for i, raw in df.iterrows():
        rowno = int(i) + 2  # 1-based + header
        problems = []
        get = lambda f: str(raw[mapping[f]]).strip() if f in mapping else ""

        title = get("title")
        if not title or len(title) < 5:
            problems.append("title missing or too short")
        cat = categories.get(get("category").lower())
        if not cat:
            problems.append(f"unknown category: {get('category')!r}")
        st = states.get(get("state").lower())
        if not st:
            problems.append(f"unknown state: {get('state')!r}")
        dist = districts.get((st.id, get("district").lower())) if st else None
        if st and not dist:
            problems.append(f"unknown district for state: {get('district')!r}")
        try:
            rec_cost = float(get("recommended_cost").replace(",", ""))
            if not (10_000 <= rec_cost <= 100_000_000):
                problems.append(f"recommended_cost out of range: {rec_cost}")
        except ValueError:
            rec_cost = None
            problems.append(f"invalid recommended_cost: {get('recommended_cost')!r}")
        sanc = None
        if get("sanctioned_cost"):
            try:
                sanc = float(get("sanctioned_cost").replace(",", ""))
            except ValueError:
                problems.append(f"invalid sanctioned_cost: {get('sanctioned_cost')!r}")
        try:
            d_start = _parse_date(get("planned_start"))
            d_end = _parse_date(get("planned_end"))
            if d_start and d_end and d_end < d_start:
                problems.append("planned_end before planned_start")
        except ValueError as e:
            d_start = d_end = None
            problems.append(str(e))
        lat = lon = None
        if get("latitude") and get("longitude"):
            try:
                lat, lon = float(get("latitude")), float(get("longitude"))
                if not (6 <= lat <= 37 and 68 <= lon <= 98):
                    problems.append(f"coordinates outside India bounds: ({lat}, {lon})")
            except ValueError:
                problems.append("invalid latitude/longitude")

        if problems:
            errors.append({"row": rowno, "problems": problems})
        else:
            clean.append({
                "title": title, "category_id": cat.id, "state_id": st.id, "district_id": dist.id,
                "recommended_cost": rec_cost, "sanctioned_cost": sanc,
                "planned_start": d_start, "planned_end": d_end,
                "latitude": lat, "longitude": lon,
                "village": get("village") or None,
                "financial_year": get("financial_year") or "2025-26",
            })

    return {
        "ok": True, "mapping": mapping, "columns": list(df.columns),
        "total": len(df), "valid": len(clean), "invalid": len(errors),
        "errors": errors[:100], "preview": clean[:10], "rows": clean,
    }


def commit_csv(content: bytes, db: Session) -> dict:
    """Validates then inserts the valid rows. Rejected rows are reported, not dropped silently."""
    result = validate_csv(content, db)
    if not result["ok"]:
        return result

    inserted = 0
    for r in result["rows"]:
        district = db.get(District, r["district_id"])
        const = db.scalar(select(Constituency).where(
            Constituency.state_id == r["state_id"], Constituency.name == district.name))
        if const is None:
            const = db.scalar(select(Constituency).where(Constituency.state_id == r["state_id"]))
        mp = const.mps[0] if const and const.mps else None
        if mp is None:
            result.setdefault("skipped", []).append(
                {"title": r["title"], "reason": "no MP found for district's constituency"})
            continue
        agency_name = f"CSV Import Agency, {district.name}"
        agency = db.scalar(select(ImplementingAgency).where(ImplementingAgency.name == agency_name))
        if agency is None:
            agency = ImplementingAgency(name=agency_name, type="csv_import", district_id=district.id)
            db.add(agency)
            db.flush()

        status = "sanctioned" if r["sanctioned_cost"] else "recommended"
        project = Project(
            code=f"CSV-{r['financial_year'][:4]}-{db.scalar(select(Project.id).order_by(Project.id.desc()).limit(1)) + inserted + 1:06d}",
            title=r["title"], description=f"{r['title']} (imported from CSV)",
            category_id=r["category_id"], mp_id=mp.id, state_id=r["state_id"],
            district_id=r["district_id"], constituency_id=const.id, agency_id=agency.id,
            status=status, recommended_cost=r["recommended_cost"],
            sanctioned_cost=r["sanctioned_cost"], expenditure=0, physical_progress_pct=0,
            planned_start=r["planned_start"], planned_end=r["planned_end"],
            financial_year=r["financial_year"], data_source="csv_import",
        )
        db.add(project)
        db.flush()
        if r["latitude"] is not None:
            db.add(ProjectLocation(
                project_id=project.id,
                geom=f"SRID=4326;POINT({r['longitude']} {r['latitude']})",
                village=r["village"], address=r["village"],
            ))
        inserted += 1
    db.commit()

    return {
        "ok": True, "total": result["total"], "inserted": inserted,
        "rejected": result["invalid"], "errors": result["errors"],
        "skipped": result.get("skipped", []),
    }
