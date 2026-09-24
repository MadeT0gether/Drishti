"""Milestone 02 tests: generator correctness, reproducibility, ground truth.

These run fully in memory (no database) on a small dataset for speed.
DB-level integrity is exercised by the real 25k load + FK constraints.
"""
import numpy as np
import pytest

from app.datagen.config import GenConfig
from app.datagen.pipeline import generate

N = 600
SEED = 1234


@pytest.fixture(scope="module")
def dataset():
    return generate(GenConfig(n_projects=N, seed=SEED), to_db=False)


def test_requested_project_count(dataset):
    # clones (duplicates/DQ copies) add rows beyond N — never fewer
    assert len(dataset["frames"]["projects"]) >= N


def test_reproducibility_same_seed():
    a = generate(GenConfig(n_projects=200, seed=99), to_db=False)
    b = generate(GenConfig(n_projects=200, seed=99), to_db=False)
    for table in ("projects", "payments", "milestones", "financial_transactions"):
        assert a["frames"][table] == b["frames"][table], f"{table} not reproducible"
    assert a["ledger"] == b["ledger"]


def test_different_seed_differs():
    a = generate(GenConfig(n_projects=200, seed=1), to_db=False)
    b = generate(GenConfig(n_projects=200, seed=2), to_db=False)
    assert a["frames"]["projects"] != b["frames"]["projects"]


def test_referential_integrity(dataset):
    f = dataset["frames"]
    project_ids = {p["id"] for p in f["projects"]}
    district_ids = {d["id"] for d in f["districts"]}
    vendor_ids = {v["id"] for v in f["vendors"]}
    agency_ids = {a["id"] for a in f["implementing_agencies"]}
    cat_ids = {c["id"] for c in f["project_categories"]}
    for p in f["projects"]:
        assert p["district_id"] in district_ids
        assert p["category_id"] in cat_ids
        assert p["agency_id"] in agency_ids
        assert p["vendor_id"] is None or p["vendor_id"] in vendor_ids
    for table in ("project_locations", "payments", "milestones", "progress_updates",
                  "recommendations", "sanctions"):
        for r in f[table]:
            assert r["project_id"] in project_ids, f"orphan row in {table}"


def test_ledger_covers_all_types(dataset):
    types = {e["anomaly_type"] for e in dataset["ledger"] if e["ground_truth_label"]}
    expected = {
        "COST_ANOMALY", "PAYMENT_ANOMALY", "PROGRESS_PAYMENT_MISMATCH", "DELAY_ANOMALY",
        "COST_OVERRUN", "DUPLICATE_PROJECT", "NEAR_DUPLICATE_PROJECT", "GEOGRAPHIC_DUPLICATE",
        "VENDOR_CONCENTRATION", "RECONCILIATION_MISMATCH", "DATA_QUALITY_ANOMALY",
    }
    # RELATIONSHIP_ANOMALY needs agencies with >=15 projects; not guaranteed at N=600
    assert expected <= types


def test_ledger_references_valid_projects(dataset):
    project_ids = {p["id"] for p in dataset["frames"]["projects"]}
    for e in dataset["ledger"]:
        if e["project_id"] is not None:
            assert e["project_id"] in project_ids
        if e["related_project_id"] is not None:
            assert e["related_project_id"] in project_ids


def test_hard_negatives_exist(dataset):
    negs = [e for e in dataset["ledger"] if not e["ground_truth_label"]]
    assert len(negs) > 0
    assert all(e["anomaly_type"] == "DUPLICATE_PROJECT" for e in negs)


def test_coordinates_valid_for_clean_projects(dataset):
    f = dataset["frames"]
    dq_ids = {e["project_id"] for e in dataset["ledger"]
              if e["anomaly_type"] == "DATA_QUALITY_ANOMALY"}
    for loc in f["project_locations"]:
        if loc["project_id"] in dq_ids or loc["geom"] is None:
            continue
        lon, lat = map(float, loc["geom"].split("(")[1].rstrip(")").split(" "))
        assert 5.5 <= lat <= 38 and 67 <= lon <= 99, f"bad coords {lat},{lon}"


def test_dates_valid_for_clean_projects(dataset):
    dq_ids = {e["project_id"] for e in dataset["ledger"]
              if e["anomaly_type"] == "DATA_QUALITY_ANOMALY"}
    for p in dataset["frames"]["projects"]:
        if p["id"] in dq_ids:
            continue
        assert p["planned_end"] >= p["planned_start"]
        if p["actual_end"] and p["actual_start"]:
            assert p["actual_end"] >= p["actual_start"]


def test_financial_consistency_clean_projects(dataset):
    """Untouched projects: expenditure equals the sum of their payments."""
    f = dataset["frames"]
    flagged = {e["project_id"] for e in dataset["ledger"]} | \
              {e["related_project_id"] for e in dataset["ledger"] if e["related_project_id"]}
    pay_sum: dict[int, float] = {}
    for pay in f["payments"]:
        pay_sum[pay["project_id"]] = pay_sum.get(pay["project_id"], 0) + pay["amount"]
    checked = 0
    for p in f["projects"]:
        if p["id"] in flagged or p["status"] not in ("in_progress", "completed"):
            continue
        assert abs(p["expenditure"] - pay_sum.get(p["id"], 0)) < 1.0, p["code"]
        if p["sanctioned_cost"]:
            assert p["expenditure"] <= p["sanctioned_cost"] * 1.10
        checked += 1
    assert checked > 100


def test_progress_correlates_with_expenditure(dataset):
    """Realism check: physical progress and financial utilization must correlate."""
    xs, ys = [], []
    flagged = {e["project_id"] for e in dataset["ledger"]}
    for p in dataset["frames"]["projects"]:
        if p["id"] in flagged or not p["sanctioned_cost"] or p["status"] != "in_progress":
            continue
        xs.append(float(p["physical_progress_pct"]))
        ys.append(p["expenditure"] / p["sanctioned_cost"] * 100)
    assert len(xs) > 20
    assert np.corrcoef(xs, ys)[0, 1] > 0.6


def test_duplicate_pairs_are_similar(dataset):
    f = dataset["frames"]
    by_id = {p["id"]: p for p in f["projects"]}
    for e in dataset["ledger"]:
        if e["anomaly_type"] in ("DUPLICATE_PROJECT", "GEOGRAPHIC_DUPLICATE") and e["ground_truth_label"]:
            a, b = by_id[e["project_id"]], by_id[e["related_project_id"]]
            assert a["category_id"] == b["category_id"]
            assert a["district_id"] == b["district_id"]
            # word overlap in titles
            clean = lambda t: {w.strip(",.") for w in t.lower().split()}
            wa, wb = clean(a["title"]), clean(b["title"])
            assert len(wa & wb) / len(wa | wb) >= 0.4


def test_reconciliation_missing_transaction(dataset):
    f = dataset["frames"]
    by_id = {p["id"]: p for p in f["projects"]}
    txn_amounts: dict[str, list[float]] = {}
    for t in f["financial_transactions"]:
        if t["type"] == "payment":
            txn_amounts.setdefault(t["project_code_raw"], []).append(t["amount"])
    cases = [e for e in dataset["ledger"]
             if e["anomaly_type"] == "RECONCILIATION_MISMATCH"
             and e["injection_params"]["variant"] == "missing_transaction"]
    assert cases, "no missing_transaction cases injected"
    for e in cases:
        p = by_id[e["project_id"]]
        removed = e["injection_params"]["amount"]
        assert removed not in txn_amounts.get(p["code"], []) or \
               txn_amounts[p["code"]].count(removed) < len([x for x in f["payments"]
                                                            if x["project_id"] == p["id"] and x["amount"] == removed])


def test_vendor_concentration_share(dataset):
    cases = [e for e in dataset["ledger"] if e["anomaly_type"] == "VENDOR_CONCENTRATION"]
    assert cases
    by_id = {p["id"]: p for p in dataset["frames"]["projects"]}
    for e in cases:
        vendor = e["injection_params"]["vendor_id"]
        ids = e["injection_params"]["project_ids"]
        assert len(ids) >= 3
        assert all(by_id[i]["vendor_id"] == vendor for i in ids)
