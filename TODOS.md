# TODOS

Deferred work items with full context. Each item has enough detail to pick up cold.

---

## [AUTH-1] Frontend auth test suite

**What:** Set up Vitest + React Testing Library and write T21–T31 — the 11 frontend test cases for the password auth feature.

**Why:** The backend auth logic is tested (T1–T20 in this PR), but the frontend state machines have real failure modes: the two-step login flow has a branch based on `requires_password`, the `ForceChangePassword` modal must be un-dismissable, and the Users.tsx promote-to-ai-leader modal must not change the role if cancelled. These are easy to get wrong and hard to catch in manual testing.

**Pros:** Catches regressions in the two-step login flow, ForceChangePassword gate, and promote modal cancel path.

**Cons:** Requires setting up Vitest + jsdom + React Testing Library from scratch (the project has no frontend test infra). ~3 hrs of setup + test writing.

**Context:** Deferred from the password auth PR (added backend tests T1–T20 only). Test cases are already fully designed in the plan-eng-review output. Frontend test framework: Vitest (Vite-native, already in use for the build). Config changes needed: `vite.config.ts` test section, `jsdom` env, `@testing-library/react`.

**Depends on:** Password auth PR being merged.

**Cases to write:**
- RegisterScreen: passwords match → submit; mismatch → error; too short → error
- LoginScreen: `requires_password=true` → password field shown; `false` → auto-submit; wrong password → error
- ForceChangePassword: renders when `password_temp=true`; blocks app; confirm mismatch → disabled
- Users.tsx: promote to ai-leader → modal shown; cancel → role NOT changed

---

## [AUTH-2] Expired session cleanup

**What:** Delete expired rows from `login_sessions` table (WHERE `expires_at < now()`).

**Why:** Expired sessions accumulate indefinitely. At current scale (~10 users, 30-day rolling sessions) the table stays tiny. But if the tool is used across multiple orgs or sessions are created more frequently, it grows without bound.

**Pros:** Clean habit, prevents table bloat if scale increases.

**Cons:** Minimal — 5-line addition to app startup or a simple cron.

**Context:** Deferred because at ~10 users this is not a real problem. `login_sessions` table added in migration 011. Simplest implementation: add `DELETE FROM login_sessions WHERE expires_at < NOW()` call in `main.py` startup event (`@app.on_event("startup")`). More robust: a background task that runs hourly.

**Depends on:** Password auth PR being merged.

---

## [AUTH-3] OAuth / SSO as alternative login method

**What:** Add Google and/or Microsoft OAuth2 as a login option alongside password auth. Password stays as the fallback for initial admin setup.

**Why:** As the org grows or wants to roll out to more leaders, requiring admins to manage passwords and reset flows for each user is friction. OAuth delegates identity verification to the org's existing provider (Google Workspace, Azure AD) and has built-in account recovery.

**Pros:** Zero password management for users. Enterprise-standard. Solves forgot-password problem permanently.

**Cons:** Requires admin to register an OAuth app with the provider (Google Cloud Console or Azure AD). One-time setup per deployment. Adds ~2-3 days of dev work. Different config steps for Google vs Microsoft.

**Context:** Full plan was designed during the password auth design session. Key decisions already made:
- Login flow: `/auth/oauth/google/start` → browser redirect → `/auth/oauth/google/callback` → session token → frontend stores token
- Sessions table (migration 011) is already the right persistence layer — OAuth just adds a different way to create a session
- Email-only login can be removed once OAuth is in place; password stays for admin bootstrap
- Config: add `google_client_id`, `google_client_secret`, `microsoft_client_id`, `microsoft_client_secret` (encrypted) to `Configuration` model
- Frontend: "Sign in with Google / Microsoft" buttons on LoginScreen, shown only if provider is configured

**Depends on:** Password auth PR (session table infrastructure is reused).
