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
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--c-bg)" }}
    >
      <div
        className="w-full max-w-md rounded-xl p-8"
        style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}
          >
            GPT
          </div>
          <div>
            <div className="text-lg font-bold" style={{ color: "var(--c-text)" }}>
              GPT Registry
            </div>
            <div className="text-xs" style={{ color: "var(--c-text-4)" }}>
              Sign in to continue
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--c-text-4)" }}>
            Email address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoFocus
            className="w-full px-3 py-2 rounded-lg text-sm mb-4 outline-none"
            style={{
              background: "var(--c-bg)",
              border: "1px solid var(--c-border)",
              color: "var(--c-text)",
            }}
          />

          {error && (
            <div className="text-xs mb-3" style={{ color: "#f87171" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-medium"
            style={{
              background: loading ? "var(--c-border)" : "#3b82f6",
              color: "#fff",
              cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
