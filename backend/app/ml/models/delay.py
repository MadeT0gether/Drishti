"""Delay prediction (XGBoost regression).

Trained on COMPLETED projects: label = actual_end - planned_end (days).
Features are restricted to what is observable mid-project (no actual_end
derivatives) so the model transfers to in-progress projects at inference.
Split: deterministic 70/30 by project-id hash; metrics only from the 30%.
"""
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb

from app.ml.models.split import is_test

ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts"

FEATURES = [
    "planned_duration", "elapsed_frac", "progress", "progress_gap",
    "fin_util", "n_payments", "milestone_mean_slip", "milestones_delayed",
    "sanctioned_cost", "category_id", "district_id_hist_delay", "agency_id_hist_delay",
]


def _matrix(df: pd.DataFrame) -> np.ndarray:
    return df[FEATURES].astype(float).fillna(0).values


def train_and_evaluate(features: pd.DataFrame, hist: pd.DataFrame) -> dict:
    f = features.merge(hist, on="id")
    comp = f[(f["status"] == "completed")
             & f["actual_end"].notna() & f["planned_end"].notna()
             & f["actual_start"].notna()].copy()
    comp["delay_days"] = (comp["actual_end"] - comp["planned_end"]).dt.days.astype(float)
    comp = comp[comp["delay_days"].notna() & np.isfinite(comp["delay_days"])]
    # mid-flight snapshot: recompute elapsed/progress features at 60% of actual duration
    # (training rows must look like in-progress rows, not finished ones)
    frac = 0.6
    dur = (comp["actual_end"] - comp["actual_start"]).dt.days.clip(lower=1)
    comp["elapsed_frac"] = (dur * frac) / comp["planned_duration"].clip(lower=1)
    x = comp["elapsed_frac"].clip(0, 1)
    snapshot_progress = 100 * (3 * (frac) ** 2 - 2 * (frac) ** 3)  # progress at 60% time on-curve
    comp["progress"] = snapshot_progress * (comp["planned_duration"] / dur).clip(0.3, 2.0)
    comp["progress_gap"] = 100 * (3 * x**2 - 2 * x**3) - comp["progress"]

    test_mask = comp["id"].map(is_test)
    train, test = comp[~test_mask], comp[test_mask]

    model = xgb.XGBRegressor(
        n_estimators=300, max_depth=5, learning_rate=0.08, subsample=0.9,
        colsample_bytree=0.9, random_state=42, n_jobs=4,
    )
    model.fit(_matrix(train), train["delay_days"].values)

    pred = model.predict(_matrix(test))
    err = pred - test["delay_days"].values
    delayed_true = test["delay_days"].values > 60
    delayed_pred = pred > 60
    tp = int((delayed_true & delayed_pred).sum())
    fp = int((~delayed_true & delayed_pred).sum())
    fn = int((delayed_true & ~delayed_pred).sum())
    tn = int((~delayed_true & ~delayed_pred).sum())
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0

    ARTIFACT_DIR.mkdir(exist_ok=True)
    model.save_model(ARTIFACT_DIR / "delay_xgb.json")

    return {
        "model": "delay-v0.1", "algorithm": "XGBRegressor",
        "train_rows": len(train), "test_rows": len(test),
        "mae_days": round(float(np.abs(err).mean()), 2),
        "rmse_days": round(float(np.sqrt((err**2).mean())), 2),
        "delayed_gt_60d_classification": {
            "precision": round(precision, 3), "recall": round(recall, 3),
            "f1": round(2 * precision * recall / (precision + recall), 3) if precision + recall else 0.0,
            "confusion": {"tp": tp, "fp": fp, "fn": fn, "tn": tn},
        },
        "feature_importance": dict(zip(FEATURES, [round(float(v), 4) for v in model.feature_importances_])),
    }


def predict_in_progress(features: pd.DataFrame, hist: pd.DataFrame) -> pd.DataFrame:
    """Predicted delay for in-progress projects using live features."""
    model = xgb.XGBRegressor()
    model.load_model(ARTIFACT_DIR / "delay_xgb.json")
    f = features.merge(hist, on="id")
    live = f[f["status"] == "in_progress"].copy()
    live["predicted_delay_days"] = model.predict(_matrix(live)).round(1)
    return live[["id", "predicted_delay_days"]]
