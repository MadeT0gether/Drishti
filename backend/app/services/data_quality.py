"""Data-quality intelligence over loaded project data.

Pure SQL aggregation — reports problems, never silently fixes or discards.
India bounding box used for coordinate sanity: lat 6..37, lon 68..98.
"""
from sqlalchemy import text
from sqlalchemy.orm import Session


def quality_report(db: Session) -> dict:
    def one(sql: str) -> int:
        return db.execute(text(sql)).scalar() or 0

    total = one("SELECT COUNT(*) FROM projects")
    report = {
        "total_projects": total,
        "missing_sanctioned_cost": one(
            "SELECT COUNT(*) FROM projects WHERE status != 'recommended' AND sanctioned_cost IS NULL"
        ),
        "missing_coordinates": one(
            "SELECT COUNT(*) FROM projects p LEFT JOIN project_locations l ON l.project_id = p.id "
            "WHERE l.geom IS NULL"
        ),
        "invalid_coordinates": one(
            "SELECT COUNT(*) FROM project_locations WHERE geom IS NOT NULL AND NOT ("
            "ST_Y(geom::geometry) BETWEEN 6 AND 37 AND ST_X(geom::geometry) BETWEEN 68 AND 98)"
        ),
        "impossible_dates": one(
            "SELECT COUNT(*) FROM projects WHERE planned_end < planned_start"
        ),
        "inconsistent_status": one(
            "SELECT COUNT(*) FROM projects WHERE status = 'completed' AND physical_progress_pct < 95"
        ),
        "duplicate_title_location": one(
            "SELECT COUNT(*) FROM (SELECT p.title, l.village, p.district_id FROM projects p "
            "JOIN project_locations l ON l.project_id = p.id "
            "GROUP BY p.title, l.village, p.district_id HAVING COUNT(*) > 1) d"
        ),
        "orphan_transactions": one(
            "SELECT COUNT(*) FROM financial_transactions t "
            "WHERE t.project_code_raw IS NULL OR NOT EXISTS "
            "(SELECT 1 FROM projects p WHERE p.code = t.project_code_raw)"
        ),
        "payments_without_transaction": one(
            "SELECT COUNT(*) FROM payments pay JOIN projects p ON p.id = pay.project_id "
            "WHERE NOT EXISTS (SELECT 1 FROM financial_transactions t "
            "WHERE t.project_code_raw = p.code AND t.type = 'payment' "
            "AND t.amount = pay.amount)"
        ),
        "progress_out_of_range": one(
            "SELECT COUNT(*) FROM projects WHERE physical_progress_pct < 0 OR physical_progress_pct > 100"
        ),
    }
    issues = sum(v for k, v in report.items() if k != "total_projects")
    report["completeness_pct"] = round(100 * (1 - min(issues, total) / max(total, 1)), 2)
    return report
