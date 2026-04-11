import { useState } from "react";
import { useUsers, useImportUsers, useUpdateUserRole, useInviteUser } from "../../hooks/useUsers";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../api/client";
import type { WorkspaceUser, SystemRole } from "../../types";

type StatusFilter = "all" | "active" | "inactive" | "admins";
type SortField = "name" | "email" | "role" | "status";

const ROLE_LABELS: Record<string, string> = {
  "account-owner": "Account Owner",
  "account-admin": "Admin",
  "standard-user": "Standard",
};

const ROLE_COLORS: Record<string, string> = {
  "account-owner": "#8b5cf6",
  "account-admin": "#3b82f6",
  "standard-user": "var(--c-text-4)",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const SYSTEM_ROLE_LABELS: Record<SystemRole, string> = {
  "system-admin": "System Admin",
  "ai-leader": "AI Leader",
  "employee": "Employee",
};

const SYSTEM_ROLE_COLORS: Record<SystemRole, string> = {
  "system-admin": "#8b5cf6",
  "ai-leader": "#3b82f6",
  "employee": "var(--c-text-4)",
};

// ---------------------------------------------------------------------------
// Reset-password modal — shown after clicking "Reset Password" on a user row
// ---------------------------------------------------------------------------
interface ResetPasswordModalProps {
  user: WorkspaceUser;
  onClose: () => void;
}

function ResetPasswordModal({ user, onClose }: ResetPasswordModalProps) {
  const [loading, setLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleReset = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await api.resetUserPassword(user.id);
      setTempPassword(result.temp_password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (tempPassword) {
      navigator.clipboard.writeText(tempPassword).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="w-full max-w-md rounded-2xl p-6"
        style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>
        <h2 className="text-lg font-bold mb-2" style={{ color: "var(--c-text)" }}>
          Reset password
        </h2>
        <p className="text-sm mb-5" style={{ color: "var(--c-text-3)" }}>
          This will generate a temporary password for{" "}
          <span style={{ color: "var(--c-text)" }}>{user.email}</span>. They will
          be forced to set a new password on next login.
        </p>

        {!tempPassword ? (
          <>
            {error && (
              <div className="text-xs mb-4" style={{ color: "#f87171" }}>{error}</div>
            )}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{
                  background: "var(--c-border)",
                  color: "var(--c-text-3)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={loading}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white"
                style={{
                  background: loading ? "var(--c-border)" : "#ef4444",
                  cursor: loading ? "wait" : "pointer",
                }}
              >
                {loading ? "Resetting..." : "Generate temp password"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-xs mb-2" style={{ color: "var(--c-text-4)" }}>
                Share this one-time password with {user.name || user.email}:
              </p>
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-sm"
                style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}
              >
                <span style={{ color: "#10b981", flex: 1 }}>{tempPassword}</span>
                <button
                  onClick={handleCopy}
                  className="text-xs px-2 py-1 rounded"
                  style={{ color: copied ? "#10b981" : "var(--c-text-4)", cursor: "pointer" }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
            <p className="text-xs mb-5" style={{ color: "var(--c-text-4)" }}>
              This password is shown once. The user will be prompted to change it on their
              first login.
            </p>
            <button
              onClick={onClose}
              className="w-full py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: "#3b82f6", cursor: "pointer" }}
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Promote-to-AI-Leader modal — auto-generates temp password before role change
// ---------------------------------------------------------------------------
interface PromoteModalProps {
  user: WorkspaceUser;
  onClose: () => void;
  onDone: () => void;
}

function PromoteToLeaderModal({ user, onClose, onDone }: PromoteModalProps) {
  const updateRoleMutation = useUpdateUserRole();
  const [loading, setLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handlePromote = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await api.resetUserPassword(user.id);
      setTempPassword(result.temp_password);
      await updateRoleMutation.mutateAsync({ userId: user.id, systemRole: "ai-leader" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (tempPassword) {
      navigator.clipboard.writeText(tempPassword).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="w-full max-w-md rounded-2xl p-6"
        style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>
        <h2 className="text-lg font-bold mb-2" style={{ color: "var(--c-text)" }}>
          Promote to AI Leader
        </h2>

        {!tempPassword ? (
          <>
            <p className="text-sm mb-5" style={{ color: "var(--c-text-3)" }}>
              You are promoting{" "}
              <span style={{ color: "var(--c-text)" }}>{user.name || user.email}</span>{" "}
              to AI Leader. A temporary password will be generated so they can log in.
              You will need to share it with them.
            </p>
            {error && (
              <div className="text-xs mb-4" style={{ color: "#f87171" }}>{error}</div>
            )}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{
                  background: "var(--c-border)",
                  color: "var(--c-text-3)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handlePromote}
                disabled={loading}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white"
                style={{
                  background: loading ? "var(--c-border)" : "#3b82f6",
                  cursor: loading ? "wait" : "pointer",
                }}
              >
                {loading ? "Generating..." : "Generate & Promote"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm mb-4" style={{ color: "var(--c-text-3)" }}>
              <span style={{ color: "#10b981" }}>{user.name || user.email}</span> has been
              promoted. Share this one-time password with them:
            </p>
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-sm mb-4"
              style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}
            >
              <span style={{ color: "#10b981", flex: 1 }}>{tempPassword}</span>
              <button
                onClick={handleCopy}
                className="text-xs px-2 py-1 rounded"
                style={{ color: copied ? "#10b981" : "var(--c-text-4)", cursor: "pointer" }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-xs mb-5" style={{ color: "var(--c-text-4)" }}>
              This password is shown once. The user will be prompted to change it on first login.
            </p>
            <button
              onClick={onDone}
              className="w-full py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: "#3b82f6", cursor: "pointer" }}
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invite user modal — create a new user without needing the Compliance API
// ---------------------------------------------------------------------------
interface InviteUserModalProps {
  onClose: () => void;
}

function InviteUserModal({ onClose }: InviteUserModalProps) {
  const inviteMutation = useInviteUser();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [systemRole, setSystemRole] = useState<string>("employee");
  const [copied, setCopied] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    inviteMutation.mutate({ email: email.trim(), name: name.trim() || undefined, system_role: systemRole });
  };

  const handleCopy = () => {
    const tp = inviteMutation.data?.temp_password;
    if (tp) {
      navigator.clipboard.writeText(tp).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const needsPassword = systemRole === "system-admin" || systemRole === "ai-leader";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.6)" }}>
      <div className="w-full max-w-md rounded-2xl p-6"
        style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>
        <h2 className="text-lg font-bold mb-2" style={{ color: "var(--c-text)" }}>
          Invite user
        </h2>

        {!inviteMutation.isSuccess ? (
          <>
            <p className="text-sm mb-3" style={{ color: "var(--c-text-3)" }}>
              Add a user directly without importing from the OpenAI Compliance API.
              {needsPassword && " A temporary password will be generated for privileged roles."}
            </p>
            <div
              className="text-xs mb-5 px-3 py-2 rounded-lg"
              style={{ background: "var(--c-surface-2)", color: "var(--c-text-4)", border: "1px solid var(--c-border)" }}
            >
              <strong style={{ color: "var(--c-text-3)" }}>Tip:</strong> For regular employees, set up SSO in Auth &amp; SSO settings — they'll appear here automatically on first login without needing an invitation.
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--c-text-4)" }}>
                  Email *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@company.com"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{
                    background: "var(--c-bg)",
                    border: "1px solid var(--c-border)",
                    color: "var(--c-text)",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--c-text-4)" }}>
                  Name (optional)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{
                    background: "var(--c-bg)",
                    border: "1px solid var(--c-border)",
                    color: "var(--c-text)",
                  }}
                />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--c-text-4)" }}>
                  Role
                </label>
                <select
                  value={systemRole}
                  onChange={(e) => setSystemRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{
                    background: "var(--c-bg)",
                    border: "1px solid var(--c-border)",
                    color: "var(--c-text)",
                  }}
                >
                  <option value="employee">Employee (email-only login)</option>
                  <option value="ai-leader">AI Leader (password required)</option>
                  <option value="system-admin">System Admin (password required)</option>
                </select>
              </div>
              {inviteMutation.isError && (
                <div className="text-xs" style={{ color: "#f87171" }}>
                  {(inviteMutation.error as Error).message}
                </div>
              )}
              <div className="flex gap-3 mt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2 rounded-lg text-sm font-medium"
                  style={{
                    background: "var(--c-border)",
                    color: "var(--c-text-3)",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteMutation.isPending}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{
                    background: inviteMutation.isPending ? "var(--c-border)" : "#3b82f6",
                    cursor: inviteMutation.isPending ? "wait" : "pointer",
                  }}
                >
                  {inviteMutation.isPending ? "Inviting..." : "Invite"}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <p className="text-sm mb-4" style={{ color: "var(--c-text-3)" }}>
              <span style={{ color: "#10b981" }}>
                {inviteMutation.data.user.name || inviteMutation.data.user.email}
              </span>{" "}
              has been added as{" "}
              <span style={{ color: "var(--c-text)" }}>
                {SYSTEM_ROLE_LABELS[inviteMutation.data.user.system_role as SystemRole]}
              </span>.
            </p>
            {inviteMutation.data.temp_password && (
              <>
                <p className="text-xs mb-2" style={{ color: "var(--c-text-4)" }}>
                  Share this one-time password with them:
                </p>
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-sm mb-4"
                  style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}
                >
                  <span style={{ color: "#10b981", flex: 1 }}>
                    {inviteMutation.data.temp_password}
                  </span>
                  <button
                    onClick={handleCopy}
                    className="text-xs px-2 py-1 rounded"
                    style={{ color: copied ? "#10b981" : "var(--c-text-4)", cursor: "pointer" }}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="text-xs mb-5" style={{ color: "var(--c-text-4)" }}>
                  This password is shown once. The user will be prompted to change it on first login.
                </p>
              </>
            )}
            <button
              onClick={onClose}
              className="w-full py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: "#3b82f6", cursor: "pointer" }}
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Users component
// ---------------------------------------------------------------------------

export default function Users() {
  const { data: users = [], isLoading, refetch } = useUsers();
  const importMutation = useImportUsers();
  const updateRoleMutation = useUpdateUserRole();
  const { systemRole: myRole } = useAuth();
  const isAdmin = myRole === "system-admin";

  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<SortField>("name");
  const [search, setSearch] = useState("");

  // Modal state
  const [resetTarget, setResetTarget] = useState<WorkspaceUser | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<WorkspaceUser | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const activeCount = users.filter((u) => u.status === "active").length;
  const inactiveCount = users.filter((u) => u.status === "inactive").length;
  const adminCount = users.filter((u) => u.system_role === "system-admin").length;

  const searchLower = search.trim().toLowerCase();

  const filtered = users
    .filter((u) => {
      if (filter === "admins") return u.system_role === "system-admin";
      return filter === "all" || u.status === filter;
    })
    .filter((u) => {
      if (!searchLower) return true;
      return (
        (u.name ?? "").toLowerCase().includes(searchLower) ||
        u.email.toLowerCase().includes(searchLower)
      );
    })
    .sort((a, b) => {
      const av = (a[sortBy] ?? "") as string;
      const bv = (b[sortBy] ?? "") as string;
      return av.localeCompare(bv);
    });

  const handleRoleChange = (user: WorkspaceUser, newRole: string) => {
    if (newRole === "ai-leader" && user.system_role !== "ai-leader") {
      // Intercept: show promote modal which handles temp password generation
      setPromoteTarget(user);
      return;
    }
    updateRoleMutation.mutate({ userId: user.id, systemRole: newRole });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Modals */}
      {showInvite && <InviteUserModal onClose={() => setShowInvite(false)} />}
      {resetTarget && (
        <ResetPasswordModal
          user={resetTarget}
          onClose={() => setResetTarget(null)}
        />
      )}
      {promoteTarget && (
        <PromoteToLeaderModal
          user={promoteTarget}
          onClose={() => setPromoteTarget(null)}
          onDone={() => {
            setPromoteTarget(null);
            refetch();
          }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-xl font-bold" style={{ color: "var(--c-text)" }}>
          Workspace Users
        </h1>
        <div className="flex gap-2">
          {isAdmin && (
            <button
              onClick={() => setShowInvite(true)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: "var(--c-border)",
                color: "var(--c-text-3)",
                border: "1px solid var(--c-border)",
                cursor: "pointer",
              }}
            >
              Invite User
            </button>
          )}
          <button
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: importMutation.isPending ? "var(--c-border)" : "#3b82f6",
              color: "#fff",
              cursor: importMutation.isPending ? "wait" : "pointer",
            }}
          >
            {importMutation.isPending ? "Importing..." : "Import Users"}
          </button>
        </div>
      </div>
      <p className="text-sm mb-6" style={{ color: "var(--c-text-4)" }}>
        Workspace members imported from the OpenAI Compliance API, invited directly, or auto-provisioned on first SSO login.
      </p>

      {/* Import result toast */}
      {importMutation.isSuccess && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-lg mb-5 text-sm"
          style={{ background: "#052e16", border: "1px solid #14532d", color: "#4ade80" }}
        >
          Imported {importMutation.data.imported} new, updated{" "}
          {importMutation.data.updated} existing ({importMutation.data.total} total users).
        </div>
      )}
      {importMutation.isError && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-lg mb-5 text-sm"
          style={{ background: "#1c0000", border: "1px solid #7f1d1d", color: "#f87171" }}
        >
          Import failed: {(importMutation.error as Error).message}
        </div>
      )}

      {/* Stats */}
      <div className="flex gap-3 mb-6">
        {[
          { label: "Total", value: users.length, color: "#3b82f6" },
          { label: "Active", value: activeCount, color: "#10b981" },
          { label: "Inactive", value: inactiveCount, color: "#6b7280" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="px-4 py-3 rounded-lg"
            style={{ background: `${stat.color}15`, border: `1px solid ${stat.color}30` }}
          >
            <div className="text-lg font-bold" style={{ color: stat.color }}>
              {stat.value}
            </div>
            <div className="text-xs" style={{ color: "var(--c-text-4)" }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full max-w-sm px-3 py-2 rounded-lg text-sm outline-none"
          style={{
            background: "var(--c-bg)",
            border: "1px solid var(--c-border)",
            color: "var(--c-text)",
          }}
        />
      </div>

      {/* Filter + Sort */}
      <div className="flex gap-3 mb-4">
        {(["all", "active", "inactive", "admins"] as const).map((f) => {
          const count =
            f === "all"
              ? users.length
              : f === "active"
              ? activeCount
              : f === "inactive"
              ? inactiveCount
              : adminCount;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={
                filter === f
                  ? {
                      background: "var(--c-accent-bg)",
                      color: "#3b82f6",
                      border: "1px solid #3b82f6",
                    }
                  : {
                      background: "var(--c-border)",
                      color: "var(--c-text-3)",
                      border: "1px solid var(--c-border)",
                    }
              }
            >
              {f === "admins"
                ? "System Admins"
                : f.charAt(0).toUpperCase() + f.slice(1)}{" "}
              ({count})
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--c-text-4)" }}>Sort:</span>
          {(["name", "email", "role"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className="text-xs px-2 py-1 rounded"
              style={
                sortBy === s
                  ? { background: "var(--c-accent-bg)", color: "#3b82f6" }
                  : { color: "var(--c-text-4)" }
              }
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-sm py-12 text-center" style={{ color: "var(--c-text-4)" }}>
          Loading users...
        </div>
      ) : users.length === 0 ? (
        <div className="text-sm py-12 text-center" style={{ color: "var(--c-text-4)" }}>
          No users imported yet. Click "Import Users" to fetch from the Compliance API.
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: "1px solid var(--c-border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr
                style={{
                  background: "var(--c-surface)",
                  borderBottom: "1px solid var(--c-border)",
                }}
              >
                {[
                  "Name",
                  "Email",
                  "Workspace Role",
                  "System Role",
                  "Status",
                  "Member Since",
                  ...(isAdmin ? ["Actions"] : []),
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-medium"
                    style={{ color: "var(--c-text-4)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u: WorkspaceUser, idx: number) => (
                <tr
                  key={u.id}
                  style={{
                    background: idx % 2 === 0 ? "var(--c-bg)" : "var(--c-surface)",
                    borderBottom: "1px solid var(--c-border)",
                  }}
                >
                  <td className="px-4 py-3 font-medium" style={{ color: "var(--c-text)" }}>
                    {u.name || "—"}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--c-text-3)" }}>
                    {u.email}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded"
                      style={{
                        background: `${ROLE_COLORS[u.role] ?? "var(--c-text-4)"}20`,
                        color: ROLE_COLORS[u.role] ?? "var(--c-text-4)",
                      }}
                    >
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <select
                        value={u.system_role}
                        disabled={u.system_role === "system-admin" && adminCount <= 1}
                        title={
                          u.system_role === "system-admin" && adminCount <= 1
                            ? "Promote another user first"
                            : undefined
                        }
                        onChange={(e) => handleRoleChange(u, e.target.value)}
                        className="text-xs px-2 py-1 rounded outline-none"
                        style={{
                          background: `${
                            SYSTEM_ROLE_COLORS[u.system_role as SystemRole] ??
                            "var(--c-text-4)"
                          }15`,
                          color:
                            SYSTEM_ROLE_COLORS[u.system_role as SystemRole] ??
                            "var(--c-text-4)",
                          border: `1px solid ${
                            SYSTEM_ROLE_COLORS[u.system_role as SystemRole] ??
                            "var(--c-text-4)"
                          }40`,
                        }}
                      >
                        <option value="system-admin">System Admin</option>
                        <option value="ai-leader">AI Leader</option>
                        <option value="employee">Employee</option>
                      </select>
                    ) : (
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded"
                        style={{
                          background: `${
                            SYSTEM_ROLE_COLORS[u.system_role as SystemRole] ??
                            "var(--c-text-4)"
                          }20`,
                          color:
                            SYSTEM_ROLE_COLORS[u.system_role as SystemRole] ??
                            "var(--c-text-4)",
                        }}
                      >
                        {SYSTEM_ROLE_LABELS[u.system_role as SystemRole] ?? u.system_role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={
                        u.status === "active"
                          ? { background: "#10b98125", color: "#10b981" }
                          : { background: "#6b728025", color: "#6b7280" }
                      }
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--c-text-4)" }}>
                    {formatDate(u.created_at)}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setResetTarget(u)}
                        className="text-xs px-2 py-1 rounded"
                        style={{
                          background: "#ef444415",
                          color: "#ef4444",
                          border: "1px solid #ef444430",
                          cursor: "pointer",
                        }}
                      >
                        Reset password
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
