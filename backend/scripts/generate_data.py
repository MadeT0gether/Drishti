"""Generate and load the synthetic MPLADS dataset.

Usage (from backend/):
    python -m scripts.generate_data --projects 25000 --seed 42 --version demo-v1

Same seed + parameters => identical dataset. The ground-truth anomaly ledger is
written to data/evaluation/ledger.json (EVALUATION USE ONLY).
"""
import argparse
import sys
from datetime import date

from app.datagen.config import GenConfig
from app.datagen.pipeline import generate


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--projects", type=int, default=25000)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--version", default="demo-v1")
    ap.add_argument("--as-of", default="2026-08-24", help="Reference date for progress/status logic")
    args = ap.parse_args()

    cfg = GenConfig(
        n_projects=args.projects, seed=args.seed,
        dataset_version=args.version, as_of=date.fromisoformat(args.as_of),
    )
    stats = generate(cfg, to_db=True)
    stats.pop("frames"), stats.pop("ledger")

    print(f"\nDataset {cfg.dataset_version} (seed={cfg.seed}, as_of={cfg.as_of}) loaded.")
    print(f"  build: {stats['build_seconds']}s   load: {stats['load_seconds']}s")
    print("  rows loaded:")
    for k, v in stats["db_rows"].items():
        print(f"    {k:26s} {v:>8,}")
    print("  project status mix:", stats["status_distribution"])
    print("  injected anomalies (ground truth positives):")
    for k, v in sorted(stats["anomalies_by_type"].items()):
        print(f"    {k:28s} {v:>5}")
    print(f"  hard negatives (label=False): {stats['hard_negatives']}")
    print("\nLedger: data/evaluation/ledger.json  (evaluation only — never an ML feature)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
