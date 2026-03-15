import { useState } from "react";
import { api } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";

/**
 * Full-screen blocking overlay shown when the current user has a temporary
 * password (password_temp === true). They must set a new permanent password
 * before they can use the application.
 */
export default function ForceChangePassword() {
  const { refreshUser, logout } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      // old_password is undefined — backend skips the check when password_temp=true
      await api.changePassword(undefined, newPassword);
      // Refresh the user object so password_temp becomes false and gate lifts
      await refreshUser();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-4 z-50"
      style={{ background: "var(--c-bg)" }}
    >
      <div className="w-full max-w-md">
        {/* Logo */}
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

        <div
          className="rounded-2xl p-8"
          style={{
            background: "var(--c-surface)",
            border: "1px solid var(--c-border)",
          }}
        >
          {/* Warning badge */}
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium mb-4"
            style={{ background: "#f59e0b20", color: "#f59e0b", border: "1px solid #f59e0b40" }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4zm0 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
            </svg>
            Temporary password — action required
          </div>

          <h1
            className="text-xl font-bold mb-1"
            style={{ color: "var(--c-text)" }}
          >
            Set a new password
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--c-text-3)" }}>
            Your account is using a temporary password. Please set a permanent
            password to continue.
          </p>

          <form onSubmit={handleSubmit}>
            <label className="form-label">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoFocus
              className="form-input mb-4"
            />

            <label className="form-label">Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your new password"
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
              {loading ? "Saving..." : "Set password & continue"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => logout()}
            className="w-full mt-3 py-2 text-xs"
            style={{ color: "var(--c-text-4)", cursor: "pointer" }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
