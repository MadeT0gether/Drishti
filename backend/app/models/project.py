import enum

from geoalchemy2 import Geography
from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin


class ProjectStatus(str, enum.Enum):
    recommended = "recommended"
    sanctioned = "sanctioned"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


class DataSource(str, enum.Enum):
    synthetic = "synthetic"
    csv_import = "csv_import"


class ProjectCategory(TimestampMixin, Base):
    __tablename__ = "project_categories"

    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    sector: Mapped[str] = mapped_column(String(50), nullable=False)
    typical_cost_min: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    typical_cost_max: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)


class ImplementingAgency(TimestampMixin, Base):
    __tablename__ = "implementing_agencies"

    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)  # panchayat/pwd/municipal/zilla_parishad
    district_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("districts.id"), nullable=False, index=True)


class Vendor(TimestampMixin, Base):
    __tablename__ = "vendors"

    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    registration_no: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    district_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("districts.id"), nullable=False, index=True)


class Project(TimestampMixin, Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint("physical_progress_pct >= 0 AND physical_progress_pct <= 100", name="ck_progress_range"),
        Index("ix_projects_district_status", "district_id", "status"),
        Index("ix_projects_category_fy", "category_id", "financial_year"),
        Index("ix_projects_planned_dates", "planned_start", "planned_end"),
    )

    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("project_categories.id"), nullable=False, index=True)
    mp_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("mps.id"), nullable=False, index=True)
    state_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("states.id"), nullable=False, index=True)
    district_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("districts.id"), nullable=False, index=True)
    constituency_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("constituencies.id"), nullable=False)
    agency_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("implementing_agencies.id"), nullable=False, index=True)
    vendor_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("vendors.id"), nullable=True, index=True)

    status: Mapped[ProjectStatus] = mapped_column(Enum(ProjectStatus, name="project_status"), nullable=False, index=True)
    recommended_cost: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    sanctioned_cost: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    revised_cost: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    expenditure: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    physical_progress_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=0)

    planned_start = mapped_column(Date, nullable=True)
    planned_end = mapped_column(Date, nullable=True)
    actual_start = mapped_column(Date, nullable=True)
    actual_end = mapped_column(Date, nullable=True)
    financial_year: Mapped[str] = mapped_column(String(10), nullable=False, index=True)

    description_embedding = mapped_column(Vector(384), nullable=True)
    data_source: Mapped[DataSource] = mapped_column(
        Enum(DataSource, name="data_source"), nullable=False, default=DataSource.synthetic
    )

    location = relationship("ProjectLocation", back_populates="project", uselist=False)


class ProjectLocation(TimestampMixin, Base):
    __tablename__ = "project_locations"

    project_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("projects.id"), nullable=False, unique=True
    )
    geom = mapped_column(Geography("POINT", srid=4326), nullable=True)
    village: Mapped[str | None] = mapped_column(String(120), nullable=True)
    address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    pincode: Mapped[str | None] = mapped_column(String(10), nullable=True)

    project = relationship("Project", back_populates="location")


class Recommendation(TimestampMixin, Base):
    __tablename__ = "recommendations"

    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id"), nullable=False, index=True)
    mp_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("mps.id"), nullable=False)
    date = mapped_column(Date, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)


class Sanction(TimestampMixin, Base):
    __tablename__ = "sanctions"

    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id"), nullable=False, index=True)
    sanction_no: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    date = mapped_column(Date, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    authority: Mapped[str] = mapped_column(String(120), nullable=False)


class Milestone(TimestampMixin, Base):
    __tablename__ = "milestones"
    __table_args__ = (UniqueConstraint("project_id", "seq", name="uq_milestone_project_seq"),)

    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id"), nullable=False, index=True)
    seq: Mapped[int] = mapped_column(BigInteger, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    planned_date = mapped_column(Date, nullable=False)
    actual_date = mapped_column(Date, nullable=True)
    weight_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # pending/completed/delayed


class ProgressUpdate(TimestampMixin, Base):
    __tablename__ = "progress_updates"

    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id"), nullable=False, index=True)
    date = mapped_column(Date, nullable=False, index=True)
    physical_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    remarks: Mapped[str | None] = mapped_column(String(300), nullable=True)


class Payment(TimestampMixin, Base):
    __tablename__ = "payments"
    __table_args__ = (Index("ix_payments_project_date", "project_id", "date"),)

    project_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("projects.id"), nullable=False)
    payment_ref: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    date = mapped_column(Date, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    payee_vendor_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("vendors.id"), nullable=True, index=True)
    mode: Mapped[str] = mapped_column(String(20), nullable=False)  # neft/rtgs/cheque
    kind: Mapped[str] = mapped_column(String(20), nullable=False)  # advance/milestone/final


class FinancialTransaction(TimestampMixin, Base):
    """PFMS-style ledger. project_code_raw is a STRING reference (not FK) by design —
    reconciliation mismatches depend on it being breakable."""

    __tablename__ = "financial_transactions"
    __table_args__ = (Index("ix_fin_txn_code_date", "project_code_raw", "date"),)

    txn_ref: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    project_code_raw: Mapped[str | None] = mapped_column(String(40), nullable=True)
    date = mapped_column(Date, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # release/payment/refund
    counterparty: Mapped[str | None] = mapped_column(String(200), nullable=True)


class PeerGroup(TimestampMixin, Base):
    """Populated by the ML pipeline in Milestone 03; schema created here."""

    __tablename__ = "peer_groups"
    __table_args__ = (
        UniqueConstraint("category_id", "state_id", "cost_band", "financial_year", name="uq_peer_group_dims"),
    )

    category_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("project_categories.id"), nullable=False)
    state_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("states.id"), nullable=False)
    cost_band: Mapped[str] = mapped_column(String(20), nullable=False)
    financial_year: Mapped[str] = mapped_column(String(10), nullable=False)
    stats: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)


class AnomalyGroundTruth(TimestampMixin, Base):
    """Ground-truth ledger of injected anomalies (and hard negatives).
    EVALUATION/DEBUGGING ONLY — never a feature input to ML models."""

    __tablename__ = "anomaly_ground_truth"
    __table_args__ = (Index("ix_agt_type_label", "anomaly_type", "ground_truth_label"),)

    project_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("projects.id"), nullable=True, index=True)
    related_project_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("projects.id"), nullable=True)
    anomaly_type: Mapped[str] = mapped_column(String(40), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False)  # low/medium/high
    ground_truth_label: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)  # False = hard negative
    injection_params: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    dataset_version: Mapped[str] = mapped_column(String(20), nullable=False)


class DatasetVersion(TimestampMixin, Base):
    __tablename__ = "dataset_versions"

    version: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    seed: Mapped[int] = mapped_column(BigInteger, nullable=False)
    n_projects: Mapped[int] = mapped_column(BigInteger, nullable=False)
    params: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
