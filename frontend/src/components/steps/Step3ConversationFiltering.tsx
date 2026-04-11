import { useState, useEffect } from "react";
import Card from "../layout/Card";
import { useConfiguration } from "../../hooks/useConfiguration";
import { usePatchConversationConfig } from "../../hooks/useConversations";

const PRIVACY_OPTIONS = [
  {
    level: 0,
    label: "Off",
    sublabel: "No analysis",
    unlocks: [],
  },
  {
    level: 1,
    label: "Counts only",
    sublabel: "Free · no LLM cost",
    unlocks: ["Conversation counts per asset", "Active vs ghost assets", "Adoption page KPIs"],
  },
  {
    level: 2,
    label: "Anonymous topics",
    sublabel: "$ · LLM analyzes patterns, identity stripped",
    unlocks: ["Everything in Level 1", "Topic distribution per asset", "Drift alerts (e.g. Finance GPT used for HR)", "Knowledge gap signals → L&D recommendations"],
  },
  {
    level: 3,
    label: "Named user analysis",
    sublabel: "$$ · per-user insights",
    unlocks: ["Everything in Level 2", "Per-employee prompting quality score", "Role fit score per asset", "Employee Portal 'My AI Usage' tab"],
  },
];

interface Step3ConversationFilteringProps {
  onSaved?: () => void;
}

export default function Step3ConversationFiltering({ onSaved }: Step3ConversationFilteringProps) {
  const { data: config } = useConfiguration();
  const patchConfig = usePatchConversationConfig();

  const [privacyLevel, setPrivacyLevel] = useState(3);
  const [dateRangeDays, setDateRangeDays] = useState(30);
  const [tokenBudget, setTokenBudget] = useState(10);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (config && !initialized) {
      const raw = config as unknown as Record<string, unknown>;
      setPrivacyLevel(typeof raw.conversation_privacy_level === "number" ? raw.conversation_privacy_level : 3);
      setDateRangeDays(typeof raw.conversation_date_range_days === "number" ? raw.conversation_date_range_days : 30);
      setTokenBudget(typeof raw.conversation_token_budget_usd === "number" ? raw.conversation_token_budget_usd : 10);
      setInitialized(true);
    }
  }, [config, initialized]);

  const handleSave = () => {
    patchConfig.mutate(
      {
        conversation_privacy_level: privacyLevel,
        conversation_date_range_days: dateRangeDays,
        conversation_token_budget_usd: tokenBudget,
      },
      { onSuccess: () => onSaved?.() }
    );
  };

  return (
    <Card
      title="Conversation Filtering"
      description="Configure how employee conversations with AI assets are analyzed."
    >
      <div className="space-y-6">
        {/* Privacy Level */}
        <div>
          <label className="form-label mb-3 block">Privacy level</label>
          <div className="flex flex-col gap-2">
            {PRIVACY_OPTIONS.map((opt) => {
              const isSelected = privacyLevel === opt.level;
              return (
                <button
                  key={opt.level}
                  onClick={() => setPrivacyLevel(opt.level)}
                  className="text-left px-4 py-3 rounded-lg text-sm transition-all"
                  style={{
                    border: isSelected ? "1.5px solid #3b82f6" : "1px solid var(--c-border)",
                    background: isSelected ? "#3b82f610" : "var(--c-surface)",
                    color: isSelected ? "#3b82f6" : "var(--c-text-2)",
                  }}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{opt.level}: {opt.label}</span>
                    <span className="text-xs" style={{ color: isSelected ? "#60a5fa" : "var(--c-text-5)" }}>
                      {opt.sublabel}
                    </span>
                  </div>
                  {isSelected && opt.unlocks.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1">
                      {opt.unlocks.map((u) => (
                        <div key={u} className="flex items-start gap-1.5 text-xs" style={{ color: "#60a5fa" }}>
                          <span className="mt-px">✓</span>
                          <span>{u}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {isSelected && opt.unlocks.length === 0 && (
                    <div className="mt-1 text-xs" style={{ color: "#94a3b8" }}>
                      Adoption page will remain empty. No data collected.
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Date range */}
        <div>
          <label className="form-label">How far back to analyze</label>
          <select
            value={dateRangeDays}
            onChange={(e) => setDateRangeDays(Number(e.target.value))}
            className="form-input"
          >
            {[7, 14, 30].map((d) => (
              <option key={d} value={d}>Last {d} days</option>
            ))}
          </select>
          <div className="mt-1 text-xs" style={{ color: "var(--c-text-5)" }}>
            OpenAI Compliance API retains conversation logs for up to 30 days.
          </div>
        </div>

        {/* Token Budget */}
        {privacyLevel >= 2 && (
          <div>
            <label className="form-label">Token budget cap (USD)</label>
            <input
              type="number"
              min={1}
              step={1}
              value={tokenBudget}
              onChange={(e) => setTokenBudget(Number(e.target.value))}
              className="form-input"
            />
            <div className="mt-1 text-xs" style={{ color: "var(--c-text-5)" }}>
              Pipeline aborts gracefully if LLM cost exceeds this limit.
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={patchConfig.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {patchConfig.isPending ? "Saving..." : "Save"}
          </button>
        </div>

        {patchConfig.isSuccess && (
          <div className="alert-success">Conversation settings saved.</div>
        )}
        {patchConfig.isError && (
          <div className="alert-error">{(patchConfig.error as Error).message}</div>
        )}
      </div>
    </Card>
  );
}
