"""Loads and validates the versioned JSON playbooks shipped with the app.

Playbooks are curated content, not user data — a DB table would add CRUD and
migration surface for nothing. Per-case progress is recorded in
investigation_actions (playbook_step_completed, detail={playbook_id, step_id}).
"""
import json
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field

PLAYBOOK_DIR = Path(__file__).resolve().parent / "playbooks"


class PlaybookStep(BaseModel):
    id: str
    title: str
    guidance: str
    evidence_hint: str | None = None


class Playbook(BaseModel):
    id: str
    title: str
    description: str
    applies_to_factors: list[str] = Field(default_factory=list)
    version: int = 1
    steps: list[PlaybookStep]


@lru_cache
def load_playbooks() -> dict[str, Playbook]:
    out: dict[str, Playbook] = {}
    for path in sorted(PLAYBOOK_DIR.glob("*.json")):
        pb = Playbook.model_validate(json.loads(path.read_text(encoding="utf-8")))
        out[pb.id] = pb
    return out


def playbooks_for_factors(factor_types: list[str]) -> list[Playbook]:
    """Playbooks whose applies_to_factors intersect the case's risk factors,
    plus the generic playbook, in stable order."""
    books = load_playbooks()
    wanted = set(factor_types)
    matched = [b for b in books.values() if wanted & set(b.applies_to_factors)]
    generic = books.get("general-review-v1")
    if generic and generic not in matched:
        matched.append(generic)
    return matched
