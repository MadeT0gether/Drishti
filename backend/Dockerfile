# DRISHTI backend — production image for Railway/Render/Fly.
# Stack: FastAPI + SQLAlchemy + Alembic + PostGIS/pgvector (DB provided
# separately, e.g. Supabase or Railway Postgres with postgis+vector).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# xgboost needs libgomp; curl for Railway healthchecks; build-essential for
# any sdist fallback during pip install.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

# misc_service resolves the evaluation artifact at <repo-root>/data/evaluation
# (parents[3] of app/services), which is /data in this image layout.
RUN mkdir -p /data/evaluation
COPY data/evaluation/metrics.json /data/evaluation/metrics.json

EXPOSE 8000

# Railway/Render inject $PORT. Migrations run on every boot so the service
# self-heals after a fresh DB provision (alembic reads DATABASE_URL from env).
CMD ["sh", "-c", "python -m alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
