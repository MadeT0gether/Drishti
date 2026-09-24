"""Evaluate every detector/model against the ground-truth anomaly ledger.

ALL metrics in data/evaluation/metrics.json come from this script — nothing is
hand-entered. Rule/statistical detectors are evaluated on the full dataset
(they have no training step, hence no leakage). Supervised models (delay,
overrun) report metrics from their frozen 30% hash split, computed at training
time and re-served here.

Usage (from backend/):  python -m scripts.evaluate
"""
import json
import sys
from pathlib import Path

from sqlalchemy import text

from app.database.session import engine

EVAL_DIR = Path(__file__).resolve().parents[2] / "data" / "evaluation"


def prf(pred: set, truth: set, universe_size: int | None = None) -> dict:
    tp = len(pred & truth)
    fp = len(pred - truth)
    fn = len(truth - pred)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    out = {"tp": tp, "fp": fp, "fn": fn,
           "precision": round(precision, 3), "recall": round(recall, 3), "f1": round(f1, 3)}
    if universe_size:
        clean = universe_size - len(truth)
        out["false_positive_rate"] = round(fp / clean, 4) if clean else None
    return out


def main() -> int:
    with engine.connect() as conn:
        def col(sql, **params) -> set:
            return {r[0] for r in conn.execute(text(sql), params).all()}

        def rows(sql, **params):
            return conn.execute(text(sql), params).all()

        n_projects = conn.execute(text(
            "SELECT COUNT(*) FROM projects WHERE status != 'recommended'")).scalar()

        truth = {}
        for atype in ("COST_ANOMALY", "PAYMENT_ANOMALY", "PROGRESS_PAYMENT_MISMATCH",
                      "DELAY_ANOMALY", "COST_OVERRUN", "RECONCILIATION_MISMATCH",
                      "DATA_QUALITY_ANOMALY"):
            truth[atype] = col(
                "SELECT project_id FROM anomaly_ground_truth "
                "WHERE anomaly_type = :t AND ground_truth_label", t=atype)

        metrics = {"n_projects_evaluable": n_projects}

        # ── rule/stat detectors ───────────────────────────────────────────
        pred_cost = col("SELECT DISTINCT project_id FROM anomaly_results WHERE detector = 'cost_deviation'")
        metrics["cost_anomaly"] = prf(pred_cost, truth["COST_ANOMALY"], n_projects)

        pred_pay = col("SELECT DISTINCT project_id FROM anomaly_results WHERE detector = 'payment_anomaly'")
        metrics["payment_anomaly"] = prf(pred_pay, truth["PAYMENT_ANOMALY"], n_projects)

        pred_mis = col("SELECT DISTINCT project_id FROM anomaly_results WHERE detector = 'progress_payment_mismatch'")
        metrics["progress_payment_mismatch"] = prf(pred_mis, truth["PROGRESS_PAYMENT_MISMATCH"], n_projects)

        # ── duplicates (pair-level) ───────────────────────────────────────
        pred_pairs = {tuple(sorted(p)) for p in rows(
            "SELECT project_id_a, project_id_b FROM duplicate_candidates")}
        truth_pairs = {tuple(sorted((r[0], r[1]))) for r in rows(
            "SELECT project_id, related_project_id FROM anomaly_ground_truth "
            "WHERE anomaly_type IN ('DUPLICATE_PROJECT','NEAR_DUPLICATE_PROJECT','GEOGRAPHIC_DUPLICATE') "
            "AND ground_truth_label AND related_project_id IS NOT NULL")}
        neg_pairs = {tuple(sorted((r[0], r[1]))) for r in rows(
            "SELECT project_id, related_project_id FROM anomaly_ground_truth "
            "WHERE NOT ground_truth_label AND related_project_id IS NOT NULL")}
        # Ranked-queue metrics: duplicate candidates are a ranked review queue, so
        # measure precision of the top-K by composite score. The synthetic corpus
        # also contains natural near-identical titles (unlabeled), which makes
        # threshold precision vs injected-only ground truth an underestimate.
        ranked_pairs = [tuple(sorted((r[0], r[1]))) for r in rows(
            "SELECT project_id_a, project_id_b FROM duplicate_candidates "
            "ORDER BY composite_score DESC")]
        strong_pairs = {tuple(sorted((r[0], r[1]))) for r in rows(
            "SELECT project_id_a, project_id_b FROM duplicate_candidates "
            "WHERE composite_score >= 85")}
        metrics["duplicate_detection_pairs"] = prf(pred_pairs, truth_pairs)
        metrics["duplicate_detection_strong_tier"] = None  # filled below after truth known
        metrics["duplicate_detection_pairs"]["per_type_recall"] = {}
        for t in ("DUPLICATE_PROJECT", "NEAR_DUPLICATE_PROJECT", "GEOGRAPHIC_DUPLICATE"):
            tp_pairs = {tuple(sorted((r[0], r[1]))) for r in rows(
                "SELECT project_id, related_project_id FROM anomaly_ground_truth "
                "WHERE anomaly_type = :t AND ground_truth_label AND related_project_id IS NOT NULL", t=t)}
            found = len(tp_pairs & pred_pairs)
            metrics["duplicate_detection_pairs"]["per_type_recall"][t] = round(
                found / len(tp_pairs), 3) if tp_pairs else None
        metrics["duplicate_detection_pairs"]["hard_negatives_total"] = len(neg_pairs)
        metrics["duplicate_detection_pairs"]["hard_negatives_flagged"] = len(neg_pairs & pred_pairs)
        metrics["duplicate_detection_strong_tier"] = prf(strong_pairs, truth_pairs)
        ranked_queue = {}
        for k in (100, 200, 300, 500):
            top = ranked_pairs[:k]
            hits = sum(1 for p in top if p in truth_pairs)
            ranked_queue[f"precision_at_{k}"] = round(hits / k, 3)
            ranked_queue[f"recall_at_{k}"] = round(
                sum(1 for p in truth_pairs if p in set(top)) / max(len(truth_pairs), 1), 3)
            ranked_queue[f"hard_negatives_in_top_{k}"] = sum(1 for p in top if p in neg_pairs)
        metrics["duplicate_ranked_queue"] = ranked_queue

        # ── reconciliation ────────────────────────────────────────────────
        pred_rec = col("SELECT project_id FROM reconciliation_results WHERE status != 'reconciled'")
        metrics["reconciliation"] = prf(pred_rec, truth["RECONCILIATION_MISMATCH"], n_projects)
        variant_recall = {}
        for r in rows("""
            SELECT g.injection_params->>'variant' AS variant, COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE rr.status IS NOT NULL AND rr.status != 'reconciled') AS caught
            FROM anomaly_ground_truth g
            LEFT JOIN reconciliation_results rr ON rr.project_id = g.project_id
            WHERE g.anomaly_type = 'RECONCILIATION_MISMATCH' AND g.ground_truth_label
            GROUP BY 1"""):
            variant_recall[r[0]] = {"total": r[1], "caught": r[2], "recall": round(r[2] / r[1], 3)}
        metrics["reconciliation"]["per_variant"] = variant_recall

        # ── data quality ──────────────────────────────────────────────────
        pred_dq = col("SELECT DISTINCT project_id FROM data_quality_issues")
        metrics["data_quality"] = prf(pred_dq, truth["DATA_QUALITY_ANOMALY"], n_projects)

        # ── network signals (entity-level) ────────────────────────────────
        truth_conc_districts = {int(r[0]) for r in rows(
            "SELECT injection_params->>'district_id' FROM anomaly_ground_truth "
            "WHERE anomaly_type = 'VENDOR_CONCENTRATION'")}
        pred_conc_districts = {int(r[0]) for r in rows(
            "SELECT DISTINCT detail->>'district_id' FROM network_signals "
            "WHERE signal_type = 'vendor_concentration'")}
        metrics["vendor_concentration_districts"] = prf(pred_conc_districts, truth_conc_districts)

        truth_pairs_av = {(int(r[0]), int(r[1])) for r in rows(
            "SELECT injection_params->>'agency_id', injection_params->>'vendor_id' "
            "FROM anomaly_ground_truth WHERE anomaly_type = 'RELATIONSHIP_ANOMALY'")}
        pred_pairs_av = {(int(r[0]), int(r[1])) for r in rows(
            "SELECT DISTINCT detail->>'agency_id', detail->>'vendor_id' FROM network_signals "
            "WHERE signal_type = 'agency_vendor_repeat'")}
        metrics["relationship_patterns_pairs"] = prf(pred_pairs_av, truth_pairs_av)

        # ── delay ranking on in-progress projects ─────────────────────────
        # Note: the generator produces many NATURALLY late projects (that is
        # realistic); the ledger only marks the extreme injected cases. So we
        # evaluate whether injected delay anomalies rank at the TOP of the
        # predicted-delay ordering, not raw threshold precision.
        truth_delay_live = {r[0] for r in rows(
            "SELECT g.project_id FROM anomaly_ground_truth g JOIN projects p ON p.id = g.project_id "
            "WHERE g.anomaly_type = 'DELAY_ANOMALY' AND g.ground_truth_label AND p.status = 'in_progress'")}
        ranked = [r[0] for r in rows(
            "SELECT project_id FROM risk_assessments WHERE is_current "
            "AND predicted_delay_days IS NOT NULL ORDER BY predicted_delay_days DESC")]
        delay_rank = {}
        for k in (100, 250, 500):
            topk = ranked[:k]
            delay_rank[f"precision_at_{k}"] = round(
                sum(1 for p in topk if p in truth_delay_live) / k, 3)
            delay_rank[f"recall_at_{k}"] = round(
                sum(1 for p in topk if p in truth_delay_live) / max(len(truth_delay_live), 1), 3)
        delay_rank["truth_in_progress"] = len(truth_delay_live)
        metrics["delay_anomaly_ranking"] = delay_rank

        # ── supervised model metrics (from training run, stored in model_versions) ──
        for comp in ("delay", "overrun"):
            p = conn.execute(text(
                "SELECT params FROM model_versions WHERE component = :c"), {"c": comp}).scalar()
            metrics[f"{comp}_model_heldout"] = p

        # ── risk ranking Precision@K ──────────────────────────────────────
        any_truth = col(
            "SELECT DISTINCT project_id FROM anomaly_ground_truth WHERE ground_truth_label AND project_id IS NOT NULL"
        ) | col(
            "SELECT DISTINCT related_project_id FROM anomaly_ground_truth "
            "WHERE ground_truth_label AND related_project_id IS NOT NULL"
        ) | {pid for r in rows(
            "SELECT injection_params->'project_ids' FROM anomaly_ground_truth "
            "WHERE anomaly_type IN ('VENDOR_CONCENTRATION','RELATIONSHIP_ANOMALY')")
            for pid in (r[0] or [])}
        pk = {}
        for k in (10, 50, 100, 250):
            topk = [r[0] for r in rows(
                "SELECT project_id FROM risk_assessments WHERE is_current "
                "ORDER BY score DESC LIMIT :k", k=k)]
            pk[f"precision_at_{k}"] = round(sum(1 for p in topk if p in any_truth) / k, 3)
        metrics["risk_ranking"] = pk
        metrics["risk_ranking"]["ground_truth_positive_projects"] = len(any_truth)

        # the CURRENTLY LOADED dataset is the most recently registered one
        dsv = conn.execute(text(
            "SELECT version, seed FROM dataset_versions ORDER BY created_at DESC LIMIT 1")).first()
        metrics["dataset_version"] = dsv[0] if dsv else None
        metrics["dataset_seed"] = dsv[1] if dsv else None
        metrics["methodology_notes"] = [
            "Rule/statistical detectors evaluated on the full dataset (no training step, no leakage).",
            "Supervised models (delay, overrun) evaluated on a frozen 30% hash split, never trained on.",
            "Ground truth = injected anomaly ledger; detectors never read the ledger.",
            "Synthetic-data caveat: injection magnitudes and detector thresholds are both design "
            "choices of this prototype; real-world performance requires calibration on real data.",
        ]

    EVAL_DIR.mkdir(parents=True, exist_ok=True)
    (EVAL_DIR / "metrics.json").write_text(json.dumps(metrics, indent=1))
    print(json.dumps(metrics, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
