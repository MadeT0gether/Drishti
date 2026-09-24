# Model Registry & Evaluation Dashboard

## Data sources — and the demo-v1/demo-v2 resolution

All figures come from two artifacts, both **generated, never hand-edited**:

- `model_versions` table — registered by `scripts/run_pipeline.py`;
- `data/evaluation/metrics.json` — produced by `scripts/evaluate.py` against
  the ground-truth ledger.

Both previously carried a stale `demo-v1` label while the loaded dataset was
demo-v2: `dataset_versions` holds one row per registered dataset and both
scripts selected with an unordered `LIMIT 1`; `register_models` also never
refreshed `dataset_version` on existing rows. M07 fixed the queries (most
recently registered version) and **re-ran the pipeline + evaluation** rather
than editing labels. The re-run shifted a few metrics because the delay and
data-quality evaluations use time-dependent (as-of-run-date) features —
notably data_quality F1 0.815 → 0.945 (previously future-dated planted
defects became unambiguous), risk P@100 0.99 → 1.0, delay MAE 15.32 → 15.31,
RMSE 23.13 → 23.39. All current values are measured outputs of the 2026-08-25
run on demo-v2 (seed 42).

## API

- `GET /models` / `GET /models/{name}` — registry cards (unchanged from M04).
- `GET /models/evaluation` — the complete metrics artifact: P@K series,
  confusion matrices, feature importances, per-variant recalls,
  hard-negative counts, methodology notes, registered versions. Aggregates
  only; the ledger itself is never exposed.
- `GET /models/risk/simulation` — scoped score histogram + level boundaries
  for the what-if slider (SIMULATION only; read-only).

## Dashboard (Models page → "Evaluation dashboard")

Visualizations only where the artifact contains the data (no invented ROC/PR
curves): stat tiles; single-hue precision@K bars (risk ranking, duplicate
queue with hard-negative counts stated); confusion-matrix grids with exact
counts always visible; delay feature-importance bars; reconciliation
per-variant recall; a detector P/R/F1 table with inline bars; methodology &
limitations notes verbatim from the artifact. Absent metrics render as "not
evaluated" — never estimated.

## What-if simulator

A slider compares "projects at or above a hypothetical review threshold"
against the current high+critical count, computed client-side from the served
histogram. Prominently labeled SIMULATION; no production score, level, queue
priority or model is modified, recomputed or persisted.

## Limitations

- All metrics are measured on synthetic data against planted anomalies;
  real-world deployment requires recalibration and re-evaluation.
- Detector precision reflects deliberate design trade-offs (see
  RISK_METHODOLOGY.md), e.g. cost-anomaly recall is inherently partial.
- Time-dependent evaluations (delay ranking, data quality) shift slightly
  with the evaluation date; metrics.json records one dated run.
