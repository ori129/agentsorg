"""Add password_hash and password_temp to workspace_users

Revision ID: 010
Revises: 009
Create Date: 2026-03-15

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "workspace_users",
        sa.Column("password_hash", sa.Text(), nullable=True),
    )
    op.add_column(
        "workspace_users",
        sa.Column(
            "password_temp",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("workspace_users", "password_temp")
    op.drop_column("workspace_users", "password_hash")
