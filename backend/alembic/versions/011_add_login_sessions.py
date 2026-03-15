"""Add login_sessions table

Revision ID: 011
Revises: 010
Create Date: 2026-03-15

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "login_sessions",
        sa.Column("token", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["workspace_users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("token"),
    )
    op.create_index(
        "ix_login_sessions_expires_at",
        "login_sessions",
        ["expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_login_sessions_expires_at", table_name="login_sessions")
    op.drop_table("login_sessions")
