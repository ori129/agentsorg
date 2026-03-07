"""Add system_role column to workspace_users

Revision ID: 008
Revises: 007
Create Date: 2026-03-07

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "workspace_users",
        sa.Column(
            "system_role", sa.String(20), nullable=False, server_default="employee"
        ),
    )


def downgrade() -> None:
    op.drop_column("workspace_users", "system_role")
