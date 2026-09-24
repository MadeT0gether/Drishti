# Risk Scoring Methodology (risk-v0.1)

> AI-generated risk assessments are decision-support signals and do not constitute
> findings of fraud, misconduct, corruption, or legal liability. A risk score is
> **Implementation / Review Risk**, not a probability of fraud.

## Score

```
magnitude = 0.6 + 0.4 × min(signal_score/100, 1)     # confirmed signals keep weight
contribution(signal) = CAP[family] × severity_scale × magnitude
risk = clamp( Σ strongest-contribution-per-family , 0, 100 )
```

| Signal family | Cap (points) | Produced by |
|---|---|---|
| Cost anomaly | 25 | Robust z-score **in log space** vs peer group (category × state × FY, median/MAD, n ≥ 8); flag at z ≥ 2.1 AND deviation ≥ +60% (high tier at z ≥ 3.0) |
| Payment anomaly | 20 | Rules: payment-before-sanction, same-day burst ≥ 3, payment > 30% of sanction **that matches no milestone weight**; IsolationForest corroboration |
| Progress/payment mismatch | 15 | Utilization − progress ≥ 25 pp; milestone exemption applies only when milestone records are consistent with reported progress |
| Delay risk | 15 | XGBoost regression, predicted delay ≥ 45 days |
| Duplicate candidate | 10 | Composite ranking: lexical title similarity (0.35) + embedding sim (0.20) + PostGIS proximity (0.20) + cost sim (0.15) + agency/time (0.10); stored ≥ 75, strong tier ≥ 85 |
| Network signal | 5 | Vendor share ≥ 50% of district (recent FYs); agency–vendor pair containing a ≥ 10-project cost cluster with window CV < 3.5% |
| Reconciliation mismatch | 5 | Payment↔PFMS-transaction matching (amount ±1.5%, date window) |
| Data quality | 5 | Rule checks (coords, dates, missing fields, status consistency, exact duplicates) |

Severity scale: low ×0.4, medium ×0.7, high/critical ×1.0. Caps sum to 100.
Only the **strongest signal per family** counts (no double-counting a family).

## Levels

0–30 LOW · 31–60 MODERATE · 61–80 HIGH · 81–100 CRITICAL

## Evidence strength

| | Condition |
|---|---|
| HIGH | ≥ 3 independent signal families AND data completeness ≥ 90% |
| MEDIUM | ≥ 2 families AND completeness ≥ 75% |
| LOW | otherwise |

Data completeness = share of key fields present (sanctioned cost, coordinates,
planned dates, vendor, financial utilization).

## Reproducibility & versioning

All thresholds live in [`risk_config.py`](../backend/app/ml/risk_config.py).
Every derived row carries a `model_version_id`; every assessment is snapshotted in
`ai_assessments`. Same data + same config ⇒ same scores.

## Evaluation

Metrics in `data/evaluation/metrics.json` are produced exclusively by
`python -m scripts.evaluate` against the injected ground-truth ledger:
- Rule/statistical detectors: full-dataset P/R/F1 + false-positive rate (they have
  no training step, so there is no leakage).
- XGBoost models: frozen 30% hash split (`app/ml/models/split.py`), metrics from
  held-out rows only.
- Duplicate detection additionally reports how many **hard negatives**
  (legitimate nearby look-alikes) it wrongly flags.
- Risk ranking: Precision@K of the top-K scored projects vs any ledger positive.

**Honesty caveat:** the dataset is synthetic; injected anomaly magnitudes and
detector thresholds are both prototype design choices. Real-world deployment
requires re-calibration and re-evaluation on real, labeled outcomes.
