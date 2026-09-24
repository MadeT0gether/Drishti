from datetime import datetime

from pydantic import BaseModel


class AlertOut(BaseModel):
    id: int
    project_id: int
    project_code: str | None = None
    project_title: str | None = None
    district: str | None = None
    state: str | None = None
    severity: str
    reason: str
    prev_score: float | None = None
    curr_score: float
    status: str
    assigned_role: str | None = None
    created_at: datetime
    # from the project's current risk assessment (None if not assessed)
    signal_count: int | None = None
    evidence_strength: str | None = None


class ModelVersionOut(BaseModel):
    name: str
    component: str
    dataset_version: str
    created_at: datetime
    status: str = "active"
    metrics: dict = {}


class AuditEventOut(BaseModel):
    event_id: str
    project_id: int
    source: str  # ai_assessment | user_action
    actor: str   # model version or user email
    action: str
    timestamp: datetime
    metadata: dict
