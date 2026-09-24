# District Health Score

Deterministic, explainable composite of a district's project-portfolio
performance. Defined in `backend/app/ml/health_config.py` (single source of
truth) and served by `GET /api/v1/dashboard/health`.

**What it is:** a 0–100 summary of implementation performance, built only from
audited aggregates that the dashboard already serves. Higher = healthier.

**What it is not:** not an ML model, not a fraud/integrity measure, not a
judgment about any official or agency. It is a decision-support signal for
prioritizing attention; the API response carries this disclaimer.

## Formula

```
health = Σ ( weight_i / total_weight ) × subscore_i     over AVAILABLE components
```

When a component cannot be computed (e.g. a district with no completed
projects has no delay rate), it is dropped and the remaining weights are
renormalized. The response lists `components_missing` so the omission is
always visible.

## Components

| Component | Weight | Subscore (0–100, higher = healthier) | Source aggregate |
|---|---|---|---|
| `delivery` | 25 | `completion_rate_pct` | completed / total projects |
| `timeliness` | 20 | `100 − delay_rate_pct` | late completions / completed |
| `risk_exposure` | 30 | `100 − avg_risk` | mean current AI risk score |
| `signal_load` | 15 | `100 − min(100, anomaly_rate_pct)` | anomaly signals / project |
| `financial_discipline` | 10 | `utilization_pct` capped at 100; utilization above 110% subtracts the excess beyond the 10-point grace band | expenditure / sanctioned |

All subscores are clamped to [0, 100]. Weights sum to 100.

Rationale, briefly: risk exposure carries the largest weight because the risk
score is itself a calibrated composite of eight evidence-backed signal
families (see RISK_METHODOLOGY.md); delivery and timeliness describe observed
outcomes; signal load counts open review indicators; financial discipline
rewards utilization tracking sanction without overspend.

## Bands and confidence

- **Bands (neutral vocabulary):** ≥75 `steady` · 50–74 `watch` · <50 `needs_attention`.
  Bands describe portfolio performance, never integrity.
- **Confidence:** districts with fewer than 30 projects in the caller's scope
  are flagged `confidence: "low"` — small portfolios make percentages jumpy.

## Explainability contract

Every response row carries `score_breakdown`:

```json
{
  "subscores":      {"delivery": 63.9, "risk_exposure": 91.2, ...},
  "weights_used":   {"delivery": 25, "risk_exposure": 30, ...},
  "contributions":  {"delivery": 15.98, "risk_exposure": 27.35, ...},
  "components_missing": [],
  "formula": "sum(weight_i/total_weight * subscore_i) over available components"
}
```

`health_score` always equals the sum of `contributions` (±0.1 rounding). The
same figures drive the choropleth HEALTH mode, so map, table and API never
disagree.

## RBAC

The score is computed over the caller's authorized scope (the same
`scoped_projects` filter as every endpoint): a state user's district scores
reflect only that state's projects; a district user sees only their district.

## Limitations

- Computed from the current snapshot only — no invented historical trend.
- Weights are documented design choices of this prototype, tuned for face
  validity on synthetic data; a real deployment should calibrate them with
  domain owners.
- `anomaly_rate_pct` counts detector signals, which include false positives by
  design (see metrics.json precision figures).
