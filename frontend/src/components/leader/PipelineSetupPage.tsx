import { useState } from "react";
import Stepper from "../layout/Stepper";
import NavButtons from "../layout/NavButtons";
import Step1ApiConfig from "../steps/Step1ApiConfig";
import Step2FilterRules from "../steps/Step2FilterRules";
import Step3Categories from "../steps/Step3Categories";
import Step4FetchClassify from "../steps/Step4FetchClassify";

const STEPS = ["API Configuration", "Filtering Rules", "Categories", "Run Pipeline"];

const COMING_SOON = [
  {
    id: "conversations",
    name: "Conversations",
    icon: "💬",
    color: "#6366f1",
    steps: [
      "Fetch conversation logs",
      "Map sessions to AI assets & users",
      "Compute volume & frequency",
      "Identify power users & patterns",
      "Cluster prompt topics",
    ],
    unlocks: [
      "Real adoption vs access granted",
      "Actual vs claimed ROI",
      "Dead asset detection",
      "Power users per asset",
      "Adoption by department",
    ],
  },
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
  const [comingSoonOpen, setComingSoonOpen] = useState(true);

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
              onClick={() => { setShowResults(false); setCurrentStep(3); }}
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
        {currentStep === 0 && <Step1ApiConfig />}
        {currentStep === 1 && <Step2FilterRules />}
        {currentStep === 2 && <Step3Categories />}
        {currentStep === 3 && (
          <Step4FetchClassify onViewResults={() => setShowResults(true)} onComplete={onComplete} />
        )}
      </div>
      <NavButtons
        currentStep={currentStep}
        totalSteps={STEPS.length}
        onBack={() => setCurrentStep((s) => s - 1)}
        onNext={() => setCurrentStep((s) => s + 1)}
      />

      {/* Coming Soon Pipelines */}
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
          <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
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
    </div>
  );
}
