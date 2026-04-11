"""Shared FastAPI auth dependencies used across routers.

Usage in endpoints:
    from app.auth_deps import require_auth, require_system_admin

    @router.get("/something")
    async def my_endpoint(
        current_user: WorkspaceUser = Depends(require_auth),
        db: AsyncSession = Depends(get_db),
    ):
        ...
"""

from datetime import datetime, timezone

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.models import LoginSession, WorkspaceUser

COOKIE_NAME = "session_token"


_BEARER_ONLY = object()  # sentinel: token came from Authorization header


async def _get_token(
    request: Request,
    authorization: str | None = Header(default=None),
) -> tuple[str | None, bool]:
    """Return (token, via_bearer).

    Cookie takes priority. Bearer header is accepted only for API tokens
    (token_type='api') — browser session tokens are rejected via Bearer to
    prevent XSS token-exfiltration attacks.
    """
    cookie_token = request.cookies.get(COOKIE_NAME)
    if cookie_token:
        return cookie_token, False
    if authorization and authorization.startswith("Bearer "):
        return authorization[7:], True
    return None, False


async def _resolve_session(
    token: str | None,
    db: AsyncSession,
    via_bearer: bool = False,
) -> LoginSession | None:
    if not token:
        return None
    result = await db.execute(
        select(LoginSession)
        .options(selectinload(LoginSession.user))
        .where(LoginSession.token == token)
    )
    session = result.scalar_one_or_none()
    if not session:
        return None
    if session.revoked_at is not None:
        return None
    if session.expires_at < datetime.now(timezone.utc):
        return None
    # Enforce: browser session tokens must not be used via Bearer header.
    # Only explicit API tokens (token_type='api') are accepted via Bearer.
    if via_bearer and session.token_type != "api":
        return None
    return session


async def get_current_user(
    token_info: tuple[str | None, bool] = Depends(_get_token),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceUser | None:
    """Resolve token to user, or return None if unauthenticated."""
    token, via_bearer = token_info
    session = await _resolve_session(token, db, via_bearer=via_bearer)
    return session.user if session else None


async def require_auth(
    token_info: tuple[str | None, bool] = Depends(_get_token),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceUser:
    """Validate session (cookie or api-token bearer) — any authenticated user.
    Raises 401 if not authenticated.
    """
    token, via_bearer = token_info
    session = await _resolve_session(token, db, via_bearer=via_bearer)
    if not session:
        raise HTTPException(status_code=401, detail="Authentication required")
    return session.user


async def require_system_admin(
    token_info: tuple[str | None, bool] = Depends(_get_token),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceUser:
    """Validate session and assert caller is system-admin.
    Raises 401 if not authenticated, 403 if authenticated but not admin.
    """
    token, via_bearer = token_info
    session = await _resolve_session(token, db, via_bearer=via_bearer)
    if not session:
        raise HTTPException(status_code=401, detail="Authentication required")
    if session.user.system_role != "system-admin":
        raise HTTPException(
            status_code=403, detail="Only system admins can perform this action"
        )
    return session.user


async def require_leader(
    token_info: tuple[str | None, bool] = Depends(_get_token),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceUser:
    """Validate session and assert caller is system-admin or ai-leader.
    Employees (system_role='employee') are rejected with 403.
    Use this for analytics and leader-view read endpoints.
    """
    token, via_bearer = token_info
    session = await _resolve_session(token, db, via_bearer=via_bearer)
    if not session:
        raise HTTPException(status_code=401, detail="Authentication required")
    if session.user.system_role not in ("system-admin", "ai-leader"):
        raise HTTPException(
            status_code=403, detail="Leader or admin access required"
        )
    return session.user
