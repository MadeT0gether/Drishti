"""M06 investigation-layer tables.

investigations         — one case per project (at most one active at a time).
investigation_actions  — append-only human action log (the action/reason model).
guideline_chunks       — approved guideline excerpts for Copilot retrieval
                         (pgvector, same 384-d space/backends as project embeddings).

Playbooks are versioned JSON files (app/investigation/playbooks/), not a table:
they are curated developer-edited content; per-case progress is recorded in
investigation_actions (action_type=playbook_step_completed).
"""
import enum

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class InvestigationStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    pending_info = "pending_info"
    closed = "closed"
    dismissed = "dismissed"


class InvestigationOutcome(str, enum.Enum):
    """Neutral dispositions — never a finding of fraud/guilt (responsible-AI rule)."""

    verified_issue = "verified_issue"
    no_issue_found = "no_issue_found"
    data_corrected = "data_corrected"
    escalated = "escalated"
    inconclusive = "inconclusive"


# Closed set of action types (String column + service validation, so adding a
# type never needs an enum migration).
ACTION_TYPES = {
    "opened",
    "assigned",
    "status_changed",
    "note_added",
    "evidence_reviewed",
    "info_requested",
    "playbook_step_completed",
    "copilot_queried",
    "copilot_summary_accepted",
    "copilot_summary_rejected",
    "summary_updated",
    "outcome_recorded",
    "reopened",
    "report_generated",
}


class Investigation(TimestampMixin, Base):
    __tablename__ = "investigations"
    __table_args__ = (
        Index("ix_investigations_status_sla", "status", "sla_due_at"),
        Index("ix_investigations_alert", "alert_id"),
        # one ACTIVE case per project (closed/dismissed cases don't block a new one)
        Index(
            "uq_investigations_active_project",
            "project_id",
            unique=True,
            postgresql_where=text("status NOT IN ('closed', 'dismissed')"),
        ),
    )

    case_number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id"), nullable=False, index=True)
    alert_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("alerts.id"), nullable=True)
    status: Mapped[InvestigationStatus] = mapped_column(
        Enum(InvestigationStatus, name="investigation_status"), nullable=False,
        default=InvestigationStatus.open)
    # priority frozen at open time (queue recomputes live; the case records what
    # was true at triage — reproducibility of "why was this prioritized")
    priority_score: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    priority_breakdown: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # pins the exact assessment snapshot the case was opened against
    risk_assessment_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("risk_assessments.id"), nullable=True)
    assigned_to_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)
    opened_by_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    sla_due_at = mapped_column(DateTime(timezone=True), nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    outcome: Mapped[InvestigationOutcome | None] = mapped_column(
        Enum(InvestigationOutcome, name="investigation_outcome"), nullable=True)
    outcome_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    closed_at = mapped_column(DateTime(timezone=True), nullable=True)


class InvestigationAction(TimestampMixin, Base):
    """Append-only — the service never updates or deletes rows here."""

    __tablename__ = "investigation_actions"
    __table_args__ = (Index("ix_investigation_actions_case", "investigation_id", "created_at"),)

    investigation_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("investigations.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    action_type: Mapped[str] = mapped_column(String(40), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    detail: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class GuidelineChunk(TimestampMixin, Base):
    __tablename__ = "guideline_chunks"

    doc_name: Mapped[str] = mapped_column(String(120), nullable=False)
    section: Mapped[str] = mapped_column(String(120), nullable=False)
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding = mapped_column(Vector(384), nullable=True)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
