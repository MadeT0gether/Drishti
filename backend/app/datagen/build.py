"""Builds the normal (pre-anomaly) synthetic dataset entirely in memory.

Output: dict[str, list[dict]] keyed by table name. IDs are assigned in-memory
(1..n per table); the loader remaps geo FKs onto real DB rows at load time.
Correlations are deliberate: cost ~ category band, progress ~ elapsed time
(s-curve), payments ~ completed milestones, expenditure = sum(payments).
"""
import json
from datetime import date, timedelta
from pathlib import Path

import numpy as np

from app.datagen.config import (
    AGENCY_TYPES,
    CATEGORIES,
    FINANCIAL_YEARS,
    FY_WEIGHTS,
    GenConfig,
    VENDOR_WORDS,
    VILLAGE_PREFIXES,
    VILLAGE_SUFFIXES,
    VILLAGE_SUFFIX_BY_STATE,
)

SEED_FILE = Path(__file__).resolve().parents[3] / "data" / "seed" / "districts.json"

MILESTONE_NAMES = [
    "Site Preparation", "Foundation Work", "Superstructure", "Finishing Works", "Completion & Handover",
]

LANDMARKS = [
    "Primary School", "Panchayat Bhavan", "Bus Stand", "Temple Road", "Market Yard",
    "Gram Panchayat Office", "Health Centre", "Water Tank", "Railway Crossing", "Main Chowk",
]


def fy_start(fy: str) -> date:
    return date(int(fy[:4]), 4, 1)


def smoothstep(x: np.ndarray | float):
    x = np.clip(x, 0.0, 1.0)
    return 3 * x**2 - 2 * x**3


class Builder:
    def __init__(self, cfg: GenConfig):
        self.cfg = cfg
        self.rng = np.random.default_rng(cfg.seed)
        self.frames: dict[str, list[dict]] = {
            "states": [], "districts": [], "constituencies": [], "mps": [],
            "project_categories": [], "implementing_agencies": [], "vendors": [],
            "projects": [], "project_locations": [], "recommendations": [], "sanctions": [],
            "milestones": [], "progress_updates": [], "payments": [], "financial_transactions": [],
        }
        self.villages: dict[int, list[dict]] = {}  # district_id -> [{name, dlat, dlon}]
        self.district_cost_mult: dict[int, float] = {}  # districts have real cost-level differences
        self._counters: dict[str, int] = {}

    def next_id(self, table: str) -> int:
        self._counters[table] = self._counters.get(table, 0) + 1
        return self._counters[table]

    # ── reference entities ────────────────────────────────────────────────
    def build_reference(self):
        seed = json.loads(SEED_FILE.read_text())
        rng = self.rng
        for s in seed["states"]:
            sid = self.next_id("states")
            self.frames["states"].append({"id": sid, "name": s["name"], "code": s["code"]})
            for d in s["districts"]:
                did = self.next_id("districts")
                self.frames["districts"].append({
                    "id": did, "state_id": sid, "name": d["name"],
                    "centroid": f"SRID=4326;POINT({d['lon']} {d['lat']})", "boundary": None,
                })
                cid = self.next_id("constituencies")
                self.frames["constituencies"].append(
                    {"id": cid, "state_id": sid, "name": d["name"], "type": "lok_sabha"}
                )
                mid = self.next_id("mps")
                first = rng.choice(VILLAGE_PREFIXES)
                self.frames["mps"].append({
                    "id": mid, "constituency_id": cid, "name": f"Hon. {first} {d['name'].split()[0]} (MP)",
                    "house": "lok_sabha",
                    "term_start": date(2024, 6, 1), "term_end": date(2029, 5, 31),
                })
                # villages: spatial sub-clusters inside the district
                suffixes = VILLAGE_SUFFIX_BY_STATE.get(s["code"], VILLAGE_SUFFIXES)
                vills = []
                for _ in range(30):
                    vills.append({
                        "name": rng.choice(VILLAGE_PREFIXES) + rng.choice(suffixes),
                        "dlat": float(rng.normal(0, 0.12)), "dlon": float(rng.normal(0, 0.12)),
                    })
                self.villages[did] = vills
                self.district_cost_mult[did] = float(rng.lognormal(0, 0.08))
                for at in AGENCY_TYPES:
                    self.frames["implementing_agencies"].append({
                        "id": self.next_id("implementing_agencies"),
                        "name": f"{at}, {d['name']}", "type": at.lower().replace(" ", "_"),
                        "district_id": did,
                    })
                n_vendors = int(rng.integers(8, 14))
                for v in range(n_vendors):
                    vid = self.next_id("vendors")
                    vname = f"{rng.choice(VILLAGE_PREFIXES)} {rng.choice(VENDOR_WORDS)} ({d['name']})"
                    self.frames["vendors"].append({
                        "id": vid, "name": f"{vname} #{vid}",
                        "registration_no": f"VND-{s['code']}-{vid:05d}", "district_id": did,
                    })
        for name, sector, cmin, cmax, dur, asset in CATEGORIES:
            self.frames["project_categories"].append({
                "id": self.next_id("project_categories"), "name": name, "sector": sector,
                "typical_cost_min": cmin, "typical_cost_max": cmax,
            })

    # ── projects ──────────────────────────────────────────────────────────
    def build_projects(self):
        cfg, rng = self.cfg, self.rng
        districts = self.frames["districts"]
        cats = self.frames["project_categories"]
        cat_meta = {c["id"]: CATEGORIES[i] for i, c in enumerate(cats)}
        dist_const = {c["name"]: c for c in self.frames["constituencies"]}
        const_mp = {m["constituency_id"]: m["id"] for m in self.frames["mps"]}
        agencies_by_district: dict[int, list[int]] = {}
        for a in self.frames["implementing_agencies"]:
            agencies_by_district.setdefault(a["district_id"], []).append(a["id"])
        vendors_by_district: dict[int, list[int]] = {}
        for v in self.frames["vendors"]:
            vendors_by_district.setdefault(v["district_id"], []).append(v["id"])
        # vendor popularity: zipf-like weights → legitimate repeated relationships
        vendor_weights = {
            did: (lambda w: w / w.sum())((1.0 / np.arange(1, len(vs) + 1)) ** 0.8)
            for did, vs in vendors_by_district.items()
        }
        # district activity weights (some districts simply run more projects)
        dweights = rng.lognormal(0, 0.5, len(districts))
        dweights /= dweights.sum()
        d_choice = rng.choice(len(districts), size=cfg.n_projects, p=dweights)
        cat_ids = np.array([c["id"] for c in cats])
        cat_choice = rng.choice(cat_ids, size=cfg.n_projects)
        fy_choice = rng.choice(FINANCIAL_YEARS, size=cfg.n_projects, p=FY_WEIGHTS)
        lifecycle = rng.choice(["recommended", "sanctioned", "active"], size=cfg.n_projects, p=[0.08, 0.12, 0.80])

        for i in range(cfg.n_projects):
            d = districts[int(d_choice[i])]
            did, sid = d["id"], d["state_id"]
            cat_id = int(cat_choice[i])
            _, _, cmin, cmax, base_dur, asset = cat_meta[cat_id]
            fy = str(fy_choice[i])
            const = dist_const[d["name"]]
            mp_id = const_mp[const["id"]]
            village = self.villages[did][int(rng.integers(0, 30))]
            pid = self.next_id("projects")

            # lognormal around the category's geometric mean (realistic clustering;
            # a log-uniform draw across the whole band would make peer comparison meaningless)
            center = float(np.sqrt(cmin * cmax)) * self.district_cost_mult[did]
            est = float(np.clip(center * rng.lognormal(0, 0.35), cmin * 0.6, cmax * 1.5))
            recommended = round(est * rng.uniform(0.95, 1.10), 2)
            duration = int(base_dur * rng.uniform(0.9, 1.8))
            planned_start = fy_start(fy) + timedelta(days=int(rng.integers(0, 300)))
            planned_end = planned_start + timedelta(days=duration)
            preposition = rng.choice(["at", "in", "near"], p=[0.6, 0.3, 0.1])
            title = f"Construction of {asset} {preposition} {village['name']}"
            # distinguishing detail (real work titles carry landmarks/wards/phases;
            # without this, same-village same-category titles collide unrealistically)
            r = rng.random()
            if r < 0.45:
                title += f", Ward {int(rng.integers(1, 25))}"
            elif r < 0.80:
                title += f", near {rng.choice(LANDMARKS)}"
            elif r < 0.90:
                title += f", Phase {rng.choice(['I', 'II', 'III'])}"

            row = {
                "id": pid, "code": f"MPL-{fy[:4]}-{pid:06d}", "title": title,
                "description": f"{title}, {d['name']} district. Recommended under MPLADS for local area development.",
                "category_id": cat_id, "mp_id": mp_id, "state_id": sid, "district_id": did,
                "constituency_id": const["id"],
                "agency_id": int(rng.choice(agencies_by_district[did])),
                "vendor_id": None, "status": str(lifecycle[i]),
                "recommended_cost": recommended, "sanctioned_cost": None, "revised_cost": None,
                "expenditure": 0.0, "physical_progress_pct": 0.0,
                "planned_start": planned_start, "planned_end": planned_end,
                "actual_start": None, "actual_end": None, "financial_year": fy,
                "data_source": "synthetic",
            }
            lat = d["centroid"].split(" ")[1].rstrip(")")
            lon = d["centroid"].split("(")[1].split(" ")[0]
            plat = float(lat) + village["dlat"] + float(rng.normal(0, 0.008))
            plon = float(lon) + village["dlon"] + float(rng.normal(0, 0.008))
            self.frames["project_locations"].append({
                "id": self.next_id("project_locations"), "project_id": pid,
                "geom": f"SRID=4326;POINT({plon:.6f} {plat:.6f})",
                "village": village["name"], "address": f"{village['name']}, {d['name']}",
                "pincode": str(int(rng.integers(110001, 855118))),
            })
            self.frames["recommendations"].append({
                "id": self.next_id("recommendations"), "project_id": pid, "mp_id": mp_id,
                "date": planned_start - timedelta(days=int(rng.integers(30, 120))),
                "amount": recommended,
            })

            if row["status"] == "recommended":
                self.frames["projects"].append(row)
                continue

            sanctioned = round(recommended * rng.uniform(0.85, 1.0), 2)
            row["sanctioned_cost"] = sanctioned
            sanction_date = planned_start - timedelta(days=int(rng.integers(5, 45)))
            self.frames["sanctions"].append({
                "id": self.next_id("sanctions"), "project_id": pid,
                "sanction_no": f"SNC-{fy[:4]}-{pid:06d}", "date": sanction_date,
                "amount": sanctioned, "authority": f"District Authority, {d['name']}",
            })
            self.frames["financial_transactions"].append({
                "id": self.next_id("financial_transactions"),
                "txn_ref": f"TXN-R-{pid:06d}", "project_code_raw": row["code"],
                "date": sanction_date + timedelta(days=int(rng.integers(1, 10))),
                "amount": sanctioned, "type": "release",
                "counterparty": f"District Authority, {d['name']}",
            })

            if row["status"] == "sanctioned":
                self.frames["projects"].append(row)
                continue

            # active: derive progress from elapsed time (s-curve + noise)
            actual_start = planned_start + timedelta(days=int(rng.exponential(20)))
            row["actual_start"] = actual_start
            elapsed = (cfg.as_of - actual_start).days
            speed = rng.normal(0.9, 0.25)  # some projects are simply faster/slower
            x = elapsed / max(duration, 1) * max(speed, 0.3)
            progress = float(100 * smoothstep(x))
            if progress > 97:
                progress = 100.0
                row["status"] = "completed"
                actual_days = int(duration / max(speed, 0.55))
                row["actual_end"] = actual_start + timedelta(days=actual_days)
            else:
                row["status"] = "in_progress"
            row["physical_progress_pct"] = round(progress, 2)
            row["vendor_id"] = int(rng.choice(
                vendors_by_district[did], p=vendor_weights[did]
            ))
            self._build_schedule_and_finance(row, duration, sanctioned)
            self.frames["projects"].append(row)

    # ── milestones, progress updates, payments, transactions ─────────────
    def _build_schedule_and_finance(self, row: dict, duration: int, sanctioned: float):
        rng, cfg = self.rng, self.cfg
        pid = row["id"]
        progress = row["physical_progress_pct"]
        start = row["actual_start"]

        k = int(rng.integers(4, 6))
        weights = rng.dirichlet(np.ones(k) * 3) * 100
        weights = np.round(weights, 2)
        weights[-1] = round(100 - weights[:-1].sum(), 2)
        cum = np.cumsum(weights)
        payments = []
        advance_frac = 0.15 if rng.random() < 0.5 else 0.0
        if advance_frac and row["status"] in ("in_progress", "completed"):
            amt = round(sanctioned * advance_frac, 2)
            payments.append({"date": start + timedelta(days=int(rng.integers(5, 20))), "amount": amt, "kind": "advance"})

        for j in range(k):
            planned_date = row["planned_start"] + timedelta(days=int(duration * cum[j] / 100))
            done = cum[j] <= progress + 1.0
            slip = int(rng.lognormal(2.5, 0.8)) - 5  # mostly small, occasionally large
            actual_date = None
            status = "pending"
            if done:
                actual_date = min(planned_date + timedelta(days=max(slip, -10)), cfg.as_of)
                status = "delayed" if slip > 30 else "completed"
            elif planned_date < cfg.as_of:
                status = "delayed"
            self.frames["milestones"].append({
                "id": self.next_id("milestones"), "project_id": pid, "seq": j + 1,
                "name": MILESTONE_NAMES[j] if j < len(MILESTONE_NAMES) else f"Stage {j+1}",
                "planned_date": planned_date, "actual_date": actual_date,
                "weight_pct": float(weights[j]), "status": status,
            })
            if done and actual_date:
                amt = round(float(weights[j]) / 100 * sanctioned * (1 - advance_frac) * rng.uniform(0.92, 1.0), 2)
                pay_date = min(actual_date + timedelta(days=int(rng.integers(5, 30))), cfg.as_of)
                payments.append({"date": pay_date, "amount": amt, "kind": "milestone"})

        if row["status"] == "completed" and rng.random() < 0.8:
            payments.append({
                "date": min(row["actual_end"] + timedelta(days=int(rng.integers(10, 40))), cfg.as_of),
                "amount": round(sanctioned * 0.05 * rng.uniform(0.8, 1.0), 2), "kind": "final",
            })

        for p in payments:
            pay_id = self.next_id("payments")
            self.frames["payments"].append({
                "id": pay_id, "project_id": pid, "payment_ref": f"PAY-{pay_id:07d}",
                "date": p["date"], "amount": p["amount"],
                "payee_vendor_id": row["vendor_id"],
                "mode": str(rng.choice(["neft", "rtgs", "cheque"], p=[0.6, 0.3, 0.1])),
                "kind": p["kind"],
            })
            self.frames["financial_transactions"].append({
                "id": self.next_id("financial_transactions"),
                "txn_ref": f"TXN-P-{pay_id:07d}", "project_code_raw": row["code"],
                "date": p["date"] + timedelta(days=int(rng.integers(0, 3))),
                "amount": p["amount"], "type": "payment", "counterparty": f"vendor:{row['vendor_id']}",
            })
        row["expenditure"] = round(sum(p["amount"] for p in payments), 2)

        # progress updates: roughly bi-monthly snapshots, monotone
        end = min(cfg.as_of, row["actual_end"] or cfg.as_of)
        span = (end - start).days
        if span > 0:
            n_updates = max(1, span // 60)
            last = 0.0
            for u in range(1, n_updates + 1):
                t = u / n_updates
                val = min(progress, float(progress * smoothstep(t) * rng.uniform(0.95, 1.05)))
                val = max(last, round(min(val, 100.0), 2))
                last = val
                self.frames["progress_updates"].append({
                    "id": self.next_id("progress_updates"), "project_id": pid,
                    "date": start + timedelta(days=int(span * t)),
                    "physical_pct": val, "remarks": None,
                })


def build_normal(cfg: GenConfig) -> tuple[dict[str, list[dict]], "Builder"]:
    b = Builder(cfg)
    b.build_reference()
    b.build_projects()
    return b.frames, b
