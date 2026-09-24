# MPLADS AI Risk Intelligence Platform — System Architecture

**SIH 2026 · Problem Statement 26102**
**Status: DRAFT for approval — no application code exists yet.**
**Team: one developer. Every decision below is optimized for that constraint.**

---

## 1. System Architecture Overview

A **modular monolith**: one React SPA, one FastAPI app, one PostgreSQL database (with PostGIS + pgvector), ML as importable Python modules inside the backend (not separate services), and an LLM API called server-side for the Copilot/summaries.

```
┌─────────────────────────────────────────────────────────────┐
│  React SPA (Vite, JS, Tailwind, TanStack Query, Leaflet)    │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS / JSON, JWT bearer
┌──────────────────────────▼──────────────────────────────────┐
│  FastAPI (single app)                                        │
│  ┌────────┐ ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌────────┐ │
│  │  api/  │→│services/│→│   ml/    │ │ copilot/│ │ auth/  │ │
│  │ routes │ │ business│ │ nlp/     │ │ RAG+LLM │ │ JWT+   │ │
│  │        │ │ logic   │ │ graph/   │ │         │ │ RBAC   │ │
│  └────────┘ └─────────┘ └──────────┘ └─────────┘ └────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │ SQLAlchemy
┌──────────────────────────▼──────────────────────────────────┐
│  PostgreSQL 16 + PostGIS (geo) + pgvector (embeddings)      │
│  source tables · derived AI tables · investigation tables   │
└─────────────────────────────────────────────────────────────┘
        ▲
        │ offline batch (CLI scripts, not a queue)
┌───────┴─────────────────────────────────────────────────────┐
│  Analysis pipeline: seed → validate → features → detectors  │
│  → risk engine → alerts  (invoked via `python -m` scripts)  │
└─────────────────────────────────────────────────────────────┘
```

**Key architectural decisions (and why):**

| Decision | Rationale |
|---|---|
| ML runs as **batch pipeline scripts**, results stored in DB | Demo reliability. The frontend never waits on a model; it reads precomputed `risk_assessments` / `anomaly_results`. Re-analysis is triggered via `POST /analysis/run` which runs the same pipeline in a FastAPI `BackgroundTasks` job. No Celery/Redis. |
| **Hard separation: source tables vs. AI-derived tables** | Explainability + responsible-AI. Every AI output row carries `model_version`, `detector`, evidence JSON, timestamp. The UI can always label "SOURCE" vs "AI-DERIVED". |
| **Deterministic risk aggregation** (documented weighted signals, not a learned meta-model) | Reproducibility. Same inputs → same score. The methodology page can show the exact formula. |
| **Copilot never touches the DB freely** | The copilot service assembles a structured context bundle from verified rows + pgvector retrieval of guidelines/playbooks, then calls the LLM with structured output. LLM has no tools, no SQL. |
| **Docker Compose for Postgres only**; frontend/backend run natively in dev | Fastest single-dev loop on Windows. Full compose profile added in Milestone 07 for deployment. |
| **Synthetic data generator is a first-class module** with seeded RNG + planted-anomaly ledger | The ledger (which anomalies were planted where) is the ground truth for genuine evaluation metrics — no fabricated numbers. |

---

## 2. Repository / Folder Structure

```
Drishti/
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── main.jsx, App.jsx
│       ├── styles/            # tokens.css, base.css
│       ├── components/
│       │   ├── ui/            # Button, Card, Badge, Modal, Drawer, Tooltip,
│       │   │                  # DataTable, FilterBar, EmptyState, LoadingState, ErrorState
│       │   ├── risk/          # RiskBadge, RiskGauge, RiskCard, EvidenceCard, RiskTimeline
│       │   ├── investigation/ # QueueRow, CaseHeader, PlaybookStepper, ActionBar, AuditTrail
│       │   └── copilot/       # CopilotPanel, SuggestedQuestions, GroundedAnswer
│       ├── charts/            # Recharts wrappers (ChartCard, TrendChart, DistributionChart)
│       ├── maps/              # RiskHeatmap, DistrictLayer, ProjectMarkers
│       ├── layouts/           # AppShell (sidebar+topbar), AuthLayout
│       ├── pages/             # Login, Dashboard, Projects, ProjectDetail,
│       │                      # InvestigationQueue, InvestigationCase, Alerts,
│       │                      # Districts, Analytics, ModelEvaluation, Admin
│       ├── hooks/             # useAuth, useProjects, useRisk, useQueue ... (TanStack Query)
│       ├── services/          # api.js (axios instance), endpoints per domain
│       └── utils/             # formatters (₹, dates, %), riskLevels.js, constants
│
├── backend/
│   ├── alembic/               # migrations
│   ├── app/
│   │   ├── main.py            # app factory, CORS, routers, exception handlers
│   │   ├── config.py          # pydantic-settings, reads .env
│   │   ├── database/          # session.py, base.py
│   │   ├── models/            # SQLAlchemy models, one file per domain
│   │   ├── schemas/           # Pydantic request/response models
│   │   ├── api/               # routers: auth, projects, dashboard, risk, anomalies,
│   │   │                      # duplicates, reconciliation, alerts, investigations,
│   │   │                      # copilot, analysis, audit, models, ingest
│   │   ├── services/          # business logic per domain (route files stay thin)
│   │   ├── ml/                # detectors + risk engine (see §6)
│   │   ├── nlp/               # embeddings.py, similarity.py
│   │   ├── graph/             # network_signals.py (NetworkX)
│   │   ├── copilot/           # context_builder.py, rag.py, llm.py, prompts.py, guards.py
│   │   ├── auth/              # jwt.py, hashing.py, rbac.py (dependency-based)
│   │   └── utils/
│   ├── scripts/               # run_pipeline.py, seed_db.py, evaluate.py, make_embeddings.py
│   └── tests/                 # pytest
│
├── data/
│   ├── synthetic/             # generator package + generated CSVs (gitignored)
│   │   ├── generator/         # entities.py, projects.py, payments.py, anomalies.py, ledger.py
│   │   └── output/
│   ├── seed/                  # static reference: states, districts (with lat/lon + boundaries), categories
│   └── evaluation/            # frozen held-out sets + planted-anomaly ledger + metrics JSON
│
├── ml/                        # offline experiments only (training notebooks/scripts,
│   ├── training/              # saved model artifacts copied into backend/app/ml/artifacts/)
│   └── evaluation/
│
├── docs/                      # this file, RISK_METHODOLOGY.md, API.md, DEMO_SCRIPT.md
├── scripts/                   # dev.ps1 / dev.sh convenience launchers
├── docker-compose.yml         # postgres (postgis+pgvector image); full profile later
├── .env.example
└── README.md
```

---

## 3. Database Schema (ERD + tables)

### 3.1 ERD (domains and key relationships)

```
GEO/ADMIN            SOURCE (eSAKSHI-style)         FINANCIAL (PFMS-style)
─────────            ──────────────────────         ──────────────────────
states ─┬─ districts ─┬─ constituencies ── mps      payment_demands ─ payments
        │             │                              financial_transactions
        │             └──< projects >───────────────────────┘
        │                    │  │ (project_id FK on all financial rows)
        │                    │  ├──< recommendations, sanctions
        │                    │  ├──< milestones, progress_updates
        │                    │  ├──< project_locations (PostGIS point)
        │                    │  └── implementing_agency_id, vendor_id FKs
        │
AI-DERIVED (all rows: model_version_id, created_at, evidence JSONB)
────────────────────────────────────────────────────────────────
anomaly_results ──┐
duplicate_candidates ──┤
network_signals ──┼──> risk_assessments ──< risk_factors
reconciliation_results ──┤        │
data_quality_issues ──┘          └──> alerts

INVESTIGATION                        GOVERNANCE
─────────────                        ──────────
investigations ─< investigation_actions      users ─ roles
        │        (actor, reason, from→to)    audit_logs
        └─ investigation_outcomes            model_versions
                                             ai_assessments (score snapshots → timeline)
RAG
───
guidelines / playbooks ─< doc_chunks (pgvector embedding)
projects.description_embedding (pgvector, for duplicate detection)
```

### 3.2 Table definitions (column-level)

**Conventions:** every table has `id` (BIGSERIAL PK), `created_at`/`updated_at` TIMESTAMPTZ. Money = `NUMERIC(14,2)` (rupees). Scores = `NUMERIC(5,2)`. Enums as PostgreSQL enums. FKs indexed.

**Governance / auth**
- `users` — email UNIQUE, password_hash, full_name, role (enum: ministry, state, district, mp, officer, viewer), state_id FK NULL, district_id FK NULL, mp_id FK NULL, is_active. Scope columns drive row-level filtering in services.
- `audit_logs` — user_id, action (enum), entity_type, entity_id, detail JSONB, ip, timestamp. Append-only.
- `model_versions` — name (e.g. `risk-v0.3`), component (enum: risk, cost, payment, duplicate, delay, overrun, network, reconciliation, dq), params JSONB, dataset_version, created_at.

**Geo / admin**
- `states` — name, code. `districts` — state_id, name, centroid GEOGRAPHY(Point), boundary GEOMETRY(MultiPolygon) NULL (simplified GeoJSON for choropleth). `constituencies` — state_id, name, type. `mps` — constituency_id, name, house, term_start/end.

**Source projects**
- `project_categories` — name, sector, typical_cost_min/max (for generator realism).
- `implementing_agencies` — name, type, district_id. `vendors` — name, registration_no.
- `projects` — code UNIQUE (e.g. `MPL-2025-004821`), title, description TEXT, category_id, mp_id, district_id, agency_id, vendor_id NULL, status (enum: recommended, sanctioned, in_progress, completed, cancelled), recommended_cost, sanctioned_cost, revised_cost NULL, expenditure, physical_progress_pct, planned_start, planned_end, actual_start NULL, actual_end NULL, financial_year, **description_embedding VECTOR(384)**, data_source (enum: synthetic, csv_import).
- `project_locations` — project_id, geom GEOGRAPHY(Point), address, village, pincode. GiST index.
- `recommendations` — project_id, mp_id, date, amount. `sanctions` — project_id, sanction_no, date, amount, authority.
- `milestones` — project_id, seq, name, planned_date, actual_date NULL, weight_pct, status.
- `progress_updates` — project_id, date, physical_pct, remarks.

**Financial (PFMS-style — deliberately separate keys to make reconciliation real)**
- `payment_demands` — project_id, demand_no, date, amount, status.
- `payments` — project_id, demand_id NULL, payment_ref, date, amount, payee_vendor_id, mode.
- `financial_transactions` — txn_ref, **project_code_raw TEXT** (string ref, not FK — mismatches are the point), date, amount, type (release/payment/refund), counterparty.

**AI-derived** (all carry `model_version_id` FK, `evidence` JSONB, `explanation` TEXT)
- `peer_groups` — category_id, state_id, cost_band (enum), fy, stats JSONB {n, median, p25, p75, iqr, p10, p90}.
- `anomaly_results` — project_id, detector (enum: cost_deviation, expenditure, payment_amount, payment_timing, payment_concentration, progress_payment_mismatch, milestone, utilization), score 0–100, severity (enum: low, medium, high, critical), values JSONB (the actual numbers behind the flag).
- `duplicate_candidates` — project_id_a, project_id_b (a<b UNIQUE), text_sim, geo_km, cost_sim, same_category BOOL, same_agency BOOL, time_overlap BOOL, composite_score, status (enum: candidate, confirmed_by_officer, rejected_by_officer).
- `network_signals` — project_id, signal_type (vendor_concentration, agency_repeat, cluster, degree_outlier), score, detail JSONB.
- `reconciliation_results` — project_id, status (enum: reconciled, amount_mismatch, timing_mismatch, missing_transaction, missing_reference, status_mismatch, requires_review), expected NUMERIC, found NUMERIC, detail JSONB.
- `data_quality_issues` — project_id, issue_type (enum), field, severity, detail.
- `risk_assessments` — project_id, score 0–100, level (enum: low, moderate, high, critical), evidence_strength (enum), data_completeness_pct, signal_count, predicted_delay_days NULL, delay_risk (enum), overrun_risk (enum), is_current BOOL. History rows (`is_current=false`) power the **risk timeline**.
- `risk_factors` — assessment_id, factor_type, contribution NUMERIC (points added), severity, evidence JSONB, explanation TEXT, source_ref (anomaly_result id etc.). This is what renders **Risk Cards**.
- `ai_assessments` — append-only snapshot log: project_id, assessed_at, score, level, signals JSONB, model_version_id. Answers "why did the AI say X at time T".
- `alerts` — project_id, severity, reason, prev_score, curr_score, status (open, acknowledged, closed), assigned_role, created_at.

**Investigation**
- `investigations` — project_id, status (enum: detected, prioritized, assigned, under_review, evidence_requested, investigating, finding_recorded, resolved, escalated, false_positive), priority_rank, financial_impact, assigned_user_id NULL, sla_due_date, opened_at, closed_at NULL.
- `investigation_actions` — investigation_id, user_id, action (enum: accept, request_evidence, dismiss, mark_false_positive, escalate, resolve, assign, comment), reason TEXT (required for state changes), prev_status, new_status, timestamp.
- `investigation_outcomes` — investigation_id, outcome (enum: valid_concern, false_positive, resolved, escalated, needs_evidence), notes, recorded_by, recorded_at.

**RAG**
- `documents` — kind (guideline, playbook, sop), title, body TEXT, meta JSONB.
- `doc_chunks` — document_id, chunk_text, embedding VECTOR(384), chunk_index. IVFFlat index.

---

## 4. ML / Detection Architecture

**Principle: hybrid, per-detector, evidence-first.** Each detector is a pure function `(project features, context) → list[AnomalyResult]` with its own score + evidence JSON. No single black box.

### 4.1 Pipeline (batch, orchestrated by `scripts/run_pipeline.py`)

```
1. validate       → data_quality_issues              (rules)
2. features       → in-memory Pandas feature frame   (deterministic)
3. peer_baseline  → peer_groups                      (robust stats: median, IQR)
4. detectors      → anomaly_results
     cost_deviation        rule+stat: (cost − peer_median)/peer_median; severity by
                           percentile position; requires peer n ≥ 8, else flag "insufficient peers"
     expenditure/payment   stats: robust z-score (MAD) within peer group; IsolationForest
                           over payment-shape features as a secondary signal
     payment_timing        rules: burst concentration, payment-before-sanction, gaps
     progress_pay_mismatch rule: |financial_util − physical_pct| > threshold, with
                           milestone-payment exemption window
5. duplicates     → duplicate_candidates
     SentenceTransformer all-MiniLM-L6-v2 (384-d) embeddings in pgvector →
     top-k cosine candidates → filter: geo distance (PostGIS ST_DWithin ≤ 5 km),
     same category, cost ratio, FY overlap → composite score (documented weights)
6. predictions    → risk_assessments.predicted_delay_days / overrun_risk
     XGBoost regressor (delay days) + classifier (overrun) trained offline in ml/
     on the synthetic historical slice; artifacts versioned + loaded from
     backend/app/ml/artifacts/; evaluated on frozen held-out set (MAE, RMSE, F1)
7. network        → network_signals   (NetworkX: bipartite agency/vendor–project graph;
                    degree, HHI concentration, dense clusters, geographic clustering)
8. reconciliation → reconciliation_results (match payments↔financial_transactions by
                    project_code_raw + amount + date-window; classify mismatch type)
9. risk_engine    → risk_assessments + risk_factors + ai_assessments + alerts
```

### 4.2 Risk engine (deterministic, documented in docs/RISK_METHODOLOGY.md)

```
score = clamp(0–100) of Σ capped signal contributions:
  cost anomaly       0–25    payment anomaly     0–20
  progress mismatch  0–15    delay prediction    0–15
  duplicate          0–10    network             0–5
  reconciliation     0–5     data quality        0–5
```
Each contribution = severity-scaled, stored per-factor in `risk_factors` with its evidence. Levels: 0–30 LOW · 31–60 MODERATE · 61–80 HIGH · 81–100 CRITICAL. **Evidence strength** = f(independent signal count, data completeness, peer n, detector agreement) via a documented lookup table — never a fabricated confidence. Weights live in one versioned config (`risk_config.py`) → `model_versions`.

### 4.3 Evaluation (genuine metrics only)

The synthetic generator writes a **planted-anomaly ledger** (`data/evaluation/ledger.json`): every injected anomaly with project id + type. Evaluation script computes, against a frozen held-out split: detection precision/recall/F1 per detector, Precision@K for the queue, duplicate P/R/F1, delay MAE/RMSE, FP rate. Results saved to `data/evaluation/metrics.json` → served by `GET /models` → Model Evaluation page. **If a metric wasn't computed, the UI shows "not evaluated" — never a made-up number.**

---

## 5. Copilot / RAG Architecture

```
POST /copilot/query {project_id, question}
  → guards.py: auth + project scope check, question length/type check
  → context_builder.py assembles VERIFIED bundle (all from DB, no LLM involvement):
      project facts · current risk_assessment + risk_factors · anomaly evidence ·
      payment/progress series (summarized) · top duplicate candidates ·
      reconciliation status · recent timeline events · investigation state
  → rag.py: pgvector top-k over doc_chunks (playbooks, guidelines) for the question
  → llm.py: single LLM call, structured output schema:
      {answer, evidence_refs[], recommended_actions[], confidence_basis, insufficient_evidence: bool}
      System prompt: answer ONLY from the provided context; if not present, set
      insufficient_evidence=true. Responsible-AI phrasing enforced in prompt +
      post-response phrase filter (no "fraud confirmed" etc.).
  → response rendered with clickable evidence_refs that map to real UI sections
```
Case summaries use the same context builder with a summary prompt. All numeric values in answers are interpolated from the verified bundle server-side where possible (the LLM references evidence by id; numbers come from DB). LLM provider behind one small interface (`llm.py`) with an `LLM_API_KEY` env var; a deterministic fallback mode (template-based answers from risk_factors) keeps the demo alive if the API is down.

---

## 6. API Architecture

JWT bearer auth (access token, 8h expiry for demo; bcrypt password hashing). Every router uses `Depends(require_roles(...))` + scope filtering (state/district/MP users see only their slice — enforced in services, not just UI).

```
POST /auth/login, GET /auth/me

GET  /projects                       ?district,state,category,status,risk_level,q,sort,page
GET  /projects/{id}                  full detail bundle
GET  /projects/{id}/risk             current assessment + factors (Risk Cards)
GET  /projects/{id}/anomalies        /timeline  /similar  /relationships
GET  /projects/{id}/reconciliation   /audit

GET  /dashboard/overview             role-scoped KPIs
GET  /dashboard/map                  ?layer=overall|cost|payment|delay|duplicate|network|dq
GET  /dashboard/districts            health scores + components
GET  /dashboard/trends

GET  /alerts                         POST /alerts/{id}/ack
GET  /investigations                 queue: rank, filters
GET  /investigations/{id}
POST /investigations/{id}/action     {action, reason} — reason required for state changes
POST /copilot/query                  POST /copilot/summary
POST /analysis/run                   (admin) background pipeline re-run + status endpoint
POST /data/upload                    CSV: validate → preview → map → commit (2-step)
GET  /models                         versions + real metrics
```
Consistent envelope: paginated lists `{items, total, page, page_size}`; errors `{detail, code}`; 403 for scope violations. OpenAPI docs auto-generated.

---

## 7. Frontend Architecture

- **State**: TanStack Query for all server state (per-domain hooks); React context only for auth. No Redux.
- **Routing**: React Router; route guards by role; lazy-loaded page chunks (Dashboard, ProjectDetail, Queue, Map are separate chunks).
- **Design tokens** (`styles/tokens.css`, mapped into Tailwind config): the palette, spacing, radius, shadow, and motion scales from §8. Every component consumes tokens only.
- **DataTable**: one reusable headless table (sort/filter/paginate server-side via query params) used by Projects, Queue, Alerts.
- **Map**: React Leaflet + OSM tiles; district choropleth from simplified boundaries served by the API; marker clustering for project points; layer switcher = the 7 risk layers.
- **Charts**: thin Recharts wrappers with token-driven theming (risk semantic colors, tabular numerals).
- **Motion**: Motion (motion.dev) for page/card/drawer transitions only, 100–400ms bands, `prefers-reduced-motion` respected globally via a single utility.
- **Every page**: Loading (skeleton) / Empty / Error states via shared components.
- **Source vs AI labeling**: a `DataOriginBadge` component ("SOURCE" / "AI-DERIVED · risk-v0.3") used everywhere derived data appears — this is a demo talking point.

**Design language:** professional enterprise intelligence. Light-first UI with a deep-navy sidebar/header; one restrained accent (indigo); semantic risk colors (slate→amber→orange→red for LOW→CRITICAL, always paired with label+icon); Inter (or IBM Plex Sans) with tabular numerals; 8px spacing grid; subtle borders over heavy shadows. The login page gets the one moment of visual drama (animated India network motif); operational screens stay dense and calm.

---

## 8. Security Strategy

- bcrypt (passlib) hashing; JWT HS256 with secret from env; token in memory + refresh on load via `/auth/me`.
- RBAC enforced in **service layer** (scope filters on every query for state/district/MP roles), not just route decorators.
- Pydantic validation on all inputs; SQLAlchemy parameterized queries (no raw SQL string interpolation); CSV ingestion validates types/ranges and never silently drops rows (rejects reported per-row).
- CORS locked to the frontend origin; secrets only in `.env` (gitignored, `.env.example` documented); LLM key never reaches the frontend — all LLM calls server-side.
- `audit_logs` written for: login, investigation actions, analysis runs, data uploads, copilot queries.
- Rate limit on `/auth/login` and `/copilot/query` (slowapi, simple in-process).

---

## 9. Testing Strategy

- **Backend (pytest, per milestone):** auth/RBAC scope tests, API contract tests per router, risk-engine unit tests (known inputs → exact scores), detector tests against small fixtures with planted anomalies, reconciliation classifier tests, copilot context-builder tests (LLM mocked).
- **ML:** frozen held-out set; evaluation script is deterministic (seeded); metrics committed to `data/evaluation/metrics.json`; a test asserts the served metrics equal the committed file (no drift/fabrication).
- **Frontend:** Playwright smoke pack in Milestone 07 — login, dashboard load, map drill-down, project detail render, queue action with reason, role restriction (viewer can't act).
- **Demo gate:** a `scripts/demo_check.py` that hits every demo-flow endpoint and fails loudly — run before every rehearsal.

---

## 10. Deployment Strategy

- **Dev:** `docker compose up postgres` (postgis image + pgvector extension), `uvicorn --reload`, `vite dev`. One `scripts/dev.ps1` starts all.
- **Demo:** full `docker-compose.yml` profile in Milestone 07 — postgres + backend (uvicorn) + frontend (static build behind the backend or nginx). Entire demo runs on the laptop, offline-tolerant except the LLM call (which has the deterministic fallback). Seed + pipeline run baked into a `make demo` / `scripts/demo_setup.ps1` one-shot.

---

## 11. Technical Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Scope explosion (39 features, 1 dev) | Strict P0→P1 order; P2 only after Milestone 06; P3 cut by default. |
| ML pipeline too slow on 25k projects | Batch precompute; vectorized Pandas; pgvector ANN for duplicates; target < 5 min full run, measured from Milestone 03. |
| LLM API down during demo | Deterministic fallback answers built from `risk_factors`; suggested-question answers cacheable. |
| Windows dev friction (PostGIS, sentence-transformers) | Postgres in Docker from day 1; embedding model downloaded once and cached; CPU-only torch. |
| District boundaries too heavy for Leaflet | Simplified GeoJSON (topojson-simplified, ~1–2 MB), demo focuses 2–3 states in depth. |
| Synthetic data looks fake to judges | Generator uses real state/district/category names, realistic cost bands per category, correlated progress/expenditure, milestone-driven payments — anomalies injected on top of realism. |
| Metrics credibility | Planted-anomaly ledger = ground truth; all metrics from actual runs; UI shows "not evaluated" where true. |
| Demo DB corrupted mid-rehearsal | `demo_setup` script rebuilds from scratch in minutes; DB dump snapshot as backup. |

---

## 12. Milestone Plan (single-dev, milestone branches off `main`)

| # | Branch | Scope | Definition of Done |
|---|---|---|---|
| 01 | `milestone/01-foundation` | Repo scaffold, compose (postgres+postgis+pgvector), FastAPI app + config + Alembic baseline, auth (JWT, bcrypt, roles) + RBAC dependencies, React shell (tokens, AppShell, Login, routing, API client), health check wiring | App starts; DB migrates; login works end-to-end; role-guarded ping route |
| 02 | `milestone/02-data-pipeline` | Seed reference data (states/districts/geo/categories), synthetic generator (~25k projects, correlated, 10 anomaly classes + ledger), CSV ingestion (validate→preview→commit), data-quality checks | Fresh clone → one command → realistic populated DB with ledger |
| 03 | `milestone/03-ml-risk` | Feature frame, peer baselines, all detectors, duplicate detection (embeddings+pgvector+PostGIS), XGBoost delay/overrun (trained + frozen eval), network + reconciliation signals, risk engine + factors + timeline snapshots + alerts, evaluation script with real metrics | Pipeline run populates all AI tables; metrics.json exists; risk explainable per-factor |
| 04 | `milestone/04-backend` | All routers in §6 with RBAC scoping, pagination/filtering, pytest coverage of contracts + authz | Full API demoable in OpenAPI docs; tests green |
| 05 | `milestone/05-frontend` | Dashboard (KPIs, trends, distribution), heatmap with layers + drill-down, district health, project list, **Project Detail hero page** (risk cards, evidence, peer comparison, payment vs progress, reconciliation, duplicates, timeline), alerts | Demo path Login→Dashboard→Map→District→Project fully works |
| 06 | `milestone/06-investigation` | Smart queue (ranking), investigation case page, lifecycle + SLA, actions with reasons, outcomes, audit trail UI, playbooks, Copilot (RAG context builder + LLM + fallback), case summary | Full DETECT→…→AUDIT story clickable end-to-end |
| 07 | `milestone/07-final` | Motion/responsive/accessibility polish, Playwright smoke pack, model-evaluation page, security pass, full compose profile, README/docs, demo script + `demo_check` | §82 Definition-of-Done checklist green; demo rehearsed |

Each milestone: branch from `main` → implement → test → merge → tag (`v0.1-foundation` …). No develop branch.

---

## 13. Responsible-AI Enforcement Points (where in code, not just words)

1. `copilot/prompts.py` — system prompt forbids fraud/corruption assertions; `guards.py` post-filters banned phrases.
2. Risk score labeled "Implementation / Review Risk" in `RiskGauge` component — one component, one label, everywhere.
3. Global footer/disclaimer component on all AI-derived views: *"AI-generated risk assessments are decision-support signals and do not constitute findings of fraud, misconduct, corruption, or legal liability."*
4. `duplicate_candidates.status` requires officer confirmation — UI copy always "Potential duplicate candidate".
5. Every derived table row → `model_versions` FK; `ai_assessments` answers "why this score, then".
6. Synthetic data banner ("Prototype Dataset — Synthetic Data") in the AppShell header, driven by `projects.data_source`.
7. No automatic punitive transitions: every investigation state change requires a human action row with reason.
