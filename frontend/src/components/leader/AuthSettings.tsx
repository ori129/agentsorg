import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { AuditLogEntry, OidcProvider, OidcProviderCreate } from "../../types";

type Tab = "sso" | "audit";

const EMPTY_FORM: OidcProviderCreate = {
  name: "",
  issuer_url: "",
  client_id: "",
  client_secret: "",
  scopes: "openid email profile",
  email_claim: "email",
  name_claim: "name",
  groups_claim: "",
  enabled: true,
  enforce_sso: false,
  allow_password_login: true,
};

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: `${color}22`, color }}
    >
      {children}
    </span>
  );
}

function ProviderCard({
  provider,
  onDelete,
  onTest,
  onToggleEnforce,
}: {
  provider: OidcProvider;
  onDelete: () => void;
  onTest: () => Promise<void>;
  onToggleEnforce: (enforce: boolean, allowPassword: boolean) => Promise<void>;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await onTest();
      setTestResult("Discovery OK");
    } catch (e) {
      setTestResult(`Failed: ${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleToggleEnforce = async () => {
    setToggling(true);
    try {
      await onToggleEnforce(!provider.enforce_sso, provider.allow_password_login);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div
      className="rounded-xl p-4 mb-3"
      style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm" style={{ color: "var(--c-text)" }}>
              {provider.name}
            </span>
            {provider.enabled ? (
              <Badge color="#10b981">Enabled</Badge>
            ) : (
              <Badge color="#6b7280">Disabled</Badge>
            )}
            {provider.enforce_sso && <Badge color="#f59e0b">SSO Enforced</Badge>}
          </div>
          <div className="text-xs mb-2" style={{ color: "var(--c-text-3)" }}>
            {provider.issuer_url}
          </div>
          <div className="flex gap-4 text-xs" style={{ color: "var(--c-text-4)" }}>
            <span>Client: {provider.client_id}</span>
            <span>Secret: {provider.has_client_secret ? "set" : "not set"}</span>
          </div>
          {testResult && (
            <div
              className="text-xs mt-2"
              style={{ color: testResult.startsWith("Failed") ? "#f87171" : "#10b981" }}
            >
              {testResult}
            </div>
          )}
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleTest}
            disabled={testing}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: "var(--c-surface-2)",
              border: "1px solid var(--c-border)",
              color: "var(--c-text-2)",
              cursor: testing ? "wait" : "pointer",
            }}
          >
            {testing ? "Testing..." : "Test"}
          </button>
          <button
            onClick={handleToggleEnforce}
            disabled={toggling}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: provider.enforce_sso ? "#fef2f2" : "var(--c-surface-2)",
              border: `1px solid ${provider.enforce_sso ? "#fecaca" : "var(--c-border)"}`,
              color: provider.enforce_sso ? "#b91c1c" : "var(--c-text-2)",
              cursor: toggling ? "wait" : "pointer",
            }}
          >
            {provider.enforce_sso ? "Unenforce SSO" : "Enforce SSO"}
          </button>
          <button
            onClick={onDelete}
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#b91c1c",
              cursor: "pointer",
            }}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

function AddProviderForm({
  onAdd,
  onCancel,
}: {
  onAdd: (data: OidcProviderCreate) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<OidcProviderCreate>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const update = (k: keyof OidcProviderCreate, v: unknown) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name || !form.issuer_url || !form.client_id) {
      setError("Name, Issuer URL, and Client ID are required");
      return;
    }
    setLoading(true);
    try {
      await onAdd(form);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl p-5 mb-4"
      style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
    >
      <h3 className="font-semibold mb-1 text-sm" style={{ color: "var(--c-text)" }}>
        Add OIDC Provider
      </h3>
      <p className="text-xs mb-4" style={{ color: "var(--c-text-4)" }}>
        You'll need your IT team or IdP admin to complete this. They'll give you the issuer URL and client credentials after registering this app.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="form-label text-xs">Provider name</label>
          <input
            className="form-input"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="e.g. Okta, Azure AD, Google"
          />
        </div>
        <div>
          <label className="form-label text-xs">Issuer URL</label>
          <input
            className="form-input"
            value={form.issuer_url}
            onChange={(e) => update("issuer_url", e.target.value)}
            placeholder="https://your-tenant.us.auth0.com"
          />
          {form.issuer_url && !form.issuer_url.startsWith("http") && (
            <div className="text-xs mt-1" style={{ color: "#f59e0b" }}>
              Add https:// — e.g. https://{form.issuer_url}
            </div>
          )}
        </div>
        <div>
          <label className="form-label text-xs">Client ID</label>
          <input
            className="form-input"
            value={form.client_id}
            onChange={(e) => update("client_id", e.target.value)}
          />
        </div>
        <div>
          <label className="form-label text-xs">Client Secret</label>
          <input
            type="password"
            className="form-input"
            value={form.client_secret ?? ""}
            onChange={(e) => update("client_secret", e.target.value)}
            placeholder="Optional for PKCE-only flows"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="text-xs mb-3 flex items-center gap-1"
        style={{ color: "var(--c-text-4)", cursor: "pointer", background: "none", border: "none", padding: 0 }}
      >
        <span style={{ fontSize: 10 }}>{showAdvanced ? "▼" : "▶"}</span>
        Advanced options
      </button>

      {showAdvanced && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="form-label text-xs">Scopes</label>
            <input
              className="form-input"
              value={form.scopes ?? ""}
              onChange={(e) => update("scopes", e.target.value)}
            />
          </div>
          <div>
            <label className="form-label text-xs">
              Groups claim
              <span className="ml-1 font-normal" style={{ color: "var(--c-text-4)" }}>— for role mapping from IdP groups</span>
            </label>
            <input
              className="form-input"
              value={form.groups_claim ?? ""}
              onChange={(e) => update("groups_claim", e.target.value || undefined)}
              placeholder="groups"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 mb-4 text-sm">
        <label className="flex items-center gap-2 cursor-pointer" style={{ color: "var(--c-text-2)" }}>
          <input
            type="checkbox"
            checked={form.enabled ?? true}
            onChange={(e) => update("enabled", e.target.checked)}
          />
          Enabled
        </label>
        <label className="flex items-center gap-2 cursor-pointer" style={{ color: "var(--c-text-2)" }}>
          <input
            type="checkbox"
            checked={form.allow_password_login ?? true}
            onChange={(e) => update("allow_password_login", e.target.checked)}
          />
          Allow password login alongside SSO
        </label>
      </div>

      {error && (
        <div className="text-xs mb-3" style={{ color: "#f87171" }}>
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: loading ? "var(--c-border)" : "#3b82f6", cursor: loading ? "wait" : "pointer" }}
        >
          {loading ? "Saving..." : "Add provider"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm"
          style={{ color: "var(--c-text-4)", cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function AuditTable({ entries }: { entries: AuditLogEntry[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--c-border)" }}>
            {["Timestamp", "Action", "Actor", "Target", "Status", "IP"].map((h) => (
              <th
                key={h}
                className="text-left py-2 px-3 font-semibold"
                style={{ color: "var(--c-text-3)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr
              key={e.id}
              style={{ borderBottom: "1px solid var(--c-border)" }}
            >
              <td className="py-2 px-3" style={{ color: "var(--c-text-3)" }}>
                {new Date(e.timestamp).toLocaleString()}
              </td>
              <td className="py-2 px-3 font-mono" style={{ color: "var(--c-text)" }}>
                {e.action}
              </td>
              <td className="py-2 px-3" style={{ color: "var(--c-text-2)" }}>
                {e.actor_email || e.actor_user_id || "—"}
              </td>
              <td className="py-2 px-3" style={{ color: "var(--c-text-3)" }}>
                {e.target_type ? `${e.target_type}/${e.target_id}` : "—"}
              </td>
              <td className="py-2 px-3">
                <Badge color={e.status === "success" ? "#10b981" : "#f87171"}>
                  {e.status}
                </Badge>
              </td>
              <td className="py-2 px-3" style={{ color: "var(--c-text-4)" }}>
                {e.ip_address || "—"}
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center" style={{ color: "var(--c-text-4)" }}>
                No audit events yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SetupGuide() {
  const callbackUrl = `${window.location.origin}/api/v1/auth/oidc/callback`;
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(callbackUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="mt-6 rounded-xl p-4 text-xs"
      style={{ background: "var(--c-surface-2)", border: "1px solid var(--c-border)" }}
    >
      <div className="font-semibold mb-3" style={{ color: "var(--c-text-2)" }}>
        Setup guide
      </div>
      <div className="mb-3">
        <div className="mb-1" style={{ color: "var(--c-text-3)" }}>
          1. Register this app in your IdP with this redirect URI:
        </div>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg font-mono"
          style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}
        >
          <span style={{ color: "var(--c-text)", flex: 1, wordBreak: "break-all" }}>
            {callbackUrl}
          </span>
          <button
            onClick={handleCopy}
            className="flex-shrink-0 text-xs px-2 py-1 rounded"
            style={{ color: copied ? "#10b981" : "var(--c-text-4)", cursor: "pointer", background: "none", border: "none" }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
      <ol className="list-decimal pl-4 space-y-1" style={{ color: "var(--c-text-3)" }}
          start={2}>
        <li>Enter the issuer URL — endpoints are discovered automatically</li>
        <li>Use "Test" to verify discovery succeeds</li>
        <li>Enable the provider so the SSO button appears on the login screen</li>
        <li>Optionally enforce SSO to prevent password login</li>
      </ol>
    </div>
  );
}

export default function AuthSettings() {
  const [tab, setTab] = useState<Tab>("sso");
  const [providers, setProviders] = useState<OidcProvider[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadProviders = async () => {
    try {
      const data = await api.getOidcProviders();
      setProviders(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLog = async () => {
    try {
      const data = await api.getAuditLog(100, 0);
      setAuditLog(data);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  useEffect(() => {
    if (tab === "audit") loadAuditLog();
  }, [tab]);

  const handleAdd = async (data: OidcProviderCreate) => {
    await api.createOidcProvider(data);
    setShowAddForm(false);
    await loadProviders();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this OIDC provider? This cannot be undone.")) return;
    await api.deleteOidcProvider(id);
    await loadProviders();
  };

  const handleTest = async (id: number) => {
    const result = await api.testOidcProvider(id);
    if (!result.success) throw new Error(result.message);
    await loadProviders();
  };

  const handleToggleEnforce = async (
    id: number,
    enforce: boolean,
    allowPassword: boolean
  ) => {
    await api.setOidcEnforcement(id, enforce, allowPassword);
    await loadProviders();
  };

  const enforceActive = providers.some((p) => p.enforce_sso && p.enabled);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold mb-1" style={{ color: "var(--c-text)" }}>
          Auth & SSO
        </h1>
        <p className="text-sm" style={{ color: "var(--c-text-3)" }}>
          Single Sign-On and audit log.
        </p>
      </div>

      {/* SSO enforcement banner */}
      {enforceActive && (
        <div
          className="rounded-xl p-4 mb-6 flex items-start gap-3"
          style={{ background: "#fef3c7", border: "1px solid #fcd34d" }}
        >
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div>
            <div className="font-semibold text-sm" style={{ color: "#92400e" }}>
              SSO enforcement is active
            </div>
            <div className="text-xs mt-0.5" style={{ color: "#78350f" }}>
              Non-admin users must sign in via SSO. Admins retain password access as an emergency fallback.
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6" style={{ borderBottom: "1px solid var(--c-border)" }}>
        {(["sso", "audit"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 text-sm font-medium transition-colors"
            style={{
              color: tab === t ? "var(--c-text)" : "var(--c-text-4)",
              borderBottom: tab === t ? "2px solid #3b82f6" : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            {t === "sso" ? "OIDC Providers" : "Audit Log"}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-sm mb-4" style={{ color: "#f87171" }}>
          {error}
        </div>
      )}

      {tab === "sso" && (
        <div>
          {loading ? (
            <div className="text-sm" style={{ color: "var(--c-text-4)" }}>
              Loading...
            </div>
          ) : (
            <>
              {providers.length === 0 && !showAddForm && (
                <div
                  className="rounded-xl p-6 mb-4"
                  style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
                >
                  <div className="text-sm font-medium mb-1" style={{ color: "var(--c-text)" }}>
                    No SSO configured
                  </div>
                  <div className="text-xs mb-1" style={{ color: "var(--c-text-3)" }}>
                    Your team can log in with passwords — no SSO needed.
                  </div>
                  <div className="text-xs mb-4" style={{ color: "var(--c-text-4)" }}>
                    If your company uses Okta, Azure AD, or Google Workspace and you want employees to log in without a separate password, add a provider below. You'll need your IT admin to help set it up.
                  </div>
                  <button
                    onClick={() => setShowAddForm(true)}
                    className="px-4 py-2 rounded-lg text-sm font-medium"
                    style={{
                      background: "var(--c-surface-2)",
                      border: "1px solid var(--c-border)",
                      color: "var(--c-text-2)",
                      cursor: "pointer",
                    }}
                  >
                    Connect an identity provider
                  </button>
                </div>
              )}

              {providers.map((p) => (
                <ProviderCard
                  key={p.id}
                  provider={p}
                  onDelete={() => handleDelete(p.id)}
                  onTest={() => handleTest(p.id)}
                  onToggleEnforce={(enforce, allowPassword) =>
                    handleToggleEnforce(p.id, enforce, allowPassword)
                  }
                />
              ))}

              {showAddForm && (
                <AddProviderForm
                  onAdd={handleAdd}
                  onCancel={() => setShowAddForm(false)}
                />
              )}

              {providers.length > 0 && !showAddForm && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="text-sm px-4 py-2 rounded-lg"
                  style={{
                    background: "var(--c-surface)",
                    border: "1px solid var(--c-border)",
                    color: "var(--c-text-2)",
                    cursor: "pointer",
                  }}
                >
                  + Add another provider
                </button>
              )}

              {/* SSO setup guide */}
              <SetupGuide />
            </>
          )}
        </div>
      )}

      {tab === "audit" && (
        <div>
          <div className="flex justify-end mb-3">
            <button
              onClick={loadAuditLog}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{
                background: "var(--c-surface)",
                border: "1px solid var(--c-border)",
                color: "var(--c-text-3)",
                cursor: "pointer",
              }}
            >
              Refresh
            </button>
          </div>
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--c-border)" }}
          >
            <AuditTable entries={auditLog} />
          </div>
        </div>
      )}
    </div>
  );
}
