"""Cross-system reconciliation: eSAKSHI-style payments vs PFMS-style transactions.

Greedy matching per project on amount (±tolerance) within a date window;
classifies each project into a reconciliation status with evidence.
"""
import pandas as pd

from app.ml.risk_config import RECON_AMOUNT_TOL, RECON_DATE_WINDOW, RECON_TIMING_LAG


def reconcile(features: pd.DataFrame, payments: pd.DataFrame, txns: pd.DataFrame) -> list[dict]:
    pay = payments.assign(date=pd.to_datetime(payments["date"]))
    tx = txns[txns["type"] == "payment"].assign(date=pd.to_datetime(txns["date"]))
    code_to_id = features.set_index("code")["id"].to_dict()
    fmeta = features.set_index("id")

    pay_by_project: dict[int, list] = {
        pid: g.to_dict("records") for pid, g in pay.groupby("project_id")}
    tx_by_project: dict[int, list] = {}
    orphan_txn_count = 0
    for _, t in tx.iterrows():
        pid = code_to_id.get(t["project_code_raw"])
        if pid is None:
            orphan_txn_count += 1
            continue
        tx_by_project.setdefault(pid, []).append(t.to_dict())

    results = []
    for pid, plist in pay_by_project.items():
        if pid not in fmeta.index:
            continue
        tlist = list(tx_by_project.get(pid, []))
        matched, unmatched_pay, lags, amount_issues = 0, [], [], []
        for p in sorted(plist, key=lambda x: x["date"]):
            best, best_lag = None, None
            for t in tlist:
                lag = abs((t["date"] - p["date"]).days)
                if abs(t["amount"] - p["amount"]) <= p["amount"] * RECON_AMOUNT_TOL and lag <= max(RECON_DATE_WINDOW, RECON_TIMING_LAG * 4):
                    if best is None or lag < best_lag:
                        best, best_lag = t, lag
            if best is not None:
                tlist.remove(best)
                matched += 1
                lags.append(best_lag)
            else:
                # amount-mismatch probe: same date window, wrong amount
                near = [t for t in tlist if abs((t["date"] - p["date"]).days) <= RECON_DATE_WINDOW]
                if near:
                    t = near[0]
                    amount_issues.append({"payment": p["amount"], "transaction": t["amount"],
                                          "diff": round(p["amount"] - t["amount"], 2)})
                    tlist.remove(t)
                else:
                    unmatched_pay.append({"amount": p["amount"], "date": str(p["date"].date())})

        row = fmeta.loc[pid]
        expected = round(sum(p["amount"] for p in plist), 2)
        found = round(expected - sum(u["amount"] for u in unmatched_pay)
                      - sum(a["diff"] for a in amount_issues), 2)
        max_lag = max(lags) if lags else 0
        paid_frac = (expected / row["sanctioned_cost"]) if row["sanctioned_cost"] else None

        if amount_issues:
            status, detail = "amount_mismatch", {"cases": amount_issues[:5]}
        elif unmatched_pay:
            status, detail = "missing_transaction", {"unmatched_payments": unmatched_pay[:5]}
        elif row["status"] == "completed" and paid_frac is not None and paid_frac < 0.70:
            status, detail = "status_mismatch", {"paid_fraction": round(paid_frac, 2),
                                                 "project_status": "completed"}
        elif max_lag > RECON_TIMING_LAG:
            status, detail = "timing_mismatch", {"max_lag_days": int(max_lag)}
        else:
            status, detail = "reconciled", {"matched": matched}
        results.append({"project_id": int(pid), "status": status,
                        "expected": expected, "found": found,
                        "detail": {**detail, "n_payments": len(plist), "n_matched": matched}})

    # projects whose transactions reference unknown codes are already counted at txn level;
    # surface projects with fewer txns than payments due to missing_reference corruption
    return results
