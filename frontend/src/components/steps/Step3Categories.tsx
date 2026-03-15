import { useState } from "react";
import Card from "../layout/Card";
import { useConfiguration, useUpdateConfig, useTestOpenaiConnection } from "../../hooks/useConfiguration";
import { HELP_LINKS } from "../../config/helpLinks";
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useSeedCategories,
  useUpdateCategory,
} from "../../hooks/useCategories";

const MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"];

export default function Step3Categories() {
  const { data: config, isLoading: configLoading } = useConfiguration();
  const updateConfig = useUpdateConfig();
  const testOpenai = useTestOpenaiConnection();
  const { data: categories = [], isLoading: catLoading } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const seedCategories = useSeedCategories();

  const [classificationEnabled, setClassificationEnabled] = useState(false);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [maxCategories, setMaxCategories] = useState(2);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDesc, setNewCategoryDesc] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (config && !initialized) {
    setClassificationEnabled(config.classification_enabled);
    setModel(config.classification_model);
    setMaxCategories(config.max_categories_per_gpt);
    setInitialized(true);
  }

  if (configLoading || catLoading) return <div className="form-hint">Loading...</div>;

  const handleSaveClassification = () => {
    updateConfig.mutate({
      classification_enabled: classificationEnabled,
      openai_api_key: openaiApiKey || undefined,
      classification_model: model,
      max_categories_per_gpt: maxCategories,
    });
  };

  const handleTestOpenai = () => {
    handleSaveClassification();
    testOpenai.mutate();
  };

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;
    createCategory.mutate(
      { name: newCategoryName.trim(), description: newCategoryDesc.trim() || null },
      { onSuccess: () => { setNewCategoryName(""); setNewCategoryDesc(""); } },
    );
  };

  const KPI_ITEMS = [
    { label: "Risk level", icon: "🛡️" },
    { label: "Sophistication score", icon: "⭐" },
    { label: "Business process", icon: "🔄" },
    { label: "Prompting quality", icon: "✍️" },
    { label: "ROI signal", icon: "💰" },
    { label: "Audience", icon: "👥" },
    { label: "Integrations", icon: "🔌" },
    { label: "Output type", icon: "📄" },
    { label: "Adoption friction", icon: "🚧" },
  ];

  return (
    <div className="space-y-6">
      <Card
        title="Deep Analysis"
        description="Each GPT's system prompt is read by an LLM to extract intelligence about what it does, how well it's built, and whether it poses any risk."
      >
        <div className="space-y-4">

          {/* What you unlock */}
          <div className="rounded-lg p-4" style={{ background: "var(--c-accent-bg)", border: "1px solid #3b82f620" }}>
            <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#3b82f6" }}>
              What this step unlocks
            </div>
            <div className="grid grid-cols-3 gap-2">
              {KPI_ITEMS.map((k) => (
                <div key={k.label} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--c-text-3)" }}>
                  <span>{k.icon}</span>
                  <span>{k.label}</span>
                </div>
              ))}
            </div>
            <p className="text-xs mt-3" style={{ color: "var(--c-text-4)" }}>
              These signals power the Risk Panel, Quality Scores, Maturity breakdown, and L&D recommendations. Requires ~9 API calls per GPT.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium" style={{ color: "var(--c-text)" }}>Enable deep analysis</span>
              <p className="text-xs mt-0.5" style={{ color: "var(--c-text-4)" }}>
                {classificationEnabled ? "On — each GPT will be analyzed during the pipeline run." : "Off — GPTs will be fetched and categorized, but not analyzed. You can enable this later."}
              </p>
            </div>
            <button
              onClick={() => setClassificationEnabled(!classificationEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ml-4 ${
                classificationEnabled ? "bg-blue-600" : ""
              }`}
              style={!classificationEnabled ? { background: "var(--c-border)" } : {}}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  classificationEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {classificationEnabled && (
            <>
              <div className="alert-info">
                <div className="font-medium mb-1">Getting your OpenAI API Key</div>
                <p style={{ color: "var(--c-text-3)" }}>
                  A standard OpenAI API key is required — this is separate from the Compliance API key.{" "}
                  <a
                    href={HELP_LINKS.apiKey.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#3b82f6", textDecoration: "underline" }}
                  >
                    {HELP_LINKS.apiKey.label}
                  </a>
                </p>
              </div>

              <div>
                <label className="form-label">OpenAI API Key</label>
                <input
                  type="password"
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder={config?.openai_api_key ? "********" : "sk-..."}
                  className="form-input"
                />
              </div>
              <div>
                <label className="form-label">Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="form-input"
                >
                  {MODELS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Max Categories per GPT</label>
                <select
                  value={maxCategories}
                  onChange={(e) => setMaxCategories(Number(e.target.value))}
                  className="form-input"
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSaveClassification}
              disabled={updateConfig.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {updateConfig.isPending ? "Saving..." : "Save Settings"}
            </button>
            {classificationEnabled && (
              <button
                onClick={handleTestOpenai}
                disabled={testOpenai.isPending}
                className="px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50"
                style={{ color: "#3b82f6", background: "var(--c-accent-bg)", border: "1px solid #3b82f640" }}
              >
                {testOpenai.isPending ? "Testing..." : "Test Connection"}
              </button>
            )}
          </div>

          {testOpenai.isSuccess && (
            <div className={testOpenai.data.success ? "alert-success" : "alert-error"}>
              {testOpenai.data.message}
            </div>
          )}
          {testOpenai.isError && (
            <div className="alert-error">{(testOpenai.error as Error).message}</div>
          )}
          {updateConfig.isSuccess && !testOpenai.isSuccess && (
            <div className="alert-success">Classification settings saved.</div>
          )}
        </div>
      </Card>

      <Card
        title="Department Categories"
        description="Categories group GPTs by department or function. During the pipeline, each GPT is assigned to the most relevant category — powering the Departments chart, Builders view, and Process breakdown in your dashboard."
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => seedCategories.mutate()}
              disabled={seedCategories.isPending}
              className="px-3 py-1.5 text-xs font-medium rounded-md disabled:opacity-50"
              style={{ color: "#3b82f6", background: "var(--c-accent-bg)", border: "1px solid #3b82f640" }}
            >
              {seedCategories.isPending ? "Adding..." : "Seed Defaults"}
            </button>
            <span className="text-xs" style={{ color: "var(--c-text-4)" }}>
              Adds 10 pre-built categories covering common enterprise departments
            </span>
          </div>

          <ul style={{ borderTop: "1px solid var(--c-border)" }}>
            {categories.map((cat) => (
              <li
                key={cat.id}
                className="flex items-center justify-between py-2"
                style={{ borderBottom: "1px solid var(--c-border)" }}
              >
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                  <span className="text-sm font-medium" style={{ color: "var(--c-text)" }}>{cat.name}</span>
                  {cat.description && (
                    <span className="text-xs" style={{ color: "var(--c-text-4)" }}>{cat.description}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateCategory.mutate({ id: cat.id, enabled: !cat.enabled })}
                    className="text-xs px-2 py-0.5 rounded"
                    style={
                      cat.enabled
                        ? { background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)" }
                        : { background: "var(--c-border)", color: "var(--c-text-4)" }
                    }
                  >
                    {cat.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <button
                    onClick={() => deleteCategory.mutate(cat.id)}
                    className="text-xs"
                    style={{ color: "#ef4444" }}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Category name"
                className="form-input"
              />
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={newCategoryDesc}
                onChange={(e) => setNewCategoryDesc(e.target.value)}
                placeholder="Description (optional)"
                className="form-input"
              />
            </div>
            <button
              onClick={handleAddCategory}
              disabled={createCategory.isPending || !newCategoryName.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
