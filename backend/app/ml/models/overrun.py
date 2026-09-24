"""Cost-overrun risk (XGBoost classifier).

Label (observable outcome, no ledger access): revised_cost > 1.1x sanctioned
OR expenditure > 1.02x sanctioned. Trained on completed projects, evaluated on
the frozen 30% hash split, then applied to in-progress projects.
"""
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb

from app.ml.models.split import is_test

ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts"

FEATURES = [
    "planned_duration", "elapsed_frac", "progress", "fin_util", "util_progress_gap",
    "n_payments", "max_payment_ratio", "milestone_mean_slip", "milestones_delayed",
    "sanctioned_cost", "category_id", "peer_deviation_pct",
]


def _label(df: pd.DataFrame) -> np.ndarray:
    over_revised = df["revised_cost"].notna() & (df["revised_cost"] > df["sanctioned_cost"] * 1.1)
    over_spent = df["expenditure"] > df["sanctioned_cost"] * 1.02
    return (over_revised | over_spent).astype(int).values


def _matrix(df: pd.DataFrame) -> np.ndarray:
    return df[FEATURES].astype(float).fillna(0).values


def train_and_evaluate(features_with_peers: pd.DataFrame) -> dict:
    f = features_with_peers
    pool = f[(f["status"].isin(["completed", "in_progress"])) & f["sanctioned_cost"].notna()].copy()
    y = _label(pool)
    test_mask = pool["id"].map(is_test).values
    Xtr, ytr = _matrix(pool[~test_mask]), y[~test_mask]
    Xte, yte = _matrix(pool[test_mask]), y[test_mask]

    model = xgb.XGBClassifier(
        n_estimators=300, max_depth=5, learning_rate=0.08, subsample=0.9,
        scale_pos_weight=max((ytr == 0).sum() / max((ytr == 1).sum(), 1), 1),
        random_state=42, n_jobs=4, eval_metric="logloss",
    )
    model.fit(Xtr, ytr)
    pred = model.predict(Xte)
    tp = int(((yte == 1) & (pred == 1)).sum()); fp = int(((yte == 0) & (pred == 1)).sum())
    fn = int(((yte == 1) & (pred == 0)).sum()); tn = int(((yte == 0) & (pred == 0)).sum())
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0

    ARTIFACT_DIR.mkdir(exist_ok=True)
    model.save_model(ARTIFACT_DIR / "overrun_xgb.json")
    return {
        "model": "overrun-v0.1", "algorithm": "XGBClassifier",
        "train_rows": int((~test_mask).sum()), "test_rows": int(test_mask.sum()),
        "positive_rate": round(float(y.mean()), 4),
        "precision": round(precision, 3), "recall": round(recall, 3),
        "f1": round(2 * precision * recall / (precision + recall), 3) if precision + recall else 0.0,
        "confusion": {"tp": tp, "fp": fp, "fn": fn, "tn": tn},
    }


def predict_in_progress(features_with_peers: pd.DataFrame) -> pd.DataFrame:
    model = xgb.XGBClassifier()
    model.load_model(ARTIFACT_DIR / "overrun_xgb.json")
    live = features_with_peers[
        (features_with_peers["status"] == "in_progress")
        & features_with_peers["sanctioned_cost"].notna()].copy()
    proba = model.predict_proba(_matrix(live))[:, 1]
    live["overrun_probability"] = proba.round(4)
    return live[["id", "overrun_probability"]]
