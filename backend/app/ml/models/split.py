"""Deterministic train/test split by project id hash — stable across runs,
no leakage between training and the frozen evaluation set."""
import hashlib

TEST_FRACTION = 0.30


def is_test(project_id: int) -> bool:
    h = hashlib.sha256(f"mplads-{project_id}".encode()).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF < TEST_FRACTION
