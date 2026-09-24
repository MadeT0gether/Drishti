"""M10 Citizen Reports: create citizen_reports table

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-29
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "citizen_reports",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("reference_id", sa.String(length=20), nullable=False, unique=True),
        sa.Column("issue_type", sa.String(length=50), nullable=False),
        sa.Column("project_id", sa.BigInteger(), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=True),
        sa.Column("custom_project_name", sa.String(length=255), nullable=True),
        sa.Column("state_id", sa.BigInteger(), sa.ForeignKey("states.id", ondelete="SET NULL"), nullable=True),
        sa.Column("district_id", sa.BigInteger(), sa.ForeignKey("districts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("village_locality", sa.String(length=200), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("photos", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("latitude", sa.Numeric(10, 7), nullable=True),
        sa.Column("longitude", sa.Numeric(10, 7), nullable=True),
        sa.Column("location_confirmed", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("observation_datetime", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reporter_name", sa.String(length=150), nullable=True),
        sa.Column("reporter_mobile", sa.String(length=30), nullable=True),
        sa.Column("reporter_email", sa.String(length=150), nullable=True),
        sa.Column("reporter_relationship", sa.String(length=50), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="submitted"),
        sa.Column("assigned_to_id", sa.BigInteger(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("resolution_remarks", sa.Text(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_citizen_reports_ref", "citizen_reports", ["reference_id"], unique=True)
    op.create_index("ix_citizen_reports_issue_type", "citizen_reports", ["issue_type"])
    op.create_index("ix_citizen_reports_project_id", "citizen_reports", ["project_id"])
    op.create_index("ix_citizen_reports_state_id", "citizen_reports", ["state_id"])
    op.create_index("ix_citizen_reports_district_id", "citizen_reports", ["district_id"])
    op.create_index("ix_citizen_reports_status", "citizen_reports", ["status"])
    op.create_index("ix_citizen_reports_assigned_to_id", "citizen_reports", ["assigned_to_id"])


def downgrade() -> None:
    op.drop_table("citizen_reports")
