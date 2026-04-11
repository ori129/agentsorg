import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import pyotp
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth_deps import COOKIE_NAME, require_auth
from app.auth_utils import hash_password, verify_password
from app.config import settings
from app.database import get_db
from app.encryption import decrypt, encrypt, mask_email
from app.models.models import LoginSession, OidcProvider, WorkspaceUser
from app.schemas.schemas import (
    AuthStatus,
    ChangePasswordRequest,
    CheckEmailResponse,
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    WorkspaceUserRead,
)
from app.services import audit

router = APIRouter(tags=["auth"])
logger = logging.getLogger(__name__)
limiter = Limiter(key_func=get_remote_address)

SESSION_TTL_DAYS = 30
_COOKIE_MAX_AGE = SESSION_TTL_DAYS * 86_400  # seconds


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _extract_bearer(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401, detail="Missing or invalid Authorization header"
        )
    return authorization[7:]


async def _get_valid_session(token: str, db: AsyncSession) -> LoginSession:
    result = await db.execute(
        select(LoginSession)
        .options(selectinload(LoginSession.user))
        .where(LoginSession.token == token)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    if session.revoked_at is not None:
        raise HTTPException(status_code=401, detail="Session revoked")
    if session.expires_at < datetime.now(timezone.utc):
        await db.delete(session)
        await db.commit()
        raise HTTPException(status_code=401, detail="Session expired")
    return session


async def _create_session(
    user_id: str,
    db: AsyncSession,
    auth_method: str = "password",
) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS)
    session = LoginSession(
        token=token,
        user_id=user_id,
        expires_at=expires_at,
        auth_method=auth_method,
    )
    db.add(session)
    await db.flush()
    return token


def _set_session_cookie(response: Response, token: str, max_age: int = _COOKIE_MAX_AGE) -> None:
    """Set the HttpOnly session cookie."""
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=max_age,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/auth/status", response_model=AuthStatus)
async def auth_status(db: AsyncSession = Depends(get_db)):
    count = await db.scalar(select(func.count()).select_from(WorkspaceUser))
    return AuthStatus(initialized=count > 0)


@router.post("/auth/register", response_model=LoginResponse)
async def register(
    request: Request,
    response: Response,
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    count = await db.scalar(select(func.count()).select_from(WorkspaceUser))
    if count > 0:
        raise HTTPException(status_code=409, detail="System already initialized")
    if len(body.password) < 8:
        raise HTTPException(
            status_code=422, detail="Password must be at least 8 characters"
        )
    try:
        password_hash = hash_password(body.password)
    except Exception:
        raise HTTPException(
            status_code=500, detail="Registration failed — contact admin"
        )
    user = WorkspaceUser(
        id=f"local-{uuid.uuid4().hex[:12]}",
        email=body.email.strip().lower(),
        name=None,
        role="account-owner",
        status="active",
        system_role="system-admin",
        password_hash=password_hash,
        password_temp=False,
        auth_source="local",
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()
    token = await _create_session(user.id, db)
    await audit.log_event(
        db,
        audit.AUTH_REGISTER,
        actor_user_id=user.id,
        actor_email=user.email,
        request=request,
        session_id=token,
    )
    await db.commit()
    await db.refresh(user)
    _set_session_cookie(response, token)
    logger.info(f"First admin registered: {mask_email(user.email)}")
    return LoginResponse(user=WorkspaceUserRead.model_validate(user), token=token)


@router.post("/auth/check-email", response_model=CheckEmailResponse)
@limiter.limit("10/minute")
async def check_email(
    request: Request,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkspaceUser).where(WorkspaceUser.email == body.email.strip().lower())
    )
    user = result.scalar_one_or_none()
    # Always return 200 — never reveal whether email exists
    requires_password = bool(user and user.password_hash)
    return CheckEmailResponse(requires_password=requires_password)


@router.post("/auth/login", response_model=LoginResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    response: Response,
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkspaceUser).where(WorkspaceUser.email == body.email.strip().lower())
    )
    user = result.scalar_one_or_none()
    if not user:
        # Generic 401 — don't reveal whether email exists to brute-forcers
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # SSO enforcement: block password login for non-admins when any provider enforces SSO.
    # Admins always retain password access as an emergency fallback.
    if user.role != "admin":
        sso_result = await db.execute(
            select(OidcProvider).where(OidcProvider.enabled == True, OidcProvider.enforce_sso == True)  # noqa: E712
        )
        if sso_result.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=403,
                detail="SSO is required. Please sign in using your SSO provider.",
            )

    if user.password_hash:
        if not body.password:
            raise HTTPException(status_code=401, detail="Password required")
        if not verify_password(body.password, user.password_hash):
            await audit.log_event(
                db,
                audit.AUTH_LOGIN_FAILURE,
                actor_email=user.email,
                status="failure",
                metadata={"reason": "wrong_password"},
                request=request,
            )
            await db.commit()
            raise HTTPException(status_code=401, detail="Invalid credentials")

    # TOTP MFA: if enabled, issue a short-lived challenge instead of a full session.
    if user.totp_enabled:
        challenge_token = secrets.token_urlsafe(32)
        challenge_expires = datetime.now(timezone.utc) + timedelta(minutes=5)
        challenge = LoginSession(
            token=challenge_token,
            user_id=user.id,
            expires_at=challenge_expires,
            auth_method="totp_challenge",
            token_type="totp_challenge",
        )
        db.add(challenge)
        await db.commit()
        # Return 200 with requires_totp so the frontend shows the TOTP step.
        # token here is the challenge, not a real session.
        return LoginResponse(
            user=WorkspaceUserRead.model_validate(user),
            token=challenge_token,
            requires_totp=True,
        )

    token = await _create_session(user.id, db)
    user.last_login_at = datetime.now(timezone.utc)
    await audit.log_event(
        db,
        audit.AUTH_LOGIN_SUCCESS,
        actor_user_id=user.id,
        actor_email=user.email,
        request=request,
        session_id=token,
    )
    await db.commit()
    _set_session_cookie(response, token)
    return LoginResponse(user=WorkspaceUserRead.model_validate(user), token=token)


@router.get("/auth/me", response_model=WorkspaceUserRead)
async def get_me(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
):
    # Accept cookie or bearer
    token = request.cookies.get(COOKIE_NAME)
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    session = await _get_valid_session(token, db)
    # Roll the expiry on each /me call
    try:
        session.expires_at = datetime.now(timezone.utc) + timedelta(
            days=SESSION_TTL_DAYS
        )
        await db.commit()
        await db.refresh(session.user)
        # Re-issue the cookie so max-age resets in browser
        _set_session_cookie(response, token)
    except Exception:
        logger.warning("Failed to roll session expiry, continuing anyway")
    return session.user


@router.delete("/auth/session", status_code=204)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
):
    token = request.cookies.get(COOKIE_NAME)
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    _clear_session_cookie(response)
    if not token:
        return
    session = await db.get(LoginSession, token)
    if session:
        await audit.log_event(
            db,
            audit.AUTH_LOGOUT,
            actor_user_id=session.user_id,
            request=request,
            session_id=token,
        )
        await db.delete(session)
        await db.commit()


@router.post("/auth/change-password", response_model=WorkspaceUserRead)
async def change_password(
    request: Request,
    body: ChangePasswordRequest,
    current_user: WorkspaceUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(default=None),
):
    # Need the token to keep current session alive
    token = request.cookies.get(COOKIE_NAME)
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization[7:]

    if not current_user.password_hash:
        raise HTTPException(status_code=400, detail="No password set for this account")

    # Skip old-password check when account is in forced-change mode
    if not current_user.password_temp:
        if not body.old_password:
            raise HTTPException(status_code=422, detail="Current password is required")
        if not verify_password(body.old_password, current_user.password_hash):
            raise HTTPException(status_code=401, detail="Current password is incorrect")

    if len(body.new_password) < 8:
        raise HTTPException(
            status_code=422, detail="New password must be at least 8 characters"
        )
    try:
        current_user.password_hash = hash_password(body.new_password)
    except Exception:
        raise HTTPException(
            status_code=500, detail="Password change failed — contact admin"
        )
    current_user.password_temp = False
    # Revoke all other sessions so the new password takes effect everywhere
    if token:
        await db.execute(
            delete(LoginSession).where(
                LoginSession.user_id == current_user.id,
                LoginSession.token != token,
            )
        )
    await audit.log_event(
        db,
        audit.AUTH_PASSWORD_CHANGED,
        actor_user_id=current_user.id,
        actor_email=current_user.email,
        request=request,
        session_id=token,
    )
    await db.commit()
    await db.refresh(current_user)
    return current_user


# ---------------------------------------------------------------------------
# Break-glass recovery
# ---------------------------------------------------------------------------

from pydantic import BaseModel as _PydanticModel  # noqa — used locally


class BreakGlassRequest(_PydanticModel):
    token: str


class BreakGlassResponse(_PydanticModel):
    email: str
    temp_password: str
    message: str


@router.post("/auth/break-glass", response_model=BreakGlassResponse)
@limiter.limit("3/hour")
async def break_glass(
    request: Request,
    body: BreakGlassRequest,
    db: AsyncSession = Depends(get_db),
):
    """Emergency recovery endpoint.

    Requires a BREAK_GLASS_TOKEN env var to be set at deployment time.
    Resets the first system-admin's password to a random temporary password.
    Logs the event in the audit trail.

    To generate a token:
        python3 -c "import secrets; print(secrets.token_urlsafe(32))"

    To use:
        POST /api/v1/auth/break-glass  {"token": "<BREAK_GLASS_TOKEN>"}
    """
    configured_token = settings.break_glass_token
    if not configured_token:
        raise HTTPException(
            status_code=404,
            detail="Break-glass recovery is not configured on this instance",
        )

    # Constant-time comparison to prevent timing attacks
    if not secrets.compare_digest(body.token, configured_token):
        await audit.log_event(
            db,
            "auth.break_glass.failed",
            status="failure",
            metadata={"reason": "invalid_token"},
            request=request,
        )
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid break-glass token")

    # Find the first system-admin by creation order
    result = await db.execute(
        select(WorkspaceUser)
        .where(WorkspaceUser.system_role == "system-admin")
        .order_by(WorkspaceUser.imported_at)
        .limit(1)
    )
    admin = result.scalar_one_or_none()
    if not admin:
        raise HTTPException(status_code=404, detail="No system admin found")

    # Reset to a temporary password
    temp_password = secrets.token_urlsafe(16)
    try:
        admin.password_hash = hash_password(temp_password)
    except Exception:
        raise HTTPException(status_code=500, detail="Password reset failed")
    admin.password_temp = True

    await audit.log_event(
        db,
        "auth.break_glass.success",
        actor_user_id=admin.id,
        actor_email=admin.email,
        metadata={"ip": request.client.host if request.client else None},
        request=request,
    )
    await db.commit()

    logger.warning(
        "BREAK-GLASS RECOVERY USED — admin=%s ip=%s",
        mask_email(admin.email),
        request.client.host if request.client else "unknown",
    )

    return BreakGlassResponse(
        email=admin.email,
        temp_password=temp_password,
        message=(
            "Password reset to temporary value. "
            "Sign in and change it immediately. "
            "This event has been logged."
        ),
    )


# ── TOTP MFA ──────────────────────────────────────────────────────────────────

class TotpSetupResponse(BaseModel):
    provisioning_uri: str  # otpauth:// URI — pass to a QR code renderer


class TotpEnableRequest(BaseModel):
    code: str  # 6-digit code from authenticator app to confirm setup


class TotpVerifyLoginRequest(BaseModel):
    challenge_token: str  # short-lived token from /auth/login when requires_totp=true
    code: str             # 6-digit TOTP code


@router.post("/auth/totp/setup", response_model=TotpSetupResponse)
@limiter.limit("5/minute")
async def totp_setup(
    request: Request,
    current_user: WorkspaceUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Generate a new TOTP secret for the current user and return the provisioning URI.
    TOTP is NOT enabled until /auth/totp/enable confirms the user scanned it correctly.
    """
    if current_user.totp_enabled:
        raise HTTPException(status_code=409, detail="TOTP already enabled. Disable first.")
    secret = pyotp.random_base32()
    current_user.totp_secret_encrypted = encrypt(secret)
    await db.commit()
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=current_user.email, issuer_name="AgentsOrg.ai")
    return TotpSetupResponse(provisioning_uri=uri)


@router.post("/auth/totp/enable", status_code=204)
@limiter.limit("5/minute")
async def totp_enable(
    request: Request,
    body: TotpEnableRequest,
    current_user: WorkspaceUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Verify the user scanned the QR code correctly, then enable TOTP."""
    if current_user.totp_enabled:
        raise HTTPException(status_code=409, detail="TOTP already enabled.")
    if not current_user.totp_secret_encrypted:
        raise HTTPException(status_code=400, detail="Run /auth/totp/setup first.")
    secret = decrypt(current_user.totp_secret_encrypted)
    totp = pyotp.TOTP(secret)
    if not totp.verify(body.code, valid_window=1):
        raise HTTPException(status_code=401, detail="Invalid TOTP code.")
    current_user.totp_enabled = True
    await db.commit()


@router.delete("/auth/totp", status_code=204)
async def totp_disable(
    current_user: WorkspaceUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """Disable TOTP for the current user. Requires an active session (not a challenge)."""
    current_user.totp_enabled = False
    current_user.totp_secret_encrypted = None
    await db.commit()


@router.post("/auth/totp/verify-login", response_model=LoginResponse)
@limiter.limit("5/minute")
async def totp_verify_login(
    request: Request,
    response: Response,
    body: TotpVerifyLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Exchange a TOTP challenge token + valid code for a real session cookie."""
    result = await db.execute(
        select(LoginSession)
        .options(selectinload(LoginSession.user))
        .where(
            LoginSession.token == body.challenge_token,
            LoginSession.token_type == "totp_challenge",
        )
    )
    challenge = result.scalar_one_or_none()
    if not challenge or challenge.revoked_at or challenge.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Invalid or expired TOTP challenge.")

    user = challenge.user
    if not user.totp_secret_encrypted:
        raise HTTPException(status_code=400, detail="TOTP not configured for this user.")

    secret = decrypt(user.totp_secret_encrypted)
    totp = pyotp.TOTP(secret)
    if not totp.verify(body.code, valid_window=1):
        await audit.log_event(
            db,
            audit.AUTH_LOGIN_FAILURE,
            actor_email=user.email,
            status="failure",
            metadata={"reason": "wrong_totp"},
            request=request,
        )
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid TOTP code.")

    # Consume the challenge so it can't be reused
    challenge.revoked_at = datetime.now(timezone.utc)

    token = await _create_session(user.id, db)
    user.last_login_at = datetime.now(timezone.utc)
    await audit.log_event(
        db,
        audit.AUTH_LOGIN_SUCCESS,
        actor_user_id=user.id,
        actor_email=user.email,
        request=request,
        session_id=token,
    )
    await db.commit()
    _set_session_cookie(response, token)
    return LoginResponse(user=WorkspaceUserRead.model_validate(user), token=token)
