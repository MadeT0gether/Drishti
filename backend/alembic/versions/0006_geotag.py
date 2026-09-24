"""M08 GeoTag-1: geotag_evidence table for image evidence verification

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-29
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "geotag_evidence",
        sa.Column("project_id", sa.BigInteger(), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("stored_filename", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("upload_path", sa.String(length=500), nullable=False),
        sa.Column("pdf_path", sa.String(length=500), nullable=True),
        sa.Column("exif_available", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("geo_available", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("latitude", sa.Numeric(10, 7), nullable=True),
        sa.Column("longitude", sa.Numeric(10, 7), nullable=True),
        sa.Column("exif_data", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("processing_status", sa.String(length=40), nullable=False, server_default="uploaded"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("uploaded_by_id", sa.BigInteger(), nullable=False),
        sa.Column("id", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_geotag_evidence_project", "geotag_evidence", ["project_id"])
    op.create_index("ix_geotag_evidence_uploaded_by", "geotag_evidence", ["uploaded_by_id"])
    op.create_index("ix_geotag_evidence_status", "geotag_evidence", ["processing_status"])
    op.create_index("ix_geotag_evidence_created", "geotag_evidence", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_geotag_evidence_created", table_name="geotag_evidence")
    op.drop_index("ix_geotag_evidence_status", table_name="geotag_evidence")
    op.drop_index("ix_geotag_evidence_uploaded_by", table_name="geotag_evidence")
    op.drop_index("ix_geotag_evidence_project", table_name="geotag_evidence")
    op.drop_table("geotag_evidence")
