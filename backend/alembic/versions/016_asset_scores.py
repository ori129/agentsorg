"""add asset scores, workspace recommendations, and learning cache tables

Revision ID: 016
Revises: 015
Create Date: 2026-03-28
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── LLM-assessed composite scores on gpts ────────────────────────────────
    op.add_column("gpts", sa.Column("quality_score", sa.Float(), nullable=True))
    op.add_column("gpts", sa.Column("quality_score_rationale", sa.Text(), nullable=True))
    op.add_column("gpts", sa.Column("quality_main_strength", sa.Text(), nullable=True))
    op.add_column("gpts", sa.Column("quality_main_weakness", sa.Text(), nullable=True))

    op.add_column("gpts", sa.Column("adoption_score", sa.Float(), nullable=True))
    op.add_column("gpts", sa.Column("adoption_score_rationale", sa.Text(), nullable=True))
    op.add_column("gpts", sa.Column("adoption_signal", sa.Text(), nullable=True))
    op.add_column("gpts", sa.Column("adoption_barrier", sa.Text(), nullable=True))

    op.add_column("gpts", sa.Column("risk_score", sa.Float(), nullable=True))
    op.add_column("gpts", sa.Column("risk_score_rationale", sa.Text(), nullable=True))
    op.add_column("gpts", sa.Column("risk_primary_driver", sa.Text(), nullable=True))
    op.add_column(
        "gpts",
        sa.Column("risk_urgency", sa.String(10), nullable=True),  # low|medium|high|critical
    )

    op.add_column(
        "gpts",
        sa.Column("quadrant_label", sa.String(30), nullable=True),
        # champion|hidden_gem|scaled_risk|retirement_candidate
    )
    op.add_column("gpts", sa.Column("top_action", sa.Text(), nullable=True))
    op.add_column("gpts", sa.Column("score_confidence", sa.String(10), nullable=True))  # low|medium|high
    op.add_column(
        "gpts",
        sa.Column("scores_assessed_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── workspace_recommendations ────────────────────────────────────────────
    # One row per pipeline run. Frontend reads the most recent row.
    op.create_table(
        "workspace_recommendations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "sync_log_id",
            sa.Integer(),
            sa.ForeignKey("sync_logs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("recommendations", JSONB(), nullable=False),  # list[PriorityAction]
        sa.Column("executive_summary", sa.Text(), nullable=True),  # P10 output
    )

    # ── org_learning_cache ───────────────────────────────────────────────────
    # Cached org-level L&D recommendations — one row per pipeline run.
    op.create_table(
        "org_learning_cache",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "sync_log_id",
            sa.Integer(),
            sa.ForeignKey("sync_logs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("skill_gaps", JSONB(), nullable=True),
        sa.Column("recommended_courses", JSONB(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
    )

    # ── employee_learning_cache ──────────────────────────────────────────────
    # One row per employee, upserted when rebuilt.
    op.create_table(
        "employee_learning_cache",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_email", sa.String(255), nullable=False),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("skill_gaps", JSONB(), nullable=True),
        sa.Column("recommended_courses", JSONB(), nullable=True),
        sa.Column("gap_summary", sa.Text(), nullable=True),
        sa.UniqueConstraint("user_email", name="uq_employee_learning_cache_email"),
    )


def downgrade() -> None:
    op.drop_table("employee_learning_cache")
    op.drop_table("org_learning_cache")
    op.drop_table("workspace_recommendations")

    for col in [
        "scores_assessed_at", "score_confidence", "top_action", "quadrant_label",
        "risk_urgency", "risk_primary_driver", "risk_score_rationale", "risk_score",
        "adoption_barrier", "adoption_signal", "adoption_score_rationale", "adoption_score",
        "quality_main_weakness", "quality_main_strength",
        "quality_score_rationale", "quality_score",
    ]:
        op.drop_column("gpts", col)
