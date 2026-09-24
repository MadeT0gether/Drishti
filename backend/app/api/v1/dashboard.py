from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse, StreamingResponse
from sqlalchemy.orm import Session


from app.auth.rbac import get_current_user
from app.database.session import get_db
from app.models import User
from app.schemas.dashboard import (
    BoundariesOut,
    DistrictAggOut,
    DistrictHealthOut,
    MapOut,
    OverviewOut,
    StateAggOut,
)
from app.services import dashboard_service, misc_service

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/overview", response_model=OverviewOut,
            summary="Aggregated KPIs for the caller's scope")
def overview(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return dashboard_service.overview(db, user)


@router.get("/states", response_model=list[StateAggOut],
            summary="Per-state aggregation (scope-filtered)")
def states(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return dashboard_service.states(db, user)


@router.get("/districts", response_model=list[DistrictAggOut],
            summary="Per-district aggregation (scope-filtered)")
def districts(state_id: int | None = None, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)):
    return dashboard_service.districts(db, user, state_id)


@router.get("/health", response_model=list[DistrictHealthOut],
            summary="District Health Score with full component breakdown")
def district_health(state_id: int | None = None, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    """Deterministic composite of audited portfolio components (delivery,
    timeliness, risk exposure, signal load, financial discipline). Formula and
    weights: docs/DISTRICT_HEALTH.md. Sorted lowest health first."""
    return dashboard_service.district_health(db, user, state_id)


@router.get("/map/boundaries", response_model=BoundariesOut,
            summary="District boundary polygons (GeoJSON, Census 2011, CC BY 4.0)")
def map_boundaries(state_id: int | None = None, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    """Real district boundaries from the DataMeet India community dataset,
    simplified server-side. Attribution is included in the response and must
    be displayed by map clients."""
    return dashboard_service.map_boundaries(db, user, state_id)


@router.get("/map", response_model=MapOut,
            summary="Geographic data for the risk heatmap")
def map_data(
    state_id: int | None = None,
    district_id: int | None = None,
    risk_level: str | None = Query(None, pattern="^(low|moderate|high|critical)$"),
    min_risk: float | None = Query(None, ge=0, le=100),
    category_id: int | None = None,
    mode: str | None = Query(None, pattern="^(districts|projects)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """District aggregation by default; project points when narrowed to a
    district or explicitly requested (capped server-side)."""
    return dashboard_service.map_data(
        db, user, state_id=state_id, district_id=district_id, risk_level=risk_level,
        min_risk=min_risk, category_id=category_id, mode=mode)


@router.get("/executive-summary",
            summary="Structured Executive Summary of current scope KPIs")
def executive_summary(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Returns a structured JSON payload aggregating all KPIs visible on the
    Command Center dashboard — scoped to the caller's authorized scope.
    Generates an audit log entry on each access."""
    result = dashboard_service.executive_summary(db, user)
    misc_service.log_action(
        db, user.id, "dashboard_executive_summary",
        entity_type="dashboard", detail={"scope": result["scope"]})
    return result


@router.get("/export.csv",
            summary="Authorized dashboard CSV export (includes risk data)")
def export_dashboard_csv(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """CSV export for authorized officials. Unlike the public /data/export routes,
    this includes risk scores and risk levels. Scope-enforced."""
    csv_content = dashboard_service.dashboard_csv(db, user)
    misc_service.log_action(
        db, user.id, "dashboard_csv_export",
        entity_type="dashboard", detail={"scope": user.role.value})
    return PlainTextResponse(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="dashboard_data.csv"'},
    )


@router.get("/monthly-report/months",
            summary="Months for which a Monthly Programme Report is available")
def monthly_report_months(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Newest-first list of {year, month, label} with recorded activity —
    drives the month/year picker on the public Reports page."""
    from app.reports import monthly_public_report
    return monthly_public_report.available_months(db, user)


@router.get("/monthly-report.pdf",
            summary="Citizen-friendly Monthly Programme Report PDF")
def monthly_report_pdf(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """A simplified, plain-language monthly summary for the public portal:
    headline numbers, what happened this month, and readable lists of
    completed and newly recommended works. Scope-enforced like all reads."""
    from app.reports import monthly_public_report
    pdf_bytes = monthly_public_report.generate(db, user, year, month)
    misc_service.log_action(
        db, user.id, "monthly_report_pdf_export",
        entity_type="dashboard", detail={"year": year, "month": month})
    filename = f"DRISHTI_Monthly_Report_{year}_{month:02d}.pdf"
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )


def _pdf_response(pdf_bytes: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )


@router.get("/quarterly-report/quarters",
            summary="Quarters for which a Quarterly Benchmark Report is available")
def quarterly_report_quarters(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.reports import monthly_public_report
    return monthly_public_report.available_quarters(db, user)


@router.get("/quarterly-report.pdf",
            summary="Citizen-friendly Quarterly Benchmark Report PDF")
def quarterly_report_pdf(
    year: int = Query(..., ge=2000, le=2100),
    quarter: int = Query(..., ge=1, le=4),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """The quarter's headline numbers plus a state-by-state comparison table."""
    from app.reports import monthly_public_report
    pdf_bytes = monthly_public_report.generate_quarterly(db, user, year, quarter)
    misc_service.log_action(
        db, user.id, "quarterly_report_pdf_export",
        entity_type="dashboard", detail={"year": year, "quarter": quarter})
    return _pdf_response(pdf_bytes, f"DRISHTI_Quarterly_Report_{year}_Q{quarter}.pdf")


@router.get("/state-report.pdf",
            summary="Citizen-friendly State Expenditure & Progress Report PDF")
def state_report_pdf(
    state_id: int = Query(..., ge=1),
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """One state in focus for the chosen month — same simplified format."""
    from app.reports import monthly_public_report
    pdf_bytes = monthly_public_report.generate_state(db, user, state_id, year, month)
    misc_service.log_action(
        db, user.id, "state_report_pdf_export",
        entity_type="dashboard",
        detail={"state_id": state_id, "year": year, "month": month})
    return _pdf_response(
        pdf_bytes, f"DRISHTI_State_Report_{state_id}_{year}_{month:02d}.pdf")


@router.get("/annual-report/years",
            summary="Years for which an Annual Programme Report is available")
def annual_report_years(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.reports import monthly_public_report
    return monthly_public_report.available_years(db, user)


@router.get("/annual-report.pdf",
            summary="Citizen-friendly Annual Programme Report PDF")
def annual_report_pdf(
    year: int = Query(..., ge=2000, le=2100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """The whole year in the simplified format, with a state comparison table."""
    from app.reports import monthly_public_report
    pdf_bytes = monthly_public_report.generate_annual(db, user, year)
    misc_service.log_action(
        db, user.id, "annual_report_pdf_export",
        entity_type="dashboard", detail={"year": year})
    return _pdf_response(pdf_bytes, f"DRISHTI_Annual_Report_{year}.pdf")


@router.get("/executive-summary.pdf",
            summary="Executive Summary as a structured ReportLab PDF")
def executive_summary_pdf(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generates a paginated, multi-section A4 PDF from the same data as
    GET /dashboard/executive-summary.  Uses ReportLab (same as investigation
    reports) — NOT a DOM screenshot.  Scope-enforced and audit-logged."""
    from app.reports import executive_summary_report
    pdf_bytes = executive_summary_report.generate(db, user)
    misc_service.log_action(
        db, user.id, "dashboard_pdf_export",
        entity_type="dashboard", detail={"scope": user.role.value})
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="DRISHTI_Executive_Summary.pdf"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )
