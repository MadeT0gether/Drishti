"""Bulk-loads generated frames into PostgreSQL.

Geo entities (states/districts/constituencies/mps) are UPSERTED by natural key —
they may be referenced by users from Milestone 01 and must not be deleted.
All project-domain tables are wiped and reloaded with explicit ids, then
sequences are advanced past the loaded ids.
"""
from sqlalchemy import func, select, text

from app.database.base import Base
from app.database.session import engine
from app.models import MP, Constituency, District, State

# wipe order respects FK dependencies (AI-derived tables first — they reference projects)
DOMAIN_TABLES = [
    # M06 investigation rows reference projects/alerts/risk_assessments, so they
    # must go first; regenerating the dataset resets open cases (documented).
    "investigation_actions", "investigations",
    "risk_factors", "ai_assessments", "alerts", "risk_assessments", "anomaly_results",
    "duplicate_candidates", "network_signals", "reconciliation_results", "data_quality_issues",
    "peer_groups", "anomaly_ground_truth", "payments", "financial_transactions",
    "progress_updates", "milestones", "sanctions", "recommendations", "project_locations",
    "projects", "vendors", "implementing_agencies", "project_categories",
]

CHUNK = 5000


def _remap(rows: list[dict], col: str, mapping: dict[int, int]):
    for r in rows:
        if r.get(col) is not None:
            r[col] = mapping[r[col]]


def load(frames: dict[str, list[dict]], ledger: list[dict], meta: dict) -> dict:
    counts = {}
    with engine.begin() as conn:
        for t in DOMAIN_TABLES:
            conn.execute(text(f"DELETE FROM {t}"))

        # ── upsert geo, build gen-id → db-id maps ─────────────────────────
        smap, dmap, cmap, mmap = {}, {}, {}, {}
        for s in frames["states"]:
            row = conn.execute(select(State.id).where(State.name == s["name"])).first()
            if row:
                smap[s["id"]] = row[0]
            else:
                smap[s["id"]] = conn.execute(
                    State.__table__.insert().returning(State.id),
                    [{"name": s["name"], "code": s["code"]}],
                ).scalar_one()
        for d in frames["districts"]:
            db_state = smap[d["state_id"]]
            row = conn.execute(
                select(District.id).where(District.state_id == db_state, District.name == d["name"])
            ).first()
            if row:
                dmap[d["id"]] = row[0]
                conn.execute(
                    District.__table__.update().where(District.id == row[0]).values(centroid=d["centroid"])
                )
            else:
                dmap[d["id"]] = conn.execute(
                    District.__table__.insert().returning(District.id),
                    [{"state_id": db_state, "name": d["name"], "centroid": d["centroid"]}],
                ).scalar_one()
        for c in frames["constituencies"]:
            db_state = smap[c["state_id"]]
            row = conn.execute(
                select(Constituency.id).where(Constituency.state_id == db_state, Constituency.name == c["name"])
            ).first()
            cmap[c["id"]] = row[0] if row else conn.execute(
                Constituency.__table__.insert().returning(Constituency.id),
                [{"state_id": db_state, "name": c["name"], "type": c["type"]}],
            ).scalar_one()
        for m in frames["mps"]:
            db_const = cmap[m["constituency_id"]]
            row = conn.execute(
                select(MP.id).where(MP.constituency_id == db_const, MP.name == m["name"])
            ).first()
            mmap[m["id"]] = row[0] if row else conn.execute(
                MP.__table__.insert().returning(MP.id),
                [{"constituency_id": db_const, "name": m["name"], "house": m["house"],
                  "term_start": m["term_start"], "term_end": m["term_end"]}],
            ).scalar_one()

        # ── remap geo FKs on domain frames ────────────────────────────────
        _remap(frames["implementing_agencies"], "district_id", dmap)
        _remap(frames["vendors"], "district_id", dmap)
        _remap(frames["projects"], "state_id", smap)
        _remap(frames["projects"], "district_id", dmap)
        _remap(frames["projects"], "constituency_id", cmap)
        _remap(frames["projects"], "mp_id", mmap)
        _remap(frames["recommendations"], "mp_id", mmap)
        for entry in ledger:
            params = entry["injection_params"]
            if "district_id" in params:
                params["district_id"] = dmap[params["district_id"]]

        # ── bulk insert with explicit ids ─────────────────────────────────
        order = ["project_categories", "implementing_agencies", "vendors", "projects",
                 "project_locations", "recommendations", "sanctions", "milestones",
                 "progress_updates", "payments", "financial_transactions"]
        for name in order:
            rows = frames[name]
            table = Base.metadata.tables[name]
            for i in range(0, len(rows), CHUNK):
                conn.execute(table.insert(), rows[i : i + CHUNK])
            counts[name] = len(rows)

        agt = Base.metadata.tables["anomaly_ground_truth"]
        for i in range(0, len(ledger), CHUNK):
            conn.execute(agt.insert(), ledger[i : i + CHUNK])
        counts["anomaly_ground_truth"] = len(ledger)

        dv = Base.metadata.tables["dataset_versions"]
        conn.execute(text("DELETE FROM dataset_versions WHERE version = :v"), {"v": meta["version"]})
        conn.execute(dv.insert(), [meta])

        # ── advance sequences past explicit ids ───────────────────────────
        for name in order + ["anomaly_ground_truth", "states", "districts", "constituencies", "mps"]:
            conn.execute(text(
                f"SELECT setval(pg_get_serial_sequence('{name}', 'id'), "
                f"COALESCE((SELECT MAX(id) FROM {name}), 1))"
            ))
    return counts
