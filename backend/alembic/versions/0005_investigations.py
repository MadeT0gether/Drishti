"""M06 investigation layer: investigations, investigation_actions, guideline_chunks

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-25

"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

investigation_status = postgresql.ENUM(
    "open", "in_progress", "pending_info", "closed", "dismissed",
    name="investigation_status", create_type=False)
investigation_outcome = postgresql.ENUM(
    "verified_issue", "no_issue_found", "data_corrected", "escalated", "inconclusive",
    name="investigation_outcome", create_type=False)


def upgrade() -> None:
    investigation_status.create(op.get_bind(), checkfirst=True)
    investigation_outcome.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "investigations",
        sa.Column("case_number", sa.String(length=20), nullable=False),
        sa.Column("project_id", sa.BigInteger(), nullable=False),
        sa.Column("alert_id", sa.BigInteger(), nullable=True),
        sa.Column("status", investigation_status, nullable=False),
        sa.Column("priority_score", sa.Numeric(6, 2), nullable=False),
        sa.Column("priority_breakdown", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("risk_assessment_id", sa.BigInteger(), nullable=True),
        sa.Column("assigned_to_id", sa.BigInteger(), nullable=True),
        sa.Column("opened_by_id", sa.BigInteger(), nullable=False),
        sa.Column("sla_due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("outcome", investigation_outcome, nullable=True),
        sa.Column("outcome_note", sa.Text(), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"]),
        sa.ForeignKeyConstraint(["alert_id"], ["alerts.id"]),
        sa.ForeignKeyConstraint(["risk_assessment_id"], ["risk_assessments.id"]),
        sa.ForeignKeyConstraint(["assigned_to_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["opened_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("case_number"),
    )
    op.create_index("ix_investigations_project", "investigations", ["project_id"])
    op.create_index("ix_investigations_status_sla", "investigations", ["status", "sla_due_at"])
    op.create_index("ix_investigations_alert", "investigations", ["alert_id"])
    op.create_index(
        "uq_investigations_active_project", "investigations", ["project_id"], unique=True,
        postgresql_where=sa.text("status NOT IN ('closed', 'dismissed')"))

    op.create_table(
        "investigation_actions",
        sa.Column("investigation_id", sa.BigInteger(), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("action_type", sa.String(length=40), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("from_status", sa.String(length=20), nullable=True),
        sa.Column("to_status", sa.String(length=20), nullable=True),
        sa.Column("detail", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["investigation_id"], ["investigations.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_investigation_actions_case", "investigation_actions",
                    ["investigation_id", "created_at"])

    op.create_table(
        "guideline_chunks",
        sa.Column("doc_name", sa.String(length=120), nullable=False),
        sa.Column("section", sa.String(length=120), nullable=False),
        sa.Column("chunk_text", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(384), nullable=True),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("checksum"),
    )
    # ivfflat index created by the seeding script once rows exist (ivfflat on an
    # empty table produces a useless clustering, same approach as projects).


def downgrade() -> None:
    op.drop_table("guideline_chunks")
    op.drop_index("ix_investigation_actions_case", table_name="investigation_actions")
    op.drop_table("investigation_actions")
    op.drop_index("uq_investigations_active_project", table_name="investigations")
    op.drop_index("ix_investigations_alert", table_name="investigations")
    op.drop_index("ix_investigations_status_sla", table_name="investigations")
    op.drop_index("ix_investigations_project", table_name="investigations")
    op.drop_table("investigations")
    investigation_outcome.drop(op.get_bind(), checkfirst=True)
    investigation_status.drop(op.get_bind(), checkfirst=True)
