"""enterprise auth: oidc providers, audit log, cookie sessions

Revision ID: 020
Revises: 019
Create Date: 2026-04-10
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- oidc_providers ---------------------------------------------------
    op.create_table(
        "oidc_providers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("issuer_url", sa.String(512), nullable=False),
        sa.Column("client_id", sa.String(255), nullable=False),
        sa.Column("client_secret_encrypted", sa.Text(), nullable=True),
        sa.Column("authorization_endpoint", sa.String(512), nullable=True),
        sa.Column("token_endpoint", sa.String(512), nullable=True),
        sa.Column("userinfo_endpoint", sa.String(512), nullable=True),
        sa.Column("jwks_uri", sa.String(512), nullable=True),
        sa.Column("scopes", sa.String(255), nullable=False, server_default="openid email profile"),
        sa.Column("email_claim", sa.String(100), nullable=False, server_default="email"),
        sa.Column("name_claim", sa.String(100), nullable=False, server_default="name"),
        sa.Column("groups_claim", sa.String(100), nullable=True),
        sa.Column("role_mapping_json", JSONB, nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("enforce_sso", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("allow_password_login", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # --- oidc_states (short-lived PKCE state) ------------------------------
    op.create_table(
        "oidc_states",
        sa.Column("state_key", sa.String(128), primary_key=True),
        sa.Column(
            "provider_id",
            sa.Integer(),
            sa.ForeignKey("oidc_providers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code_verifier", sa.String(256), nullable=False),
        sa.Column("redirect_uri", sa.String(512), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )

    # --- audit_log_entries -------------------------------------------------
    op.create_table(
        "audit_log_entries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("actor_user_id", sa.String(255), nullable=True),
        sa.Column("actor_email", sa.String(255), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("target_type", sa.String(50), nullable=True),
        sa.Column("target_id", sa.String(255), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="success"),
        sa.Column("metadata_json", JSONB, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("session_id", sa.String(64), nullable=True),
    )
    op.create_index("ix_audit_log_action", "audit_log_entries", ["action"])
    op.create_index("ix_audit_log_actor", "audit_log_entries", ["actor_user_id"])
    op.create_index("ix_audit_log_timestamp", "audit_log_entries", ["timestamp"])

    # --- extend login_sessions --------------------------------------------
    op.add_column(
        "login_sessions",
        sa.Column(
            "auth_method",
            sa.String(20),
            nullable=False,
            server_default="password",
        ),
    )
    op.add_column(
        "login_sessions",
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )

    # --- extend workspace_users -------------------------------------------
    op.add_column(
        "workspace_users",
        sa.Column(
            "auth_source",
            sa.String(20),
            nullable=False,
            server_default="local",
        ),
    )
    op.add_column(
        "workspace_users",
        sa.Column("external_subject", sa.String(255), nullable=True),
    )
    op.add_column(
        "workspace_users",
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("workspace_users", "last_login_at")
    op.drop_column("workspace_users", "external_subject")
    op.drop_column("workspace_users", "auth_source")
    op.drop_column("login_sessions", "revoked_at")
    op.drop_column("login_sessions", "auth_method")
    op.drop_index("ix_audit_log_timestamp", "audit_log_entries")
    op.drop_index("ix_audit_log_actor", "audit_log_entries")
    op.drop_index("ix_audit_log_action", "audit_log_entries")
    op.drop_table("audit_log_entries")
    op.drop_table("oidc_states")
    op.drop_table("oidc_providers")
