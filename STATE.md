# MPLADS AI Risk Intelligence — Project State

Authoritative handoff document for AI coding sessions.
Smart India Hackathon 2026 · Problem Statement 26102.
Last updated: 2026-08-25 (after Milestone 07).

## 1. Project Purpose

An AI-powered risk intelligence and investigation-support platform for the MPLAD
Scheme. It analyzes project, financial, geographic and administrative data to
detect anomalies, prioritize review, and support human investigation decisions:
DETECT → EXPLAIN → PRIORITIZE → INVESTIGATE → HUMAN DECISION → AUDIT.

Users: authorized officials (ministry, state, district, MP, monitoring officer,
viewer). **Responsible-AI principle:** AI outputs are decision-support signals —
"Implementation / Review Risk", never findings of fraud, corruption, or
misconduct. Final decisions remain with authorized human officials. All data is
synthetic ("Prototype Dataset — Synthetic Data").

## 2. Current Status

| Milestone | Status |
|---|---|
| M01 Foundation | ✅ |
| M02 Data Pipeline | ✅ |
| M03 ML & Risk | ✅ |
| M04 Backend APIs | ✅ |
| M05 Frontend | ✅ |
| M06 Investigation & Copilot | ✅ |
| M07 Executive Intelligence & Polish | ✅ |

Git tags (all exist and are pushed): `v0.1-foundation`, `v0.2-data-pipeline`,
`v0.3-ml-risk`, `v0.4-backend`, `v0.5-frontend`, `v0.6-investigation`,
`v0.7-executive-polish`.
Current branch: `main` (M07 merged --no-ff).
Milestone branches (`milestone/01-…` through `07-…`) are preserved.

## 3. Tech Stack

- **Frontend:** React 19 (JavaScript ONLY — no TypeScript), Vite 7, Tailwind CSS v4
  (CSS-first tokens), React Router 7, TanStack Query 5, Axios, Recharts,
  React-Leaflet + Leaflet (OpenStreetMap tiles), Motion (motion.dev, restrained).
- **Backend:** Python 3.14, FastAPI, SQLAlchemy 2, Alembic, Pydantic v2
  (pydantic-settings), psycopg v3.
- **Database:** PostgreSQL 16 in Docker (custom image: `postgis/postgis:16-3.4`
  + pgvector; see `db/Dockerfile`). Host port **5434** (5432 is taken by a local
  Postgres on this machine).
- **GIS:** PostGIS (`GEOGRAPHY(Point)` locations, `ST_Distance`/`ST_DWithin`).
- **Vector search:** pgvector (`projects.description_embedding VECTOR(384)`,
  ivfflat cosine index).
- **ML:** pandas, numpy, scikit-learn (IsolationForest), XGBoost (delay
  regressor + overrun classifier, artifacts in `backend/app/ml/models/artifacts/`),
  sentence-transformers `all-MiniLM-L6-v2` (torch CPU), NetworkX.
- **Auth:** JWT (PyJWT, HS256) + bcrypt. Single auth mechanism.
- **Reporting (M07):** reportlab (PDF), openpyxl (XLSX); pypdf test-only.
- **Copilot LLM (M06, optional):** anthropic SDK; deterministic fallback
  needs no key/package/network.
- **Geo data (M07):** DataMeet Census-2011 district boundaries (CC BY 4.0)
  in `districts.boundary`; pyshp used for extraction tooling.
- **Testing:** pytest (backend), Vitest + Testing Library (frontend units),
  Playwright + Chromium (E2E against a production build).
- **Tooling:** docker-compose (Postgres only), npm, venv at `backend/.venv`.

## 4. Repository Structure

```
backend/
  app/
    api/            # legacy auth/health/ingest + api/v1/ (main API routers)
    auth/           # jwt.py, hashing.py, rbac.py (require_roles, get_current_user)
    datagen/        # synthetic data generator + anomaly injector + loader
    database/       # session.py, base.py
    graph/          # network_signals.py (NetworkX)
    ml/             # features, peer_baseline, risk_config, risk_engine,
                    # detectors/ (cost, payment, mismatch, reconciliation,
                    # data_quality, duplicates), models/ (delay, overrun, split)
    models/         # SQLAlchemy: user, geo, project, ai, audit
    nlp/            # embeddings.py (ST primary, TF-IDF fallback)
    schemas/        # Pydantic response models
    services/       # scope, projects, intel, dashboard, misc, ingestion,
                    # data_quality, investigation, copilot
    investigation/  # playbooks (JSON) + loader, queue_config (M06)
    copilot/        # prompts + structured-output contract (M06)
    reports/        # investigation_report (PDF), investigation_xlsx (M07)
  alembic/versions/ # 0001..0005
  scripts/          # generate_data, run_pipeline, evaluate, seed_users,
                    # seed_guidelines, seed_boundaries
  tests/            # auth, datagen, ml, api, investigations, copilot,
                    # health_score, boundaries, report
frontend/
  src/
    components/     # ui/ (kit incl. Modal), risk/RiskCard, charts/
                    # (RiskDistribution, RelationshipGraph,
                    # EvaluationDashboard, WhatIfSimulator),
                    # maps/RiskMap (choropleth), investigation/ (+Copilot)
    pages/          # CommandCenter, Projects, ProjectDetail, MapView,
                    # Alerts, DataQuality, Models, Login,
                    # InvestigationQueue, CaseList, CaseDetail
    layouts/        # AppShell (sidebar/topbar/mobile)
    hooks/          # useAuth.jsx
    services/       # api.js (single Axios client, /api/v1)
    utils/          # format.js, risk.js, health.js, investigation.js
    test/           # vitest suite
  e2e/              # Playwright specs + helpers (M07)
data/
  seed/             # districts.json, sample_projects.csv, guidelines/,
                    # boundaries/ (Census-2011 GeoJSON + ATTRIBUTION.md)
  evaluation/       # ledger.json (ground truth), metrics.json, dataset_stats.json
db/                 # Dockerfile (postgis + pgvector)
docs/               # ARCHITECTURE.md, RISK_METHODOLOGY.md,
                    # INVESTIGATION_WORKFLOW.md, DISTRICT_HEALTH.md,
                    # REPORTING.md, MODEL_REGISTRY.md, M07.md
```

## 5. Database

PostgreSQL + PostGIS + pgvector; Alembic migrations 0001–0004 (foundation →
project domain → AI-derived tables → audit_logs).

- **Geo/admin:** states, districts (PostGIS centroid, GiST), constituencies, mps.
- **Source (eSAKSHI-style):** projects (status enum, costs NUMERIC(14,2),
  embedding vector, `data_source` synthetic|csv_import), project_locations
  (GEOGRAPHY Point), project_categories, implementing_agencies, vendors,
  recommendations, sanctions, milestones, progress_updates, payments.
- **PFMS-style:** financial_transactions — references projects by **string code
  (`project_code_raw`), deliberately not an FK** so reconciliation mismatches are real.
- **AI-derived** (every row carries `model_version_id` + evidence JSONB):
  peer_groups, anomaly_results, duplicate_candidates, network_signals,
  reconciliation_results, data_quality_issues, risk_assessments (+ `is_current`),
  risk_factors (per-factor evidence), ai_assessments (append-only snapshots),
  alerts, model_versions.
- **Governance:** users (role enum + scope columns state_id/district_id/mp_id),
  audit_logs, anomaly_ground_truth (**evaluation only — never an ML feature and
  never exposed via API**), dataset_versions.
- Indexes: FKs, composite (district+status, category+FY), GiST spatial, ivfflat
  vector, `(is_current, level)` on risk_assessments.

## 6. Dataset

- Version **demo-v2**, seed **42**, as-of date 2026-08-24, reproducible via
  `python -m scripts.generate_data --projects 25000 --seed 42 --version demo-v2`.
- **25,355 projects** (25,000 + injected clones; DB may also hold a few
  `csv_import` test rows). Status mix: 16,524 completed / 3,877 in progress /
  2,951 sanctioned / 2,003 recommended.
- Related rows: 106,074 payments, 129,193 financial transactions, 90,273
  milestones, 106,818 progress updates, 821 vendors, 320 agencies.
- **Ground truth:** 2,548 positive injected anomalies across 12 types
  (COST 405, DELAY 405, RECONCILIATION 409, DATA_QUALITY 379, PAYMENT 280,
  OVERRUN 250, DUPLICATE 109, NEAR_DUPLICATE 100, GEO_DUPLICATE 76,
  MISMATCH 117, VENDOR_CONCENTRATION 10 districts, RELATIONSHIP 8 clusters)
  plus **101 hard negatives** (legitimate look-alike pairs, label=False).
  ~30 are **compound cases** (several correlated anomalies on one project) —
  these produce the high/critical demo projects.
- Geography: 10 real states × 8 real districts each, village-clustered
  coordinates around district centroids.
- Realism: lognormal cost clustering per category, s-curve progress,
  milestone-driven payments (expenditure = Σ payments for clean projects),
  zipf vendor popularity, distinctive titles (wards/landmarks/phases).
- Injected data-quality defects: ~65 missing coords, ~56 invalid coords,
  ~70 impossible dates, orphan transactions, etc. Overall completeness ≈ 96.35%.

## 7. M01 — Foundation

JWT login (`/api/v1/auth/login`, `/auth/me`), bcrypt hashing, role enum
(ministry/state/district/mp/officer/viewer) with scope columns, reusable
`require_roles()` dependency; Alembic baseline with PostGIS + pgvector
extensions; `/health` reports api/database/postgis/pgvector individually;
React shell with design tokens, auth context, protected routing;
`scripts/seed_users.py` seeds one demo user per role (idempotent).
Tests: 5 auth unit tests.

## 8. M02 — Data Pipeline

Seeded, fully reproducible generator (`app/datagen/`): reference geo → projects
→ schedules → finance, then a separate-RNG anomaly injector writing every
injection (with parameters) to `anomaly_ground_truth` and
`data/evaluation/ledger.json`. Bulk loader upserts geo by natural key, wipes and
reloads domain tables (~508k rows in ~60s), syncs sequences. CSV ingestion
(auto column mapping, per-row validation, preview + commit endpoints; rejected
rows always reported). Data-quality report service. Tests: 14 (reproducibility
byte-for-byte, referential integrity, ledger coverage, financial consistency,
progress↔utilization correlation > 0.6). Limitation: district boundary polygons
not loaded (centroids only); CSV imports get a district-default MP/agency.

## 9. M03 — ML & Risk Engine

Pipeline: `python -m scripts.run_pipeline` (`--skip-embeddings` for fast
re-runs); evaluation: `python -m scripts.evaluate` → `data/evaluation/metrics.json`.
**Every metric is computed against the ground-truth ledger — nothing hand-entered.**

- Peer baselining: category × state × FY, robust median/MAD incl. log space, n ≥ 8.
- Detectors: cost (log-space robust z ≥ 2.1 + deviation ≥ 60%), payment (rules:
  before-sanction, same-day burst, oversized-vs-milestone-weights + IsolationForest
  corroboration), progress/payment mismatch (milestone-consistency-aware
  exemption), reconciliation (payment↔txn matching, 6 statuses), data quality.
- Duplicates: MiniLM embeddings in pgvector (ANN candidates, same district+category)
  + lexical title similarity + PostGIS distance → composite ranking (store ≥ 75,
  strong ≥ 85).
- XGBoost: delay regressor + overrun classifier, frozen 30% hash split
  (`ml/models/split.py`), leakage-safe mid-flight features.
- Network: vendor concentration per district; uniform-cost cluster within
  agency–vendor pairs (window CV < 3.5%, n ≥ 10).
- Risk engine (`risk_config.py` + `risk_engine.py`, docs/RISK_METHODOLOGY.md):
  contribution = cap × severity_scale × (0.6 + 0.4·score/100); caps sum to 100
  (cost 25, payment 20, mismatch 15, delay 15, duplicate 10, network 5,
  reconciliation 5, DQ 5); strongest signal per family; levels 0–30/31–60/
  61–80/81–100; evidence strength from signal count × completeness.
  Output: risk_assessments + evidence-carrying risk_factors + ai_assessments
  snapshots + alerts. Model versions `*-v0.1` registered in model_versions.

**Authoritative metrics (demo-v2, metrics.json regenerated 2026-08-25 in M07):**
risk ranking P@10=1.0, P@50=1.0, P@100=1.0, P@250=0.972; delay held-out MAE
15.31d / RMSE 23.39d, >60d-classification F1 0.917; overrun held-out P 1.0 /
R 0.988 / F1 0.994; mismatch P .483/R 1.0; reconciliation P .887/R .978;
DQ F1 .945; vendor concentration P 1.0/R 1.0; relationship pairs P .571/R 1.0;
duplicates per-type recall 1.0/.78/.987 with 1 hard negative in ranked
top-300; cost P .259/R .422 (irreducible overlap — 1.6–2.6× injections vs
natural lognormal spread; documented). Note: delay-ranking and data-quality
evaluations use time-dependent features, so values shift slightly with the
evaluation date (see docs/MODEL_REGISTRY.md; DQ improved 0.815→0.945 because
previously future-dated planted defects became unambiguous).

Limitations: thresholds tuned on synthetic data (real deployment needs
recalibration); single pipeline run so far → one timeline snapshot per project;
cost recall inherently partial; naturally-late projects dilute delay-vs-ledger
ranking metrics.

## 10. M04 — Backend APIs

27 operations under `/api/v1` (all verified against OpenAPI; `/docs`, `/redoc`
work). Legacy unversioned `/auth/*` and `/data/*` remain as hidden aliases.

- Auth: `POST /api/v1/auth/login`, `GET /api/v1/auth/me`
- Projects: `GET /api/v1/projects` (filters: search, state_id, district_id,
  constituency_id, category_id, status, risk_level, min/max_risk,
  min/max_expenditure, start/end_date; allowlisted sort; page_size ≤ 200),
  `GET /api/v1/projects/{project_id}`
- Per-project intelligence: `/risk`, `/risk/factors`, `/risk/timeline`,
  `/anomalies` (detector filter), `/similar`, `/relationships`,
  `/reconciliation`, `/predictions`, `/early-warning`
- Dashboard: `/dashboard/overview`, `/states`, `/districts`, `/health`
  (components only — composite score deferred), `/map` (district aggregates
  default; project points when narrowed, capped at 2,000)
- Alerts: `GET /alerts`, `GET /alerts/{alert_id}`
- Data: `GET /data/quality`, `POST /data/upload`, `POST /data/upload/commit`
- Models: `GET /models`, `GET /models/{name}` (genuine metrics from metrics.json)
- Audit: `GET /audit/{project_id}` (ai_assessments + audit_logs; viewer/MP denied)
- `GET /health` (public)

Conventions: `Paginated{items,page,page_size,total,total_pages}`; scope enforced
**server-side** in `services/scope.py` (client params can only narrow scope;
out-of-scope detail → 403; unknown → 404); allowlisted sorting (bad sort → 422);
no stack traces; ground truth unreachable; risk responses carry the
responsible-AI disclaimer. Route handlers are thin; logic in services.

## 11. M05 — Frontend

Pages: **Command Center** (8 real-API KPI cards, clickable risk-distribution
chart, Requires Attention list, recent alerts, map preview, ranked state table),
**Projects** (server-side filtered/sorted/paginated table, URL-persisted
filters), **Project Detail** (hero: Risk Card with score/level/evidence
strength/model version + numbered factors + disclaimer; per-factor evidence
cards; financial + progress sections with mismatch callout; risk timeline chart;
predictions; anomalies; similar/duplicate-candidate table; relationships panel
with network signals; reconciliation), **MapView** (district risk-concentration
circles + project points, filters, district side panel), **Alerts**,
**DataQuality**, **Models** (10 model cards with plain-language what/how/limits).

Reusable: UI kit (`components/ui`: Card, RiskBadge, StatusBadge, SeverityBadge,
ProgressBar, Skeleton, EmptyState, ErrorState, QueryBoundary), RiskCard,
RiskDistribution, RiskMap + legend. AppShell: collapsible sidebar, role-aware
nav (Data Quality hidden for mp/viewer), live open-alert badge, global search
(→ `/projects?search=`), mobile drawer, sign out. All pages have
loading/empty/error states; lazy-loaded routes; no page-level horizontal
overflow at 375px; risk states always label+symbol, never color-only.

## 12. Frontend → Backend Flow

React pages → TanStack Query hooks → single Axios client
(`src/services/api.js`, base `VITE_API_URL + /api/v1`, Bearer token from
sessionStorage, 401 interceptor → logout event) → FastAPI routers → services
(scope-filtered queries) → PostgreSQL (source + precomputed M03 outputs).
The frontend **never recomputes ML** and contains **zero hardcoded production
numbers** — every figure comes from the API.

## 13. Authentication & RBAC

Roles and scope (enforced in backend services, not just UI):
ministry/officer/viewer → national; state → own state; district → own district;
mp → own MP's projects; viewer read-only (uploads 403, audit 403).
Demo users exist per role as `<role>@mplads.demo` (see `scripts/seed_users.py`;
shared demo password is in the README — synthetic prototype only).
JWT carries user id + role; role is always re-read from DB server-side.

## 14. Responsible AI Rules

- AI identifies **risk indicators**; it does not establish guilt.
- Vocabulary: "High-risk project", "Potential anomaly", "Requires review",
  "Duplicate candidate", "Suspicious/unusual relationship pattern",
  "Risk concentration" (maps).
- Never: "Fraud confirmed", "Corruption confirmed", "Collusion confirmed",
  "Fraud hotspot", or naming any person/contractor as guilty.
- Risk score = "Implementation / Review Risk", not a fraud probability.
- Standard disclaimer (in `utils/risk.js` and API risk responses): AI-generated
  indicators are decision-support signals and do not constitute findings of
  fraud or misconduct; final decisions remain with authorized officials.
- Ground-truth ledger is for evaluation only — never an ML feature, never in API
  responses. No fabricated metrics anywhere: UI shows only measured values.

## 15. Design System

Tokens in `frontend/src/styles/index.css` (Tailwind v4 `@theme`): light-first
surfaces, deep-navy sidebar (`navy-900`), restrained indigo accent (#4f46e5),
semantic risk colors (slate/amber/orange/red for low/moderate/high/critical),
Inter with tabular numerals, 8px-ish spacing, subtle borders over shadows.
Risk semantics centralized in `utils/risk.js` — label + symbol (● ◆ ▲ ■) always
accompany color. Layout: AppShell sidebar + topbar; dense analytical cards.
Motion: entrance/transition only (100–400ms), no decorative animation.
Accessibility: aria-labeled badges (role=status), progressbar semantics, labeled
inputs, keyboard-focusable controls, `prefers-reduced-motion`-friendly usage.
Inspiration sources (godly.design, refero, 21st.dev, motion.dev, etc.) were
approved as inspiration only — no copied proprietary designs.

## 16. Known Limitations

- Risk timeline has a single point per project — each pipeline run replaces
  the ai_assessments snapshots rather than appending across runs.
- Milestones, payment line items, and progress-update series are in the DB but
  **not exposed by the API** — the frontend shows aggregates only.
- Cost-anomaly recall is inherently partial (see §9); thresholds are tuned on
  synthetic data and need recalibration for real data.
- District boundaries are Census-2011 extents; districts bifurcated after
  2011 are shown undivided (documented per district in
  data/seed/boundaries/ATTRIBUTION.md).
- Health-score weights are documented design choices pending real-data
  calibration; portfolios under 30 projects are flagged low-confidence.
- Delay-ranking and data-quality evaluation metrics are time-dependent
  (as-of-run-date features) and shift slightly between evaluation dates.
- Reports are generated on demand, not archived server-side (the audit trail
  records each export event, not the bytes).
- Playwright's backend web-server command is Windows-pathed (dev machine);
  other platforms start the backend manually (reuseExistingServer applies).
- Demo MP user (`mp.pune@mplads.demo`) owns no generated projects (scope
  mechanics verified; empty result set).
- `GET /data/quality` is uncached (~0.85s full scan).
- Dataset/pipeline regeneration resets or detaches investigation-to-AI pins
  (documented M06/M07 behavior; frozen priority_breakdown survives).

## 17. Deferred Features (not yet implemented)

- Advanced role-specific dashboards beyond the current scoped views.
- Full docker-compose deploy profile (backend+frontend images) and a
  scripted demo runbook (`demo_check`).
- Report archival (storing generated report bytes server-side).
- Photo verification and geotag checks (P3 stretch — cut).

## 18. M07 — Executive Intelligence, Reporting & Production Polish

Details: docs/M07.md, docs/DISTRICT_HEALTH.md, docs/REPORTING.md,
docs/MODEL_REGISTRY.md.

- **District Health Score:** deterministic weighted composite (delivery 25 /
  timeliness 20 / risk exposure 30 / signal load 15 / financial discipline 10)
  over audited aggregates; renormalizes missing components; neutral bands
  (steady/watch/needs_attention); confidence flag; full breakdown in
  `/dashboard/health`. Formula in `ml/health_config.py`.
- **Choropleth:** real Census-2011 district boundaries (DataMeet, CC BY 4.0)
  loaded into the pre-existing `districts.boundary` column (80/80 matched
  exactly once; alias table + provenance in data/seed/boundaries/
  ATTRIBUTION.md); `/dashboard/map/boundaries` GeoJSON (~0.37 MB simplified);
  four map modes (risk/health/density/investigations); enriched district
  panel; cross-filter links into projects/queue/alerts (URL params);
  centroid circles retained as fallback + project-point mode. No migration
  was needed (column existed since 0002).
- **Reporting:** investigation package as PDF (primary, 10 sections,
  responsible-AI banners, "Not available" for missing data) and XLSX
  (6 sheets); one shared scoped data builder; RBAC (viewer/MP 403);
  every export audit-logged.
- **Playwright E2E:** 14 tests / 7 specs against a production build —
  auth, navigation, projects, map + cross-filtering, full investigation
  lifecycle incl. PDF download, RBAC, model dashboard. `npm run test:e2e`.
- **Relationship graph:** dependency-free SVG neighborhood view (zoom/pan/
  selection/filters/legend) of existing M03 relationship data; additive
  `related_projects` field on `/projects/{id}/relationships`.
- **Model registry:** `/models/evaluation` serves the full measured artifact;
  Evaluation Dashboard (P@K bars, confusion matrices, feature importance,
  per-variant recalls, detector table, methodology). demo-v1/demo-v2 label
  inconsistency resolved by fixing the version queries in run_pipeline/
  evaluate and regenerating (never hand-editing).
- **Copilot UX:** factor-gated quick prompts, answer skeleton, aria-live;
  architecture unchanged. **A11y:** shared Modal with focus trap/Esc/restore.
  **Motion:** motion-safe keyframes only. **Responsive:** 375/768/1280 clean.
- **What-if simulator (P3):** `/models/risk/simulation` histogram + slider
  card, prominently labeled SIMULATION; read-only, nothing persisted.
- **Pipeline note:** `run_pipeline` now detaches investigation pins
  (risk_assessment_id/alert_id) before regenerating AI tables; frozen
  priority_breakdown preserves at-open evidence.

## 19. Important Development Rules

- JavaScript, NOT TypeScript. Preserve the modular-monolith architecture.
- Do not rewrite M01–M05; build on them. Backend RBAC is authoritative.
- Real API data only — no hardcoded production metrics, no fake AI outputs,
  no fabricated evaluation numbers ("not evaluated" beats a made-up number).
- Never expose the ground-truth ledger or secrets (.env is gitignored; JWT
  secret and DB credentials live only there).
- Test before claiming completion; report failures honestly.
- Work milestone-by-milestone on `milestone/NN-*` branches; merge `--no-ff`;
  tag `v0.N-*`; never push without explicit instruction.
- Postgres runs in Docker on port **5434**; start Docker Desktop first.
- Dataset regeneration wipes and reloads all domain + AI tables.

## 20. Verification History (actual measured results)

- M01: 5/5 auth unit tests; login E2E verified in browser.
- M02: 14/14 datagen tests; 25k load ~60s; CSV ingestion live-verified.
- M03: 13/13 ML tests; smoke test (821-project in-memory subset through full
  pipeline): PASSED repeatedly (214 risk scores/cards, 0 errors).
- M04: 44/44 API tests; independent verification: 53/53 live checks incl.
  RBAC/scope-bypass/leakage; 21 endpoints live at 0.02–0.85s; read-only GETs
  proven non-mutating (before/after DB counts identical).
- M05: 15/15 Vitest tests; backend regression 76/76; production build clean
  (~6–9s); browser E2E across ministry/district/viewer (login, all 7 pages,
  filters, pagination, search, logout, unauthorized redirect); zero console
  errors in a fresh session; responsive probes clean at 1280/375px.
- M06: 31/31 new frontend Vitest tests (46/46 total); 36/36 backend investigation/copilot tests (112/112 total); browser E2E verification of case lifecycle (login, queue, open case with reason, assign, copilot grounded question, draft/accept case summary, change status to In Progress, close case with outcome and notes).
- M07: 23 new backend tests (health formula + API, boundaries/choropleth,
  PDF/XLSX reports, what-if simulation) — backend 135/135; 10 new Vitest
  (56/56); Playwright suite 14/14 twice consecutively against a production
  build; boundary verification 80/80 matched exactly once, 0 invalid
  geometries; PDF verified by text extraction (all sections + disclaimers,
  no guilt vocabulary); responsive probes clean at 375/768/1280; fresh-session
  console clean.
- Full suite as of M07 close: **backend 135/135, frontend 56/56,
  Playwright E2E 14/14**.

## 21. Git Checkpoints

| Milestone | Tag | Status |
|---|---|---|
| M01 | v0.1-foundation | Complete |
| M02 | v0.2-data-pipeline | Complete |
| M03 | v0.3-ml-risk | Complete |
| M04 | v0.4-backend | Complete |
| M05 | v0.5-frontend | Complete |
| M06 | v0.6-investigation | Complete |
| M07 | v0.7-executive-polish | Complete |

All seven tags verified present locally and pushed to origin.

## 22. AI Session Startup Instructions

When starting a new AI coding session:

1. Read STATE.md first.
2. Inspect the repository before modifying anything.
3. Verify the current Git branch/tag.
4. Inspect the relevant existing implementation.
5. Never assume planned functionality exists.
6. Preserve M01–M05 unless a justified change is required.
7. Ask/confirm milestone scope before implementing unrelated work.
