"""Milestone 03 unit tests — pure-function tests, no database required."""
import numpy as np
import pandas as pd
import pytest

from app.ml import risk_engine
from app.ml.detectors import cost, mismatch
from app.ml.models.split import is_test
from app.ml.peer_baseline import attach_peer_stats, compute_peer_groups
from app.ml.risk_config import CAPS, level_for


def make_features(rows):
    defaults = {
        "id": 0, "code": "X", "status": "in_progress", "category_id": 1, "state_id": 1,
        "financial_year": "2025-26", "sanctioned_cost": 1_000_000.0, "expenditure": 0.0,
        "progress": 50.0, "fin_util": 50.0, "util_progress_gap": 0.0,
        "completed_milestone_weight": 50.0, "lat": 18.5, "lon": 73.8,
        "planned_start": pd.Timestamp("2025-06-01"), "planned_end": pd.Timestamp("2026-06-01"),
        "vendor_id": 1,
    }
    return pd.DataFrame([{**defaults, **r} for r in rows])


# ── risk levels & contributions ───────────────────────────────────────────
def test_level_boundaries():
    assert level_for(0) == "low" and level_for(30) == "low"
    assert level_for(31) == "moderate" and level_for(60) == "moderate"
    assert level_for(61) == "high" and level_for(80) == "high"
    assert level_for(81) == "critical" and level_for(100) == "critical"


def test_caps_sum_to_100():
    assert sum(CAPS.values()) == 100


def test_contribution_capped():
    assert risk_engine._contribution("cost_anomaly", "high", 100) == 25
    assert risk_engine._contribution("cost_anomaly", "high", 50) == pytest.approx(20.0)
    assert risk_engine._contribution("cost_anomaly", "low", 100) == pytest.approx(10.0)


# ── peer baselining ───────────────────────────────────────────────────────
def test_peer_group_robust_stats():
    rows = [{"id": i, "sanctioned_cost": c} for i, c in enumerate(
        [100.0, 110, 105, 95, 90, 100, 108, 102, 300])]  # one outlier
    f = make_features(rows)
    groups = compute_peer_groups(f)
    assert len(groups) == 1
    g = groups.iloc[0]
    assert g["n"] == 9 and g["usable"]
    assert 95 <= g["median"] <= 110  # outlier does not drag the median
    fp = attach_peer_stats(f, groups)
    outlier = fp[fp["sanctioned_cost"] == 300].iloc[0]
    assert outlier["peer_robust_z"] > 6


def test_peer_group_too_small_not_usable():
    f = make_features([{"id": i, "sanctioned_cost": 100.0} for i in range(5)])
    groups = compute_peer_groups(f)
    assert not groups.iloc[0]["usable"]


# ── cost detector ─────────────────────────────────────────────────────────
def test_cost_detector_flags_outlier_only():
    rows = [{"id": i, "sanctioned_cost": 1_000_000 + i * 10_000} for i in range(20)]
    rows.append({"id": 99, "sanctioned_cost": 2_600_000.0})
    f = make_features(rows)
    fp = attach_peer_stats(f, compute_peer_groups(f))
    hits = cost.detect(fp)
    assert [h["project_id"] for h in hits] == [99]
    assert hits[0]["values"]["peer_n"] == 21
    assert "peer" in hits[0]["explanation"]


# ── mismatch detector with milestone exemption ────────────────────────────
def test_mismatch_flags_gap():
    f = make_features([{
        "id": 1, "fin_util": 75.0, "progress": 35.0, "util_progress_gap": 40.0,
        "completed_milestone_weight": 30.0,
    }])
    hits = mismatch.detect(f)
    assert len(hits) == 1 and hits[0]["severity"] == "high"


def test_mismatch_milestone_exemption():
    # Utilization 78% led by milestone payments (70% weight completed) while
    # progress is 52% — milestones are consistent with progress AND explain the
    # utilization, so this legitimate milestone-payment pattern is exempt.
    f = make_features([{
        "id": 1, "fin_util": 78.0, "progress": 52.0, "util_progress_gap": 26.0,
        "completed_milestone_weight": 70.0,
    }])
    assert mismatch.detect(f) == []


def test_mismatch_contradictory_milestones_not_exempt():
    # Milestones claim far more completion than reported progress — that
    # contradiction is evidence, not an excuse; must flag.
    f = make_features([{
        "id": 1, "fin_util": 75.0, "progress": 35.0, "util_progress_gap": 40.0,
        "completed_milestone_weight": 70.0,
    }])
    assert len(mismatch.detect(f)) == 1


# ── risk engine end-to-end (in memory) ────────────────────────────────────
def test_risk_engine_aggregates_and_explains():
    f = make_features([{"id": 1}, {"id": 2}])
    anomalies = [
        {"project_id": 1, "detector": "cost_deviation", "score": 100, "severity": "high",
         "values": {"deviation_pct": 80}, "explanation": "cost way above peers"},
        {"project_id": 1, "detector": "payment_anomaly", "score": 90, "severity": "high",
         "values": {}, "explanation": "burst"},
        {"project_id": 1, "detector": "progress_payment_mismatch", "score": 90, "severity": "high",
         "values": {}, "explanation": "gap"},
    ]
    assessments, factors = risk_engine.assess(
        f, anomalies, [], [], [], [], pd.DataFrame(), pd.DataFrame())
    assert len(assessments) == 1
    a, fl = assessments[0], factors[0]
    assert a["project_id"] == 1
    # 25 + 19.2 + 14.4 = 58.6 -> moderate
    assert a["score"] == pytest.approx(58.6, abs=0.1)
    assert a["level"] == "moderate"
    assert a["signal_count"] == 3
    assert fl[0]["factor_type"] == "cost_anomaly" and fl[0]["contribution"] == 25.0
    assert all(f["explanation"] for f in fl)


def test_risk_engine_keeps_strongest_per_family():
    f = make_features([{"id": 1}])
    anomalies = [
        {"project_id": 1, "detector": "cost_deviation", "score": 60, "severity": "medium",
         "values": {}, "explanation": "weak"},
        {"project_id": 1, "detector": "cost_deviation", "score": 100, "severity": "high",
         "values": {}, "explanation": "strong"},
    ]
    assessments, factors = risk_engine.assess(
        f, anomalies, [], [], [], [], pd.DataFrame(), pd.DataFrame())
    assert assessments[0]["signal_count"] == 1
    assert factors[0][0]["explanation"] == "strong"
    assert assessments[0]["score"] == 25.0


def test_risk_score_clamped_at_100():
    f = make_features([{"id": 1}])
    anomalies = [
        {"project_id": 1, "detector": d, "score": 100, "severity": "high", "values": {}, "explanation": d}
        for d in ("cost_deviation", "payment_anomaly", "progress_payment_mismatch")
    ]
    dups = [{"project_id_a": 1, "project_id_b": 2, "text_sim": 0.95, "geo_km": 0.5,
             "cost_sim": 0.95, "composite_score": 90.0, "same_agency": True}]
    net = [{"project_id": 1, "signal_type": "vendor_concentration", "score": 100,
            "severity": "high", "detail": {}}]
    rec = [{"project_id": 1, "status": "missing_transaction", "expected": 100.0, "found": 0.0,
            "detail": {}}]
    dq = [{"project_id": 1, "issue_type": "impossible_dates", "field": "x",
           "severity": "high", "detail": {}}]
    assessments, _ = risk_engine.assess(f, anomalies, dups, net, rec, dq,
                                        pd.DataFrame(), pd.DataFrame())
    a = next(x for x in assessments if x["project_id"] == 1)
    assert a["score"] <= 100
    assert a["level"] == "critical"
    assert a["evidence_strength"] == "high"


# ── split determinism ─────────────────────────────────────────────────────
def test_split_deterministic_and_reasonable():
    flags = [is_test(i) for i in range(10_000)]
    assert flags == [is_test(i) for i in range(10_000)]
    frac = np.mean(flags)
    assert 0.28 < frac < 0.32
