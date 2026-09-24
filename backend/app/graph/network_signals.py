"""Suspicious relationship pattern analysis (NetworkX + pandas).

Signals — always phrased as patterns requiring human review, never as collusion:
- vendor_concentration: one vendor holds an outsized share of a district's
  recent projects (HHI + share test)
- agency_vendor_repeat: an agency-vendor pair with many projects AND
  suspiciously uniform sanctioned costs (CV below threshold)
Node degree/centrality is computed via NetworkX for the evidence payload.
"""
import networkx as nx
import numpy as np
import pandas as pd

from app.ml.risk_config import PAIR_COST_CV_MAX, PAIR_MIN_PROJECTS, VENDOR_SHARE_HIGH

RECENT_FYS = ("2024-25", "2025-26")


def detect(features: pd.DataFrame) -> list[dict]:
    all_f = features[features["vendor_id"].notna()]
    f = all_f[all_f["financial_year"].isin(RECENT_FYS)]  # concentration looks at recent FYs
    signals = []

    # bipartite agency-vendor graph for degree evidence
    G = nx.Graph()
    for _, r in all_f.iterrows():
        G.add_edge(f"agency:{int(r['agency_id'])}", f"vendor:{int(r['vendor_id'])}")

    # vendor concentration per district
    for did, g in f.groupby("district_id"):
        counts = g["vendor_id"].value_counts()
        total = len(g)
        if total < 8:
            continue
        shares = counts / total
        hhi = float((shares**2).sum())
        top_vendor, top_share = int(counts.index[0]), float(shares.iloc[0])
        if top_share >= VENDOR_SHARE_HIGH:
            degree = G.degree(f"vendor:{top_vendor}") if G.has_node(f"vendor:{top_vendor}") else 0
            affected = g[g["vendor_id"] == top_vendor]["id"].tolist()
            sev = "high" if top_share >= 0.6 else "medium"
            for pid in affected:
                signals.append({
                    "project_id": int(pid), "signal_type": "vendor_concentration",
                    "score": round(min(top_share * 100 + 20, 100), 2), "severity": sev,
                    "detail": {"district_id": int(did), "vendor_id": top_vendor,
                               "vendor_share": round(top_share, 2), "district_hhi": round(hhi, 3),
                               "district_projects_recent": total, "vendor_agency_degree": degree},
                })

    # agency-vendor repeated pair containing a suspiciously uniform cost cluster
    # (all FYs — patterns span years). A popular vendor legitimately holds many
    # projects, so we look for a tight-window SUBSET: >= PAIR_MIN_PROJECTS whose
    # costs vary by less than PAIR_COST_CV_MAX — near-identical sanctioned costs
    # across many works is the reviewable pattern, not mere repetition.
    grouped = all_f[all_f["sanctioned_cost"].notna()].groupby(["agency_id", "vendor_id"])
    for (aid, vid), g in grouped:
        if len(g) < PAIR_MIN_PROJECTS:
            continue
        costs = np.sort(g["sanctioned_cost"].values)
        best_cv, best_win = None, None
        for i in range(len(costs) - PAIR_MIN_PROJECTS + 1):
            win = costs[i:i + PAIR_MIN_PROJECTS]
            cv = float(win.std() / win.mean())
            if best_cv is None or cv < best_cv:
                best_cv, best_win = cv, (win.min(), win.max())
        if best_cv is None or best_cv >= PAIR_COST_CV_MAX:
            continue
        member_mask = g["sanctioned_cost"].between(best_win[0], best_win[1])
        members = g[member_mask]["id"].tolist()
        for pid in members:
            signals.append({
                "project_id": int(pid), "signal_type": "agency_vendor_repeat",
                "score": round(min(60 + len(members) * 2, 95), 2), "severity": "medium",
                "detail": {"agency_id": int(aid), "vendor_id": int(vid),
                           "pair_projects": int(len(g)), "uniform_cluster_size": len(members),
                           "cluster_cost_cv": round(best_cv, 4),
                           "cluster_cost_range": [round(best_win[0], 2), round(best_win[1], 2)]},
            })
    return signals
