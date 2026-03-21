"""Add token tracking to sync_logs and auto-sync config to configurations

Revision ID: 013
Revises: 012
Create Date: 2026-03-21

sync_logs: tokens_input, tokens_output, estimated_cost_usd — per-run LLM cost tracking
configurations: auto_sync_enabled, auto_sync_interval_hours — background scheduler config
"""

from alembic import op
import sqlalchemy as sa

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Token tracking on sync_logs
    op.add_column("sync_logs", sa.Column("tokens_input", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("sync_logs", sa.Column("tokens_output", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("sync_logs", sa.Column("estimated_cost_usd", sa.Numeric(precision=10, scale=6), nullable=True))

    # Auto-sync config on configurations
    op.add_column("configurations", sa.Column("auto_sync_enabled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("configurations", sa.Column("auto_sync_interval_hours", sa.Integer(), nullable=False, server_default="24"))


def downgrade() -> None:
    op.drop_column("sync_logs", "tokens_input")
    op.drop_column("sync_logs", "tokens_output")
    op.drop_column("sync_logs", "estimated_cost_usd")
    op.drop_column("configurations", "auto_sync_enabled")
    op.drop_column("configurations", "auto_sync_interval_hours")
