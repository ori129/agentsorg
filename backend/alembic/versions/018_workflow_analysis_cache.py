"""add workflow_analysis_cache table

Revision ID: 018
Revises: 017
Create Date: 2026-04-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workflow_analysis_cache",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "conversation_sync_log_id",
            sa.Integer(),
            sa.ForeignKey("conversation_sync_logs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        # List of {name, status, reasoning, priority_action, priority_level}
        sa.Column("workflow_items", JSONB, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("workflow_analysis_cache")
