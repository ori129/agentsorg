import { useState } from "react";
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

  if (config && !initialized) {
    setWorkspaceId(config.workspace_id || "");
    setBaseUrl(config.base_url || "https://api.chatgpt.com/v1");
    setInitialized(true);
  }

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
      description="Connect to the OpenAI Compliance API to discover Custom GPTs in your workspace."
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

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={updateConfig.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {updateConfig.isPending ? "Saving..." : "Save"}
          </button>
          <button
            onClick={handleTest}
            disabled={testConnection.isPending}
            className="px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50"
            style={{ color: "#3b82f6", background: "var(--c-accent-bg)", border: "1px solid #3b82f640" }}
          >
            {testConnection.isPending ? "Testing..." : "Test Connection"}
          </button>
        </div>

        {testConnection.isSuccess && (
          <div className="alert-success">{testConnection.data.message}</div>
        )}
        {testConnection.isError && (
          <div className="alert-error">{(testConnection.error as Error).message}</div>
        )}
        {updateConfig.isSuccess && !testConnection.isSuccess && (
          <div className="alert-success">Configuration saved.</div>
        )}
      </div>
    </Card>
  );
}
