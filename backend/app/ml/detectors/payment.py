"""Payment anomaly detection: deterministic rules + IsolationForest secondary signal.

Rules catch the specific patterns officials care about (payment before sanction,
same-day bursts, oversized single payments). The IsolationForest runs on
payment-shape features and only CORROBORATES — it never flags alone at high
severity, keeping false positives low and explanations concrete.
"""
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from app.ml.risk_config import PAYMENT_BURST_MIN, PAYMENT_MAX_RATIO


def detect(features: pd.DataFrame, payments: pd.DataFrame,
           milestones: pd.DataFrame | None = None) -> list[dict]:
    f = features.set_index("id")
    pay = payments.assign(date=pd.to_datetime(payments["date"]))
    results: dict[int, dict] = {}

    def add(pid, rule, severity, score, values, explanation):
        cur = results.get(pid)
        if cur is None or score > cur["score"]:
            results[pid] = {
                "project_id": int(pid), "detector": "payment_anomaly",
                "score": score, "severity": severity,
                "values": {**values, "rule": rule}, "explanation": explanation,
            }
        results[pid]["values"].setdefault("rules_triggered", []).append(rule)

    # rule 1: payment before sanction date
    merged = pay.merge(f[["sanction_date"]], left_on="project_id", right_index=True, how="inner")
    early = merged[merged["sanction_date"].notna() & (merged["date"] < merged["sanction_date"])]
    for pid, g in early.groupby("project_id"):
        days = int((g["sanction_date"].iloc[0] - g["date"].min()).days)
        add(pid, "payment_before_sanction", "high", 85.0,
            {"earliest_payment": str(g['date'].min().date()),
             "sanction_date": str(g['sanction_date'].iloc[0].date()),
             "amount": round(float(g['amount'].sum()), 2)},
            f"Payment of ₹{g['amount'].sum():,.0f} recorded {days} days before the sanction date.")

    # rule 2: same-day payment burst
    burst = f[f["max_same_day_payments"] >= PAYMENT_BURST_MIN]
    for pid, r in burst.iterrows():
        n = int(r["max_same_day_payments"])
        add(pid, "same_day_burst", "high" if n >= 4 else "medium", 70.0 + min(n * 3, 20),
            {"payments_same_day": n},
            f"{n} separate payments recorded on the same day — unusual transaction concentration.")

    # rule 3: oversized single payment. A large payment is LEGITIMATE when it
    # approximates one of the project's own milestone weights — only flag payments
    # that both exceed the ratio threshold AND match no milestone.
    weights_by_project: dict[int, list[float]] = {}
    if milestones is not None and len(milestones):
        for pid, g in milestones.groupby("project_id"):
            weights_by_project[pid] = [float(w) for w in g["weight_pct"]]

    def matches_milestone(pid: int, amount: float, sanctioned: float) -> bool:
        for w in weights_by_project.get(pid, []):
            for scale in (1.0, 0.85):  # with/without 15% advance netting
                expected = w / 100 * sanctioned * scale
                if expected > 0 and abs(amount - expected) / expected <= 0.18:
                    return True
        return False

    big = pay[~pay["kind"].isin(["advance", "final"])].merge(
        f[["sanctioned_cost"]], left_on="project_id", right_index=True)
    big = big[big["sanctioned_cost"].notna() & (big["amount"] > big["sanctioned_cost"] * PAYMENT_MAX_RATIO)]
    for pid, g in big.groupby("project_id"):
        sanc = float(g["sanctioned_cost"].iloc[0])
        unmatched = [float(a) for a in g["amount"] if not matches_milestone(pid, float(a), sanc)]
        if not unmatched:
            continue
        amt = max(unmatched)
        ratio = amt / sanc
        add(pid, "oversized_payment", "high" if ratio > 0.4 else "medium",
            60.0 + min(ratio * 60, 35),
            {"max_payment": round(amt, 2), "ratio_of_sanction": round(ratio, 3),
             "matches_any_milestone_weight": False},
            f"Payment of ₹{amt:,.0f} equals {ratio*100:.0f}% of the sanctioned cost and does not "
            f"correspond to any milestone weight — above the {PAYMENT_MAX_RATIO*100:.0f}% review threshold.")

    # secondary: IsolationForest on payment shape (corroboration only)
    shape = f[f["n_payments"] > 0][
        ["n_payments", "max_payment_ratio", "max_same_day_payments", "fin_util"]
    ].fillna(0)
    if len(shape) > 100:
        iso = IsolationForest(n_estimators=200, contamination=0.02, random_state=42)
        outlier = iso.fit_predict(shape.values) == -1
        for pid in shape.index[outlier]:
            if pid in results:
                results[pid]["values"]["isolation_forest_outlier"] = True
                results[pid]["score"] = min(results[pid]["score"] + 5, 100.0)

    for r in results.values():
        r["score"] = round(float(r["score"]), 2)
    return list(results.values())
