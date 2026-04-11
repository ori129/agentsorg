"""021 security hardening: TOTP MFA, token_type on login_sessions

Revision ID: 021_security_hardening
Revises: 020_enterprise_auth
Create Date: 2026-04-11
"""

from alembic import op
import sqlalchemy as sa

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # TOTP columns on workspace_users
    op.add_column("workspace_users", sa.Column("totp_secret_encrypted", sa.Text(), nullable=True))
    op.add_column("workspace_users", sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default="false"))

    # token_type on login_sessions — distinguishes browser sessions from API tokens
    op.add_column(
        "login_sessions",
        sa.Column("token_type", sa.String(10), nullable=False, server_default="session"),
    )


def downgrade() -> None:
    op.drop_column("workspace_users", "totp_secret_encrypted")
    op.drop_column("workspace_users", "totp_enabled")
    op.drop_column("login_sessions", "token_type")
