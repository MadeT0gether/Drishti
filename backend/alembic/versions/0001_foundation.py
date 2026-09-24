"""Foundation: extensions, users, states, districts, constituencies, mps

Revision ID: 0001
Revises:
Create Date: 2026-08-24

"""
from alembic import op
import sqlalchemy as sa
import geoalchemy2

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

def _ts():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "states",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
        sa.Column("code", sa.String(10), nullable=False, unique=True),
        *_ts(),
    )

    op.create_table(
        "districts",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("state_id", sa.BigInteger(), sa.ForeignKey("states.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column(
            "centroid",
            geoalchemy2.Geography(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=True,
        ),
        sa.Column(
            "boundary",
            geoalchemy2.Geometry(geometry_type="MULTIPOLYGON", srid=4326, spatial_index=False),
            nullable=True,
        ),
        sa.UniqueConstraint("state_id", "name", name="uq_district_state_name"),
        *_ts(),
    )
    op.create_index("ix_districts_state_id", "districts", ["state_id"])
    op.execute("CREATE INDEX ix_districts_centroid ON districts USING gist (centroid)")

    constituency_type = sa.Enum("lok_sabha", "rajya_sabha", name="constituency_type")
    op.create_table(
        "constituencies",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("state_id", sa.BigInteger(), sa.ForeignKey("states.id"), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("type", constituency_type, nullable=False),
        sa.UniqueConstraint("state_id", "name", name="uq_constituency_state_name"),
        *_ts(),
    )
    op.create_index("ix_constituencies_state_id", "constituencies", ["state_id"])

    op.create_table(
        "mps",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("constituency_id", sa.BigInteger(), sa.ForeignKey("constituencies.id"), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("house", sa.String(20), nullable=False),
        sa.Column("term_start", sa.Date(), nullable=True),
        sa.Column("term_end", sa.Date(), nullable=True),
        *_ts(),
    )
    op.create_index("ix_mps_constituency_id", "mps", ["constituency_id"])

    user_role = sa.Enum("ministry", "state", "district", "mp", "officer", "viewer", name="user_role")
    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("state_id", sa.BigInteger(), sa.ForeignKey("states.id"), nullable=True),
        sa.Column("district_id", sa.BigInteger(), sa.ForeignKey("districts.id"), nullable=True),
        sa.Column("mp_id", sa.BigInteger(), sa.ForeignKey("mps.id"), nullable=True),
        *_ts(),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_role", "users", ["role"])


def downgrade() -> None:
    op.drop_table("users")
    op.drop_table("mps")
    op.drop_table("constituencies")
    op.drop_table("districts")
    op.drop_table("states")
    sa.Enum(name="user_role").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="constituency_type").drop(op.get_bind(), checkfirst=True)
