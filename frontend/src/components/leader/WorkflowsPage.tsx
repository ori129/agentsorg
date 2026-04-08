import { useState } from "react";
import { useWorkflowCoverage } from "../../hooks/usePipeline";
import type { WorkflowCoverageItem, WorkflowStatus } from "../../types";

// ── Status config ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<WorkflowStatus, { label: string; color: string; bg: string; icon: string }> = {
  covered:    { label: "Covered",     color: "#10b981", bg: "#052e16", icon: "✓" },
  ghost:      { label: "Ghost",       color: "#f59e0b", bg: "#1c1200", icon: "◎" },
  intent_gap: { label: "Intent Gap",  color: "#ef4444", bg: "#1c0000", icon: "⚡" },
};

const PRIORITY_CONFIG: Record<string, { color: string; bg: string }> = {
  low:      { color: "#4ade80", bg: "#052e16" },
  medium:   { color: "#f59e0b", bg: "#1c1200" },
  high:     { color: "#f97316", bg: "#1c0a00" },
  critical: { color: "#ef4444", bg: "#1c0000" },
};

// ── Workflow detail panel ──────────────────────────────────────────────────

function WorkflowDetail({ wf, onClose }: { wf: WorkflowCoverageItem; onClose: () => void }) {
  const sc = STATUS_CONFIG[wf.status];
  const pc = wf.priority_level ? PRIORITY_CONFIG[wf.priority_level] : null;

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "var(--c-bg)", borderLeft: "1px solid var(--c-border)" }}
    >
      {/* Header */}
      <div
        className="flex items-start justify-between p-5"
        style={{ borderBottom: "1px solid var(--c-border)" }}
      >
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs font-medium px-2 py-0.5 rounded"
              style={{ background: sc.bg, color: sc.color }}
            >
              {sc.icon} {sc.label}
            </span>
            {pc && wf.priority_level && (
              <span
                className="text-xs font-medium px-2 py-0.5 rounded"
                style={{ background: pc.bg, color: pc.color }}
              >
                {wf.priority_level.toUpperCase()}
              </span>
            )}
          </div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--c-text-1)" }}>
            {wf.name}
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--c-text-5)" }}>
            {wf.asset_count} asset{wf.asset_count !== 1 ? "s" : ""} · {wf.conversation_count.toLocaleString()} conversations
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-lg leading-none shrink-0"
          style={{ color: "var(--c-text-5)" }}
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* LLM Reasoning */}
        {wf.reasoning && (
          <div
            className="rounded-lg p-4"
            style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
          >
            <div className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: "var(--c-text-4)" }}>
              AI Analysis
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "var(--c-text-2)" }}>
              {wf.reasoning}
            </p>
            {wf.priority_action && (
              <div
                className="mt-3 pt-3 flex items-start gap-2"
                style={{ borderTop: "1px solid var(--c-border)" }}
              >
                <span className="text-sm font-medium shrink-0" style={{ color: "var(--c-text-4)" }}>
                  Action:
                </span>
                <span className="text-sm font-semibold" style={{ color: pc ? pc.color : "var(--c-text-2)" }}>
                  {wf.priority_action}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Assets covering this workflow */}
        {wf.assets.length > 0 && (
          <div>
            <div className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: "var(--c-text-4)" }}>
              Assets
            </div>
            <div className="space-y-2">
              {wf.assets.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between px-3 py-2 rounded-lg"
                  style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
                >
                  <span className="text-sm font-medium" style={{ color: "var(--c-text-2)" }}>
                    {a.name}
                  </span>
                  <div className="flex items-center gap-3">
                    {a.quadrant_label && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{
                          background: "var(--c-bg)",
                          color: "var(--c-text-4)",
                          border: "1px solid var(--c-border)",
                        }}
                      >
                        {a.quadrant_label.replace("_", " ")}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: "var(--c-text-5)" }}>
                      {a.conversation_count.toLocaleString()} convs
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conversation intent signals */}
        {wf.intent_signals.length > 0 && (
          <div>
            <div className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: "var(--c-text-4)" }}>
              Conversation Signals
            </div>
            <div className="space-y-2">
              {wf.intent_signals.map((s, i) => (
                <div
                  key={i}
                  className="rounded-lg p-3"
                  style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium" style={{ color: "var(--c-text-2)" }}>
                      {s.topic}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: "var(--c-text-4)" }}>
                      {s.pct.toFixed(0)}%
                    </span>
                  </div>
                  {/* Mini bar */}
                  <div className="w-full rounded-full h-1 mb-2" style={{ background: "var(--c-border)" }}>
                    <div
                      className="h-1 rounded-full"
                      style={{ width: `${Math.min(s.pct, 100)}%`, background: STATUS_CONFIG[wf.status].color }}
                    />
                  </div>
                  {s.example_phrases.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {s.example_phrases.map((ph, j) => (
                        <span
                          key={j}
                          className="text-xs px-2 py-0.5 rounded"
                          style={{ background: "var(--c-bg)", color: "var(--c-text-5)", border: "1px solid var(--c-border)" }}
                        >
                          "{ph}"
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Intent gap example phrases */}
        {wf.status === "intent_gap" && wf.example_phrases.length > 0 && (
          <div>
            <div className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: "var(--c-text-4)" }}>
              How users ask for this
            </div>
            <div className="flex flex-wrap gap-2">
              {wf.example_phrases.map((ph, i) => (
                <span
                  key={i}
                  className="text-sm px-3 py-1.5 rounded-lg"
                  style={{ background: "#1c0000", color: "#ef4444", border: "1px solid #7f1d1d" }}
                >
                  "{ph}"
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Workflow row ───────────────────────────────────────────────────────────

function WorkflowRow({
  wf,
  selected,
  onClick,
}: {
  wf: WorkflowCoverageItem;
  selected: boolean;
  onClick: () => void;
}) {
  const sc = STATUS_CONFIG[wf.status];
  const pc = wf.priority_level ? PRIORITY_CONFIG[wf.priority_level] : null;

  return (
    <tr
      className="cursor-pointer transition-colors"
      onClick={onClick}
      style={{
        borderBottom: "1px solid var(--c-border)",
        background: selected ? "var(--c-surface)" : "transparent",
      }}
      onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = "var(--c-surface)"; }}
      onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = "transparent"; }}
    >
      {/* Status badge */}
      <td className="px-4 py-3 w-32">
        <span
          className="text-xs font-medium px-2 py-1 rounded whitespace-nowrap"
          style={{ background: sc.bg, color: sc.color }}
        >
          {sc.icon} {sc.label}
        </span>
      </td>

      {/* Workflow name */}
      <td className="px-4 py-3">
        <div className="text-sm font-medium" style={{ color: "var(--c-text-1)" }}>
          {wf.name}
        </div>
        {wf.reasoning && (
          <div
            className="text-xs mt-0.5 line-clamp-1"
            style={{ color: "var(--c-text-5)", maxWidth: 420 }}
          >
            {wf.reasoning}
          </div>
        )}
      </td>

      {/* Assets */}
      <td className="px-4 py-3 text-sm text-right tabular-nums" style={{ color: "var(--c-text-4)" }}>
        {wf.asset_count}
      </td>

      {/* Conversations */}
      <td className="px-4 py-3 text-sm text-right tabular-nums" style={{ color: "var(--c-text-4)" }}>
        {wf.conversation_count > 0 ? wf.conversation_count.toLocaleString() : "—"}
      </td>

      {/* Priority */}
      <td className="px-4 py-3 text-right">
        {pc && wf.priority_level ? (
          <span
            className="text-xs font-medium px-2 py-0.5 rounded"
            style={{ background: pc.bg, color: pc.color }}
          >
            {wf.priority_level}
          </span>
        ) : (
          <span style={{ color: "var(--c-text-5)" }} className="text-xs">—</span>
        )}
      </td>

      {/* Chevron */}
      <td className="px-4 py-3 w-8">
        <span style={{ color: "var(--c-text-5)" }} className="text-sm">›</span>
      </td>
    </tr>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

type FilterTab = "all" | WorkflowStatus;

export default function WorkflowsPage() {
  const { data: workflows = [], isLoading } = useWorkflowCoverage();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [selected, setSelected] = useState<WorkflowCoverageItem | null>(null);

  const filtered = filter === "all" ? workflows : workflows.filter((w) => w.status === filter);

  const counts = {
    all: workflows.length,
    covered: workflows.filter((w) => w.status === "covered").length,
    ghost: workflows.filter((w) => w.status === "ghost").length,
    intent_gap: workflows.filter((w) => w.status === "intent_gap").length,
  };

  const tabs: { id: FilterTab; label: string; color?: string }[] = [
    { id: "all", label: `All (${counts.all})` },
    { id: "covered", label: `Covered (${counts.covered})`, color: "#10b981" },
    { id: "ghost", label: `Ghost (${counts.ghost})`, color: "#f59e0b" },
    { id: "intent_gap", label: `Intent Gaps (${counts.intent_gap})`, color: "#ef4444" },
  ];

  const hasAnalysis = workflows.some((w) => w.reasoning);

  return (
    <div className="flex h-full" style={{ minHeight: 0 }}>
      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0" style={{ overflowY: "auto" }}>
        {/* Page header */}
        <div className="px-6 pt-6 pb-4">
          <h1 className="text-xl font-semibold mb-1" style={{ color: "var(--c-text-1)" }}>
            Workflows
          </h1>
          <p className="text-sm" style={{ color: "var(--c-text-5)" }}>
            Business processes your AI portfolio covers — and the gaps where demand exceeds supply.
          </p>
          {!hasAnalysis && !isLoading && workflows.length > 0 && (
            <p className="text-xs mt-2" style={{ color: "var(--c-text-5)" }}>
              Run the conversation pipeline to generate AI analysis and reasoning for each workflow.
            </p>
          )}
        </div>

        {/* Summary stats */}
        {workflows.length > 0 && (
          <div className="px-6 pb-4 grid grid-cols-3 gap-3">
            {[
              { label: "Covered Workflows", value: counts.covered, color: "#10b981", sub: "assets + active users" },
              { label: "Ghost Coverage",    value: counts.ghost,   color: "#f59e0b", sub: "built but unused" },
              { label: "Intent Gaps",       value: counts.intent_gap, color: "#ef4444", sub: "demand with no asset" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl p-4"
                style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
              >
                <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                <div className="text-xs font-medium mt-0.5" style={{ color: "var(--c-text-2)" }}>{s.label}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--c-text-5)" }}>{s.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filter tabs */}
        <div className="px-6 pb-2 flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
              style={{
                background: filter === t.id ? (t.color ?? "var(--c-text-1)") : "var(--c-surface)",
                color: filter === t.id ? "#fff" : (t.color ?? "var(--c-text-4)"),
                border: `1px solid ${filter === t.id ? "transparent" : "var(--c-border)"}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="px-6 pt-8 text-sm" style={{ color: "var(--c-text-5)" }}>
            Loading workflows...
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 pt-8 text-sm" style={{ color: "var(--c-text-5)" }}>
            {workflows.length === 0
              ? "No workflow data yet. Run the pipeline to discover business processes."
              : "No workflows match this filter."}
          </div>
        ) : (
          <div className="px-6 pb-6">
            <table className="w-full text-left">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--c-border)" }}>
                  {["Status", "Workflow", "Assets", "Conversations", "Priority", ""].map((h) => (
                    <th
                      key={h}
                      className={`pb-2 text-xs font-semibold uppercase tracking-wide ${h === "Assets" || h === "Conversations" || h === "Priority" ? "text-right" : ""}`}
                      style={{ color: "var(--c-text-5)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((wf) => (
                  <WorkflowRow
                    key={wf.name}
                    wf={wf}
                    selected={selected?.name === wf.name}
                    onClick={() => setSelected(selected?.name === wf.name ? null : wf)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="shrink-0" style={{ width: 400, overflowY: "auto" }}>
          <WorkflowDetail wf={selected} onClose={() => setSelected(null)} />
        </div>
      )}
    </div>
  );
}
