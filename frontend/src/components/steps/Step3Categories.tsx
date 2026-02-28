import { useState } from "react";
import Card from "../layout/Card";
import { useConfiguration, useUpdateConfig } from "../../hooks/useConfiguration";
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

  if (configLoading || catLoading) return <div className="text-gray-500">Loading...</div>;

  const handleSaveClassification = () => {
    updateConfig.mutate({
      classification_enabled: classificationEnabled,
      openai_api_key: openaiApiKey || undefined,
      classification_model: model,
      max_categories_per_gpt: maxCategories,
    });
  };

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;
    createCategory.mutate(
      { name: newCategoryName.trim(), description: newCategoryDesc.trim() || null },
      { onSuccess: () => { setNewCategoryName(""); setNewCategoryDesc(""); } },
    );
  };

  return (
    <div className="space-y-6">
      <Card
        title="Classification Settings"
        description="Enable AI-powered classification of GPTs into categories."
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Enable Classification</span>
            <button
              onClick={() => setClassificationEnabled(!classificationEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                classificationEnabled ? "bg-blue-600" : "bg-gray-200"
              }`}
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
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  OpenAI API Key
                </label>
                <input
                  type="password"
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder={config?.openai_api_key ? "********" : "sk-..."}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {MODELS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Max Categories per GPT
                </label>
                <select
                  value={maxCategories}
                  onChange={(e) => setMaxCategories(Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <button
            onClick={handleSaveClassification}
            disabled={updateConfig.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {updateConfig.isPending ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </Card>

      <Card
        title="Categories"
        description="Define categories for classifying GPTs."
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              onClick={() => seedCategories.mutate()}
              disabled={seedCategories.isPending}
              className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-50"
            >
              Seed Defaults
            </button>
          </div>

          <ul className="divide-y divide-gray-100">
            {categories.map((cat) => (
              <li key={cat.id} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="text-sm font-medium text-gray-900">{cat.name}</span>
                  {cat.description && (
                    <span className="text-xs text-gray-400">{cat.description}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      updateCategory.mutate({ id: cat.id, enabled: !cat.enabled })
                    }
                    className={`text-xs px-2 py-0.5 rounded ${
                      cat.enabled
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {cat.enabled ? "Enabled" : "Disabled"}
                  </button>
                  <button
                    onClick={() => deleteCategory.mutate(cat.id)}
                    className="text-xs text-red-500 hover:text-red-700"
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
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={newCategoryDesc}
                onChange={(e) => setNewCategoryDesc(e.target.value)}
                placeholder="Description (optional)"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
