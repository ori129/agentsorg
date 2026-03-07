"""Initial schema with all 5 tables and pgvector

Revision ID: 001
Revises: None
Create Date: 2026-02-28

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # configurations (singleton)
    op.create_table(
        "configurations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.String(255)),
        sa.Column("compliance_api_key", sa.Text()),
        sa.Column(
            "base_url", sa.String(512), server_default="https://api.chatgpt.com/v1"
        ),
        sa.Column("openai_api_key", sa.Text()),
        sa.Column("classification_enabled", sa.Boolean(), server_default="false"),
        sa.Column("classification_model", sa.String(100), server_default="gpt-4o-mini"),
        sa.Column("max_categories_per_gpt", sa.Integer(), server_default="2"),
        sa.Column("visibility_filters", JSONB, server_default="{}"),
        sa.Column("include_all", sa.Boolean(), server_default="true"),
        sa.Column("min_shared_users", sa.Integer(), server_default="0"),
        sa.Column("excluded_emails", JSONB, server_default="[]"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
    )

    # categories
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(100), unique=True, nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("color", sa.String(7), server_default="#6B7280"),
        sa.Column("enabled", sa.Boolean(), server_default="true"),
        sa.Column("sort_order", sa.Integer(), server_default="0"),
    )

    # sync_logs
    op.create_table(
        "sync_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "started_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(20), server_default="running"),
        sa.Column("total_gpts_found", sa.Integer(), server_default="0"),
        sa.Column("gpts_after_filter", sa.Integer(), server_default="0"),
        sa.Column("gpts_classified", sa.Integer(), server_default="0"),
        sa.Column("gpts_embedded", sa.Integer(), server_default="0"),
        sa.Column("errors", JSONB, server_default="[]"),
        sa.Column("configuration_snapshot", JSONB),
    )

    # gpts
    op.create_table(
        "gpts",
        sa.Column("id", sa.String(255), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("instructions", sa.Text()),
        sa.Column("owner_email", sa.String(255)),
        sa.Column("builder_name", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("visibility", sa.String(50)),
        sa.Column("recipients", JSONB),
        sa.Column("shared_user_count", sa.Integer(), server_default="0"),
        sa.Column("tools", JSONB),
        sa.Column("files", JSONB),
        sa.Column("builder_categories", JSONB),
        sa.Column("conversation_starters", JSONB),
        sa.Column(
            "primary_category_id",
            sa.Integer(),
            sa.ForeignKey("categories.id", ondelete="SET NULL"),
        ),
        sa.Column(
            "secondary_category_id",
            sa.Integer(),
            sa.ForeignKey("categories.id", ondelete="SET NULL"),
        ),
        sa.Column("classification_confidence", sa.Float()),
        sa.Column("llm_summary", sa.Text()),
        sa.Column("sync_log_id", sa.Integer(), sa.ForeignKey("sync_logs.id")),
        sa.Column("indexed_at", sa.DateTime(timezone=True)),
    )

    # Add vector column separately (Alembic doesn't natively support pgvector type)
    op.execute("ALTER TABLE gpts ADD COLUMN embedding vector(1536)")

    # pipeline_log_entries
    op.create_table(
        "pipeline_log_entries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "sync_log_id", sa.Integer(), sa.ForeignKey("sync_logs.id"), nullable=False
        ),
        sa.Column(
            "timestamp", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
        sa.Column("level", sa.String(10), server_default="info"),
        sa.Column("message", sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("pipeline_log_entries")
    op.drop_table("gpts")
    op.drop_table("sync_logs")
    op.drop_table("categories")
    op.drop_table("configurations")
    op.execute("DROP EXTENSION IF EXISTS vector")
