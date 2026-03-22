"""add purpose_fingerprint to gpts

Revision ID: 014
Revises: 013
Create Date: 2026-03-22
"""

from alembic import op
import sqlalchemy as sa

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("gpts", sa.Column("purpose_fingerprint", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("gpts", "purpose_fingerprint")
