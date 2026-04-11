"""OIDC / Enterprise SSO router.

Endpoints:
  GET  /auth/oidc/providers               — list providers (admin)
  POST /auth/oidc/providers               — create provider (admin)
  PATCH /auth/oidc/providers/{id}         — update provider (admin)
  DELETE /auth/oidc/providers/{id}        — disable/delete provider (admin)
  POST /auth/oidc/providers/{id}/test     — test discovery (admin)
  PATCH /auth/oidc/providers/{id}/enforce — toggle SSO enforcement (admin)

  GET  /auth/oidc/login/{provider_id}     — initiate OIDC flow (public → redirect)
  GET  /auth/oidc/callback                — handle IdP callback (public)
  GET  /auth/oidc/status                  — current SSO mode visible to login screen

  GET  /auth/audit                        — audit log (admin)
"""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import require_system_admin
from app.config import settings
from app.database import get_db
from app.encryption import encrypt
from app.models.models import LoginSession, OidcProvider, WorkspaceUser, AuditLogEntry
from app.routers.auth import SESSION_TTL_DAYS, _create_session, _set_session_cookie
from app.schemas.schemas import (
    AuditLogEntryRead,
    OidcEnforcementUpdate,
    OidcProviderCreate,
    OidcProviderRead,
    OidcProviderUpdate,
    OidcTestResult,
)
from app.services import audit, oidc as oidc_svc

router = APIRouter(tags=["oidc"])
logger = logging.getLogger(__name__)

# Where the frontend expects to land after SSO.
# These are paths — the final URL is built using the same PUBLIC_URL logic as redirect_uri.
_FRONTEND_AFTER_LOGIN_PATH = "/"
_FRONTEND_LOGIN_ERROR_PATH = "/login?error="


def _public_base(request: Request) -> str:
    """Return the public-facing base URL (no trailing slash).

    Priority: PUBLIC_URL env > X-Forwarded headers > request.base_url.
    nginx strips the port from the Host header, so request.base_url would
    give http://localhost/ (port 80) instead of http://localhost:3000/.
    """
    if settings.public_url:
        return settings.public_url.rstrip("/")
    fwd_proto = request.headers.get("x-forwarded-proto")
    fwd_host = request.headers.get("x-forwarded-host")
    if fwd_proto and fwd_host:
        return f"{fwd_proto}://{fwd_host}"
    return str(request.base_url).rstrip("/")


# ---------------------------------------------------------------------------
# Admin: provider management
# ---------------------------------------------------------------------------


@router.get("/auth/oidc/providers", response_model=list[OidcProviderRead])
async def list_providers(
    _: WorkspaceUser = Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(OidcProvider).order_by(OidcProvider.id))
    providers = result.scalars().all()
    return [OidcProviderRead.from_orm_obj(p) for p in providers]


def _normalize_issuer_url(url: str) -> str:
    """Ensure issuer URL has an https:// scheme and no trailing slash."""
    url = url.strip().rstrip("/")
    if url and not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


@router.post("/auth/oidc/providers", response_model=OidcProviderRead, status_code=201)
async def create_provider(
    body: OidcProviderCreate,
    request: Request,
    caller: WorkspaceUser = Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
):
    issuer_url = _normalize_issuer_url(body.issuer_url)
    if not issuer_url:
        raise HTTPException(status_code=422, detail="Issuer URL is required")

    # Run discovery to populate endpoints
    try:
        discovery = await oidc_svc.discover_endpoints(issuer_url)
    except Exception as exc:
        msg = str(exc)
        # Translate raw httpx/network errors into something human-readable
        if "protocol" in msg.lower() or "missing" in msg.lower():
            msg = f"Invalid issuer URL — make sure it starts with https://"
        elif "connection" in msg.lower() or "connect" in msg.lower():
            msg = f"Could not reach {issuer_url} — check the URL and try again"
        elif "404" in msg or "not found" in msg.lower():
            msg = f"Discovery endpoint not found at {issuer_url}/.well-known/openid-configuration"
        raise HTTPException(status_code=422, detail=f"OIDC discovery failed: {msg}")

    provider = OidcProvider(
        name=body.name,
        issuer_url=issuer_url,
        client_id=body.client_id,
        client_secret_encrypted=encrypt(body.client_secret) if body.client_secret else None,
        scopes=body.scopes,
        email_claim=body.email_claim,
        name_claim=body.name_claim,
        groups_claim=body.groups_claim,
        role_mapping_json=body.role_mapping_json,
        enabled=body.enabled,
        enforce_sso=body.enforce_sso,
        allow_password_login=body.allow_password_login,
        authorization_endpoint=discovery.get("authorization_endpoint"),
        token_endpoint=discovery.get("token_endpoint"),
        userinfo_endpoint=discovery.get("userinfo_endpoint"),
        jwks_uri=discovery.get("jwks_uri"),
    )
    db.add(provider)
    await db.flush()
    await audit.log_event(
        db,
        audit.OIDC_PROVIDER_CREATED,
        actor_user_id=caller.id,
        actor_email=caller.email,
        target_type="oidc_provider",
        target_id=str(provider.id),
        request=request,
    )
    await db.commit()
    await db.refresh(provider)
    return OidcProviderRead.from_orm_obj(provider)


@router.patch("/auth/oidc/providers/{provider_id}", response_model=OidcProviderRead)
async def update_provider(
    provider_id: int,
    body: OidcProviderUpdate,
    request: Request,
    caller: WorkspaceUser = Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OidcProvider).where(OidcProvider.id == provider_id)
    )
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(status_code=404, detail="OIDC provider not found")

    updates = body.model_dump(exclude_unset=True)

    # If issuer_url changes, normalize and re-run discovery
    if "issuer_url" in updates:
        updates["issuer_url"] = _normalize_issuer_url(updates["issuer_url"])
        try:
            discovery = await oidc_svc.discover_endpoints(updates["issuer_url"])
            provider.authorization_endpoint = discovery.get("authorization_endpoint")
            provider.token_endpoint = discovery.get("token_endpoint")
            provider.userinfo_endpoint = discovery.get("userinfo_endpoint")
            provider.jwks_uri = discovery.get("jwks_uri")
        except Exception as exc:
            msg = str(exc)
            if "protocol" in msg.lower() or "missing" in msg.lower():
                msg = "Invalid issuer URL — make sure it starts with https://"
            raise HTTPException(status_code=422, detail=f"OIDC discovery failed: {msg}")

    # Encrypt client_secret if updated
    if "client_secret" in updates:
        secret = updates.pop("client_secret")
        provider.client_secret_encrypted = encrypt(secret) if secret else None

    for key, value in updates.items():
        if hasattr(provider, key):
            setattr(provider, key, value)

    await audit.log_event(
        db,
        audit.OIDC_PROVIDER_UPDATED,
        actor_user_id=caller.id,
        actor_email=caller.email,
        target_type="oidc_provider",
        target_id=str(provider.id),
        request=request,
    )
    await db.commit()
    await db.refresh(provider)
    return OidcProviderRead.from_orm_obj(provider)


@router.delete("/auth/oidc/providers/{provider_id}", status_code=204)
async def delete_provider(
    provider_id: int,
    request: Request,
    caller: WorkspaceUser = Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OidcProvider).where(OidcProvider.id == provider_id)
    )
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(status_code=404, detail="OIDC provider not found")

    await audit.log_event(
        db,
        audit.OIDC_PROVIDER_DISABLED,
        actor_user_id=caller.id,
        actor_email=caller.email,
        target_type="oidc_provider",
        target_id=str(provider_id),
        request=request,
    )
    await db.delete(provider)
    await db.commit()


@router.post("/auth/oidc/providers/{provider_id}/test", response_model=OidcTestResult)
async def test_provider(
    provider_id: int,
    _: WorkspaceUser = Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OidcProvider).where(OidcProvider.id == provider_id)
    )
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(status_code=404, detail="OIDC provider not found")

    try:
        discovery = await oidc_svc.discover_endpoints(provider.issuer_url)
        # Update cached endpoints
        provider.authorization_endpoint = discovery.get("authorization_endpoint")
        provider.token_endpoint = discovery.get("token_endpoint")
        provider.userinfo_endpoint = discovery.get("userinfo_endpoint")
        provider.jwks_uri = discovery.get("jwks_uri")
        await db.commit()
        return OidcTestResult(
            success=True,
            message="Discovery successful",
            discovery=discovery,
        )
    except Exception as exc:
        return OidcTestResult(success=False, message=str(exc))


@router.patch("/auth/oidc/providers/{provider_id}/enforce", response_model=OidcProviderRead)
async def set_enforcement(
    provider_id: int,
    body: OidcEnforcementUpdate,
    request: Request,
    caller: WorkspaceUser = Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(OidcProvider).where(OidcProvider.id == provider_id)
    )
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(status_code=404, detail="OIDC provider not found")

    old_enforce = provider.enforce_sso
    provider.enforce_sso = body.enforce_sso
    provider.allow_password_login = body.allow_password_login

    action = audit.OIDC_SSO_ENFORCED if body.enforce_sso else audit.OIDC_SSO_UNENFORCED
    await audit.log_event(
        db,
        action,
        actor_user_id=caller.id,
        actor_email=caller.email,
        target_type="oidc_provider",
        target_id=str(provider.id),
        metadata={"was": old_enforce, "now": body.enforce_sso},
        request=request,
    )
    await db.commit()
    await db.refresh(provider)
    return OidcProviderRead.from_orm_obj(provider)


# ---------------------------------------------------------------------------
# Public: SSO status (used by login screen)
# ---------------------------------------------------------------------------


@router.get("/auth/oidc/status")
async def sso_status(db: AsyncSession = Depends(get_db)):
    """Return the SSO configuration visible to the login screen.

    Returns:
    - providers: list of {id, name} for enabled providers
    - enforce_sso: true if any provider enforces SSO (password login blocked)
    - allow_password_login: true if password login is still allowed
    """
    result = await db.execute(
        select(OidcProvider).where(OidcProvider.enabled == True)  # noqa: E712
    )
    providers = result.scalars().all()
    enforce_sso = any(p.enforce_sso for p in providers)
    allow_password = not enforce_sso or any(p.allow_password_login for p in providers)
    return {
        "providers": [{"id": p.id, "name": p.name} for p in providers],
        "enforce_sso": enforce_sso,
        "allow_password_login": allow_password,
    }


# ---------------------------------------------------------------------------
# Public: OIDC flow initiation
# ---------------------------------------------------------------------------


@router.get("/auth/oidc/login/{provider_id}")
async def oidc_login(
    provider_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Redirect the user to the IdP authorization endpoint."""
    result = await db.execute(
        select(OidcProvider).where(
            OidcProvider.id == provider_id,
            OidcProvider.enabled == True,  # noqa: E712
        )
    )
    provider = result.scalar_one_or_none()
    if not provider:
        raise HTTPException(status_code=404, detail="OIDC provider not found or disabled")
    if not provider.authorization_endpoint:
        raise HTTPException(
            status_code=503,
            detail="Provider endpoints not discovered — run /test first",
        )

    redirect_uri = _public_base(request) + "/api/v1/auth/oidc/callback"

    state_key, code_verifier = await oidc_svc.create_oidc_state(
        db, provider_id, redirect_uri
    )
    await db.commit()

    auth_url = oidc_svc.build_auth_url(provider, state_key, code_verifier, redirect_uri)
    return RedirectResponse(url=auth_url, status_code=302)


# ---------------------------------------------------------------------------
# Public: OIDC callback
# ---------------------------------------------------------------------------


@router.get("/auth/oidc/callback")
async def oidc_callback(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Handle the authorization code callback from the IdP."""
    params = dict(request.query_params)
    code = params.get("code")
    state_key = params.get("state")
    error = params.get("error")

    _base = _public_base(request)

    if error:
        desc = params.get("error_description", error)
        logger.warning(f"OIDC callback error from IdP: {desc}")
        return RedirectResponse(
            url=f"{_base}{_FRONTEND_LOGIN_ERROR_PATH}{desc}", status_code=302
        )

    if not code or not state_key:
        return RedirectResponse(
            url=f"{_base}{_FRONTEND_LOGIN_ERROR_PATH}missing_parameters", status_code=302
        )

    # Validate state and get PKCE verifier
    try:
        state_row = await oidc_svc.consume_oidc_state(db, state_key)
    except ValueError as exc:
        logger.warning(f"OIDC state validation failed: {exc}")
        return RedirectResponse(
            url=f"{_base}{_FRONTEND_LOGIN_ERROR_PATH}invalid_state", status_code=302
        )

    # Load provider
    result = await db.execute(
        select(OidcProvider).where(OidcProvider.id == state_row.provider_id)
    )
    provider = result.scalar_one_or_none()
    if not provider:
        return RedirectResponse(
            url=f"{_base}{_FRONTEND_LOGIN_ERROR_PATH}provider_not_found", status_code=302
        )

    # Exchange code for tokens
    try:
        tokens = await oidc_svc.exchange_code(
            provider, code, state_row.code_verifier, state_row.redirect_uri
        )
    except Exception as exc:
        logger.error(f"OIDC token exchange failed: {exc}")
        await audit.log_event(
            db,
            audit.AUTH_OIDC_LOGIN_FAILURE,
            target_type="oidc_provider",
            target_id=str(provider.id),
            status="failure",
            metadata={"error": str(exc)},
            request=request,
        )
        await db.commit()
        return RedirectResponse(
            url=f"{_base}{_FRONTEND_LOGIN_ERROR_PATH}token_exchange_failed", status_code=302
        )

    access_token = tokens.get("access_token", "")

    # Get userinfo
    try:
        userinfo = await oidc_svc.get_userinfo(provider, access_token)
    except Exception as exc:
        logger.warning(f"OIDC userinfo fetch failed, using id_token claims: {exc}")
        userinfo = {}

    # Extract identity from userinfo + id_token claims (decoded without verify for claims)
    email_claim = provider.email_claim or "email"
    name_claim = provider.name_claim or "name"

    email = userinfo.get(email_claim)
    if not email:
        # Fallback: parse id_token (base64 middle segment)
        id_token = tokens.get("id_token", "")
        if id_token:
            import base64, json as _json
            try:
                parts = id_token.split(".")
                if len(parts) >= 2:
                    padded = parts[1] + "=" * (4 - len(parts[1]) % 4)
                    payload = _json.loads(base64.urlsafe_b64decode(padded))
                    email = payload.get(email_claim) or payload.get("email")
                    userinfo = {**payload, **userinfo}
            except Exception:
                pass

    if not email:
        logger.error("OIDC callback: no email in userinfo or id_token")
        await audit.log_event(
            db,
            audit.AUTH_OIDC_LOGIN_FAILURE,
            status="failure",
            metadata={"error": "no_email_claim"},
            request=request,
        )
        await db.commit()
        return RedirectResponse(
            url=f"{_base}{_FRONTEND_LOGIN_ERROR_PATH}no_email_claim", status_code=302
        )

    email = email.strip().lower()
    display_name = userinfo.get(name_claim)
    subject = userinfo.get("sub") or email

    # Resolve role from IdP claims
    system_role = oidc_svc.resolve_role(provider, userinfo)

    # Upsert the user
    existing = await db.execute(
        select(WorkspaceUser).where(WorkspaceUser.email == email)
    )
    user = existing.scalar_one_or_none()

    if user:
        # Only update role if there's an explicit role mapping configured.
        # Without a mapping, resolve_role returns a hardcoded default ("employee")
        # which would incorrectly demote existing admins/leaders on their first SSO login.
        if provider.role_mapping_json:
            user.system_role = system_role
        user.auth_source = "oidc"
        user.external_subject = subject
        user.last_login_at = datetime.now(timezone.utc)
        if display_name and not user.name:
            user.name = display_name
    else:
        # Auto-provision new user — default to "ai-leader" when no mapping is set
        # so SSO-only users aren't stuck as employees with no access.
        effective_role = system_role if provider.role_mapping_json else "ai-leader"
        user = WorkspaceUser(
            id=f"oidc-{uuid.uuid4().hex[:12]}",
            email=email,
            name=display_name,
            role="member",
            status="active",
            system_role=effective_role,
            auth_source="oidc",
            external_subject=subject,
            last_login_at=datetime.now(timezone.utc),
        )
        db.add(user)
        await db.flush()

    session_token = await _create_session(user.id, db, auth_method="oidc")

    await audit.log_event(
        db,
        audit.AUTH_OIDC_LOGIN_SUCCESS,
        actor_user_id=user.id,
        actor_email=user.email,
        target_type="oidc_provider",
        target_id=str(provider.id),
        metadata={"role_mapped": system_role},
        request=request,
        session_id=session_token,
    )
    await db.commit()

    redirect_response = RedirectResponse(url=f"{_base}{_FRONTEND_AFTER_LOGIN_PATH}", status_code=302)
    _set_session_cookie(redirect_response, session_token)
    return redirect_response


# ---------------------------------------------------------------------------
# Admin: audit log
# ---------------------------------------------------------------------------


@router.get("/auth/audit", response_model=list[AuditLogEntryRead])
async def get_audit_log(
    limit: int = 100,
    offset: int = 0,
    _: WorkspaceUser = Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AuditLogEntry)
        .order_by(AuditLogEntry.timestamp.desc())
        .limit(min(limit, 500))
        .offset(offset)
    )
    return result.scalars().all()
