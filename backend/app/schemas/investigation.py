from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class QueueItem(BaseModel):
    project_id: int
    code: str
    title: str
    status: str
    district: str | None = None
    state: str | None = None
    sanctioned_cost: float | None = None
    expenditure: float
    risk_score: float
    risk_level: str
    evidence_strength: str
    priority_score: float
    priority_breakdown: dict[str, Any]
    has_open_case: bool
    investigation_id: int | None = None
    case_number: str | None = None
    investigation_status: str | None = None


class InvestigationCreate(BaseModel):
    project_id: int
    reason: str = Field(min_length=10, max_length=2000)
    alert_id: int | None = None


class InvestigationOut(BaseModel):
    id: int
    case_number: str
    project_id: int
    project_code: str | None = None
    project_title: str | None = None
    district: str | None = None
    state: str | None = None
    alert_id: int | None = None
    status: str
    priority_score: float
    assigned_to: str | None = None
    opened_by: str | None = None
    sla_due_at: datetime | None = None
    overdue: bool
    summary: str | None = None
    outcome: str | None = None
    outcome_note: str | None = None
    created_at: datetime
    closed_at: datetime | None = None


class RiskSnapshot(BaseModel):
    risk_score: float
    risk_level: str
    evidence_strength: str
    assessed_at: datetime
    is_current: bool


class PlaybookStepOut(BaseModel):
    id: str
    title: str
    guidance: str
    evidence_hint: str | None = None
    completed: bool = False


class PlaybookOut(BaseModel):
    id: str
    title: str
    description: str
    applies_to_factors: list[str]
    version: int
    steps: list[PlaybookStepOut]


class InvestigationDetail(InvestigationOut):
    risk_snapshot: RiskSnapshot | None = None
    priority_breakdown: dict[str, Any]
    playbooks: list[PlaybookOut]
    action_count: int


class ActionCreate(BaseModel):
    action_type: str = Field(max_length=40)
    reason: str = Field(min_length=5, max_length=2000)
    detail: dict[str, Any] = Field(default_factory=dict)


class ActionOut(BaseModel):
    id: int
    investigation_id: int
    action_type: str
    reason: str
    from_status: str | None = None
    to_status: str | None = None
    detail: dict[str, Any]
    user: str | None = None
    created_at: datetime


class TransitionRequest(BaseModel):
    to_status: str
    reason: str = Field(min_length=10, max_length=2000)
    outcome: str | None = None
    outcome_note: str | None = Field(None, max_length=4000)


class AssignRequest(BaseModel):
    assignee_id: int
    reason: str = Field(min_length=5, max_length=2000)


class SummaryUpdate(BaseModel):
    summary: str = Field(min_length=10, max_length=8000)
    reason: str = Field(min_length=5, max_length=2000)
    source: str = Field("manual", pattern="^(manual|copilot)$")
