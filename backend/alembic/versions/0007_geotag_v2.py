"""M09 GeoTag-1 v2: add officer_review, review_status, reviewed_at, reviewed_by_id

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-29
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("geotag_evidence", sa.Column("officer_review", sa.Text(), nullable=True))
    op.add_column("geotag_evidence", sa.Column("review_status", sa.String(length=20), server_default="pending_review", nullable=False))
    op.add_column("geotag_evidence", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("geotag_evidence", sa.Column("reviewed_by_id", sa.BigInteger(), nullable=True))
    
    op.create_foreign_key("fk_geotag_evidence_reviewed_by", "geotag_evidence", "users", ["reviewed_by_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_geotag_evidence_review_status", "geotag_evidence", ["review_status"])
    op.create_index("ix_geotag_evidence_reviewed_by", "geotag_evidence", ["reviewed_by_id"])


def downgrade() -> None:
    op.drop_index("ix_geotag_evidence_reviewed_by", table_name="geotag_evidence")
    op.drop_index("ix_geotag_evidence_review_status", table_name="geotag_evidence")
    op.drop_constraint("fk_geotag_evidence_reviewed_by", "geotag_evidence", type_="foreignkey")
    op.drop_column("geotag_evidence", "reviewed_by_id")
    op.drop_column("geotag_evidence", "reviewed_at")
    op.drop_column("geotag_evidence", "review_status")
    op.drop_column("geotag_evidence", "officer_review")
