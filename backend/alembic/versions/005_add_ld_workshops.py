"""Add L&D workshop tables

Revision ID: 005
Revises: 004
Create Date: 2026-03-05

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "workshops",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("event_date", sa.Date(), nullable=False),
        sa.Column("duration_hours", sa.Float(), nullable=True),
        sa.Column("facilitator", sa.String(200), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "workshop_participants",
        sa.Column("workshop_id", sa.Integer(), nullable=False),
        sa.Column("employee_email", sa.String(200), nullable=False),
        sa.ForeignKeyConstraint(
            ["workshop_id"], ["workshops.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("workshop_id", "employee_email"),
    )

    op.create_table(
        "workshop_gpt_tags",
        sa.Column("workshop_id", sa.Integer(), nullable=False),
        sa.Column("gpt_id", sa.String(255), nullable=False),
        sa.Column(
            "tagged_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["workshop_id"], ["workshops.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("workshop_id", "gpt_id"),
    )


def downgrade() -> None:
    op.drop_table("workshop_gpt_tags")
    op.drop_table("workshop_participants")
    op.drop_table("workshops")
