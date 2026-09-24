"""GeoTag-1 evidence model.

Stores image evidence upload records including extracted EXIF/GPS metadata,
PDF generation status, and the full processing/verification status.
Responsible-AI principle: geo-data and processing signals are decision-support
only; they do not constitute findings of fraud or misconduct.
"""
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin


class GeoTagEvidence(TimestampMixin, Base):
    """Append-only record for each uploaded image evidence file."""

    __tablename__ = "geotag_evidence"

    # ── Project association (optional) ─────────────────────────────────────
    project_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    # ── File identity ────────────────────────────────────────────────────
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)

    # ── Storage paths (relative to backend root) ─────────────────────────
    upload_path: Mapped[str] = mapped_column(String(500), nullable=False)
    pdf_path: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # ── EXIF / GPS ────────────────────────────────────────────────────────
    exif_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    geo_available: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    latitude: Mapped[float | None] = mapped_column(Numeric(10, 7), nullable=True)
    longitude: Mapped[float | None] = mapped_column(Numeric(10, 7), nullable=True)
    exif_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # ── Processing status ─────────────────────────────────────────────────
    # Values: uploaded | processing | geo_available | geo_missing |
    #         verified | requires_review | failed
    processing_status: Mapped[str] = mapped_column(
        String(40), nullable=False, default="uploaded", index=True,
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(
        # DateTime with timezone; mirrors TimestampMixin pattern
        __import__("sqlalchemy").DateTime(timezone=True), nullable=True,
    )

    # ── Uploader ─────────────────────────────────────────────────────────
    uploaded_by_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"),
        nullable=False, index=True,
    )

    # ── Officer review / human-in-the-loop ───────────────────────────────
    officer_review: Mapped[str | None] = mapped_column(Text, nullable=True)
    review_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending_review", index=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        __import__("sqlalchemy").DateTime(timezone=True), nullable=True,
    )
    reviewed_by_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    # ── Relationships ─────────────────────────────────────────────────────
    project = relationship("Project", foreign_keys=[project_id])
    uploaded_by = relationship("User", foreign_keys=[uploaded_by_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])
