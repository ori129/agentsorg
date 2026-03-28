import { useState } from "react";
import Card from "../layout/Card";
import { useConfiguration } from "../../hooks/useConfiguration";
import { usePatchConversationConfig } from "../../hooks/useConversations";

const PRIVACY_OPTIONS = [
  { level: 0, label: "Off", sublabel: "No analysis", cost: "" },
  { level: 1, label: "Counts only", sublabel: "Free", cost: "" },
  { level: 2, label: "Anonymous topics", sublabel: "$", cost: "" },
  { level: 3, label: "Named user analysis", sublabel: "$$", cost: "" },
];

const DATE_RANGE_DAYS = 30;

interface Step3ConversationFilteringProps {
  onSaved?: () => void;
}

export default function Step3ConversationFiltering({ onSaved }: Step3ConversationFilteringProps) {
  const { data: config } = useConfiguration();
  const patchConfig = usePatchConversationConfig();

  const [privacyLevel, setPrivacyLevel] = useState(3);
  const [tokenBudget, setTokenBudget] = useState(10);
  const [initialized, setInitialized] = useState(false);

  if (config && !initialized) {
    const raw = config as unknown as Record<string, unknown>;
    setPrivacyLevel(typeof raw.conversation_privacy_level === "number" ? raw.conversation_privacy_level : 3);
    setTokenBudget(typeof raw.conversation_token_budget_usd === "number" ? raw.conversation_token_budget_usd : 10);
    setInitialized(true);
  }

  const handleSave = () => {
    patchConfig.mutate(
      {
        conversation_privacy_level: privacyLevel,
        conversation_date_range_days: DATE_RANGE_DAYS,
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
          <div className="grid grid-cols-2 gap-2">
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
                  <div className="font-medium">{opt.level}: {opt.label}</div>
                  {opt.sublabel && (
                    <div className="text-xs mt-0.5" style={{ color: isSelected ? "#60a5fa" : "var(--c-text-5)" }}>
                      {opt.sublabel}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-xs" style={{ color: "var(--c-text-5)" }}>
            {privacyLevel === 0 && "Conversation analysis is disabled. No data will be fetched."}
            {privacyLevel === 1 && "Counts only — conversation volume and user counts per asset. No AI cost."}
            {privacyLevel === 2 && "Anonymous topic analysis — LLM analyzes message patterns with all identity stripped."}
            {privacyLevel === 3 && "Full analysis — per-user prompting quality, role fit, and knowledge gap signals."}
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
