"""Deterministic risk aggregation. See risk_config.py for the full methodology.

For each project:
  contribution(signal) = CAP[signal] * SEVERITY_SCALE[severity] * (score/100)
  risk = clamp(sum of contributions, 0, 100)
Every contributing signal becomes a risk_factors row carrying its evidence.
The score expresses IMPLEMENTATION / REVIEW RISK — not a probability of fraud.
"""
from collections import defaultdict

import numpy as np
import pandas as pd

from app.ml.risk_config import CAPS, DELAY_HIGH_DAYS, DELAY_MEDIUM_DAYS, SEVERITY_SCALE, level_for


def _contribution(family: str, severity: str, score: float) -> float:
    # 0.6 floor keeps a confirmed signal meaningful even at modest magnitude;
    # the 0.4 span lets magnitude push a strong signal toward its full cap.
    magnitude = 0.6 + 0.4 * min(score / 100, 1.0)
    return CAPS[family] * SEVERITY_SCALE.get(severity, 0.7) * magnitude


def _strength(signal_count: int, completeness: float) -> str:
    if signal_count >= 3 and completeness >= 90:
        return "high"
    if signal_count >= 2 and completeness >= 75:
        return "medium"
    return "low"


def assess(
    features: pd.DataFrame,
    anomalies: list[dict],
    duplicates: list[dict],
    network: list[dict],
    reconciliation: list[dict],
    dq_issues: list[dict],
    delay_pred: pd.DataFrame,
    overrun_pred: pd.DataFrame,
) -> tuple[list[dict], list[list[dict]]]:
    """Returns (assessments, per-assessment factor lists), index-aligned."""
    by_project: dict[int, list[tuple[str, str, float, dict, str, str]]] = defaultdict(list)
    # tuple: (family, severity, score, evidence, explanation, source_ref)

    DETECTOR_FAMILY = {
        "cost_deviation": "cost_anomaly",
        "payment_anomaly": "payment_anomaly",
        "progress_payment_mismatch": "progress_payment_mismatch",
    }
    for a in anomalies:
        fam = DETECTOR_FAMILY[a["detector"]]
        by_project[a["project_id"]].append(
            (fam, a["severity"], a["score"], a["values"], a["explanation"], f"anomaly:{a['detector']}"))

    for d in duplicates:
        for pid, other in ((d["project_id_a"], d["project_id_b"]), (d["project_id_b"], d["project_id_a"])):
            ev = {k: d[k] for k in ("text_sim", "geo_km", "cost_sim", "composite_score", "same_agency")}
            ev["other_project_id"] = other
            geo_part = f"{d['geo_km']:.1f} km apart, " if d.get("geo_km") is not None else ""
            expl = (f"Potential duplicate candidate: {d['text_sim']*100:.0f}% title similarity, "
                    f"{geo_part}composite score {d['composite_score']:.0f}/100. "
                    "Human verification required.")
            sev = "high" if d["composite_score"] >= 85 else "medium"
            by_project[pid].append(("duplicate_candidate", sev, d["composite_score"], ev, expl, "duplicate_candidates"))

    for s in network:
        expl = ("Suspicious relationship pattern detected "
                f"({s['signal_type'].replace('_', ' ')}). Human review required.")
        by_project[s["project_id"]].append(
            ("network_signal", s["severity"], s["score"], s["detail"], expl, f"network:{s['signal_type']}"))

    for r in reconciliation:
        if r["status"] == "reconciled":
            continue
        sev = "high" if r["status"] in ("missing_transaction", "amount_mismatch") else "medium"
        expl = (f"Cross-system reconciliation flagged: {r['status'].replace('_', ' ')} "
                f"(expected ₹{r['expected']:,.0f}, matched ₹{r['found']:,.0f}).")
        by_project[r["project_id"]].append(
            ("reconciliation_mismatch", sev, 80.0, {**r["detail"], "status": r["status"]},
             expl, "reconciliation_results"))

    dq_per_project: dict[int, list[dict]] = defaultdict(list)
    for i in dq_issues:
        dq_per_project[i["project_id"]].append(i)
    for pid, issues in dq_per_project.items():
        worst = max(issues, key=lambda x: {"low": 0, "medium": 1, "high": 2}.get(x["severity"], 0))
        expl = f"{len(issues)} data-quality issue(s): " + ", ".join(sorted({i['issue_type'] for i in issues}))
        by_project[pid].append(
            ("data_quality", worst["severity"], 60.0 + 10 * min(len(issues), 4),
             {"issues": [i["issue_type"] for i in issues]}, expl, "data_quality_issues"))

    delay_map = delay_pred.set_index("id")["predicted_delay_days"].to_dict() if len(delay_pred) else {}
    for pid, days in delay_map.items():
        if days >= DELAY_MEDIUM_DAYS:
            sev = "high" if days >= DELAY_HIGH_DAYS else "medium"
            score = float(np.clip(40 + days / 3, 40, 100))
            by_project[pid].append((
                "delay_risk", sev, score, {"predicted_delay_days": float(days)},
                f"Model predicts completion approximately {days:.0f} days behind schedule.",
                "model:delay-v0.1"))

    overrun_map = overrun_pred.set_index("id")["overrun_probability"].to_dict() if len(overrun_pred) else {}

    # data completeness per project (share of key fields present)
    key_fields = ["sanctioned_cost", "lat", "planned_start", "planned_end", "vendor_id", "fin_util"]
    completeness = (features[key_fields].notna().mean(axis=1) * 100).round(1)
    completeness_map = dict(zip(features["id"], completeness))
    status_map = dict(zip(features["id"], features["status"]))

    assessments, factor_lists = [], []
    for pid, signals in by_project.items():
        if status_map.get(pid) in ("recommended", None):
            continue
        contributions = defaultdict(float)
        factors = []
        for fam, sev, score, ev, expl, ref in signals:
            c = _contribution(fam, sev, score)
            if c <= contributions[fam]:
                continue  # keep only the strongest signal per family
            contributions[fam] = c
            factors = [f for f in factors if f["factor_type"] != fam]
            factors.append({"factor_type": fam, "contribution": round(c, 2), "severity": sev,
                            "evidence": ev, "explanation": expl, "source_ref": ref})
        total = float(np.clip(sum(contributions.values()), 0, 100))
        comp = completeness_map.get(pid, 50.0)
        n_signals = len(factors)
        days = delay_map.get(pid)
        assessments.append({
            "project_id": pid, "score": round(total, 2), "level": level_for(total),
            "evidence_strength": _strength(n_signals, comp),
            "data_completeness_pct": comp, "signal_count": n_signals,
            "predicted_delay_days": days,
            "delay_risk": ("high" if days >= DELAY_HIGH_DAYS else "medium" if days >= DELAY_MEDIUM_DAYS else "low") if days is not None else None,
            "overrun_risk": ("high" if overrun_map.get(pid, 0) > 0.7 else "medium" if overrun_map.get(pid, 0) > 0.4 else "low") if pid in overrun_map else None,
            "is_current": True,
        })
        factor_lists.append(sorted(factors, key=lambda f: -f["contribution"]))
    return assessments, factor_lists
