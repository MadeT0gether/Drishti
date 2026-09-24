"""Data-quality issue detection (rule-based)."""
import pandas as pd

INDIA_LAT = (6.0, 37.0)
INDIA_LON = (68.0, 98.0)


def detect(features: pd.DataFrame) -> list[dict]:
    f = features
    issues = []

    def add(row, issue_type, field, severity, detail):
        issues.append({"project_id": int(row["id"]), "issue_type": issue_type, "field": field,
                       "severity": severity, "detail": detail})

    no_coords = f[f["lat"].isna() | f["lon"].isna()]
    for _, r in no_coords.iterrows():
        add(r, "missing_coordinates", "location.geom", "medium", {})

    bad_coords = f[f["lat"].notna() & (
        ~f["lat"].between(*INDIA_LAT) | ~f["lon"].between(*INDIA_LON))]
    for _, r in bad_coords.iterrows():
        add(r, "invalid_coordinates", "location.geom", "medium",
            {"lat": round(float(r["lat"]), 4), "lon": round(float(r["lon"]), 4)})

    bad_dates = f[f["planned_end"].notna() & f["planned_start"].notna()
                  & (f["planned_end"] < f["planned_start"])]
    for _, r in bad_dates.iterrows():
        add(r, "impossible_dates", "planned_end", "high",
            {"planned_start": str(r["planned_start"].date()), "planned_end": str(r["planned_end"].date())})

    no_cost = f[(f["status"] != "recommended") & f["sanctioned_cost"].isna()]
    for _, r in no_cost.iterrows():
        add(r, "missing_sanctioned_cost", "sanctioned_cost", "medium", {"status": r["status"]})

    incons = f[(f["status"] == "completed") & (f["progress"] < 95)]
    for _, r in incons.iterrows():
        add(r, "inconsistent_status", "status", "high",
            {"status": "completed", "physical_progress_pct": float(r["progress"])})

    # exact duplicate record: same title + village + sanctioned cost, different id
    key = f[f["sanctioned_cost"].notna()].groupby(["title", "village", "sanctioned_cost"])["id"].apply(list)
    for ids in key[key.str.len() > 1]:
        for pid in ids[1:]:
            row = f[f["id"] == pid].iloc[0]
            add(row, "duplicate_record", None, "medium", {"duplicate_of": int(ids[0])})

    return issues
