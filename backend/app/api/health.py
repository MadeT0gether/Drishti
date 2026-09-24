from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database.session import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health(db: Session = Depends(get_db)):
    checks = {"api": "ok", "database": "error", "postgis": "error", "pgvector": "error"}
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "ok"
        rows = db.execute(
            text("SELECT extname FROM pg_extension WHERE extname IN ('postgis', 'vector')")
        ).scalars().all()
        if "postgis" in rows:
            checks["postgis"] = "ok"
        if "vector" in rows:
            checks["pgvector"] = "ok"
    except Exception:
        pass
    status = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
    return {"status": status, "checks": checks}
