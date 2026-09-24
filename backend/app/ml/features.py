"""Builds the shared project feature frame all detectors/models consume.

Everything here is observable operational data — the ground-truth ledger is
NEVER read by this module or any detector.
"""
from datetime import date

import numpy as np
import pandas as pd
from sqlalchemy import text

from app.database.session import engine

AS_OF = date(2026, 8, 24)  # matches the dataset generator's reference date


def load_frames() -> dict[str, pd.DataFrame]:
    with engine.connect() as conn:
        projects = pd.read_sql(text("""
            SELECT p.id, p.code, p.title, p.status, p.category_id, p.state_id, p.district_id,
                   p.agency_id, p.vendor_id, p.mp_id, p.financial_year,
                   p.recommended_cost::float8 AS recommended_cost,
                   p.sanctioned_cost::float8 AS sanctioned_cost,
                   p.revised_cost::float8 AS revised_cost,
                   p.expenditure::float8 AS expenditure,
                   p.physical_progress_pct::float8 AS progress,
                   p.planned_start, p.planned_end, p.actual_start, p.actual_end,
                   ST_X(l.geom::geometry) AS lon, ST_Y(l.geom::geometry) AS lat,
                   l.village
            FROM projects p LEFT JOIN project_locations l ON l.project_id = p.id
        """), conn)
        payments = pd.read_sql(text(
            "SELECT id, project_id, date, amount::float8 AS amount, kind FROM payments"), conn)
        milestones = pd.read_sql(text(
            "SELECT project_id, seq, planned_date, actual_date, weight_pct::float8 AS weight_pct, status "
            "FROM milestones"), conn)
        sanctions = pd.read_sql(text(
            "SELECT project_id, date AS sanction_date, amount::float8 AS amount FROM sanctions"), conn)
        txns = pd.read_sql(text(
            "SELECT id, txn_ref, project_code_raw, date, amount::float8 AS amount, type "
            "FROM financial_transactions"), conn)
    return {"projects": projects, "payments": payments, "milestones": milestones,
            "sanctions": sanctions, "transactions": txns}


def build_features(frames: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """One row per project with engineered features."""
    p = frames["projects"].copy()
    pay = frames["payments"]
    ms = frames["milestones"]
    sanc = frames["sanctions"][["project_id", "sanction_date"]]

    for col in ("planned_start", "planned_end", "actual_start", "actual_end"):
        p[col] = pd.to_datetime(p[col])
    pay = pay.assign(date=pd.to_datetime(pay["date"]))
    ms = ms.assign(planned_date=pd.to_datetime(ms["planned_date"]),
                   actual_date=pd.to_datetime(ms["actual_date"]))

    as_of = pd.Timestamp(AS_OF)
    p["planned_duration"] = (p["planned_end"] - p["planned_start"]).dt.days
    p["elapsed_days"] = (as_of - p["actual_start"]).dt.days
    p["elapsed_frac"] = (p["elapsed_days"] / p["planned_duration"].clip(lower=1)).clip(0, 5)
    # expected progress under the same s-curve family the world roughly follows
    x = p["elapsed_frac"].clip(0, 1)
    p["expected_progress"] = 100 * (3 * x**2 - 2 * x**3)
    p["progress_gap"] = p["expected_progress"] - p["progress"]
    p["fin_util"] = np.where(p["sanctioned_cost"] > 0, p["expenditure"] / p["sanctioned_cost"] * 100, np.nan)
    p["util_progress_gap"] = p["fin_util"] - p["progress"]

    pay_g = pay.groupby("project_id").agg(
        n_payments=("amount", "size"), max_payment=("amount", "max"),
        sum_payments=("amount", "sum"), first_payment=("date", "min"), last_payment=("date", "max"),
    )
    burst = (pay.groupby(["project_id", "date"]).size().rename("same_day")
             .reset_index().groupby("project_id")["same_day"].max().rename("max_same_day_payments"))
    p = p.merge(pay_g, left_on="id", right_index=True, how="left") \
         .merge(burst, left_on="id", right_index=True, how="left") \
         .merge(sanc, left_on="id", right_on="project_id", how="left", suffixes=("", "_s"))
    p["sanction_date"] = pd.to_datetime(p["sanction_date"])
    p["max_payment_ratio"] = np.where(p["sanctioned_cost"] > 0, p["max_payment"] / p["sanctioned_cost"], np.nan)

    done = ms[ms["actual_date"].notna()]
    slip = (done["actual_date"] - done["planned_date"]).dt.days
    ms_g = pd.DataFrame({
        "milestone_mean_slip": slip.groupby(done["project_id"]).mean(),
        "milestones_done": done.groupby("project_id").size(),
    })
    ms_delayed = ms[ms["status"] == "delayed"].groupby("project_id").size().rename("milestones_delayed")
    p = p.merge(ms_g, left_on="id", right_index=True, how="left") \
         .merge(ms_delayed, left_on="id", right_index=True, how="left")
    p[["n_payments", "milestones_done", "milestones_delayed", "max_same_day_payments"]] = \
        p[["n_payments", "milestones_done", "milestones_delayed", "max_same_day_payments"]].fillna(0)

    # completed-milestone weight so far (for the milestone-payment exemption)
    done_w = done.merge(ms[["project_id", "seq", "weight_pct"]], on=["project_id", "seq"], how="left")
    cum_w = done_w.groupby("project_id")["weight_pct_y"].sum().rename("completed_milestone_weight")
    p = p.merge(cum_w, left_on="id", right_index=True, how="left")
    p["completed_milestone_weight"] = p["completed_milestone_weight"].fillna(0)
    return p


def historical_rates(features: pd.DataFrame) -> pd.DataFrame:
    """District/agency historical delay behavior from completed projects only."""
    comp = features[features["status"] == "completed"].copy()
    comp["delay_days"] = (comp["actual_end"] - comp["planned_end"]).dt.days
    out = features[["id"]].copy()
    for key in ("district_id", "agency_id"):
        rate = comp.groupby(key)["delay_days"].mean().rename(f"{key}_hist_delay")
        out = out.merge(features[["id", key]], on="id").merge(rate, on=key, how="left").drop(columns=[key])
    return out
