"""Orchestrates: build normal dataset → inject anomalies → load DB → export ledger."""
import json
import time
from collections import Counter
from pathlib import Path

from app.datagen.anomalies import inject
from app.datagen.build import build_normal
from app.datagen.config import GenConfig
from app.datagen.loader import load

EVAL_DIR = Path(__file__).resolve().parents[3] / "data" / "evaluation"


def generate(cfg: GenConfig, to_db: bool = True) -> dict:
    t0 = time.time()
    frames, builder = build_normal(cfg)
    ledger = inject(frames, builder, cfg)
    build_secs = round(time.time() - t0, 1)

    stats = {
        "dataset_version": cfg.dataset_version,
        "seed": cfg.seed,
        "as_of": cfg.as_of.isoformat(),
        "build_seconds": build_secs,
        "rows": {k: len(v) for k, v in frames.items()},
        "anomalies_by_type": dict(Counter(
            e["anomaly_type"] for e in ledger if e["ground_truth_label"]
        )),
        "hard_negatives": sum(1 for e in ledger if not e["ground_truth_label"]),
        "status_distribution": dict(Counter(p["status"] for p in frames["projects"])),
    }

    if to_db:
        t1 = time.time()
        meta = {
            "version": cfg.dataset_version, "seed": cfg.seed,
            "n_projects": cfg.n_projects, "params": cfg.params_dict(),
        }
        counts = load(frames, ledger, meta)
        stats["load_seconds"] = round(time.time() - t1, 1)
        stats["db_rows"] = counts

        EVAL_DIR.mkdir(parents=True, exist_ok=True)
        (EVAL_DIR / "ledger.json").write_text(json.dumps(
            {"dataset_version": cfg.dataset_version, "seed": cfg.seed,
             "entries": [
                 {k: v for k, v in e.items() if k != "id"} for e in ledger
             ]}, indent=1, default=str))
        (EVAL_DIR / "dataset_stats.json").write_text(json.dumps(stats, indent=1, default=str))

    stats["frames"] = frames
    stats["ledger"] = ledger
    return stats
