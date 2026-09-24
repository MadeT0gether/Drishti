"""Response schemas for AI-derived project intelligence (M03 outputs).

Terminology follows the responsible-AI policy: scores are implementation/review
risk; duplicates are CANDIDATES; network signals are patterns requiring review.
"""
from datetime import datetime

from pydantic import BaseModel


class RiskFactorOut(BaseModel):
    factor_type: str
    contribution: float
    severity: str
    evidence: dict
    explanation: str
    source_ref: str | None = None


class RiskOut(BaseModel):
    project_id: int
    risk_score: float
    risk_level: str
    evidence_strength: str
    data_completeness_pct: float
    signal_count: int
    predicted_delay_days: float | None = None
    delay_risk: str | None = None
    overrun_risk: str | None = None
    model_version: str
    assessed_at: datetime
    factors: list[RiskFactorOut] = []
    disclaimer: str = (
        "AI-generated risk assessments are decision-support signals and do not "
        "constitute findings of fraud, misconduct, corruption, or legal liability."
    )


class RiskTimelinePoint(BaseModel):
    assessed_at: datetime
    risk_score: float
    risk_level: str
    model_version: str
    signals: dict


class AnomalyOut(BaseModel):
    id: int
    detector: str
    score: float
    severity: str
    values: dict
    explanation: str
    model_version: str
    detected_at: datetime


class SimilarProjectOut(BaseModel):
    project_id: int
    code: str
    title: str
    district: str | None = None
    status: str
    sanctioned_cost: float | None = None
    classification: str  # "duplicate_candidate" (strong) | "similar_project"
    composite_score: float
    text_similarity: float
    geo_distance_km: float | None = None
    cost_similarity: float | None = None
    same_agency: bool
    time_overlap: bool
    review_status: str  # candidate / confirmed_by_officer / rejected_by_officer
    note: str = "Potential duplicate candidate — human verification required."


class RelationshipEdge(BaseModel):
    relationship_type: str  # implemented_by / contracted_to / vendor_portfolio / agency_portfolio
    entity_type: str        # agency / vendor / project
    entity_id: int
    entity_name: str
    detail: dict = {}


class NetworkSignalOut(BaseModel):
    signal_type: str
    score: float
    severity: str
    detail: dict
    note: str = "Suspicious relationship pattern — human review required."


class RelatedProject(BaseModel):
    project_id: int
    code: str
    title: str
    shared: str  # vendor | agency_vendor


class RelationshipsOut(BaseModel):
    project_id: int
    edges: list[RelationshipEdge]
    signals: list[NetworkSignalOut]
    related_projects: list[RelatedProject] = []


class ReconciliationOut(BaseModel):
    project_id: int
    status: str            # reconciled / amount_mismatch / timing_mismatch / missing_transaction / status_mismatch / not_analyzed
    status_group: str      # RECONCILED / PARTIAL / MISMATCH / MISSING
    project_side_total: float | None = None
    matched_total: float | None = None
    mismatch_amount: float | None = None
    detail: dict
    severity: str
    model_version: str | None = None


class PredictionsOut(BaseModel):
    project_id: int
    predicted_delay_days: float | None = None
    delay_risk: str | None = None
    delay_model_version: str | None = None
    overrun_risk: str | None = None
    overrun_model_version: str | None = None
    predicted_at: datetime | None = None
    note: str = "Predictions apply to in-progress projects; completed projects show none."


class EarlyWarningItem(BaseModel):
    warning_type: str  # delay / overrun / anomaly / risk_escalation
    severity: str
    message: str
    evidence: dict
    model_version: str | None = None
    timestamp: datetime


class EarlyWarningOut(BaseModel):
    project_id: int
    warnings: list[EarlyWarningItem]
