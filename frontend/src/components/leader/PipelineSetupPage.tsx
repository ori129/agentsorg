import { useState } from "react";
import Stepper from "../layout/Stepper";
import NavButtons from "../layout/NavButtons";
import Step1ApiConfig from "../steps/Step1ApiConfig";
import Step2FilterRules from "../steps/Step2FilterRules";
import Step3ConversationFiltering from "../steps/Step3ConversationFiltering";
import Step3Categories from "../steps/Step3Categories";
import Step4FetchClassify from "../steps/Step4FetchClassify";
import { useConfiguration } from "../../hooks/useConfiguration";

const STEPS = [
  "API Configuration",
  "Asset Filtering",
  "Conversation Filtering",
  "Categories",
  "Run Pipeline",
];

const COMING_SOON = [
  {
    id: "users",
    name: "Users & Access",
    icon: "👥",
    color: "#8b5cf6",
    steps: ["Sync user roster", "Map asset access rights", "Detect over-sharing"],
    unlocks: ["Access heatmap", "Shadow AI detection", "Least-privilege recommendations"],
  },
  {
    id: "audit",
    name: "Audit Logs",
    icon: "📋",
    color: "#f59e0b",
    steps: ["Fetch log entries", "Parse event types", "Detect anomalies"],
    unlocks: ["Policy violations", "Full audit trail", "Compliance reporting"],
  },
];

interface PipelineSetupPageProps {
  onComplete?: () => void;
}

export default function PipelineSetupPage({ onComplete }: PipelineSetupPageProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  // Track per-step explicit saves (for steps that require user action)
  const [step2Saved, setStep2Saved] = useState(false);
  const [step3Saved, setStep3Saved] = useState(false);
  const [step4Saved, setStep4Saved] = useState(false);

  const { data: config } = useConfiguration();

  // ── Validation per step ───────────────────────────────────────────────────
  const getValidation = (step: number): { canContinue: boolean; blockerMessage: string } => {
    switch (step) {
      case 0: {
        // API Config: workspace_id + compliance_api_key must be saved
        const hasWorkspaceId = !!(config?.workspace_id);
        const hasApiKey = !!(config?.compliance_api_key);
        if (!hasWorkspaceId && !hasApiKey)
          return { canContinue: false, blockerMessage: "Save your Workspace ID and Compliance API Key to continue" };
        if (!hasWorkspaceId)
          return { canContinue: false, blockerMessage: "Enter and save your Workspace ID to continue" };
        if (!hasApiKey)
          return { canContinue: false, blockerMessage: "Enter and save your Compliance API Key to continue" };
        return { canContinue: true, blockerMessage: "" };
      }
      case 1: {
        // Asset Filtering: must explicitly save filters
        if (!step2Saved && !config?.workspace_id)
          return { canContinue: false, blockerMessage: "Save your filter settings to continue" };
        return { canContinue: true, blockerMessage: "" };
      }
      case 2: {
        // Conversation Filtering: must explicitly save
        if (!step3Saved)
          return { canContinue: false, blockerMessage: "Save your conversation settings to continue" };
        return { canContinue: true, blockerMessage: "" };
      }
      case 3: {
        // Categories: if deep analysis enabled, need OpenAI key; must save
        const classificationEnabled = config?.classification_enabled ?? false;
        const hasOpenAiKey = !!(config?.openai_api_key);
        if (classificationEnabled && !hasOpenAiKey)
          return { canContinue: false, blockerMessage: "Add an OpenAI API key or disable Deep Analysis to continue" };
        if (!step4Saved)
          return { canContinue: false, blockerMessage: "Save your category settings to continue" };
        return { canContinue: true, blockerMessage: "" };
      }
      default:
        return { canContinue: true, blockerMessage: "" };
    }
  };

  const { canContinue, blockerMessage } = getValidation(currentStep);

  if (showResults) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div
          className="rounded-xl p-8 text-center space-y-4"
          style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
        >
          <div className="text-3xl">✓</div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--c-text)" }}>
            Pipeline configured!
          </h2>
          <p className="text-sm" style={{ color: "var(--c-text-3)" }}>
            Your AI assets have been fetched and classified. The Sync page is where you'll
            run future syncs, enable auto-sync, and view history.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={onComplete}
              className="px-5 py-2 text-sm font-medium text-white rounded-lg"
              style={{ background: "#3b82f6" }}
            >
              Go to Sync →
            </button>
            <button
              onClick={() => { setShowResults(false); setCurrentStep(4); }}
              className="px-4 py-2 text-sm rounded-lg"
              style={{ color: "var(--c-text-3)", border: "1px solid var(--c-border)" }}
            >
              Back to Setup
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Stepper steps={STEPS} currentStep={currentStep} />
      <div className="mt-8">
        {currentStep === 0 && (
          <Step1ApiConfig />
        )}
        {currentStep === 1 && (
          <Step2FilterRules onSaved={() => setStep2Saved(true)} />
        )}
        {currentStep === 2 && (
          <Step3ConversationFiltering onSaved={() => setStep3Saved(true)} />
        )}
        {currentStep === 3 && (
          <Step3Categories onSaved={() => setStep4Saved(true)} />
        )}
        {currentStep === 4 && (
          <Step4FetchClassify onViewResults={() => setShowResults(true)} onComplete={onComplete} />
        )}
      </div>
      <NavButtons
        currentStep={currentStep}
        totalSteps={STEPS.length}
        onBack={() => setCurrentStep((s) => s - 1)}
        onNext={() => setCurrentStep((s) => s + 1)}
        canContinue={canContinue}
        blockerMessage={blockerMessage}
      />

      {/* Coming Soon Pipelines */}
      {COMING_SOON.length > 0 && (
        <div className="mt-12" style={{ borderTop: "1px solid var(--c-border)", paddingTop: "1.5rem" }}>
          <button
            onClick={() => setComingSoonOpen((o) => !o)}
            className="w-full flex items-center justify-between text-left"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            <span className="text-sm font-semibold" style={{ color: "var(--c-text-3)" }}>
              Coming Soon Pipelines
            </span>
            <span style={{ color: "var(--c-text-5)", fontSize: 12 }}>
              {comingSoonOpen ? "▲" : "▼"}
            </span>
          </button>

          {comingSoonOpen && (
            <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
              {COMING_SOON.map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg p-4"
                  style={{
                    background: "var(--c-surface)",
                    border: `1px solid ${p.color}30`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span style={{ fontSize: 16 }}>{p.icon}</span>
                    <span className="text-sm font-semibold" style={{ color: p.color }}>
                      {p.name}
                    </span>
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full ml-auto"
                      style={{ background: `${p.color}20`, color: p.color }}
                    >
                      Soon
                    </span>
                  </div>
                  <div className="text-xs mb-2" style={{ color: "var(--c-text-5)" }}>
                    Steps
                  </div>
                  <ul className="mb-3" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {p.steps.map((s) => (
                      <li key={s} className="text-xs mb-1" style={{ color: "var(--c-text-3)" }}>
                        · {s}
                      </li>
                    ))}
                  </ul>
                  <div className="text-xs mb-1" style={{ color: "var(--c-text-5)" }}>
                    Unlocks
                  </div>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {p.unlocks.map((u) => (
                      <li key={u} className="text-xs mb-1" style={{ color: p.color, opacity: 0.8 }}>
                        + {u}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
