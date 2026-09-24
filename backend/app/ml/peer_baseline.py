"""Peer-group cost baselining.

Groups: category x state x financial_year (cost band deliberately NOT a grouping
dimension — banding by the cost under test would hide the very outliers we want).
Robust statistics only: median, MAD, IQR, percentiles.
"""
import numpy as np
import pandas as pd

from app.ml.risk_config import COST_MIN_PEERS

GROUP_KEYS = ["category_id", "state_id", "financial_year"]


def compute_peer_groups(features: pd.DataFrame) -> pd.DataFrame:
    base = features[features["sanctioned_cost"].notna() & (features["sanctioned_cost"] > 0)]

    def stats(g: pd.Series) -> pd.Series:
        med = g.median()
        mad = float(np.median(np.abs(g - med))) or 1.0
        logs = np.log(g)
        log_mad = float(np.median(np.abs(logs - np.median(logs)))) or 0.01
        return pd.Series({
            "n": len(g), "median": med, "mad": mad, "log_mad": log_mad,
            "p25": g.quantile(0.25), "p75": g.quantile(0.75),
            "p10": g.quantile(0.10), "p90": g.quantile(0.90),
            "iqr": g.quantile(0.75) - g.quantile(0.25),
        })

    groups = base.groupby(GROUP_KEYS)["sanctioned_cost"].apply(stats).unstack().reset_index()
    groups["usable"] = groups["n"] >= COST_MIN_PEERS
    return groups


def attach_peer_stats(features: pd.DataFrame, groups: pd.DataFrame) -> pd.DataFrame:
    f = features.merge(groups, on=GROUP_KEYS, how="left", suffixes=("", "_peer"))
    f["peer_deviation_pct"] = np.where(
        f["median"] > 0, (f["sanctioned_cost"] - f["median"]) / f["median"] * 100, np.nan)
    # robust z in LOG space: multiplicative outliers become additive, so a 2x cost
    # stands out the same way in a 5-lakh category as in a 50-lakh one
    f["peer_robust_z"] = np.where(
        (f["log_mad"] > 0) & (f["sanctioned_cost"] > 0) & (f["median"] > 0),
        (np.log(f["sanctioned_cost"].clip(lower=1)) - np.log(f["median"].clip(lower=1)))
        / (1.4826 * f["log_mad"]),
        np.nan)
    return f
