"""add conversation intelligence tables and config columns

Revision ID: 015
Revises: 014
Create Date: 2026-03-25
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── conversation_events ──────────────────────────────────────────────────
    # One row per JSONL event (one message). Used for dedup, counts, and user linkage.
    # Raw message content is NEVER stored.
    op.create_table(
        "conversation_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("event_id", sa.String(255), nullable=False, unique=True),
        sa.Column("conversation_id", sa.String(255), nullable=False),
        sa.Column(
            "asset_id",
            sa.String(255),
            sa.ForeignKey("gpts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("user_email", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "synced_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_conversation_events_asset_id", "conversation_events", ["asset_id"]
    )
    op.create_index(
        "ix_conversation_events_created_at", "conversation_events", ["created_at"]
    )
    op.create_index(
        "ix_conversation_events_user_email", "conversation_events", ["user_email"]
    )

    # ── asset_usage_insights ─────────────────────────────────────────────────
    # One row per (asset, analysis run). Stores aggregated LLM-derived insights.
    op.create_table(
        "asset_usage_insights",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "asset_id",
            sa.String(255),
            sa.ForeignKey("gpts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("date_range_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("date_range_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("conversation_count", sa.Integer(), default=0, nullable=False),
        sa.Column("unique_user_count", sa.Integer(), default=0, nullable=False),
        sa.Column("avg_messages_per_conversation", sa.Float(), nullable=True),
        sa.Column("top_topics", JSONB, nullable=True),
        sa.Column("task_distribution", JSONB, nullable=True),
        sa.Column("drift_alert", sa.Text(), nullable=True),
        sa.Column("knowledge_gap_signals", JSONB, nullable=True),
        sa.Column("prompting_quality_from_messages", sa.Float(), nullable=True),
        sa.Column(
            "analyzed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("tokens_used", sa.Integer(), default=0, nullable=False),
        sa.Column("cost_usd", sa.Float(), nullable=True),
        sa.Column("privacy_level", sa.Integer(), default=3, nullable=False),
    )
    op.create_index(
        "ix_asset_usage_insights_asset_id", "asset_usage_insights", ["asset_id"]
    )
    op.create_index(
        "ix_asset_usage_insights_analyzed_at", "asset_usage_insights", ["analyzed_at"]
    )

    # ── user_usage_insights ──────────────────────────────────────────────────
    # Level-3 only. One row per (asset, user_email).
    op.create_table(
        "user_usage_insights",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "asset_id",
            sa.String(255),
            sa.ForeignKey("gpts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_email", sa.String(255), nullable=False),
        sa.Column("user_department", sa.String(255), nullable=True),
        sa.Column("conversation_count", sa.Integer(), default=0, nullable=False),
        sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("avg_messages_per_conversation", sa.Float(), nullable=True),
        sa.Column("prompting_quality_score", sa.Float(), nullable=True),
        sa.Column("primary_use_cases", JSONB, nullable=True),
        sa.Column("role_fit_score", sa.Float(), nullable=True),
        sa.Column(
            "analyzed_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_user_usage_insights_asset_id", "user_usage_insights", ["asset_id"]
    )
    op.create_index(
        "ix_user_usage_insights_user_email", "user_usage_insights", ["user_email"]
    )

    # ── conversation_sync_logs ───────────────────────────────────────────────
    op.create_table(
        "conversation_sync_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(30), default="running", nullable=False),
        sa.Column("date_range_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("date_range_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("privacy_level", sa.Integer(), nullable=True),
        sa.Column("events_fetched", sa.Integer(), default=0, nullable=False),
        sa.Column("events_processed", sa.Integer(), default=0, nullable=False),
        sa.Column("assets_covered", sa.Integer(), default=0, nullable=False),
        sa.Column("assets_analyzed", sa.Integer(), default=0, nullable=False),
        sa.Column("assets_skipped_unchanged", sa.Integer(), default=0, nullable=False),
        sa.Column("skipped_events", sa.Integer(), default=0, nullable=False),
        sa.Column("estimated_cost_usd", sa.Float(), nullable=True),
        sa.Column("actual_cost_usd", sa.Float(), nullable=True),
        sa.Column("tokens_input", sa.Integer(), default=0, nullable=False),
        sa.Column("tokens_output", sa.Integer(), default=0, nullable=False),
        sa.Column("errors", JSONB, nullable=True),
    )

    # ── configuration columns ────────────────────────────────────────────────
    op.add_column(
        "configurations",
        sa.Column(
            "conversation_privacy_level", sa.Integer(), nullable=False, server_default="3"
        ),
    )
    op.add_column(
        "configurations",
        sa.Column(
            "conversation_date_range_days",
            sa.Integer(),
            nullable=False,
            server_default="30",
        ),
    )
    op.add_column(
        "configurations",
        sa.Column(
            "conversation_token_budget_usd",
            sa.Float(),
            nullable=False,
            server_default="10.0",
        ),
    )
    op.add_column(
        "configurations",
        sa.Column("conversation_asset_scope", JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("configurations", "conversation_asset_scope")
    op.drop_column("configurations", "conversation_token_budget_usd")
    op.drop_column("configurations", "conversation_date_range_days")
    op.drop_column("configurations", "conversation_privacy_level")

    op.drop_table("conversation_sync_logs")
    op.drop_table("user_usage_insights")
    op.drop_table("asset_usage_insights")
    op.drop_table("conversation_events")
