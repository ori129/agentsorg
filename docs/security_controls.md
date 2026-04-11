# Security Controls — AI Transformation Intelligence

_Last updated: 2026-04-11. Reflects the codebase as shipped._

---

## 1. API Key Storage

### Where keys live

Two classes of API keys are stored in the database:

| Key | Column | Table |
|-----|--------|-------|
| OpenAI Compliance API key | `compliance_api_key` | `workspace_config` |
| OpenAI LLM key | `openai_api_key` | `workspace_config` |
| OIDC client secret | `client_secret_encrypted` | `oidc_providers` |

**None of these columns ever hold a plaintext value.**

### Encryption at rest — Fernet (AES-128-CBC + HMAC-SHA256)

Every API key and OIDC client secret is encrypted with [Fernet](https://cryptography.io/en/latest/fernet/) before the row is written (`backend/app/encryption.py`):

```python
# Write path (configuration.py, oidc.py)
update_data["compliance_api_key"] = encrypt(update_data["compliance_api_key"])

# Read path (pipeline.py, users.py, etc.)
api_key = decrypt(config.compliance_api_key)
```

Fernet wraps AES-128-CBC with a random IV and adds an HMAC-SHA256 authentication tag. The ciphertext is base64-encoded. A tampered ciphertext raises `InvalidToken` before decryption — it cannot silently produce a wrong plaintext.

The key material (`FERNET_KEY`) lives in the environment, not the database or source code. It is a 32-byte value encoded as URL-safe base64. The app refuses to start if the variable is missing or malformed.

### What the API returns to the browser

The `GET /api/v1/configuration` response never returns a decrypted key. It returns `"********"` via the `mask()` helper:

```python
compliance_api_key=mask(config.compliance_api_key),  # → "********" or None
openai_api_key=mask(config.openai_api_key),
```

A browser developer tools inspection of any API response will never show a key value.

---

## 2. Authentication

### Session tokens

Sessions are created with `secrets.token_urlsafe(32)` — 256 bits of OS-level entropy (`/dev/urandom`). Tokens are stored as primary keys in the `login_sessions` table and validated on every request.

A session is invalid if:
- It does not exist in the database
- `revoked_at IS NOT NULL`
- `expires_at < now()` (30-day TTL)

All three checks happen server-side on every authenticated request (`auth_deps.py: _resolve_session`).

### Cookie security

```python
response.set_cookie(
    key="session_token",
    value=token,
    httponly=True,       # not readable by JavaScript
    samesite="lax",      # CSRF mitigation
    secure=False,        # set True in production behind HTTPS
    max_age=2592000,     # 30 days
)
```

`HttpOnly` means XSS cannot read the session cookie. `SameSite=lax` means cross-site POST requests (CSRF) do not carry the cookie. The `secure=False` flag is the one remaining production gap — it must be `True` behind TLS.

### Password hashing

Passwords are hashed with bcrypt (`auth_utils.py`):

```python
_bcrypt.hashpw(password.encode(), _bcrypt.gensalt())
```

bcrypt is deliberately slow (adaptive cost factor). The raw password is never logged or stored.

### Rate limiting on auth endpoints

| Endpoint | Limit |
|---|---|
| `POST /auth/check-email` | 10 / minute |
| `POST /auth/login` | 5 / minute |
| `POST /auth/reset-password` | 3 / hour |

Limits are enforced by `slowapi` keyed on client IP (`auth.py`).

---

## 3. Role-Based Access Control (RBAC)

### Role model

Three roles exist in `system_role` on `WorkspaceUser`:

| Role | Access |
|---|---|
| `system-admin` | Full access to all endpoints |
| `ai-leader` | Read access to analytics, no configuration writes |
| `employee` | Own portal data only |

### Enforcement — FastAPI dependency injection

Every protected endpoint declares its required role as a FastAPI `Depends`. The check runs before the endpoint body executes:

```python
# Admin-only: any config write, user management, pipeline trigger
async def my_endpoint(
    _: WorkspaceUser = Depends(require_system_admin),
):
    ...

# Auth-only: read-access endpoints
async def my_endpoint(
    _: WorkspaceUser = Depends(require_auth),
):
    ...
```

`require_system_admin` raises 403 if the resolved user's `system_role != "system-admin"`. It is impossible to reach the endpoint body without passing this check — there is no conditional inside the handler that could be bypassed.

### What each role can reach

**`require_system_admin` gates** (partial list):

| Endpoint | File |
|---|---|
| `POST /config` — write API keys | `configuration.py:54` |
| `POST /auth/oidc/providers` — add SSO provider | `oidc.py:95` |
| `PATCH /auth/oidc/providers/{id}/enforce` — enforce SSO | `oidc.py:267` |
| `POST /users` — create users | `users.py:32` |
| `PATCH /users/{id}` — change roles | `users.py:190` |
| `DELETE /users/{id}` — remove users | `users.py:226` |
| `POST /pipeline/run` — trigger data pipeline | `pipeline.py:128` |
| `POST /admin/seed` — seed demo data | `admin.py:25` |
| All category CRUD | `categories.py:87-131` |
| All conversation pipeline writes | `conversations.py:65,329,347,481` |

**`require_auth` gates** (partial list — any authenticated user):

| Endpoint | File |
|---|---|
| `GET /config` — read config (keys masked) | `configuration.py:31` |
| `GET /pipeline/status` | `pipeline.py:161` |
| `GET /clustering/results` | `clustering.py:477` |
| `GET /conversations/*` read endpoints | `conversations.py:164,177,196,281` |

### Role escalation protection

A `system-admin` cannot demote themselves if they are the last admin:

```python
# users.py:204
if user.system_role == "system-admin" and body.system_role != "system-admin":
    count = await db.execute(select(func.count(...)).where(system_role == "system-admin"))
    if count == 1:
        raise HTTPException(400, "Cannot remove the last system admin")
```

New users provisioned via OIDC SSO default to `employee` unless an explicit role mapping is configured for their IdP group/claim.

---

## 4. IDOR Controls

IDOR (Insecure Direct Object Reference) is the class of bug where `GET /users/42` works even if you are user 43 — i.e., the ID in the URL is the only access check.

### Current posture

The app's primary IDOR exposure is low because most data is workspace-scoped rather than user-scoped. The database does not have per-user row-level isolation — it has workspace-level isolation. All authenticated users belong to the same workspace installation.

**Specific mitigations in place:**

1. **User record writes require admin.** `PATCH /users/{id}` and `DELETE /users/{id}` both `Depends(require_system_admin)`. An employee cannot modify another employee's record regardless of the ID they supply.

2. **Password change is session-scoped.** `POST /auth/change-password` resolves the target user from the session token, not from a URL parameter. There is no `user_id` in the request body that could be swapped.

3. **Configuration is workspace-singleton.** There is one `WorkspaceConfig` row. There is no per-user config object to enumerate.

4. **OIDC provider management requires admin.** All `/auth/oidc/providers/{id}` mutations are admin-gated, so an employee cannot delete or modify an SSO provider by guessing its UUID.

### Known gap

The read endpoints under `require_auth` (e.g., `GET /api/v1/gpts`, `GET /clustering/results`) are scoped to the workspace but not to the calling user's role beyond "authenticated." An `employee`-role user with a valid session can call these endpoints and read aggregate analytics data. This is intentional for the employee portal, but it means that an employee can technically read leader-view data if they know the endpoint URLs. Mitigation: add `require_system_admin` or `require_ai_leader` to analytics endpoints that should be leader-only.

---

## 5. SSO and Authentication Flow

### OIDC / OpenID Connect

The OIDC flow follows the Authorization Code flow:

1. Browser navigates to `GET /auth/oidc/login/{provider_id}` — server generates a `state` nonce (stored in a short-lived `HttpOnly` cookie) and redirects to the IdP.
2. IdP redirects to `GET /auth/oidc/callback?code=...&state=...`.
3. Server validates the `state` nonce (CSRF protection), exchanges the code for tokens, fetches the userinfo endpoint.
4. Server creates or upserts the `WorkspaceUser`, creates a session, sets the session cookie.

The `state` parameter is a `secrets.token_urlsafe(32)` value stored server-side and compared on callback. A forged callback without a valid state is rejected.

### SSO enforcement

When `enforce_sso=True` on a provider:
- **Backend**: `/auth/login` (password route) returns 403 for any user whose `system_role != "admin"`.
- **Frontend**: the password form is hidden. A subtle "Admin password login" link reveals it for emergency admin access.
- Admins retain password access to prevent lockout if SSO misconfigures.

The backend check is authoritative — the frontend hiding is UX-only. A curl request to `/auth/login` with a non-admin account and SSO enforcement active will get a 403 regardless of the UI state.

---

## 6. Audit Log

All auth and privileged actions write to the `audit_log_entries` table before the response is returned. The event catalog includes:

| Event | Trigger |
|---|---|
| `auth.login.success` / `.failure` | Every login attempt |
| `auth.logout` | Session termination |
| `auth.session.revoked` | Admin-forced session revoke |
| `auth.password.changed` | Password change |
| `auth.oidc.login.success` / `.failure` | SSO login attempts |
| `oidc.sso.enforced` / `.unenforced` | SSO enforcement toggle |
| `oidc.provider.created` / `.updated` / `.disabled` | Provider management |
| `user.role.changed` | Role promotion/demotion |
| `user.password.reset` | Admin password reset |
| `user.invited` | User invitation |
| `pipeline.started` | Data pipeline trigger |
| `conversation.pipeline.started` | Conversation analysis trigger |

Each entry records: `action`, `actor_email` (masked as `a***@domain.com`), `target_type`, `target_id`, `status`, `ip_address`, `user_agent`, `metadata`, `created_at`.

Passwords and session tokens are never stored in audit metadata.

---

## 7. Open Items (Known Gaps)

| # | Gap | Risk | Mitigation path |
|---|-----|------|-----------------|
| 1 | `secure=False` on session cookie | Session token transmitted over HTTP | Set `secure=True` behind TLS in production |
| 2 | Analytics read endpoints not role-gated | Employee can read leader-view aggregate data | Add `require_ai_leader` dependency to leader-only endpoints |
| 3 | `FERNET_KEY` rotation not automated | Long-lived encryption key | Add key rotation endpoint that re-encrypts all secrets |
| 4 | No MFA on password login | Credential stuffing resilience | Add TOTP or rely on SSO provider for MFA |
| 5 | Bearer token fallback in auth_deps | API clients bypass cookie-only posture | Accept only cookies in browser context; document bearer as API-only |
