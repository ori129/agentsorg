import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }
    setLoading(true);
    try {
      await login(trimmed);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--c-bg)" }}>
      <div className="w-full max-w-md">

        {/* Logo + brand */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <svg width="32" height="32" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: "var(--c-text)" }}>
            <rect x="1.5" y="1.5" width="25" height="25" rx="4" stroke="currentColor" strokeWidth="2"/>
            <circle cx="10" cy="10" r="4" fill="currentColor"/>
          </svg>
          <span className="text-xl font-bold tracking-tight" style={{ color: "var(--c-text)" }}>AgentsOrg.ai</span>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-8" style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>
          <h1 className="text-xl font-bold mb-1" style={{ color: "var(--c-text)" }}>
            Sign in
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--c-text-3)" }}>
            Enter your email to access the AI Transformation Intelligence dashboard.
          </p>

          <form onSubmit={handleSubmit}>
            <label className="form-label">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoFocus
              className="form-input mb-4"
            />

            {error && (
              <div className="text-xs mb-4" style={{ color: "#f87171" }}>{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
              style={{ background: loading ? "var(--c-border)" : "#3b82f6", cursor: loading ? "wait" : "pointer" }}
            >
              {loading ? "Signing in..." : "Continue"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "var(--c-text-4)" }}>
          Self-hosted &middot; Your data stays on your infrastructure
        </p>
      </div>
    </div>
  );
}
