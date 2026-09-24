"""Single source of truth for risk methodology. Documented in docs/RISK_METHODOLOGY.md.

Risk score = clamp(0-100) of the sum of capped per-signal contributions.
A severity within a signal scales its contribution: low 40%, medium 70%, high/critical 100%.
The score expresses IMPLEMENTATION / REVIEW RISK — it is not a probability of fraud.
"""

MODEL_VERSIONS = {
    "cost": "cost-v0.1",
    "payment": "payment-v0.1",
    "mismatch": "mismatch-v0.1",
    "duplicate": "duplicate-v0.1",
    "delay": "delay-v0.1",
    "overrun": "overrun-v0.1",
    "network": "network-v0.1",
    "reconciliation": "reconciliation-v0.1",
    "data_quality": "dq-v0.1",
    "risk": "risk-v0.1",
}

# max points each signal family can contribute
CAPS = {
    "cost_anomaly": 25,
    "payment_anomaly": 20,
    "progress_payment_mismatch": 15,
    "delay_risk": 15,
    "duplicate_candidate": 10,
    "network_signal": 5,
    "reconciliation_mismatch": 5,
    "data_quality": 5,
}

SEVERITY_SCALE = {"low": 0.4, "medium": 0.7, "high": 1.0, "critical": 1.0}

RISK_LEVELS = [(0, 30, "low"), (31, 60, "moderate"), (61, 80, "high"), (81, 100, "critical")]

# Alerting floor: projects at or above this score raise an open alert.
# 50–60 ("elevated moderate") -> medium severity; high -> high; critical -> critical.
ALERT_MIN_SCORE = 50

# detector thresholds (kept here so the whole methodology is one reviewable file)
COST_Z_MEDIUM = 2.1          # robust z-score in log space (MAD-based); best-F1 point on demo-v2
COST_Z_HIGH = 3.0            # high-severity tier (precision ~0.5 on demo-v2)
COST_DEV_MIN_PCT = 60        # deviation guard: at least +60% above peer median
COST_MIN_PEERS = 8
PAYMENT_MAX_RATIO = 0.30     # single payment > 30% of sanction (non-advance, non-final)
PAYMENT_BURST_MIN = 3        # >=3 payments on the same day
MISMATCH_GAP_PP = 25         # fin-util minus progress, percentage points
MISMATCH_MIN_UTIL = 40
MISMATCH_MILESTONE_TOL = 12  # exemption if util within tol of completed milestone weight
DUP_TEXT_SIM_MIN = 0.60      # ANN candidate floor (recall stage, embedding space)
DUP_GEO_KM_MAX = 2.5
DUP_STORE_MIN = 75           # store candidates at/above this composite
DUP_STRONG_MIN = 85          # "strong candidate" tier (high severity in risk engine)
DELAY_HIGH_DAYS = 90
DELAY_MEDIUM_DAYS = 45
RECON_AMOUNT_TOL = 0.015     # 1.5% amount matching tolerance
RECON_DATE_WINDOW = 45       # days for payment<->txn matching
RECON_TIMING_LAG = 90
VENDOR_SHARE_HIGH = 0.5      # vendor share of district projects (recent FYs)
PAIR_MIN_PROJECTS = 10       # uniform-cost cluster size within an agency-vendor pair
PAIR_COST_CV_MAX = 0.035     # suspiciously uniform costs (window CV)


def level_for(score: float) -> str:
    if score <= 30:
        return "low"
    if score <= 60:
        return "moderate"
    if score <= 80:
        return "high"
    return "critical"
