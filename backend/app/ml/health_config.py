"""District Health Score — single source of truth for the formula.
Documented in docs/DISTRICT_HEALTH.md.

    health = Σ weight_i × subscore_i   over AVAILABLE components,
             with weights renormalized when a component is unavailable.

Every subscore is 0-100 (higher = healthier) and is a pure function of
aggregates the dashboard already serves — no ML model, no invented history.
The score describes IMPLEMENTATION PERFORMANCE of a district's project
portfolio; it is never a statement about integrity or misconduct.
"""

# component weights (sum 100)
WEIGHTS = {
    "delivery": 25,        # completion rate of the portfolio
    "timeliness": 20,      # share of completed projects finished on time
    "risk_exposure": 30,   # inverse of average AI risk score
    "signal_load": 15,     # inverse of anomaly signals per project
    "financial_discipline": 10,  # utilization: credit up to 100%, overspend penalized
}

# a district with fewer projects than this gets a low-confidence flag
MIN_PROJECTS_FULL_CONFIDENCE = 30

# neutral performance bands (never integrity language)
BANDS = [(75, "steady"), (50, "watch"), (0, "needs_attention")]

OVERSPEND_GRACE_PCT = 10  # utilization up to 110% is not penalized


def _clamp(v: float) -> float:
    return max(0.0, min(100.0, v))


def subscores(components: dict) -> dict:
    """components: the dict served by /dashboard/health (completion_rate_pct,
    delay_rate_pct, utilization_pct, avg_risk, anomaly_rate_pct) — any of which
    may be None. Returns only the computable subscores."""
    out = {}
    if components.get("completion_rate_pct") is not None:
        out["delivery"] = _clamp(components["completion_rate_pct"])
    if components.get("delay_rate_pct") is not None:
        out["timeliness"] = _clamp(100 - components["delay_rate_pct"])
    if components.get("avg_risk") is not None:
        out["risk_exposure"] = _clamp(100 - components["avg_risk"])
    if components.get("anomaly_rate_pct") is not None:
        out["signal_load"] = _clamp(100 - components["anomaly_rate_pct"])
    util = components.get("utilization_pct")
    if util is not None:
        if util <= 100:
            out["financial_discipline"] = _clamp(util)
        else:
            over = util - 100
            penalty = max(0.0, over - OVERSPEND_GRACE_PCT)
            out["financial_discipline"] = _clamp(100 - penalty)
    return out


def health_score(components: dict, project_count: int) -> dict | None:
    """Composite score with full explainability. Returns None when no
    component is computable (e.g. a district with zero projects in scope)."""
    subs = subscores(components)
    if not subs:
        return None
    total_weight = sum(WEIGHTS[k] for k in subs)
    contributions = {
        k: round(WEIGHTS[k] / total_weight * v, 2) for k, v in subs.items()
    }
    score = round(sum(contributions.values()), 1)
    band = next(label for floor, label in BANDS if score >= floor)
    return {
        "health_score": score,
        "band": band,
        "confidence": "full" if project_count >= MIN_PROJECTS_FULL_CONFIDENCE else "low",
        "subscores": {k: round(v, 1) for k, v in subs.items()},
        "weights_used": {k: WEIGHTS[k] for k in subs},
        "contributions": contributions,
        "components_missing": sorted(set(WEIGHTS) - set(subs)),
        "formula": "sum(weight_i/total_weight * subscore_i) over available components",
    }
