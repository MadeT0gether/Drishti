"""Citizen Issue Report model for the DRISHTI Public Transparency Portal.

Allows citizens and viewers to submit ground-level discrepancy reports on projects,
including photo evidence, GPS/EXIF metadata, observation descriptions, and
reporter details (restricted).

Responsible-AI & Governance Principles:
- Citizen reports are strictly isolated from official project records.
- Submitting a report never mutates official data.
- Reporter details are classified and only visible to authorized officials.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin


class CitizenReport(TimestampMixin, Base):
    """Citizen-submitted issue reports and observations."""

    __tablename__ = "citizen_reports"

    # Reference ID e.g. DRISHTI-A1B2C3
    reference_id: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)

    # Issue Category / Type:
    # 'incorrect_info' | 'project_missing' | 'work_not_happening' |
    # 'work_incomplete' | 'incorrect_location' | 'funding_concern' | 'other'
    issue_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    # Project association (optional / nullable if project is missing from DB)
    project_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    custom_project_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Location Information
    state_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("states.id", ondelete="SET NULL"), nullable=True, index=True
    )
    district_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("districts.id", ondelete="SET NULL"), nullable=True, index=True
    )
    village_locality: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # Citizen Observation Details
    description: Mapped[str] = mapped_column(Text, nullable=False)

    # Photo & Location Evidence (JSON array of uploaded photo metadata and URLs/paths)
    photos: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    latitude: Mapped[Optional[float]] = mapped_column(Numeric(10, 7), nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Numeric(10, 7), nullable=True)
    location_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    observation_datetime: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Reporter Details (Confidential / Classified for government follow-up only)
    reporter_name: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    reporter_mobile: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    reporter_email: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    reporter_relationship: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )  # 'resident' | 'beneficiary' | 'community_member' | 'worker' | 'other'

    # Review Lifecycle:
    # 'submitted' -> 'under_review' -> 'verification_required' -> 'resolved' | 'dismissed'
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="submitted", index=True)
    assigned_to_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    resolution_remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    project = relationship("Project", foreign_keys=[project_id])
    state = relationship("State", foreign_keys=[state_id])
    district = relationship("District", foreign_keys=[district_id])
    assigned_to = relationship("User", foreign_keys=[assigned_to_id])
