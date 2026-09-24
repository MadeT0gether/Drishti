"""Controlled anomaly injection over the normal dataset.

Every injection appends a row to the ground-truth ledger with its parameters.
The ledger is for EVALUATION ONLY — detectors in Milestone 03 never read it.
Hard negatives (legitimate look-alikes) are recorded with ground_truth_label=False.
"""
from datetime import timedelta

import numpy as np

from app.datagen.build import Builder
from app.datagen.config import GenConfig


class Injector:
    def __init__(self, frames: dict, builder: Builder, cfg: GenConfig):
        self.frames = frames
        self.b = builder
        self.cfg = cfg
        self.rng = np.random.default_rng(cfg.seed + 1)  # separate stream from the builder
        self.ledger: list[dict] = []
        self.tagged: set[int] = set()  # projects already carrying an anomaly
        self.projects = frames["projects"]
        self.by_id = {p["id"]: p for p in self.projects}
        self.pay_by_project: dict[int, list[dict]] = {}
        for p in frames["payments"]:
            self.pay_by_project.setdefault(p["project_id"], []).append(p)
        self.txn_by_code: dict[str, list[dict]] = {}
        for t in frames["financial_transactions"]:
            self.txn_by_code.setdefault(t["project_code_raw"], []).append(t)
        self.loc_by_project = {loc["project_id"]: loc for loc in frames["project_locations"]}

    # ── helpers ───────────────────────────────────────────────────────────
    def _record(self, atype, project_id, severity, params, related=None, label=True):
        self.ledger.append({
            "id": len(self.ledger) + 1,
            "project_id": project_id, "related_project_id": related,
            "anomaly_type": atype, "severity": severity,
            "ground_truth_label": label, "injection_params": params,
            "dataset_version": self.cfg.dataset_version,
        })
        if label and project_id:
            self.tagged.add(project_id)

    def _pick(self, n, status=("in_progress", "completed")):
        pool = [p for p in self.projects if p["status"] in status and p["id"] not in self.tagged]
        idx = self.rng.choice(len(pool), size=min(n, len(pool)), replace=False)
        return [pool[int(i)] for i in idx]

    def _n(self, rate):
        return max(1, int(round(rate * len(self.projects))))

    def _scale_payments(self, pid, factor):
        for pay in self.pay_by_project.get(pid, []):
            pay["amount"] = round(pay["amount"] * factor, 2)
        code = self.by_id[pid]["code"]
        for txn in self.txn_by_code.get(code, []):
            txn["amount"] = round(txn["amount"] * factor, 2)

    def _add_payment(self, p, amount, pay_date, kind="milestone", with_txn=True):
        pay_id = self.b.next_id("payments")
        row = {
            "id": pay_id, "project_id": p["id"], "payment_ref": f"PAY-{pay_id:07d}",
            "date": pay_date, "amount": round(amount, 2),
            "payee_vendor_id": p["vendor_id"], "mode": "neft", "kind": kind,
        }
        self.frames["payments"].append(row)
        self.pay_by_project.setdefault(p["id"], []).append(row)
        if with_txn:
            txn = {
                "id": self.b.next_id("financial_transactions"),
                "txn_ref": f"TXN-P-{pay_id:07d}", "project_code_raw": p["code"],
                "date": pay_date + timedelta(days=1), "amount": round(amount, 2),
                "type": "payment", "counterparty": f"vendor:{p['vendor_id']}",
            }
            self.frames["financial_transactions"].append(txn)
            self.txn_by_code.setdefault(p["code"], []).append(txn)
        return row

    def _clone_project(self, src, title, dlat, dlon, cost_factor, same_vendor):
        rng = self.rng
        pid = self.b.next_id("projects")
        clone = dict(src)
        clone["id"] = pid
        clone["code"] = f"MPL-{src['financial_year'][:4]}-{pid:06d}"
        clone["title"] = title
        clone["description"] = f"{title}, cloned scope under MPLADS."
        for c in ("recommended_cost", "sanctioned_cost", "expenditure"):
            if clone.get(c):
                clone[c] = round(clone[c] * cost_factor, 2)
        if not same_vendor:
            clone["vendor_id"] = src["vendor_id"]  # same district pool; keep simple but flag differently
        shift = int(rng.integers(-60, 60))
        for c in ("planned_start", "planned_end", "actual_start", "actual_end"):
            if clone.get(c):
                clone[c] = clone[c] + timedelta(days=shift)
        self.projects.append(clone)
        self.by_id[pid] = clone

        src_loc = self.loc_by_project[src["id"]]
        lon, lat = src_loc["geom"].split("(")[1].rstrip(")").split(" ")
        loc = {
            "id": self.b.next_id("project_locations"), "project_id": pid,
            "geom": f"SRID=4326;POINT({float(lon)+dlon:.6f} {float(lat)+dlat:.6f})",
            "village": src_loc["village"], "address": src_loc["address"], "pincode": src_loc["pincode"],
        }
        self.frames["project_locations"].append(loc)
        self.loc_by_project[pid] = loc
        self.frames["recommendations"].append({
            "id": self.b.next_id("recommendations"), "project_id": pid, "mp_id": clone["mp_id"],
            "date": clone["planned_start"] - timedelta(days=45), "amount": clone["recommended_cost"],
        })
        if clone["sanctioned_cost"]:
            self.frames["sanctions"].append({
                "id": self.b.next_id("sanctions"), "project_id": pid,
                "sanction_no": f"SNC-{clone['financial_year'][:4]}-{pid:06d}",
                "date": clone["planned_start"] - timedelta(days=20),
                "amount": clone["sanctioned_cost"], "authority": "District Authority",
            })
            if clone["expenditure"]:
                self._add_payment(clone, clone["expenditure"], min(clone["planned_start"] + timedelta(days=90), self.cfg.as_of))
        return clone

    # ── injections ────────────────────────────────────────────────────────
    def compound_cases(self):
        """Projects with several correlated problems at once — the realistic
        'genuinely troubled project' profile that should reach HIGH/CRITICAL
        risk. Each constituent anomaly is recorded separately in the ledger
        (params carry compound=True)."""
        rng = self.rng
        targets = [p for p in self._pick(self.cfg.rates.compound_cases * 3, status=("in_progress",))
                   if p["sanctioned_cost"] and p["expenditure"] / p["sanctioned_cost"] > 0.35]
        for p in targets[: self.cfg.rates.compound_cases]:
            pid = p["id"]
            # 1) cost inflation vs peers
            factor = float(rng.uniform(2.2, 2.6))
            original = p["sanctioned_cost"]
            for c in ("recommended_cost", "sanctioned_cost", "expenditure"):
                if p.get(c):
                    p[c] = round(p[c] * factor, 2)
            self._scale_payments(pid, factor)
            self._record("COST_ANOMALY", pid, "high",
                         {"factor": round(factor, 3), "original_sanctioned": original,
                          "compound": True})
            # 2) oversized non-milestone payment
            amt = p["sanctioned_cost"] * float(rng.uniform(0.30, 0.45))
            self._add_payment(p, amt, min(p["actual_start"] + timedelta(days=int(rng.integers(60, 200))),
                                          self.cfg.as_of))
            p["expenditure"] = round(p["expenditure"] + amt, 2)
            self._record("PAYMENT_ANOMALY", pid, "high",
                         {"variant": "oversized_payment", "amount": round(amt, 2), "compound": True})
            # 3) progress/payment mismatch
            util = p["expenditure"] / p["sanctioned_cost"] * 100
            old_prog = p["physical_progress_pct"]
            new_prog = round(max(min(util, 100) - float(rng.uniform(35, 45)), 5.0), 2)
            p["physical_progress_pct"] = new_prog
            scale = new_prog / max(old_prog, 1.0)
            for u in self.frames["progress_updates"]:
                if u["project_id"] == pid:
                    u["physical_pct"] = round(min(u["physical_pct"] * scale, new_prog), 2)
            self._record("PROGRESS_PAYMENT_MISMATCH", pid, "high",
                         {"financial_utilization_pct": round(util, 1), "new_progress_pct": new_prog,
                          "original_progress_pct": old_prog, "compound": True})
            # 4) schedule slip
            slip = int(rng.integers(120, 280))
            for m in self.frames["milestones"]:
                if m["project_id"] == pid:
                    if m["actual_date"]:
                        m["actual_date"] = min(m["actual_date"] + timedelta(days=slip), self.cfg.as_of)
                        m["status"] = "delayed"
                    elif m["planned_date"] < self.cfg.as_of:
                        m["status"] = "delayed"
            self._record("DELAY_ANOMALY", pid, "high", {"slip_days": slip, "compound": True})
            # 5) broken reconciliation: one payment's PFMS transaction goes missing
            txns = [t for t in self.txn_by_code.get(p["code"], []) if t["type"] == "payment"]
            if txns:
                t = txns[0]
                self.frames["financial_transactions"].remove(t)
                self.txn_by_code[p["code"]].remove(t)
                self._record("RECONCILIATION_MISMATCH", pid, "high",
                             {"variant": "missing_transaction", "removed_txn_ref": t["txn_ref"],
                              "amount": t["amount"], "compound": True})
            # 6) for some, a nearby duplicate clone exists too
            if rng.random() < 0.4:
                title = (p["title"].replace(" at ", " in ")
                         if " at " in p["title"] else p["title"].replace(" in ", " at "))
                clone = self._clone_project(p, title, dlat=float(rng.normal(0, 0.003)),
                                            dlon=float(rng.normal(0, 0.003)),
                                            cost_factor=float(rng.uniform(0.95, 1.05)),
                                            same_vendor=True)
                self._record("DUPLICATE_PROJECT", pid, "high",
                             {"clone_code": clone["code"], "compound": True}, related=clone["id"])

    def cost_anomaly(self):
        for p in self._pick(self._n(self.cfg.rates.cost_anomaly)):
            factor = float(self.rng.uniform(1.6, 2.6))
            original = p["sanctioned_cost"]
            for c in ("recommended_cost", "sanctioned_cost", "expenditure"):
                if p.get(c):
                    p[c] = round(p[c] * factor, 2)
            self._scale_payments(p["id"], factor)
            sev = "high" if factor > 2.1 else "medium"
            self._record("COST_ANOMALY", p["id"], sev,
                         {"factor": round(factor, 3), "original_sanctioned": original})

    def payment_anomaly(self):
        variants = ["oversized_payment", "payment_before_sanction", "payment_burst"]
        for p in self._pick(self._n(self.cfg.rates.payment_anomaly)):
            v = str(self.rng.choice(variants))
            if v == "oversized_payment":
                amt = p["sanctioned_cost"] * float(self.rng.uniform(0.30, 0.50))
                self._add_payment(p, amt, min(p["actual_start"] + timedelta(days=int(self.rng.integers(30, 120))), self.cfg.as_of))
                p["expenditure"] = round(p["expenditure"] + amt, 2)
                params = {"variant": v, "amount": round(amt, 2)}
            elif v == "payment_before_sanction":
                amt = p["sanctioned_cost"] * float(self.rng.uniform(0.10, 0.25))
                self._add_payment(p, amt, p["planned_start"] - timedelta(days=int(self.rng.integers(30, 90))))
                p["expenditure"] = round(p["expenditure"] + amt, 2)
                params = {"variant": v, "amount": round(amt, 2)}
            else:  # burst: 4-6 same-day payments
                n = int(self.rng.integers(4, 7))
                burst_date = min(p["actual_start"] + timedelta(days=int(self.rng.integers(60, 200))), self.cfg.as_of)
                amt = p["sanctioned_cost"] * 0.06
                for _ in range(n):
                    self._add_payment(p, amt, burst_date)
                p["expenditure"] = round(p["expenditure"] + n * amt, 2)
                params = {"variant": v, "n_payments": n, "each": round(amt, 2)}
            self._record("PAYMENT_ANOMALY", p["id"], "high", params)

    def progress_payment_mismatch(self):
        pool = [p for p in self._pick(self._n(self.cfg.rates.progress_payment_mismatch) * 3)
                if p["sanctioned_cost"] and p["expenditure"] / p["sanctioned_cost"] > 0.45
                and p["status"] == "in_progress"]
        for p in pool[: self._n(self.cfg.rates.progress_payment_mismatch)]:
            util = p["expenditure"] / p["sanctioned_cost"] * 100
            new_progress = round(max(util - float(self.rng.uniform(35, 45)), 5.0), 2)
            old = p["physical_progress_pct"]
            p["physical_progress_pct"] = new_progress
            scale = new_progress / max(old, 1.0)
            for u in self.frames["progress_updates"]:
                if u["project_id"] == p["id"]:
                    u["physical_pct"] = round(min(u["physical_pct"] * scale, new_progress), 2)
            self._record("PROGRESS_PAYMENT_MISMATCH", p["id"], "high",
                         {"financial_utilization_pct": round(util, 1),
                          "new_progress_pct": new_progress, "original_progress_pct": old})

    def delay_anomaly(self):
        for p in self._pick(self._n(self.cfg.rates.delay_anomaly), status=("in_progress",)):
            slip = int(self.rng.integers(90, 300))
            for m in self.frames["milestones"]:
                if m["project_id"] == p["id"]:
                    if m["actual_date"]:
                        m["actual_date"] = min(m["actual_date"] + timedelta(days=slip), self.cfg.as_of)
                        m["status"] = "delayed"
                    elif m["planned_date"] < self.cfg.as_of:
                        m["status"] = "delayed"
            old = p["physical_progress_pct"]
            p["physical_progress_pct"] = round(old * float(self.rng.uniform(0.4, 0.7)), 2)
            self._record("DELAY_ANOMALY", p["id"], "high" if slip > 180 else "medium",
                         {"slip_days": slip, "original_progress_pct": old})

    def cost_overrun(self):
        for p in self._pick(self._n(self.cfg.rates.cost_overrun)):
            factor = float(self.rng.uniform(1.3, 1.8))
            p["revised_cost"] = round(p["sanctioned_cost"] * factor, 2)
            extra = p["sanctioned_cost"] * float(self.rng.uniform(0.05, 0.25))
            self._add_payment(p, extra, min((p["actual_end"] or self.cfg.as_of), self.cfg.as_of))
            p["expenditure"] = round(p["expenditure"] + extra, 2)
            self._record("COST_OVERRUN", p["id"], "high" if factor > 1.55 else "medium",
                         {"revision_factor": round(factor, 3), "extra_expenditure": round(extra, 2)})

    def duplicates(self):
        rng = self.rng
        # exact-style duplicates: same title with trivial variation
        for p in self._pick(self._n(self.cfg.rates.duplicate_project)):
            title = p["title"].replace(" at ", " in ") if " at " in p["title"] else p["title"].replace(" in ", " at ")
            c = self._clone_project(p, title, dlat=float(rng.normal(0, 0.003)), dlon=float(rng.normal(0, 0.003)),
                                    cost_factor=float(rng.uniform(0.95, 1.05)), same_vendor=True)
            self._record("DUPLICATE_PROJECT", p["id"], "high", {"clone_code": c["code"]}, related=c["id"])
        # near duplicates: paraphrased title, looser cost/geo
        for p in self._pick(self._n(self.cfg.rates.near_duplicate_project)):
            title = p["title"].replace("Construction of", "Providing and constructing")
            c = self._clone_project(p, title, dlat=float(rng.normal(0, 0.012)), dlon=float(rng.normal(0, 0.012)),
                                    cost_factor=float(rng.uniform(0.85, 1.15)), same_vendor=False)
            self._record("NEAR_DUPLICATE_PROJECT", p["id"], "medium", {"clone_code": c["code"]}, related=c["id"])
        # geographic duplicates: same spot, differently worded
        for p in self._pick(self._n(self.cfg.rates.geographic_duplicate)):
            title = p["title"].split(",")[0].replace("Construction of", "Development of")
            c = self._clone_project(p, title, dlat=float(rng.normal(0, 0.0015)), dlon=float(rng.normal(0, 0.0015)),
                                    cost_factor=float(rng.uniform(0.9, 1.1)), same_vendor=True)
            self._record("GEOGRAPHIC_DUPLICATE", p["id"], "high", {"clone_code": c["code"]}, related=c["id"])
        # HARD NEGATIVES: legitimate nearby same-category works (label=False)
        by_district_cat: dict[tuple, list[dict]] = {}
        for p in self.projects:
            if p["id"] not in self.tagged and p["status"] in ("in_progress", "completed"):
                by_district_cat.setdefault((p["district_id"], p["category_id"]), []).append(p)
        pairs = [v for v in by_district_cat.values() if len(v) >= 2]
        n_neg = self._n(self.cfg.rates.duplicate_hard_negative)
        idx = rng.choice(len(pairs), size=min(n_neg, len(pairs)), replace=False)
        for i in idx:
            a, b = pairs[int(i)][0], pairs[int(i)][1]
            loc_a, loc_b = self.loc_by_project[a["id"]], self.loc_by_project[b["id"]]
            lon, lat = loc_a["geom"].split("(")[1].rstrip(")").split(" ")
            loc_b["geom"] = f"SRID=4326;POINT({float(lon)+rng.normal(0, 0.01):.6f} {float(lat)+rng.normal(0, 0.01):.6f})"
            self._record("DUPLICATE_PROJECT", a["id"], "low",
                         {"note": "legitimate nearby same-category works"}, related=b["id"], label=False)

    def vendor_concentration(self):
        rng = self.rng
        districts = list({p["district_id"] for p in self.projects})
        chosen = rng.choice(districts, size=min(self.cfg.rates.vendor_concentration_districts, len(districts)), replace=False)
        for did in chosen:
            dprojects = [p for p in self.projects
                         if p["district_id"] == did and p["vendor_id"] and p["financial_year"] >= "2024-25"]
            if len(dprojects) < 6:
                continue
            vendor = dprojects[0]["vendor_id"]
            share = float(rng.uniform(0.6, 0.8))
            n_take = int(len(dprojects) * share)
            taken = []
            for p in dprojects[:n_take]:
                p["vendor_id"] = vendor
                for pay in self.pay_by_project.get(p["id"], []):
                    pay["payee_vendor_id"] = vendor
                taken.append(p["id"])
            self._record("VENDOR_CONCENTRATION", None, "high",
                         {"district_id": int(did), "vendor_id": int(vendor),
                          "share": round(share, 2), "project_ids": taken})

    def relationship_anomaly(self):
        rng = self.rng
        agencies: dict[int, list[dict]] = {}
        for p in self.projects:
            if p["vendor_id"] and p["id"] not in self.tagged:
                agencies.setdefault(p["agency_id"], []).append(p)
        big = [(a, ps) for a, ps in agencies.items() if len(ps) >= 15]
        idx = rng.choice(len(big), size=min(self.cfg.rates.relationship_clusters, len(big)), replace=False)
        for i in idx:
            agency_id, ps = big[int(i)]
            vendor = ps[0]["vendor_id"]
            cluster = ps[: int(rng.integers(12, 18))]
            mean_cost = float(np.mean([p["sanctioned_cost"] or 0 for p in cluster]))
            ids = []
            for p in cluster:
                p["vendor_id"] = vendor
                if p["sanctioned_cost"]:
                    p["sanctioned_cost"] = round(mean_cost * float(rng.uniform(0.97, 1.03)), 2)
                ids.append(p["id"])
            self._record("RELATIONSHIP_ANOMALY", None, "medium",
                         {"agency_id": int(agency_id), "vendor_id": int(vendor), "project_ids": ids})

    def reconciliation_mismatch(self):
        variants = ["amount_mismatch", "timing_mismatch", "missing_transaction", "missing_reference", "status_mismatch"]
        for p in self._pick(self._n(self.cfg.rates.reconciliation_mismatch)):
            v = str(self.rng.choice(variants))
            txns = [t for t in self.txn_by_code.get(p["code"], []) if t["type"] == "payment"]
            params = {"variant": v}
            if v == "amount_mismatch" and txns:
                t = txns[0]
                factor = float(self.rng.choice([0.65, 1.4]))
                params.update({"txn_ref": t["txn_ref"], "original": t["amount"], "factor": factor})
                t["amount"] = round(t["amount"] * factor, 2)
            elif v == "timing_mismatch" and txns:
                t = txns[-1]
                lag = int(self.rng.integers(120, 240))
                params.update({"txn_ref": t["txn_ref"], "lag_days": lag})
                t["date"] = t["date"] + timedelta(days=lag)
            elif v == "missing_transaction" and txns:
                t = txns[0]
                params.update({"removed_txn_ref": t["txn_ref"], "amount": t["amount"]})
                self.frames["financial_transactions"].remove(t)
                self.txn_by_code[p["code"]].remove(t)
            elif v == "missing_reference" and txns:
                t = txns[0]
                params.update({"txn_ref": t["txn_ref"], "original_code": t["project_code_raw"]})
                t["project_code_raw"] = f"MPL-0000-{t['id']:06d}"
            else:  # status_mismatch: reported completed, payments clearly partial
                v = "status_mismatch"
                params = {"variant": v, "original_status": p["status"],
                          "paid_fraction": round(p["expenditure"] / (p["sanctioned_cost"] or 1), 2)}
                keep = self.pay_by_project.get(p["id"], [])[: max(1, len(self.pay_by_project.get(p["id"], [])) // 2)]
                removed = [x for x in self.pay_by_project.get(p["id"], []) if x not in keep]
                for r in removed:
                    self.frames["payments"].remove(r)
                self.pay_by_project[p["id"]] = keep
                p["status"] = "completed"
                p["physical_progress_pct"] = 100.0
                p["actual_end"] = p["actual_end"] or min(p["planned_end"], self.cfg.as_of)
                p["expenditure"] = round(sum(x["amount"] for x in keep), 2)
            self._record("RECONCILIATION_MISMATCH", p["id"], "medium", params)

    def data_quality(self):
        variants = ["missing_coordinates", "invalid_coordinates", "impossible_dates",
                    "missing_sanctioned_cost", "inconsistent_status", "duplicate_record"]
        for p in self._pick(self._n(self.cfg.rates.data_quality)):
            v = str(self.rng.choice(variants))
            params = {"variant": v}
            if v == "missing_coordinates":
                self.loc_by_project[p["id"]]["geom"] = None
            elif v == "invalid_coordinates":
                # lat/lon swapped → point far outside India
                loc = self.loc_by_project[p["id"]]
                lon, lat = loc["geom"].split("(")[1].rstrip(")").split(" ")
                loc["geom"] = f"SRID=4326;POINT({lat} {lon})"
                params["note"] = "lat/lon swapped"
            elif v == "impossible_dates":
                p["planned_end"] = p["planned_start"] - timedelta(days=int(self.rng.integers(10, 200)))
            elif v == "missing_sanctioned_cost":
                params["original"] = p["sanctioned_cost"]
                p["sanctioned_cost"] = None
            elif v == "inconsistent_status":
                p["status"] = "completed"
                p["physical_progress_pct"] = round(float(self.rng.uniform(20, 45)), 2)
                p["actual_end"] = None
            else:  # duplicate_record
                clone = self._clone_project(p, p["title"], 0.0, 0.0, 1.0, True)
                params["clone_code"] = clone["code"]
                self._record("DATA_QUALITY_ANOMALY", p["id"], "low", params, related=clone["id"])
                continue
            self._record("DATA_QUALITY_ANOMALY", p["id"], "low", params)

    def run(self) -> list[dict]:
        self.compound_cases()
        self.cost_anomaly()
        self.payment_anomaly()
        self.progress_payment_mismatch()
        self.delay_anomaly()
        self.cost_overrun()
        self.duplicates()
        self.vendor_concentration()
        self.relationship_anomaly()
        self.reconciliation_mismatch()
        self.data_quality()
        return self.ledger


def inject(frames: dict, builder: Builder, cfg: GenConfig) -> list[dict]:
    return Injector(frames, builder, cfg).run()
