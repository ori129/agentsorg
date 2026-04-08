"""add portfolio trend history: KPI snapshots in sync_logs + gpt_score_history table

Revision ID: 017
Revises: 016
Create Date: 2026-04-03
"""

from alembic import op
import sqlalchemy as sa

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── KPI snapshot columns on sync_logs ────────────────────────────────────
    # Written at end of every pipeline run. Powers the Portfolio Health timeline.
    op.add_column(
        "sync_logs", sa.Column("avg_quality_score", sa.Float(), nullable=True)
    )
    op.add_column(
        "sync_logs", sa.Column("avg_adoption_score", sa.Float(), nullable=True)
    )
    op.add_column("sync_logs", sa.Column("avg_risk_score", sa.Float(), nullable=True))
    op.add_column(
        "sync_logs",
        sa.Column("champion_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "sync_logs",
        sa.Column("hidden_gem_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "sync_logs",
        sa.Column(
            "scaled_risk_count", sa.Integer(), nullable=False, server_default="0"
        ),
    )
    op.add_column(
        "sync_logs",
        sa.Column("retirement_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "sync_logs",
        sa.Column(
            "ghost_asset_count", sa.Integer(), nullable=False, server_default="0"
        ),
    )
    op.add_column(
        "sync_logs",
        sa.Column("high_risk_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "sync_logs",
        sa.Column(
            "total_asset_count", sa.Integer(), nullable=False, server_default="0"
        ),
    )

    # ── gpt_score_history: one row per (asset × sync) ────────────────────────
    # Append-only. Never overwritten. The longitudinal asset journey lives here.
    op.create_table(
        "gpt_score_history",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "gpt_id",
            sa.String(255),
            sa.ForeignKey("gpts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "sync_log_id",
            sa.Integer(),
            sa.ForeignKey("sync_logs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "synced_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("quality_score", sa.Float(), nullable=True),
        sa.Column("adoption_score", sa.Float(), nullable=True),
        sa.Column("risk_score", sa.Float(), nullable=True),
        sa.Column("quadrant_label", sa.String(30), nullable=True),
    )
    op.create_index(
        "ix_gpt_score_history_gpt_synced", "gpt_score_history", ["gpt_id", "synced_at"]
    )
    op.create_index(
        "ix_gpt_score_history_sync_log", "gpt_score_history", ["sync_log_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_gpt_score_history_sync_log", "gpt_score_history")
    op.drop_index("ix_gpt_score_history_gpt_synced", "gpt_score_history")
    op.drop_table("gpt_score_history")
    for col in [
        "avg_quality_score",
        "avg_adoption_score",
        "avg_risk_score",
        "champion_count",
        "hidden_gem_count",
        "scaled_risk_count",
        "retirement_count",
        "ghost_asset_count",
        "high_risk_count",
        "total_asset_count",
    ]:
        op.drop_column("sync_logs", col)
