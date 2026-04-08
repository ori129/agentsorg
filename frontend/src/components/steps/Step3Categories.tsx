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

interface Step3CategoriesProps {
  onSaved?: () => void;
}

export default function Step3Categories({ onSaved }: Step3CategoriesProps) {
  const { data: config, isLoading: configLoading } = useConfiguration();
  const updateConfig = useUpdateConfig();
  const testOpenai = useTestOpenaiConnection();
  const { data: categories = [], isLoading: catLoading } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const seedCategories = useSeedCategories();

  const [classificationEnabled, setClassificationEnabled] = useState(true);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [maxCategories, setMaxCategories] = useState(2);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDesc, setNewCategoryDesc] = useState("");
  const [initialized, setInitialized] = useState(false);

  if (config && !initialized) {
    const hasOpenAiKey = !!config.openai_api_key;
    setClassificationEnabled(hasOpenAiKey ? config.classification_enabled : true);
    setModel(config.classification_model);
    setMaxCategories(config.max_categories_per_gpt);
    setInitialized(true);
  }

  if (configLoading || catLoading) return <div className="form-hint">Loading…</div>;

  const handleSaveClassification = () => {
    updateConfig.mutate(
      {
        classification_enabled: classificationEnabled,
        openai_api_key: openaiApiKey || undefined,
        classification_model: model,
        max_categories_per_gpt: maxCategories,
      },
      { onSuccess: () => onSaved?.() }
    );
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

  return (
    <Card
      title="Categories & Analysis"
      description="Set up department categories and configure LLM-powered deep analysis for your AI assets."
    >
      <div className="space-y-0">

        {/* ── Section 1: LLM Analysis ──────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--c-text-5)" }}>
            LLM Analysis
          </div>

          {/* What this unlocks */}
          <div className="rounded-lg p-3" style={{ background: "var(--c-accent-bg)", border: "1px solid #3b82f620" }}>
            <div className="text-xs font-semibold mb-2" style={{ color: "#3b82f6" }}>What this unlocks</div>
            <div className="grid grid-cols-3 gap-1.5">
              {KPI_ITEMS.map((k) => (
                <div key={k.label} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--c-text-3)" }}>
                  <span>{k.icon}</span>
                  <span>{k.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium" style={{ color: "var(--c-text)" }}>Enable deep analysis</span>
              <p className="text-xs mt-0.5" style={{ color: "var(--c-text-4)" }}>
                {classificationEnabled
                  ? "On — each asset will be analyzed during the pipeline run. Requires ~9 API calls per asset."
                  : "Off — assets are fetched and categorized only. Enable to extract KPIs."}
              </p>
            </div>
            <button
              onClick={() => setClassificationEnabled(!classificationEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ml-4 ${classificationEnabled ? "bg-blue-600" : ""}`}
              style={!classificationEnabled ? { background: "var(--c-border)" } : {}}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${classificationEnabled ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          {/* OpenAI settings — only when enabled */}
          {classificationEnabled && (
            <div className="rounded-lg p-4 space-y-3" style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>
              <div className="alert-info">
                <div className="font-medium mb-0.5">OpenAI API Key required</div>
                <p style={{ color: "var(--c-text-3)" }}>
                  Separate from your Compliance API key.{" "}
                  <a href={HELP_LINKS.apiKey.url} target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6", textDecoration: "underline" }}>
                    {HELP_LINKS.apiKey.label}
                  </a>
                </p>
              </div>

              {/* Compact 3-column layout for settings */}
              <div className="grid gap-3" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
                <div>
                  <label className="form-label">OpenAI API Key</label>
                  <input
                    type="password"
                    value={openaiApiKey}
                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                    placeholder={config?.openai_api_key ? "••••••••" : "sk-…"}
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Model</label>
                  <select value={model} onChange={(e) => setModel(e.target.value)} className="form-input">
                    {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Max categories</label>
                  <select value={maxCategories} onChange={(e) => setMaxCategories(Number(e.target.value))} className="form-input">
                    {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Save row — scoped to LLM settings above */}
          <div className="flex items-center gap-3 pb-1 flex-wrap">
            <button
              onClick={handleSaveClassification}
              disabled={updateConfig.isPending}
              className="px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50"
              style={{ background: "#3b82f6" }}
            >
              {updateConfig.isPending ? "Saving…" : "Save analysis settings"}
            </button>
            {classificationEnabled && (
              <button
                onClick={handleTestOpenai}
                disabled={testOpenai.isPending || updateConfig.isPending}
                className="px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50"
                style={{ color: "#3b82f6", background: "var(--c-accent-bg)", border: "1px solid #3b82f640" }}
              >
                {testOpenai.isPending ? "Testing…" : "Save & test connection"}
              </button>
            )}
            {updateConfig.isSuccess && !testOpenai.isPending && (
              <span className="text-sm" style={{ color: "#10b981" }}>✓ Saved</span>
            )}
          </div>

          {/* Test result */}
          <div style={{ minHeight: 36 }}>
            {testOpenai.isSuccess && (
              <div className={testOpenai.data.success ? "alert-success" : "alert-error"}>
                {testOpenai.data.message}
              </div>
            )}
            {testOpenai.isError && (
              <div className="alert-error">{(testOpenai.error as Error).message}</div>
            )}
          </div>
        </div>

        {/* ── Divider ──────────────────────────────────────────────────────── */}
        <div style={{ borderTop: "1px solid var(--c-border)", margin: "8px 0 24px" }} />

        {/* ── Section 2: Department Categories ────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--c-text-5)" }}>
                Department Categories
              </div>
              <p className="text-xs" style={{ color: "var(--c-text-4)" }}>
                Each asset is assigned to the most relevant category — powers the Departments chart, Builders view, and Process breakdown.
              </p>
            </div>
            <button
              onClick={() => seedCategories.mutate()}
              disabled={seedCategories.isPending || categories.length > 0}
              className="px-3 py-1.5 text-xs font-medium rounded-md disabled:opacity-40 flex-shrink-0 ml-4"
              style={{ color: "#3b82f6", background: "var(--c-accent-bg)", border: "1px solid #3b82f640" }}
              title={categories.length > 0 ? "Categories already seeded" : "Add 10 pre-built department categories"}
            >
              {seedCategories.isPending ? "Adding…" : "Seed defaults"}
            </button>
          </div>

          {categories.length === 0 ? (
            <div className="rounded-lg py-8 text-center" style={{ border: "1px dashed var(--c-border)" }}>
              <p className="text-sm mb-1" style={{ color: "var(--c-text-4)" }}>No categories yet</p>
              <p className="text-xs" style={{ color: "var(--c-text-5)" }}>Click "Seed defaults" above to add 10 pre-built categories, or add your own below.</p>
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--c-border)" }}>
              {categories.map((cat, i) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between px-4 py-2.5"
                  style={{ borderBottom: i < categories.length - 1 ? "1px solid var(--c-border)" : "none" }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="text-sm font-medium" style={{ color: "var(--c-text)" }}>{cat.name}</span>
                    {cat.description && (
                      <span className="text-xs truncate" style={{ color: "var(--c-text-4)" }}>{cat.description}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
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
                      style={{ color: "var(--c-text-5)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--c-text-5)")}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add category */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                placeholder="Category name"
                className="form-input"
              />
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={newCategoryDesc}
                onChange={(e) => setNewCategoryDesc(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                placeholder="Description (optional)"
                className="form-input"
              />
            </div>
            <button
              onClick={handleAddCategory}
              disabled={createCategory.isPending || !newCategoryName.trim()}
              className="px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50"
              style={{ background: "#3b82f6" }}
            >
              Add
            </button>
          </div>
        </div>

      </div>
    </Card>
  );
}
