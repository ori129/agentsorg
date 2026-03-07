import { useState } from "react";
import type { GPTItem } from "../../types";

interface EnrichmentProps {
  gpts: GPTItem[];
  onOpenWizard: () => void;
}

// ── Static data ────────────────────────────────────────────────────────────────

const KPI_CHIPS = [
  { label: "Business Process", color: "#6366f1" },
  { label: "Risk Level", color: "#ef4444" },
  { label: "Sophistication", color: "#8b5cf6" },
  { label: "Prompting Quality", color: "#3b82f6" },
  { label: "ROI Potential", color: "#10b981" },
  { label: "Intended Audience", color: "#f59e0b" },
  { label: "Integrations", color: "#06b6d4" },
  { label: "Output Type", color: "#a855f7" },
  { label: "Adoption Friction", color: "#f97316" },
];

interface UnlockGroup {
  label: string;
  accent: string;
  items: string[];
}

interface PipelineDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  active: boolean;
  apiCalls: { method: string; path: string }[];
  steps: string[];
  unlocks?: string[];
  unlockGroups?: UnlockGroup[];
  unlockSummary?: string;
}

const PIPELINES: PipelineDef[] = [
  {
    id: "gpt",
    name: "GPT Pipeline",
    icon: "⚙",
    color: "#3b82f6",
    active: true,
    apiCalls: [
      { method: "GET", path: "/compliance/workspaces/{workspace_id}/gpts" },
      { method: "GET", path: "/compliance/workspaces/{workspace_id}/gpts/{gpt_id}/configs" },
    ],
    steps: [
      "Configure API key",
      "Fetch GPT list",
      "Filter & classify",
      "Semantic enrichment",
      "Embed & store",
    ],
  },
  {
    id: "conversations",
    name: "Conversations",
    icon: "💬",
    color: "#6366f1",
    active: false,
    apiCalls: [
      { method: "GET", path: "/compliance/workspaces/{workspace_id}/conversations" },
    ],
    steps: [
      "Fetch conversation logs",
      "Map sessions to GPTs & users",
      "Compute volume & frequency",
      "Identify power users & patterns",
      "Cluster prompt topics",
    ],
    unlockSummary: "Conversations are a second entity layer — separate from GPTs and builders. Each conversation ties a real user to a GPT session, turning adoption from a guess into a measurable fact.",
    unlockGroups: [
      {
        label: "Deeper GPT insight",
        accent: "#6366f1",
        items: [
          "Real adoption vs access granted",
          "Actual vs claimed ROI",
          "Conversation volume trend",
          "Peak usage hours",
          "Dead GPT detection",
          "Prompt topic clusters",
        ],
      },
      {
        label: "New entity: Users",
        accent: "#8b5cf6",
        items: [
          "Power users per GPT",
          "Cross-GPT heavy users",
          "Dormant users (access, no use)",
          "First-use → habit curve",
          "Adoption by department",
          "User engagement score",
        ],
      },
    ],
  },
  {
    id: "users",
    name: "Users & Access",
    icon: "👥",
    color: "#8b5cf6",
    active: false,
    apiCalls: [
      { method: "GET", path: "/compliance/workspaces/{workspace_id}/users" },
      { method: "GET", path: "/compliance/workspaces/{workspace_id}/gpts/{gpt_id}/shared_users" },
    ],
    steps: [
      "Sync user roster",
      "Map GPT access rights",
      "Detect over-sharing",
    ],
    unlocks: ["Access heatmap", "Shadow AI detection", "Least-privilege recommendations"],
  },
  {
    id: "audit",
    name: "Audit Logs",
    icon: "📋",
    color: "#f59e0b",
    active: false,
    apiCalls: [
      { method: "GET", path: "/compliance/workspaces/{workspace_id}/logs" },
      { method: "GET", path: "/compliance/workspaces/{workspace_id}/logs/download" },
    ],
    steps: [
      "Fetch log entries",
      "Parse event types",
      "Detect anomalies",
    ],
    unlocks: ["Policy violations", "Full audit trail", "Compliance reporting"],
  },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function ApiCallChip({ method, path }: { method: string; path: string }) {
  return (
    <div
      className="flex items-center gap-1.5 rounded px-2 py-1 text-xs"
      style={{
        background: "var(--c-accent-bg)",
        color: "var(--c-text-3)",
        fontFamily: "monospace",
      }}
    >
      <span className="font-semibold" style={{ color: "#10b981", flexShrink: 0 }}>
        {method}
      </span>
      <span className="truncate">{path}</span>
    </div>
  );
}

function PipelineStep({
  index,
  label,
  color,
  active,
}: {
  index: number;
  label: string;
  color: string;
  active: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2 text-xs"
      style={{ color: active ? "var(--c-text-3)" : "var(--c-text-4)" }}
    >
      <span
        className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xs"
        style={
          active
            ? { background: `${color}20`, color }
            : { background: "var(--c-border)", color: "var(--c-text-5)" }
        }
      >
        {index + 1}
      </span>
      {label}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Enrichment({ gpts, onOpenWizard }: EnrichmentProps) {
  const [expandedKpis, setExpandedKpis] = useState(false);

  const total = gpts.length;
  const enriched = gpts.filter((g) => g.semantic_enriched_at).length;
  const pending = total - enriched;
  const pct = total > 0 ? Math.round((enriched / total) * 100) : 0;
  const barColor = pct >= 70 ? "#10b981" : pct >= 30 ? "#f59e0b" : "#ef4444";

  return (
    <div className="p-6 flex flex-col gap-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--c-text)" }}>
          Data Pipelines
        </h2>
        <p className="text-sm mt-1" style={{ color: "var(--c-text-4)" }}>
          Connect compliance data sources to build your AI governance layer
        </p>
      </div>

      {/* Enrichment Status */}
      <div>
        <div
          className="text-xs font-semibold uppercase tracking-widest mb-3"
          style={{ color: "var(--c-text-5)" }}
        >
          Enrichment Status
        </div>
        <div
          className="rounded-xl p-5 flex flex-col gap-3"
          style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: "var(--c-text)" }}>
              GPT Semantic Enrichment
            </span>
            <span className="text-2xl font-bold" style={{ color: barColor }}>
              {total === 0 ? "—" : `${pct}%`}
            </span>
          </div>
          <div
            className="rounded-full overflow-hidden"
            style={{ background: "var(--c-border)", height: 10 }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: barColor }}
            />
          </div>
          <div
            className="flex items-center justify-between text-xs"
            style={{ color: "var(--c-text-4)" }}
          >
            <span>
              {total === 0
                ? "No GPTs in registry — run the pipeline first"
                : `${enriched} of ${total} GPTs enriched`}
            </span>
            {total > 0 && pending > 0 && (
              <span style={{ color: "#f59e0b" }}>{pending} pending</span>
            )}
          </div>
        </div>
      </div>

      {/* Pipeline Roadmap */}
      <div>
        <div
          className="text-xs font-semibold uppercase tracking-widest mb-3"
          style={{ color: "var(--c-text-5)" }}
        >
          Pipeline Roadmap
        </div>
        <div className="grid grid-cols-2 gap-4">
          {PIPELINES.map((pipeline) => {
            const isGpt = pipeline.id === "gpt";
            return (
              <div
                key={pipeline.id}
                className="rounded-xl p-5 flex flex-col gap-4"
                style={{
                  background: "var(--c-surface)",
                  border: "1px solid var(--c-border)",
                  borderLeft: pipeline.active
                    ? `4px solid ${pipeline.color}`
                    : "1px solid var(--c-border)",
                  opacity: pipeline.active ? 1 : 0.65,
                }}
              >
                {/* Card header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-sm"
                      style={{
                        background: `${pipeline.color}20`,
                        color: pipeline.color,
                      }}
                    >
                      {pipeline.icon}
                    </div>
                    <span
                      className="text-sm font-semibold"
                      style={{ color: "var(--c-text)" }}
                    >
                      {pipeline.name}
                    </span>
                  </div>
                  {pipeline.active ? (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ background: "#10b98120", color: "#10b981" }}
                    >
                      Active
                    </span>
                  ) : (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        background: `${pipeline.color}20`,
                        color: pipeline.color,
                      }}
                    >
                      Coming Soon
                    </span>
                  )}
                </div>

                {/* API calls */}
                <div className="flex flex-col gap-1.5">
                  <div
                    className="text-xs font-semibold uppercase tracking-wider mb-0.5"
                    style={{ color: "var(--c-text-5)" }}
                  >
                    API Calls
                  </div>
                  {pipeline.apiCalls.map((call) => (
                    <ApiCallChip key={call.path} method={call.method} path={call.path} />
                  ))}
                </div>

                {/* Steps */}
                <div className="flex flex-col gap-1.5">
                  <div
                    className="text-xs font-semibold uppercase tracking-wider mb-0.5"
                    style={{ color: "var(--c-text-5)" }}
                  >
                    Steps
                  </div>
                  {pipeline.steps.map((step, i) => (
                    <PipelineStep
                      key={step}
                      index={i}
                      label={step}
                      color={pipeline.color}
                      active={pipeline.active}
                    />
                  ))}
                </div>

                {/* KPI accordion (GPT pipeline only) */}
                {isGpt && (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => setExpandedKpis((v) => !v)}
                      className="flex items-center gap-1.5 text-xs font-medium"
                      style={{ color: pipeline.color, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          transform: expandedKpis ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform 0.2s",
                        }}
                      >
                        ▾
                      </span>
                      What you unlock ({KPI_CHIPS.length} KPIs)
                    </button>
                    {expandedKpis && (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3, 1fr)",
                          gap: "6px",
                        }}
                      >
                        {KPI_CHIPS.map((kpi) => (
                          <div
                            key={kpi.label}
                            className="rounded px-2 py-1 text-xs font-medium text-center"
                            style={{
                              background: `${kpi.color}15`,
                              color: kpi.color,
                            }}
                          >
                            {kpi.label}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Unlocks — grouped (conversations) */}
                {!isGpt && pipeline.unlockGroups && (
                  <div className="flex flex-col gap-3">
                    <div
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--c-text-5)" }}
                    >
                      Unlocks
                    </div>
                    {pipeline.unlockSummary && (
                      <p className="text-xs leading-relaxed" style={{ color: "var(--c-text-4)" }}>
                        {pipeline.unlockSummary}
                      </p>
                    )}
                    {pipeline.unlockGroups.map((group) => (
                      <div key={group.label} className="flex flex-col gap-1.5">
                        <div
                          className="text-xs font-semibold px-2 py-0.5 rounded self-start"
                          style={{ background: `${group.accent}18`, color: group.accent }}
                        >
                          {group.label}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {group.items.map((item) => (
                            <span
                              key={item}
                              className="text-xs rounded px-2 py-0.5"
                              style={{
                                background: `${group.accent}10`,
                                color: "var(--c-text-3)",
                                border: `1px solid ${group.accent}20`,
                              }}
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Unlocks — flat chips (other pipelines) */}
                {!isGpt && !pipeline.unlockGroups && pipeline.unlocks && (
                  <div className="flex flex-col gap-1.5">
                    <div
                      className="text-xs font-semibold uppercase tracking-wider mb-0.5"
                      style={{ color: "var(--c-text-5)" }}
                    >
                      Unlocks
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {pipeline.unlocks.map((item) => (
                        <span
                          key={item}
                          className="text-xs rounded px-2 py-0.5"
                          style={{
                            background: `${pipeline.color}12`,
                            color: pipeline.color,
                          }}
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* CTA (GPT pipeline only) */}
                {isGpt && (
                  <button
                    onClick={onOpenWizard}
                    className="mt-auto self-end text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity"
                    style={{
                      background: `${pipeline.color}20`,
                      color: pipeline.color,
                      border: `1px solid ${pipeline.color}40`,
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                  >
                    Open Wizard →
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
