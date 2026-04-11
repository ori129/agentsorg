import { useState, useEffect } from "react";
import Card from "../layout/Card";
import { useConfiguration, useUpdateConfig, useTestConnection } from "../../hooks/useConfiguration";
import { HELP_LINKS } from "../../config/helpLinks";

export default function Step1ApiConfig() {
  const { data: config, isLoading } = useConfiguration();
  const updateConfig = useUpdateConfig();
  const testConnection = useTestConnection();

  const [workspaceId, setWorkspaceId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.chatgpt.com/v1");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (config && !initialized) {
      setWorkspaceId(config.workspace_id || "");
      setBaseUrl(config.base_url || "https://api.chatgpt.com/v1");
      setInitialized(true);
    }
  }, [config, initialized]);

  if (isLoading) return <div className="form-hint">Loading...</div>;

  const handleSave = () => {
    updateConfig.mutate({
      workspace_id: workspaceId,
      compliance_api_key: apiKey || undefined,
      base_url: baseUrl,
    });
  };

  const handleTest = () => {
    handleSave();
    testConnection.mutate();
  };

  return (
    <Card
      title="API Configuration"
      description="Connect to the OpenAI Compliance API to discover AI assets in your workspace."
    >
      <div className="space-y-4">
        <div className="alert-info">
          <div className="font-medium mb-1">Getting your Compliance API Key</div>
          <p style={{ color: "var(--c-text-3)" }}>
            Obtain audit and compliance data in your Enterprise workspace.{" "}
            <a
              href={HELP_LINKS.complianceApi.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#3b82f6", textDecoration: "underline" }}
            >
              {HELP_LINKS.complianceApi.label}
            </a>
          </p>
        </div>

        <div>
          <label className="form-label">Workspace ID</label>
          <input
            type="text"
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            placeholder="ws-xxxxxxxx"
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">Compliance API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={config?.compliance_api_key ? "********" : "sk-..."}
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">Base URL</label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="form-input"
          />
        </div>

        <div className="flex items-center gap-3 pt-2 flex-wrap">
          <button
            onClick={handleSave}
            disabled={updateConfig.isPending}
            className="px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50"
            style={{ background: "#3b82f6" }}
          >
            {updateConfig.isPending ? "Saving…" : "Save credentials"}
          </button>
          <button
            onClick={handleTest}
            disabled={testConnection.isPending || updateConfig.isPending}
            className="px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50"
            style={{ color: "#3b82f6", background: "var(--c-accent-bg)", border: "1px solid #3b82f640" }}
          >
            {testConnection.isPending ? "Testing…" : "Save & test connection"}
          </button>
          {/* Inline save confirmation — no layout shift */}
          {updateConfig.isSuccess && !testConnection.isPending && (
            <span className="text-sm" style={{ color: "#10b981" }}>✓ Saved</span>
          )}
        </div>

        {/* Test result — reserve space so it doesn't jump */}
        <div style={{ minHeight: 36 }}>
          {testConnection.isSuccess && (
            <div className="alert-success mt-2">{testConnection.data.message}</div>
          )}
          {testConnection.isError && (
            <div className="alert-error mt-2">{(testConnection.error as Error).message}</div>
          )}
        </div>
      </div>
    </Card>
  );
}
