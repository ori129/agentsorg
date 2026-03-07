"""Add semantic enrichment columns to gpts table

Revision ID: 003
Revises: 002
Create Date: 2026-03-03

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("gpts", sa.Column("business_process", sa.Text(), nullable=True))
    op.add_column("gpts", sa.Column("risk_flags", postgresql.JSONB(), nullable=True))
    op.add_column("gpts", sa.Column("risk_level", sa.String(10), nullable=True))
    op.add_column(
        "gpts", sa.Column("sophistication_score", sa.Integer(), nullable=True)
    )
    op.add_column(
        "gpts", sa.Column("sophistication_rationale", sa.Text(), nullable=True)
    )
    op.add_column(
        "gpts", sa.Column("prompting_quality_score", sa.Integer(), nullable=True)
    )
    op.add_column(
        "gpts", sa.Column("prompting_quality_flags", postgresql.JSONB(), nullable=True)
    )
    op.add_column("gpts", sa.Column("roi_potential_score", sa.Integer(), nullable=True))
    op.add_column("gpts", sa.Column("roi_rationale", sa.Text(), nullable=True))
    op.add_column("gpts", sa.Column("intended_audience", sa.Text(), nullable=True))
    op.add_column(
        "gpts", sa.Column("integration_flags", postgresql.JSONB(), nullable=True)
    )
    op.add_column("gpts", sa.Column("output_type", sa.String(50), nullable=True))
    op.add_column(
        "gpts", sa.Column("adoption_friction_score", sa.Integer(), nullable=True)
    )
    op.add_column(
        "gpts", sa.Column("adoption_friction_rationale", sa.Text(), nullable=True)
    )
    op.add_column(
        "gpts",
        sa.Column("semantic_enriched_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("gpts", "semantic_enriched_at")
    op.drop_column("gpts", "adoption_friction_rationale")
    op.drop_column("gpts", "adoption_friction_score")
    op.drop_column("gpts", "output_type")
    op.drop_column("gpts", "integration_flags")
    op.drop_column("gpts", "intended_audience")
    op.drop_column("gpts", "roi_rationale")
    op.drop_column("gpts", "roi_potential_score")
    op.drop_column("gpts", "prompting_quality_flags")
    op.drop_column("gpts", "prompting_quality_score")
    op.drop_column("gpts", "sophistication_rationale")
    op.drop_column("gpts", "sophistication_score")
    op.drop_column("gpts", "risk_level")
    op.drop_column("gpts", "risk_flags")
    op.drop_column("gpts", "business_process")
