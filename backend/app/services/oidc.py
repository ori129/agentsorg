"""OIDC service — discovery, PKCE, token exchange, role mapping."""

import base64
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.encryption import decrypt, encrypt
from app.models.models import OidcProvider, OidcState

logger = logging.getLogger(__name__)

# How long an OIDC state entry lives before it's invalid.
_STATE_TTL_MINUTES = 10


# ---------------------------------------------------------------------------
# PKCE helpers
# ---------------------------------------------------------------------------


def _generate_code_verifier() -> str:
    """Generate a 43-128 char random code_verifier for PKCE."""
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()


def _code_challenge(verifier: str) -> str:
    """Derive S256 code_challenge from verifier."""
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------


async def discover_endpoints(issuer_url: str) -> dict[str, Any]:
    """Fetch the OpenID configuration document from the issuer.

    Returns the raw dict from .well-known/openid-configuration.
    Raises httpx.HTTPError or ValueError on failure.
    """
    issuer_url = issuer_url.rstrip("/")
    url = f"{issuer_url}/.well-known/openid-configuration"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    required = {"authorization_endpoint", "token_endpoint", "issuer"}
    missing = required - set(data.keys())
    if missing:
        raise ValueError(f"OIDC discovery missing required fields: {missing}")

    return data


# ---------------------------------------------------------------------------
# State / PKCE flow
# ---------------------------------------------------------------------------


async def create_oidc_state(
    db: AsyncSession,
    provider_id: int,
    redirect_uri: str,
) -> tuple[str, str]:
    """Create a short-lived OIDC state row.

    Returns (state_key, code_verifier) — code_verifier is stored encrypted.
    """
    state_key = secrets.token_urlsafe(24)
    code_verifier = _generate_code_verifier()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=_STATE_TTL_MINUTES)
    row = OidcState(
        state_key=state_key,
        provider_id=provider_id,
        code_verifier=encrypt(code_verifier),
        redirect_uri=redirect_uri,
        expires_at=expires_at,
    )
    db.add(row)
    await db.flush()
    return state_key, code_verifier


async def consume_oidc_state(
    db: AsyncSession, state_key: str
) -> OidcState:
    """Fetch, validate, and delete the state row. Raises ValueError if invalid/expired."""
    result = await db.execute(
        select(OidcState).where(OidcState.state_key == state_key)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise ValueError("Unknown OIDC state — possible CSRF or replay attack")
    if row.expires_at < datetime.now(timezone.utc):
        await db.delete(row)
        await db.commit()
        raise ValueError("OIDC state expired — please try again")
    await db.delete(row)
    # Decrypt verifier before flush so caller gets plaintext
    row.code_verifier = decrypt(row.code_verifier)
    return row


# ---------------------------------------------------------------------------
# Auth URL generation
# ---------------------------------------------------------------------------


def build_auth_url(
    provider: OidcProvider,
    state_key: str,
    code_verifier: str,
    redirect_uri: str,
) -> str:
    """Build the authorization URL to redirect the user to the IdP."""
    import urllib.parse

    challenge = _code_challenge(code_verifier)
    scope = provider.scopes or "openid email profile"

    params: dict[str, str] = {
        "client_id": provider.client_id,
        "response_type": "code",
        "scope": scope,
        "redirect_uri": redirect_uri,
        "state": state_key,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    return f"{provider.authorization_endpoint}?{urllib.parse.urlencode(params)}"


# ---------------------------------------------------------------------------
# Token exchange
# ---------------------------------------------------------------------------


async def exchange_code(
    provider: OidcProvider,
    code: str,
    code_verifier: str,
    redirect_uri: str,
) -> dict[str, Any]:
    """Exchange an authorization code for tokens at the provider's token endpoint."""
    client_secret = decrypt(provider.client_secret_encrypted) if provider.client_secret_encrypted else None
    payload: dict[str, str] = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": provider.client_id,
        "code_verifier": code_verifier,
    }
    if client_secret:
        payload["client_secret"] = client_secret

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            provider.token_endpoint,
            data=payload,
            headers={"Accept": "application/json"},
        )
        resp.raise_for_status()
        return resp.json()


# ---------------------------------------------------------------------------
# Userinfo
# ---------------------------------------------------------------------------


async def get_userinfo(provider: OidcProvider, access_token: str) -> dict[str, Any]:
    """Fetch claims from the userinfo endpoint."""
    if not provider.userinfo_endpoint:
        return {}
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            provider.userinfo_endpoint,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json()


# ---------------------------------------------------------------------------
# Role mapping
# ---------------------------------------------------------------------------

_VALID_ROLES = {"system-admin", "ai-leader", "employee"}


def resolve_role(provider: OidcProvider, claims: dict[str, Any]) -> str:
    """Map IdP claims to a system_role using the provider's role_mapping_json.

    role_mapping_json is a list of rules evaluated in order:
    [
      {"match": "admins", "role": "system-admin"},
      {"match": "leaders", "role": "ai-leader"},
      {"default": "employee"}
    ]

    The groups claim key is taken from provider.groups_claim (or "groups").
    Returns one of: "system-admin", "ai-leader", "employee"
    """
    rules: list = provider.role_mapping_json or []
    default_role = "employee"
    for rule in rules:
        if "default" in rule:
            candidate = rule["default"]
            if candidate in _VALID_ROLES:
                default_role = candidate

    groups_key = provider.groups_claim or "groups"
    groups: list = []
    raw = claims.get(groups_key)
    if isinstance(raw, list):
        groups = raw
    elif isinstance(raw, str):
        groups = [raw]

    for rule in rules:
        match = rule.get("match")
        role = rule.get("role")
        if match and role and role in _VALID_ROLES:
            if match in groups:
                return role

    return default_role


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------


async def purge_expired_states(db: AsyncSession) -> None:
    """Delete expired OidcState rows. Call periodically from a background task."""
    from sqlalchemy import delete as sa_delete

    await db.execute(
        sa_delete(OidcState).where(OidcState.expires_at < datetime.now(timezone.utc))
    )
    await db.commit()
