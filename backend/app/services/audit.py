"""Centralized audit logging for auth and privileged actions.

Never depends on application logs alone. Always writes to audit_log_entries.
All writes fire-and-forget — do NOT await inside request handlers unless you
explicitly need the row flushed before returning.
"""

import logging
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.encryption import mask_email
from app.models.models import AuditLogEntry

logger = logging.getLogger(__name__)

# ── Action constants ─────────────────────────────────────────────────────────
# Auth
AUTH_REGISTER = "auth.register"
AUTH_LOGIN_SUCCESS = "auth.login.success"
AUTH_LOGIN_FAILURE = "auth.login.failure"
AUTH_LOGOUT = "auth.logout"
AUTH_SESSION_REVOKED = "auth.session.revoked"
AUTH_PASSWORD_CHANGED = "auth.password.changed"
AUTH_OIDC_LOGIN_SUCCESS = "auth.oidc.login.success"
AUTH_OIDC_LOGIN_FAILURE = "auth.oidc.login.failure"

# OIDC provider management (admin)
OIDC_PROVIDER_CREATED = "oidc.provider.created"
OIDC_PROVIDER_UPDATED = "oidc.provider.updated"
OIDC_PROVIDER_DISABLED = "oidc.provider.disabled"
OIDC_SSO_ENFORCED = "oidc.sso.enforced"
OIDC_SSO_UNENFORCED = "oidc.sso.unenforced"
OIDC_PASSWORD_LOGIN_DISABLED = "oidc.password_login.disabled"
OIDC_PASSWORD_LOGIN_ENABLED = "oidc.password_login.enabled"

# User management (admin)
USER_ROLE_CHANGED = "user.role.changed"
USER_PASSWORD_RESET = "user.password.reset"
USER_INVITED = "user.invited"

# Control plane
PIPELINE_STARTED = "pipeline.started"
CONVERSATION_PIPELINE_STARTED = "conversation.pipeline.started"
DEMO_MODE_TOGGLED = "demo.mode.toggled"
# ─────────────────────────────────────────────────────────────────────────────


def _get_client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _get_user_agent(request: Request | None) -> str | None:
    if request is None:
        return None
    return request.headers.get("User-Agent", "")[:512]


async def log_event(
    db: AsyncSession,
    action: str,
    *,
    actor_user_id: str | None = None,
    actor_email: str | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    status: str = "success",
    metadata: dict[str, Any] | None = None,
    request: Request | None = None,
    session_id: str | None = None,
) -> None:
    """Write one audit event. Safe to call without awaiting — fires within the
    current transaction. Caller must commit for the row to persist.

    actor_email is automatically masked in application logs but stored plaintext
    in the audit table for query purposes. Never store passwords or tokens in metadata.
    """
    try:
        entry = AuditLogEntry(
            action=action,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
            target_type=target_type,
            target_id=target_id,
            status=status,
            metadata_json=metadata,
            ip_address=_get_client_ip(request),
            user_agent=_get_user_agent(request),
            session_id=session_id,
        )
        db.add(entry)
        logger.info(
            "audit action=%s actor=%s target=%s/%s status=%s",
            action,
            mask_email(actor_email) if actor_email else actor_user_id or "—",
            target_type or "—",
            target_id or "—",
            status,
        )
    except Exception:
        # Audit failure must never break the main request
        logger.exception("Failed to write audit event action=%s", action)
