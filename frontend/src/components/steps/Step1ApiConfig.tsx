import { useState } from "react";
import Card from "../layout/Card";
import { useConfiguration, useUpdateConfig, useTestConnection } from "../../hooks/useConfiguration";

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

  if (isLoading) return <div className="text-gray-500">Loading...</div>;

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
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Workspace ID
          </label>
          <input
            type="text"
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            placeholder="ws-xxxxxxxx"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Compliance API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={config?.compliance_api_key ? "********" : "sk-..."}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Base URL
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-50"
          >
            {testConnection.isPending ? "Testing..." : "Test Connection"}
          </button>
        </div>

        {testConnection.isSuccess && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
            {testConnection.data.message}
          </div>
        )}
        {testConnection.isError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
            {(testConnection.error as Error).message}
          </div>
        )}
        {updateConfig.isSuccess && !testConnection.isSuccess && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
            Configuration saved.
          </div>
        )}
      </div>
    </Card>
  );
}
