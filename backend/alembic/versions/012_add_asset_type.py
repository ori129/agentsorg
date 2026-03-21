"""Add asset_type to gpts table for Project support

Revision ID: 012
Revises: 011
Create Date: 2026-03-17

asset_type: 'gpt' | 'project' — allows the gpts table to store both
Custom GPTs and OpenAI Projects as a unified asset registry.

conversation_count / last_conversation_at: placeholders for Phase 2
Conversation Intelligence (populated when the Conversations API is added).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "gpts",
        sa.Column(
            "asset_type",
            sa.String(32),
            nullable=False,
            server_default="gpt",
        ),
    )
    op.add_column(
        "gpts",
        sa.Column("conversation_count", sa.Integer, nullable=False, server_default="0"),
    )
    op.add_column(
        "gpts",
        sa.Column(
            "last_conversation_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.create_index("ix_gpts_asset_type", "gpts", ["asset_type"])


def downgrade() -> None:
    op.drop_index("ix_gpts_asset_type", table_name="gpts")
    op.drop_column("gpts", "last_conversation_at")
    op.drop_column("gpts", "conversation_count")
    op.drop_column("gpts", "asset_type")
