"""Progress/payment reconciliation: financial utilization far ahead of physical progress.

Milestone exemption: when utilization tracks the completed-milestone weight
(legitimate milestone-based payment pattern), no flag is raised.
"""
import numpy as np
import pandas as pd

from app.ml.risk_config import MISMATCH_GAP_PP, MISMATCH_MILESTONE_TOL, MISMATCH_MIN_UTIL


def detect(features: pd.DataFrame) -> list[dict]:
    f = features
    gap = f["util_progress_gap"]
    # Milestone exemption applies ONLY when the milestone records are themselves
    # consistent with reported progress. If milestones claim far more completion
    # than reported progress, that contradiction is evidence, not an excuse.
    util_explained = (f["fin_util"] - f["completed_milestone_weight"]) <= MISMATCH_MILESTONE_TOL
    milestones_consistent = (f["completed_milestone_weight"] - f["progress"]) <= 20
    exempt = util_explained & milestones_consistent
    mask = (
        f["status"].isin(["in_progress"])
        & f["fin_util"].notna()
        & (f["fin_util"] >= MISMATCH_MIN_UTIL)
        & (gap >= MISMATCH_GAP_PP)
        & ~exempt
    )
    results = []
    for _, r in f[mask].iterrows():
        g = float(r["util_progress_gap"])
        severity = "high" if g >= 35 else "medium"
        score = float(np.clip(45 + g * 1.2, 45, 100))
        results.append({
            "project_id": int(r["id"]), "detector": "progress_payment_mismatch",
            "score": round(score, 2), "severity": severity,
            "values": {
                "financial_utilization_pct": round(float(r["fin_util"]), 1),
                "physical_progress_pct": round(float(r["progress"]), 1),
                "gap_pp": round(g, 1),
                "completed_milestone_weight_pct": round(float(r["completed_milestone_weight"]), 1),
            },
            "explanation": (
                f"Financial utilization ({r['fin_util']:.0f}%) exceeds reported physical progress "
                f"({r['progress']:.0f}%) by {g:.0f} percentage points, and is not explained by "
                f"completed milestones ({r['completed_milestone_weight']:.0f}% weight completed)."
            ),
        })
    return results
