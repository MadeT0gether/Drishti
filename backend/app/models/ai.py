import enum

from sqlalchemy import (
    BigInteger,
    Boolean,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class Severity(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class RiskLevel(str, enum.Enum):
    low = "low"
    moderate = "moderate"
    high = "high"
    critical = "critical"


class EvidenceStrength(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class ModelVersion(TimestampMixin, Base):
    __tablename__ = "model_versions"
    __table_args__ = (UniqueConstraint("name", "component", name="uq_model_component"),)

    name: Mapped[str] = mapped_column(String(40), nullable=False)  # e.g. risk-v0.1
    component: Mapped[str] = mapped_column(String(30), nullable=False)  # cost/payment/.../risk
    params: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    dataset_version: Mapped[str] = mapped_column(String(20), nullable=False)


class AnomalyResult(TimestampMixin, Base):
    __tablename__ = "anomaly_results"
    __table_args__ = (
        Index("ix_anomaly_results_project_detector", "project_id", "detector"),
        Index("ix_anomaly_results_detector_severity", "detector", "severity"),
    )

    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id"), nullable=False)
    detector: Mapped[str] = mapped_column(String(40), nullable=False)
    score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)  # 0-100
    severity: Mapped[Severity] = mapped_column(Enum(Severity, name="severity"), nullable=False)
    values: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)  # the numbers behind the flag
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    model_version_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("model_versions.id"), nullable=False)


class DuplicateCandidate(TimestampMixin, Base):
    __tablename__ = "duplicate_candidates"
    __table_args__ = (
        UniqueConstraint("project_id_a", "project_id_b", name="uq_duplicate_pair"),
        Index("ix_duplicate_candidates_b", "project_id_b"),
    )

    project_id_a: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id"), nullable=False, index=True)
    project_id_b: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id"), nullable=False)
    text_sim: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False)
    geo_km: Mapped[float | None] = mapped_column(Numeric(8, 3), nullable=True)
    cost_sim: Mapped[float | None] = mapped_column(Numeric(5, 4), nullable=True)
    same_category: Mapped[bool] = mapped_column(Boolean, nullable=False)
    same_agency: Mapped[bool] = mapped_column(Boolean, nullable=False)
    time_overlap: Mapped[bool] = mapped_column(Boolean, nullable=False)
    composite_score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)  # 0-100
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="candidate")
    model_version_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("model_versions.id"), nullable=False)


class NetworkSignal(TimestampMixin, Base):
    __tablename__ = "network_signals"

    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id"), nullable=False, index=True)
    signal_type: Mapped[str] = mapped_column(String(40), nullable=False)
    score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    severity: Mapped[Severity] = mapped_column(Enum(Severity, name="severity"), nullable=False)
    detail: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    model_version_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("model_versions.id"), nullable=False)


class ReconciliationResult(TimestampMixin, Base):
    __tablename__ = "reconciliation_results"

    project_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("projects.id"), nullable=False, unique=True
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    expected: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    found: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    detail: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    model_version_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("model_versions.id"), nullable=False)


class DataQualityIssue(TimestampMixin, Base):
    __tablename__ = "data_quality_issues"

    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id"), nullable=False, index=True)
    issue_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    field: Mapped[str | None] = mapped_column(String(60), nullable=True)
    severity: Mapped[Severity] = mapped_column(Enum(Severity, name="severity"), nullable=False)
    detail: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    model_version_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("model_versions.id"), nullable=False)


class RiskAssessment(TimestampMixin, Base):
    __tablename__ = "risk_assessments"
    __table_args__ = (
        Index("ix_risk_assessments_current_level", "is_current", "level"),
        Index("ix_risk_assessments_project_current", "project_id", "is_current"),
    )

    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id"), nullable=False)
    score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    level: Mapped[RiskLevel] = mapped_column(Enum(RiskLevel, name="risk_level"), nullable=False)
    evidence_strength: Mapped[EvidenceStrength] = mapped_column(
        Enum(EvidenceStrength, name="evidence_strength"), nullable=False
    )
    data_completeness_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    signal_count: Mapped[int] = mapped_column(BigInteger, nullable=False)
    predicted_delay_days: Mapped[float | None] = mapped_column(Numeric(7, 1), nullable=True)
    delay_risk: Mapped[str | None] = mapped_column(String(10), nullable=True)
    overrun_risk: Mapped[str | None] = mapped_column(String(10), nullable=True)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    model_version_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("model_versions.id"), nullable=False)


class RiskFactor(TimestampMixin, Base):
    __tablename__ = "risk_factors"

    assessment_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("risk_assessments.id"), nullable=False, index=True
    )
    factor_type: Mapped[str] = mapped_column(String(40), nullable=False)
    contribution: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)  # points added
    severity: Mapped[Severity] = mapped_column(Enum(Severity, name="severity"), nullable=False)
    evidence: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    source_ref: Mapped[str | None] = mapped_column(String(60), nullable=True)  # e.g. anomaly_results:123


class AIAssessment(TimestampMixin, Base):
    """Append-only snapshot log — answers 'why did the AI say X at time T'."""

    __tablename__ = "ai_assessments"

    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id"), nullable=False, index=True)
    score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    level: Mapped[str] = mapped_column(String(10), nullable=False)
    signals: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    model_version_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("model_versions.id"), nullable=False)


class Alert(TimestampMixin, Base):
    __tablename__ = "alerts"
    __table_args__ = (Index("ix_alerts_status_severity", "status", "severity"),)

    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id"), nullable=False, index=True)
    severity: Mapped[Severity] = mapped_column(Enum(Severity, name="severity"), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    prev_score: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    curr_score: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    assigned_role: Mapped[str | None] = mapped_column(String(20), nullable=True)
