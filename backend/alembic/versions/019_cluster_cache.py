"""persist clustering results to DB so they survive restarts

Revision ID: 019
Revises: 018
Create Date: 2026-04-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cluster_cache",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        # list[ClusterGroup] serialized as JSON
        sa.Column("results", JSONB, nullable=False),
        # list[{cluster_id, action, ...}] — decisions persist here too
        sa.Column("decisions", JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_table("cluster_cache")
