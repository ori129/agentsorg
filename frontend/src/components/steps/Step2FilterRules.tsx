import { useState } from "react";
import Card from "../layout/Card";
import { useConfiguration, useUpdateConfig } from "../../hooks/useConfiguration";

const VISIBILITY_OPTIONS = [
  { key: "everyone_in_workspace", label: "Everyone in Workspace" },
  { key: "anyone_with_link", label: "Anyone with a Link" },
  { key: "invite_only", label: "Invite Only" },
  { key: "just_me", label: "Just Me" },
];

export default function Step2FilterRules() {
  const { data: config, isLoading } = useConfiguration();
  const updateConfig = useUpdateConfig();

  const [includeAll, setIncludeAll] = useState(true);
  const [visibilityFilters, setVisibilityFilters] = useState<Record<string, boolean>>({});
  const [minSharedUsers, setMinSharedUsers] = useState(0);
  const [excludedEmails, setExcludedEmails] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (config && !initialized) {
    setIncludeAll(config.include_all);
    setVisibilityFilters(config.visibility_filters || {});
    setMinSharedUsers(config.min_shared_users);
    setExcludedEmails((config.excluded_emails || []).join(", "));
    setInitialized(true);
  }

  if (isLoading) return <div className="text-gray-500">Loading...</div>;

  const handleSave = () => {
    updateConfig.mutate({
      include_all: includeAll,
      visibility_filters: visibilityFilters,
      min_shared_users: minSharedUsers,
      excluded_emails: excludedEmails
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean),
    });
  };

  const toggleVisibility = (key: string) => {
    setVisibilityFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Card
      title="Filtering Rules"
      description="Configure which GPTs to include based on visibility and ownership."
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-gray-700">Include All GPTs</span>
            <p className="text-xs text-gray-500">Skip filtering and include everything</p>
          </div>
          <button
            onClick={() => setIncludeAll(!includeAll)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              includeAll ? "bg-blue-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                includeAll ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {!includeAll && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Visibility Filters
              </label>
              <div className="grid grid-cols-2 gap-2">
                {VISIBILITY_OPTIONS.map((opt) => (
                  <label
                    key={opt.key}
                    className="flex items-center gap-2 p-2 rounded border border-gray-200 cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={visibilityFilters[opt.key] || false}
                      onChange={() => toggleVisibility(opt.key)}
                      className="rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-sm text-gray-700">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {visibilityFilters["invite_only"] && (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Minimum Shared Users (Invite Only)
                </label>
                <input
                  type="range"
                  min={0}
                  max={50}
                  value={minSharedUsers}
                  onChange={(e) => setMinSharedUsers(Number(e.target.value))}
                  className="mt-1 w-full"
                />
                <span className="text-sm text-gray-500">{minSharedUsers} users</span>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Excluded Owner Emails
              </label>
              <input
                type="text"
                value={excludedEmails}
                onChange={(e) => setExcludedEmails(e.target.value)}
                placeholder="admin@company.com, bot@company.com"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">Comma-separated list of emails to exclude</p>
            </div>
          </>
        )}

        <button
          onClick={handleSave}
          disabled={updateConfig.isPending}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {updateConfig.isPending ? "Saving..." : "Save Filters"}
        </button>

        {updateConfig.isSuccess && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
            Filters saved.
          </div>
        )}
      </div>
    </Card>
  );
}
