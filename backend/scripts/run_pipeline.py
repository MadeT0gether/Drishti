"""Full ML/risk pipeline: features -> detectors -> models -> risk engine -> DB.

Usage (from backend/):  python -m scripts.run_pipeline [--skip-embeddings]

Writes: peer_groups, anomaly_results, duplicate_candidates, network_signals,
reconciliation_results, data_quality_issues, risk_assessments, risk_factors,
ai_assessments, alerts, model_versions. Deterministic given the same data.
"""
import argparse
import json
import sys
import time

from sqlalchemy import text

import app.models  # noqa: F401 — register all tables on Base.metadata
from app.database.base import Base
from app.database.session import engine
from app.graph import network_signals as network
from app.ml import features as F
from app.ml import peer_baseline, risk_engine
from app.ml.detectors import cost, data_quality, duplicates, mismatch, payment, reconciliation
from app.ml.models import delay, overrun
from app.ml.risk_config import MODEL_VERSIONS
from app.nlp import embeddings

DERIVED = ["risk_factors", "ai_assessments", "alerts", "risk_assessments", "anomaly_results",
           "duplicate_candidates", "network_signals", "reconciliation_results",
           "data_quality_issues", "peer_groups"]

CHUNK = 5000


def _insert(conn, table_name: str, rows: list[dict]):
    if not rows:
        return
    t = Base.metadata.tables[table_name]
    for i in range(0, len(rows), CHUNK):
        conn.execute(t.insert(), rows[i:i + CHUNK])


def register_models(conn, dataset_version: str, extra_params: dict) -> dict[str, int]:
    ids = {}
    mv = Base.metadata.tables["model_versions"]
    for component, name in MODEL_VERSIONS.items():
        existing = conn.execute(text(
            "SELECT id FROM model_versions WHERE name = :n AND component = :c"),
            {"n": name, "c": component}).first()
        params = extra_params.get(component, {})
        if existing:
            ids[component] = existing[0]
            # refresh dataset_version too — a re-run against a newer dataset must
            # not keep advertising the old one
            conn.execute(text(
                "UPDATE model_versions SET params = CAST(:p AS jsonb), "
                "dataset_version = :d WHERE id = :i"),
                {"p": json.dumps(params), "d": dataset_version, "i": existing[0]})
        else:
            ids[component] = conn.execute(
                mv.insert().returning(mv.c.id),
                [{"name": name, "component": component, "params": params,
                  "dataset_version": dataset_version}]).scalar_one()
    return ids


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-embeddings", action="store_true",
                    help="reuse existing embeddings (faster re-runs)")
    args = ap.parse_args()
    t0 = time.time()
    timings = {}

    def step(name, fn):
        s = time.time()
        out = fn()
        timings[name] = round(time.time() - s, 1)
        print(f"  [{timings[name]:>6.1f}s] {name}")
        return out

    print("MPLADS ML/risk pipeline")
    frames = step("load frames", F.load_frames)
    feats = step("build features", lambda: F.build_features(frames))
    hist = step("historical rates", lambda: F.historical_rates(feats))
    groups = step("peer baselines", lambda: peer_baseline.compute_peer_groups(feats))
    featp = peer_baseline.attach_peer_stats(feats, groups)

    if not args.skip_embeddings:
        emb_info = step("embeddings", embeddings.compute_and_store_embeddings)
    else:
        emb_info = {"backend": "reused", "count": 0}

    cost_res = step("cost detector", lambda: cost.detect(featp))
    pay_res = step("payment detector", lambda: payment.detect(
        featp, frames["payments"], frames["milestones"]))
    mis_res = step("mismatch detector", lambda: mismatch.detect(featp))
    dup_res = step("duplicate detector", duplicates.detect)
    net_res = step("network signals", lambda: network.detect(featp))
    rec_res = step("reconciliation", lambda: reconciliation.reconcile(
        featp, frames["payments"], frames["transactions"]))
    dq_res = step("data quality", lambda: data_quality.detect(featp))

    delay_metrics = step("delay model train+eval", lambda: delay.train_and_evaluate(featp, hist))
    overrun_metrics = step("overrun model train+eval", lambda: overrun.train_and_evaluate(featp))
    delay_pred = step("delay predictions", lambda: delay.predict_in_progress(featp, hist))
    overrun_pred = step("overrun predictions", lambda: overrun.predict_in_progress(featp))

    anomalies = cost_res + pay_res + mis_res
    assessments, factor_lists = step("risk engine", lambda: risk_engine.assess(
        featp, anomalies, dup_res, net_res, rec_res, dq_res, delay_pred, overrun_pred))

    def persist():
        with engine.begin() as conn:
            dsv = conn.execute(text(
                "SELECT version FROM dataset_versions ORDER BY created_at DESC LIMIT 1"
            )).scalar() or "unknown"
            # M06 investigations pin risk_assessments/alerts rows; detach the pins
            # before regenerating AI tables (the case's priority_breakdown JSONB
            # keeps the frozen at-open evidence, and case detail falls back to the
            # current assessment).
            conn.execute(text(
                "UPDATE investigations SET risk_assessment_id = NULL, alert_id = NULL"))
            for t in DERIVED:
                conn.execute(text(f"DELETE FROM {t}"))
            mv_ids = register_models(conn, dsv, {
                "delay": delay_metrics, "overrun": overrun_metrics,
                "duplicate": {"embedding_backend": emb_info["backend"]},
            })
            _insert(conn, "peer_groups", [
                {"category_id": int(g["category_id"]), "state_id": int(g["state_id"]),
                 "cost_band": "all", "financial_year": g["financial_year"],
                 "stats": {k: round(float(g[k]), 4) for k in
                           ("n", "median", "mad", "log_mad", "p25", "p75", "p10", "p90", "iqr")}}
                for _, g in groups.iterrows()])
            for rows, table, comp in ((cost_res, "anomaly_results", "cost"),
                                      (pay_res, "anomaly_results", "payment"),
                                      (mis_res, "anomaly_results", "mismatch")):
                _insert(conn, table, [{**r, "model_version_id": mv_ids[comp]} for r in rows])
            _insert(conn, "duplicate_candidates",
                    [{**d, "model_version_id": mv_ids["duplicate"]} for d in dup_res])
            _insert(conn, "network_signals",
                    [{**n, "model_version_id": mv_ids["network"]} for n in net_res])
            _insert(conn, "reconciliation_results",
                    [{**r, "model_version_id": mv_ids["reconciliation"]} for r in rec_res])
            _insert(conn, "data_quality_issues",
                    [{**i, "model_version_id": mv_ids["data_quality"]} for i in dq_res])

            ra = Base.metadata.tables["risk_assessments"]
            for i in range(0, len(assessments), CHUNK):
                chunk = assessments[i:i + CHUNK]
                ids = conn.execute(
                    ra.insert().returning(ra.c.id),
                    [{**a, "model_version_id": mv_ids["risk"]} for a in chunk]).scalars().all()
                factor_rows = []
                for aid, fl in zip(ids, factor_lists[i:i + CHUNK]):
                    for fct in fl:
                        factor_rows.append({**fct, "assessment_id": aid})
                _insert(conn, "risk_factors", factor_rows)
            _insert(conn, "ai_assessments", [
                {"project_id": a["project_id"], "score": a["score"], "level": a["level"],
                 "signals": {f["factor_type"]: f["contribution"] for f in fl},
                 "model_version_id": mv_ids["risk"]}
                for a, fl in zip(assessments, factor_lists)])
            from app.ml.risk_config import ALERT_MIN_SCORE

            def _alert_severity(a):
                if a["level"] == "critical":
                    return "critical"
                if a["level"] == "high":
                    return "high"
                return "medium"  # elevated moderate (>= ALERT_MIN_SCORE)

            _insert(conn, "alerts", [
                {"project_id": a["project_id"],
                 "severity": _alert_severity(a),
                 "reason": f"Project assessed as {a['level'].upper()} implementation/review risk "
                           f"({a['score']:.0f}/100) with {a['signal_count']} independent signal(s).",
                 "prev_score": None, "curr_score": a["score"], "status": "open",
                 "assigned_role": "district"}
                for a in assessments
                if a["level"] in ("high", "critical") or a["score"] >= ALERT_MIN_SCORE])

    step("persist to DB", persist)
    print(f"\nTotal {round(time.time() - t0, 1)}s | assessments: {len(assessments)} | "
          f"anomalies: {len(anomalies)} | duplicates: {len(dup_res)} | "
          f"network: {len(net_res)} | embedding backend: {emb_info['backend']}")
    print("Delay model:", json.dumps(delay_metrics, indent=1)[:400])
    print("Overrun model:", json.dumps(overrun_metrics, indent=1)[:300])
    return 0


if __name__ == "__main__":
    sys.exit(main())
