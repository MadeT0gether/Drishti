# DRISHTI — MPLADS AI Risk & Investigation Platform

**Team BiteCoder · Smart India Hackathon 2026 · Problem Statement 26102**

> **🔗 Live Demo:** https://drishti-bitecoder.vercel.app
>
> **Responsible AI:** Risk assessments are decision-support signals, not findings of fraud or misconduct. Final decisions remain with authorized officials.

---

## What Is This?

The **Member of Parliament Local Area Development Scheme (MPLADS)** gives each MP ₹5 crore per year to fund local infrastructure — roads, schools, hospitals, drinking water, sanitation, and more. With thousands of projects across 543 constituencies, manually spotting cost overruns, suspicious duplicates, payment irregularities, or stalled work is nearly impossible.

This platform uses **AI and machine learning** to automatically analyze every project's cost, timeline, payments, geography, and relationships — then flags the ones that need human attention. It does **not** decide guilt or fraud. It surfaces risk signals so that authorized officials (Ministry, State, District, MPs, Monitoring Officers) can investigate and make informed decisions.

### How It Works

```
Project & Financial Data
  → Data Quality Checks (missing fields, invalid coordinates, impossible dates)
  → AI/ML Risk Detection (12 anomaly detectors + predictive models)
  → Explainable Risk Scoring (per-factor evidence, not a black box)
  → Investigation Queue (prioritized by risk, assigned to officials)
  → AI Copilot (answers questions using project evidence)
  → Human Decision (official reviews, accepts, or dismisses)
  → Audit Trail (every action logged, every export recorded)
  → Executive Analytics (dashboards, maps, health scores, reports)
```

All seven milestones (M01–M07) are complete. Project records are **real MPLADS works from the official eSAKSHI portal** (18th Lok Sabha), compiled from the public [in-rolls/mplads](https://github.com/in-rolls/mplads) dataset — 36 states, 774 districts, 538 constituencies and 88,855 unique works. Fields that the public portal does not publish (payments, vendors, GPS) are not fabricated; detectors that need them are disabled or shown as unavailable.

---

## Features

### 🎯 Command Center
Central dashboard with real-time KPIs — total projects, funds utilized, risk distribution, active alerts, and a ranked state-level overview. One-click navigation to any flagged project.

### 📊 Project Intelligence
Every project gets a detailed profile: risk score with level (Low / Moderate / High / Critical), numbered risk factors with per-factor evidence, financial breakdown, progress tracking, milestone history, and mismatch detection between payments and progress.

### 🤖 AI Risk Detection (12 Detectors)
The ML pipeline runs 12 independent anomaly detectors and combines their signals into a single explainable risk score:

| Detector | What It Catches |
|---|---|
| **Cost Anomaly** | Projects costing significantly more than similar peers |
| **Payment Irregularity** | Payments before sanction, same-day bursts, oversized installments |
| **Progress–Payment Mismatch** | Money spent but no progress, or progress reported but no money |
| **Delay Prediction** | XGBoost model predicting which projects will be delayed >60 days |
| **Cost Overrun** | XGBoost classifier identifying likely cost overruns |
| **Duplicate Detection** | Sentence-transformer embeddings + geography finding copy-paste projects |
| **Near-Duplicate** | Similar but not identical projects in the same area |
| **Geo-Duplicate** | Different descriptions at suspiciously close locations |
| **Vendor Concentration** | Districts where one vendor dominates all contracts |
| **Relationship Patterns** | Agency–vendor pairs with unusually uniform contract values |
| **Reconciliation** | Mismatches between project payments and financial transaction records |
| **Data Quality** | Missing coordinates, invalid locations, impossible dates, orphan records |

Every risk score comes with evidence — officials see *why* a project was flagged, not just *that* it was flagged.

### 🗺️ Interactive Maps
Choropleth map using real Census 2011 district boundaries showing risk concentration, district health, project density, and investigation activity. Click any district to drill into its projects. Individual project points visible when zoomed in.

### 🔍 Investigation & Case Management
High-risk projects are queued for investigation. Officials can open cases, assign them, follow structured playbooks, record findings, and close with documented outcomes. The full lifecycle is audit-logged.

### 🤝 AI Copilot
Ask natural-language questions about a case and get grounded answers pulled from the project's actual data — financials, risk factors, similar projects, timeline. The Copilot can also draft investigation summaries. Works with a deterministic evidence engine (no LLM API key required) or optionally with an LLM for richer responses.

### 📈 District Health Scores
Weighted composite score per district across five dimensions: delivery performance (25%), timeliness (20%), risk exposure (30%), signal load (15%), and financial discipline (10%). Flags low-confidence scores for small portfolios.

### 📋 Reports
Export investigation packages as PDF (10-section report with responsible-AI banners) or XLSX (6-sheet workbook). Every export is audit-logged. Reports are generated on demand with live data.

### 🏗️ Model Registry
Transparency dashboard showing every ML model used — what it does, how it works, its measured performance metrics (precision, recall, F1, MAE), and known limitations. No hand-entered numbers; all metrics come from evaluation against the ground-truth ledger.

### 🔐 Role-Based Access Control
Six roles with server-enforced scoping — Ministry and Officers see everything, State officials see their state, District officials see their district, MPs see their projects, Viewers get read-only access. Scope is enforced in the backend, not just the UI.

### 📝 Audit Trail
Every significant action is logged: logins, risk assessments, investigation actions, status changes, report exports. Officials can review the complete AI assessment history for any project.

### 📥 Data Ingestion
CSV upload with automatic column mapping, per-row validation, preview before commit, and rejected-row reporting. Data quality reports available for the entire dataset.

---

## Quick Start

```
1. git clone https://github.com/digantshetty0006-ship-it/Drishti.git
   cd Drishti

2. Copy-Item .env.example .env        # then edit JWT_SECRET

3. docker compose up -d --build        # start PostgreSQL

4. cd backend
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   python -m alembic upgrade head
   python -m scripts.seed_users
   python -m scripts.seed_boundaries
   python -m scripts.generate_data --projects 25000 --seed 42 --version demo-v2
   python -m scripts.run_pipeline
   python -m uvicorn app.main:app --reload --port 8000

5. cd frontend
   npm install
   npm run dev

6. Open http://localhost:5173
   Login: ministry@mplads.demo / Demo@1234
```

---

## Prerequisites

| Tool | Version | Verify |
|---|---|---|
| Docker Desktop | Latest (running) | `docker --version` |
| Python | 3.12+ | `python --version` |
| Node.js | 20+ | `node --version` |
| Git | Any | `git --version` |

---

## Environment Variables

```powershell
Copy-Item .env.example .env
```

Edit `.env` and set `JWT_SECRET` (generate one with `python -c "import secrets; print(secrets.token_hex(32))"`).

| Variable | Purpose | Default |
|---|---|---|
| `POSTGRES_PORT` | Host port for PostgreSQL | `5434` |
| `DATABASE_URL` | SQLAlchemy connection string | `postgresql+psycopg://mplads:mplads_dev_password@localhost:5434/mplads` |
| `JWT_SECRET` | Token signing key | **Must change** |
| `JWT_EXPIRY_HOURS` | Token lifetime | `8` |
| `CORS_ORIGINS` | Allowed origins | `http://localhost:5173` |
| `VITE_API_URL` | Backend URL for frontend | `http://localhost:8000` (optional, set in `frontend/.env`) |

> ⚠️ Never commit `.env` files.

---

## Database

PostgreSQL 16 + PostGIS + pgvector runs in Docker on port **5434** (avoids conflict with local Postgres on 5432).

```powershell
docker compose up -d --build     # start
docker compose ps                # verify (should show "healthy")
docker compose down              # stop
docker compose down -v           # stop + delete data
```

---

## Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate                # Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
python -m alembic upgrade head        # create tables (5 migrations)
python -m scripts.seed_users          # create demo accounts
python -m scripts.seed_boundaries     # load district map boundaries
python -m scripts.generate_data --projects 25000 --seed 42 --version demo-v2   # ~60s
python -m scripts.run_pipeline        # ML analysis + risk scoring
python -m uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs · Health: http://localhost:8000/health

---

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

---

## Demo Accounts

Password for all: **`Demo@1234`** (demo only — never use in production)

| Email | Role | Scope |
|---|---|---|
| `ministry@mplads.demo` | Ministry | National |
| `state.mh@mplads.demo` | State Authority | Maharashtra |
| `district.pune@mplads.demo` | District Authority | Pune |
| `mp.pune@mplads.demo` | Member of Parliament | Own projects |
| `officer@mplads.demo` | Monitoring Officer | National |
| `viewer@mplads.demo` | Viewer | Read-only |

---

## Verify It Works

After login, check these pages load:

- Command Center (dashboard, KPIs, alerts)
- Projects (table with filters/sorting)
- Project Detail (risk card, factors, financials)
- Map (choropleth with district boundaries)
- Investigation Queue → open a case → Copilot → close with outcome
- Reports (PDF/XLSX export)
- District Health, Model Registry
- Logout → redirects to login

---

## Testing

```powershell
# Backend (135 tests)
cd backend && python -m pytest

# Frontend unit (56 tests)
cd frontend && npm test

# E2E — Playwright (14 tests, needs dataset + pipeline)
cd frontend && npm run test:e2e
```

---

## Production Build

```powershell
cd frontend
npm run build       # output → frontend/dist/
npm run preview     # serve at http://localhost:4173
```

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS v4, React Router, TanStack Query, Axios, Recharts, React-Leaflet, Motion |
| Backend | Python, FastAPI, SQLAlchemy 2, Alembic, Pydantic v2, PyJWT, reportlab, openpyxl |
| Database | PostgreSQL 16, PostGIS, pgvector (Docker) |
| ML | scikit-learn, XGBoost, sentence-transformers, NetworkX, pandas, numpy |
| Testing | pytest, Vitest, Playwright |

---

## Project Structure

```
backend/
  app/            # FastAPI application (api, auth, ml, services, models, etc.)
  alembic/        # Database migrations (0001–0005)
  scripts/        # seed_users, generate_data, run_pipeline, evaluate, etc.
  tests/          # pytest suite
frontend/
  src/            # React app (components, pages, hooks, services, utils)
  e2e/            # Playwright E2E tests
data/
  seed/           # Districts, boundaries (Census 2011 GeoJSON), guidelines
  evaluation/     # Ground-truth ledger, metrics
db/               # Dockerfile (PostgreSQL + PostGIS + pgvector)
docs/             # Architecture, risk methodology, investigation workflow, etc.
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Port conflict | Change `POSTGRES_PORT` in `.env` and update `DATABASE_URL` to match |
| Docker not running | Start Docker Desktop first |
| Backend can't reach DB | `docker compose ps` → check healthy; verify `DATABASE_URL` |
| Frontend can't reach API | Backend on :8000? `CORS_ORIGINS` includes `http://localhost:5173`? |
| Missing `.env` | `Copy-Item .env.example .env` then set `JWT_SECRET` |
| Empty database | Re-run: `alembic upgrade head` → `seed_users` → `generate_data` → `run_pipeline` |
| Python venv issues | Delete `.venv`, recreate with `python -m venv .venv` |
| npm issues | Delete `node_modules`, run `npm install` again |

---

## Dataset

The demo dataset is generated, not included. `generate_data` creates ~25,000 synthetic projects with realistic financials, geography, and ~2,500 injected anomalies across 12 types. Same seed = identical output. Takes ~60 seconds. `run_pipeline` then computes all ML risk analysis. `scripts.evaluate` (optional) computes metrics against the ground-truth ledger.

---

## Attribution

District boundaries: [DataMeet India](https://github.com/datameet/maps) Census 2011 (CC BY 4.0). Full details in [data/seed/boundaries/ATTRIBUTION.md](data/seed/boundaries/ATTRIBUTION.md).

---

## Security

- Never commit `.env`, API keys, or production credentials
- Demo credentials are synthetic — configure real secrets for production
- Ground-truth anomaly ledger is evaluation-only, never exposed via API

---

## Documentation

| Doc | What |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design |
| [RISK_METHODOLOGY.md](docs/RISK_METHODOLOGY.md) | Risk scoring |
| [INVESTIGATION_WORKFLOW.md](docs/INVESTIGATION_WORKFLOW.md) | Case lifecycle |
| [DISTRICT_HEALTH.md](docs/DISTRICT_HEALTH.md) | Health score formula |
| [REPORTING.md](docs/REPORTING.md) | PDF/XLSX reports |
| [MODEL_REGISTRY.md](docs/MODEL_REGISTRY.md) | ML models & metrics |
| [STATE.md](STATE.md) | Full project state |
