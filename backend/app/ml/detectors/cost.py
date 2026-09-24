"""Cost deviation vs peer-group baseline (robust z-score)."""
import numpy as np
import pandas as pd

from app.ml.risk_config import COST_DEV_MIN_PCT, COST_Z_HIGH, COST_Z_MEDIUM


def detect(features_with_peers: pd.DataFrame) -> list[dict]:
    f = features_with_peers
    mask = (
        f["usable"].fillna(False)
        & f["peer_robust_z"].notna()
        & (f["peer_robust_z"] >= COST_Z_MEDIUM)
        & (f["peer_deviation_pct"] >= COST_DEV_MIN_PCT)  # guard for tight peer groups
    )
    results = []
    for _, r in f[mask].iterrows():
        z = float(r["peer_robust_z"])
        severity = "high" if z >= COST_Z_HIGH else "medium"
        score = float(np.clip(40 + 20 * (z - COST_Z_MEDIUM), 40, 100))
        results.append({
            "project_id": int(r["id"]), "detector": "cost_deviation",
            "score": round(score, 2), "severity": severity,
            "values": {
                "sanctioned_cost": r["sanctioned_cost"], "peer_median": round(r["median"], 2),
                "peer_n": int(r["n"]), "peer_iqr": round(r["iqr"], 2),
                "deviation_pct": round(r["peer_deviation_pct"], 1), "robust_z": round(z, 2),
                "peer_p25": round(r["p25"], 2), "peer_p75": round(r["p75"], 2),
            },
            "explanation": (
                f"Sanctioned cost ₹{r['sanctioned_cost']:,.0f} is "
                f"{r['peer_deviation_pct']:.0f}% above the median (₹{r['median']:,.0f}) of "
                f"{int(r['n'])} peer projects (same category, state, financial year)."
            ),
        })
    return results
