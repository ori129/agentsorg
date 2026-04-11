import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import type { SsoStatus } from "../../types";

type Step = "email" | "password" | "totp";

export default function LoginScreen() {
  const { login } = useAuth();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpChallenge, setTotpChallenge] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoStatus, setSsoStatus] = useState<SsoStatus | null>(null);

  // Check URL for SSO error message (from callback redirect)
  const urlError = new URLSearchParams(window.location.search).get("error");

  useEffect(() => {
    api.getSsoStatus().then(setSsoStatus).catch(() => {});
  }, []);

  const hasProviders = (ssoStatus?.providers?.length ?? 0) > 0;
  const ssoOnly = !!(ssoStatus?.enforce_sso);
  const [showPasswordEscape, setShowPasswordEscape] = useState(false);

  // Step 1: check whether this email requires a password
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      const { requires_password } = await api.checkEmail(trimmed);
      if (requires_password) {
        setStep("password");
      } else {
        // Employee with no password — log in directly
        await login(trimmed);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: submit password
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!password) {
      setError("Please enter your password");
      return;
    }

    setLoading(true);
    try {
      const result = await api.login(email.trim().toLowerCase(), password);
      if (result.requires_totp) {
        setTotpChallenge(result.token);
        setStep("totp");
      } else {
        await login(email.trim().toLowerCase(), password);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!totpCode || totpCode.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app");
      return;
    }
    setLoading(true);
    try {
      await api.verifyTotpLogin(totpChallenge, totpCode);
      // verifyTotpLogin sets the session cookie; reload so AuthContext picks it up
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--c-bg)" }}
    >
      <div className="w-full max-w-md">
        {/* Logo + brand */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <svg
            width="32"
            height="32"
            viewBox="0 0 28 28"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ color: "var(--c-text)" }}
          >
            <rect
              x="1.5"
              y="1.5"
              width="25"
              height="25"
              rx="4"
              stroke="currentColor"
              strokeWidth="2"
            />
            <circle cx="10" cy="10" r="4" fill="currentColor" />
          </svg>
          <span
            className="text-xl font-bold tracking-tight"
            style={{ color: "var(--c-text)" }}
          >
            AgentsOrg.ai
          </span>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: "var(--c-surface)",
            border: "1px solid var(--c-border)",
          }}
        >
          <h1
            className="text-xl font-bold mb-1"
            style={{ color: "var(--c-text)" }}
          >
            Sign in
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--c-text-3)" }}>
            {ssoOnly
              ? "Use your company SSO to access the dashboard."
              : step === "email"
              ? "Enter your email to access the AI Transformation Intelligence dashboard."
              : step === "totp"
              ? "Enter the 6-digit code from your authenticator app."
              : `Enter your password for ${email}.`}
          </p>

          {/* SSO error from callback */}
          {urlError && (
            <div
              className="text-xs mb-4 p-3 rounded-lg"
              style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}
            >
              SSO sign-in failed: {decodeURIComponent(urlError).replace(/_/g, " ")}
            </div>
          )}

          {/* SSO buttons */}
          {hasProviders && (
            <div className="mb-4 flex flex-col gap-2">
              {ssoStatus!.providers.map((provider) => (
                <a
                  key={provider.id}
                  href={api.getOidcLoginUrl(provider.id)}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold transition-colors"
                  style={{
                    background: "var(--c-surface-2)",
                    border: "1px solid var(--c-border)",
                    color: "var(--c-text)",
                    textDecoration: "none",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 2a5 5 0 0 1 4.546 7.09L5.91 3.454A4.977 4.977 0 0 1 8 3zm-4.546 1.91L9.09 11.546A5 5 0 0 1 3.454 4.91z"
                      fill="currentColor"
                    />
                  </svg>
                  Sign in with {provider.name}
                </a>
              ))}
            </div>
          )}

          {/* Divider between SSO and password */}
          {hasProviders && !ssoOnly && (
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px" style={{ background: "var(--c-border)" }} />
              <span className="text-xs" style={{ color: "var(--c-text-4)" }}>
                or
              </span>
              <div className="flex-1 h-px" style={{ background: "var(--c-border)" }} />
            </div>
          )}

          {/* TOTP step */}
          {step === "totp" && (
            <form onSubmit={handleTotpSubmit}>
              <label className="form-label">Authenticator code</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                autoFocus
                className="form-input mb-4 text-center text-lg tracking-widest"
              />
              {error && (
                <div className="text-xs mb-4" style={{ color: "#f87171" }}>{error}</div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white"
                style={{ background: loading ? "var(--c-border)" : "#3b82f6" }}
              >
                {loading ? "Verifying..." : "Verify"}
              </button>
            </form>
          )}

          {/* Password form — hidden when SSO is enforced (unless admin escape hatch opened) */}
          {step !== "totp" && (!ssoOnly || showPasswordEscape) && (
            <>
              {step === "email" ? (
                <form onSubmit={handleEmailSubmit}>
                  <label className="form-label">Email address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    autoFocus={!hasProviders}
                    className="form-input mb-4"
                  />

                  {error && (
                    <div className="text-xs mb-4" style={{ color: "#f87171" }}>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
                    style={{
                      background: loading ? "var(--c-border)" : "#3b82f6",
                      cursor: loading ? "wait" : "pointer",
                    }}
                  >
                    {loading ? "Checking..." : "Continue"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handlePasswordSubmit}>
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                    autoFocus
                    className="form-input mb-4"
                  />

                  {error && (
                    <div className="text-xs mb-4" style={{ color: "#f87171" }}>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
                    style={{
                      background: loading ? "var(--c-border)" : "#3b82f6",
                      cursor: loading ? "wait" : "pointer",
                    }}
                  >
                    {loading ? "Signing in..." : "Sign in"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStep("email");
                      setPassword("");
                      setError("");
                    }}
                    className="w-full mt-2 py-2 text-sm"
                    style={{ color: "var(--c-text-4)", cursor: "pointer" }}
                  >
                    Use a different email
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        <p
          className="text-center text-xs mt-6"
          style={{ color: "var(--c-text-4)" }}
        >
          Self-hosted &middot; Your data stays on your infrastructure
        </p>

        {ssoOnly && !showPasswordEscape && (
          <p className="text-center text-xs mt-3">
            <button
              onClick={() => setShowPasswordEscape(true)}
              className="underline"
              style={{ color: "var(--c-text-5)", background: "none", border: "none", cursor: "pointer" }}
            >
              Admin password login
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
