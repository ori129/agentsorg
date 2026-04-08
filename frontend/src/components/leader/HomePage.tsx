import { useMemo, useState } from "react";
import type { GPTItem, PortfolioTrendPoint, PriorityAction } from "../../types";
import { usePipelineSummary, usePortfolioTrend, useRecommendations, useWorkflowCoverage } from "../../hooks/usePipeline";
import { useConversationOverview } from "../../hooks/useConversations";
import GPTDrawer, { type DetailTab } from "./GPTDrawer";
import type { DrawerFilter } from "./GPTDrawer";

interface HomePageProps {
  gpts: GPTItem[];
  onSetPage?: (p: import("./Sidebar").LeaderPage) => void;
}

// ── Quadrant chart (pure CSS, no charting library) ─────────────────────────

const QUADRANT_COLORS: Record<string, string> = {
  champion: "#10b981",
  hidden_gem: "#6366f1",
  scaled_risk: "#f59e0b",
  retirement_candidate: "#6b7280",
};

const QUADRANT_LABELS: Record<string, string> = {
  champion: "Champion",
  hidden_gem: "Hidden Gem",
  scaled_risk: "Scaled Risk",
  retirement_candidate: "Retirement",
};

function QuadrantChart({ gpts, onSelectGpt }: { gpts: GPTItem[]; onSelectGpt: (g: GPTItem) => void }) {
  const scored = gpts.filter((g) => g.quality_score != null && g.adoption_score != null);

  const counts = useMemo(() => ({
    champions: scored.filter((g) => (g.quality_score ?? 0) >= 60 && (g.adoption_score ?? 0) >= 60).length,
    hidden_gems: scored.filter((g) => (g.quality_score ?? 0) >= 60 && (g.adoption_score ?? 0) < 60).length,
    scaled_risk: scored.filter((g) => (g.quality_score ?? 0) < 60 && (g.adoption_score ?? 0) >= 60).length,
    retirement: scored.filter((g) => (g.quality_score ?? 0) < 60 && (g.adoption_score ?? 0) < 60).length,
  }), [scored]);

  if (scored.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl"
        style={{ height: 340, background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
      >
        <p style={{ color: "var(--c-text-5)" }} className="text-sm">
          No scored assets yet — run the pipeline to assess assets
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Quadrant grid */}
      <div className="relative" style={{ height: 320, marginBottom: 8 }}>
        {/* Axis labels */}
        <div
          className="absolute text-xs"
          style={{
            left: 0,
            top: "50%",
            transform: "translateY(-50%) rotate(-90deg) translateX(-50%)",
            transformOrigin: "left center",
            color: "var(--c-text-5)",
            whiteSpace: "nowrap",
          }}
        >
          Quality Score →
        </div>
        <div
          className="absolute text-xs"
          style={{ bottom: -4, left: "50%", transform: "translateX(-50%)", color: "var(--c-text-5)" }}
        >
          Adoption Score →
        </div>

        {/* Chart area */}
        <div
          className="absolute"
          style={{ top: 4, bottom: 20, left: 20, right: 4 }}
        >
          {/* Quadrant backgrounds */}
          <div className="absolute inset-0" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" }}>
            {/* Top-left: Hidden Gem (high quality, low adoption) */}
            <div style={{ background: "rgba(99,102,241,0.06)", borderRight: "1px dashed var(--c-border)", borderBottom: "1px dashed var(--c-border)" }} />
            {/* Top-right: Champion (high quality, high adoption) */}
            <div style={{ background: "rgba(16,185,129,0.06)", borderBottom: "1px dashed var(--c-border)" }} />
            {/* Bottom-left: Retirement (low quality, low adoption) */}
            <div style={{ background: "rgba(107,114,128,0.04)", borderRight: "1px dashed var(--c-border)" }} />
            {/* Bottom-right: Scaled Risk (low quality, high adoption) */}
            <div style={{ background: "rgba(245,158,11,0.06)" }} />
          </div>

          {/* Quadrant corner labels */}
          <span className="absolute text-xs font-medium" style={{ top: 6, left: 6, color: "#6366f1", opacity: 0.7 }}>Hidden Gem</span>
          <span className="absolute text-xs font-medium" style={{ top: 6, right: 6, color: "#10b981", opacity: 0.7 }}>Champion</span>
          <span className="absolute text-xs font-medium" style={{ bottom: 24, left: 6, color: "#6b7280", opacity: 0.7 }}>Retirement</span>
          <span className="absolute text-xs font-medium" style={{ bottom: 24, right: 6, color: "#f59e0b", opacity: 0.7 }}>Scaled Risk</span>

          {/* Dots */}
          {scored.map((g) => {
            const x = ((g.adoption_score ?? 0) / 100) * 100;
            const y = 100 - ((g.quality_score ?? 0) / 100) * 100;
            const color = QUADRANT_COLORS[g.quadrant_label ?? "retirement_candidate"] ?? "#6b7280";
            // Shorten name for label: first 12 chars
            const shortName = g.name.length > 14 ? g.name.slice(0, 13) + "…" : g.name;
            return (
              <div
                key={g.id}
                className="absolute group"
                style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)", zIndex: 2 }}
              >
                <button
                  onClick={() => onSelectGpt(g)}
                  className="rounded-full transition-transform group-hover:scale-125 focus:outline-none"
                  style={{
                    width: 10,
                    height: 10,
                    background: color,
                    opacity: 0.9,
                    cursor: "pointer",
                    display: "block",
                  }}
                />
                {/* Tooltip */}
                <div
                  className="absolute bottom-full left-1/2 mb-1.5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{
                    transform: "translateX(-50%)",
                    background: "var(--c-bg)",
                    border: `1px solid ${color}60`,
                    borderRadius: 6,
                    padding: "3px 7px",
                    whiteSpace: "nowrap",
                    zIndex: 10,
                  }}
                >
                  <p className="text-xs font-medium" style={{ color }}>{shortName}</p>
                  <p className="text-xs" style={{ color: "var(--c-text-5)" }}>Q:{g.quality_score?.toFixed(0)} A:{g.adoption_score?.toFixed(0)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 flex-wrap">
        {[
          { key: "champions", label: "Champions", color: "#10b981", count: counts.champions },
          { key: "hidden_gems", label: "Hidden Gems", color: "#6366f1", count: counts.hidden_gems },
          { key: "scaled_risk", label: "Scaled Risk", color: "#f59e0b", count: counts.scaled_risk },
          { key: "retirement", label: "Retirement", color: "#6b7280", count: counts.retirement },
        ].map(({ label, color, count }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="rounded-full" style={{ width: 8, height: 8, background: color }} />
            <span className="text-xs" style={{ color: "var(--c-text-4)" }}>
              {label} <span style={{ color }}>{count}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Priority action card ───────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { color: string; icon: string }> = {
  risk:       { color: "#ef4444", icon: "⚠" },
  adoption:   { color: "#6366f1", icon: "↑" },
  quality:    { color: "#3b82f6", icon: "★" },
  governance: { color: "#f59e0b", icon: "⊕" },
  learning:   { color: "#10b981", icon: "✎" },
};

const IMPACT_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#6b7280",
};

const CATEGORY_TAB: Record<string, DetailTab> = {
  risk:       "risk",
  quality:    "quality",
  adoption:   "usage",
  governance: "risk",
  learning:   "details",
};

function PriorityActionCard({
  action,
  rank,
  gpts,
  onOpenDrawer,
}: {
  action: PriorityAction;
  rank: number;
  gpts: GPTItem[];
  onOpenDrawer: (label: string, subset: GPTItem[], tab: DetailTab) => void;
}) {
  const cfg = CATEGORY_CONFIG[action.category] ?? { color: "#6b7280", icon: "●" };
  const tab = CATEGORY_TAB[action.category] ?? "details";

  const relevantGpts = useMemo(() => {
    if (!action.asset_ids?.length) return [];
    const ids = new Set(action.asset_ids);
    return gpts.filter((g) => ids.has(g.id));
  }, [action.asset_ids, gpts]);

  return (
    <div
      className="rounded-lg p-4 cursor-pointer transition-all group"
      style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
      onClick={() => onOpenDrawer(action.title, relevantGpts, tab)}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = cfg.color + "60"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--c-border)"; }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ background: cfg.color + "20", color: cfg.color }}
        >
          {rank}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wide"
              style={{ background: cfg.color + "20", color: cfg.color }}
            >
              {action.category}
            </span>
            <span
              className="text-xs px-1.5 py-0.5 rounded-full"
              style={{ background: IMPACT_COLORS[action.impact] + "20", color: IMPACT_COLORS[action.impact] }}
            >
              {action.impact} impact
            </span>
            <span className="text-xs" style={{ color: "var(--c-text-5)" }}>
              {action.effort} effort
            </span>
          </div>

          <p className="text-sm font-medium" style={{ color: "var(--c-text-1)" }}>
            {action.title}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--c-text-5)" }}>
            {action.description}
          </p>
        </div>

        <svg
          className="w-4 h-4 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
          style={{ color: cfg.color }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>

      {relevantGpts.length > 0 && (
        <div className="mt-2 ml-10 flex flex-wrap gap-1">
          {relevantGpts.slice(0, 4).map((g) => (
            <span key={g.id} className="text-xs px-2 py-0.5 rounded-full truncate max-w-[120px]"
              style={{ background: cfg.color + "12", color: cfg.color }}>
              {g.name}
            </span>
          ))}
          {relevantGpts.length > 4 && (
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: "var(--c-border)", color: "var(--c-text-5)" }}>
              +{relevantGpts.length - 4} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Pulse KPI strip ────────────────────────────────────────────────────────

function PulseStrip({ gpts, onSetPage }: { gpts: GPTItem[]; onSetPage?: (p: import("./Sidebar").LeaderPage) => void }) {
  const { data: summary } = usePipelineSummary();
  const { data: convOverview } = useConversationOverview(30);

  const scored = gpts.filter((g) => g.quality_score != null);
  const avgQuality = scored.length > 0
    ? scored.reduce((s, g) => s + (g.quality_score ?? 0), 0) / scored.length
    : null;
  const avgRisk = scored.length > 0
    ? scored.reduce((s, g) => s + (g.risk_score ?? 0), 0) / scored.length
    : null;
  const highRisk = gpts.filter((g) => g.risk_level === "high" || g.risk_level === "critical").length;

  // Prefer conversation-based signals over LLM-scored when available
  const hasConvData = convOverview && convOverview.total_conversations > 0;
  const totalAssets = hasConvData
    ? convOverview.active_assets + convOverview.ghost_assets
    : gpts.length;
  const utilizationPct = hasConvData && totalAssets > 0
    ? Math.round((convOverview.active_assets / totalAssets) * 100)
    : null;
  const ghostCount = hasConvData ? convOverview.ghost_assets : (summary?.ghost_assets ?? 0);

  const kpis: { label: string; value: string | number; sub: string; color: string; tooltip: string; page?: import("./Sidebar").LeaderPage }[] = [
    {
      label: "Assets",
      value: gpts.length,
      sub: `${gpts.filter((g) => g.asset_type === "gpt").length} GPTs · ${gpts.filter((g) => g.asset_type === "project").length} Projects`,
      color: "#3b82f6",
      tooltip: "Total AI assets registered in your workspace — Custom GPTs and API Projects combined.",
      page: "portfolio",
    },
    {
      label: "Avg Quality",
      value: avgQuality != null ? `${avgQuality.toFixed(0)}%` : "—",
      sub: `${scored.length} assessed`,
      color: avgQuality != null ? (avgQuality >= 60 ? "#10b981" : avgQuality >= 40 ? "#f59e0b" : "#ef4444") : "#6b7280",
      tooltip: "Average quality score across all assessed assets (0–100). Combines prompting quality, sophistication, ROI potential, and adoption friction — scored by AI analysis of each asset's instructions.",
      page: "quality",
    },
    {
      label: "Actual Adoption",
      value: hasConvData ? `${utilizationPct}%` : "—",
      sub: hasConvData
        ? `${convOverview.total_conversations} conversations · ${convOverview.active_users} users`
        : "run conversation pipeline",
      color: utilizationPct != null ? (utilizationPct >= 70 ? "#10b981" : utilizationPct >= 40 ? "#f59e0b" : "#ef4444") : "#6b7280",
      tooltip: "% of assets that had at least one real conversation in the last 30 days — measured from actual usage logs, not estimates. An asset is 'active' if it received any conversation.",
      page: "adoption",
    },
    {
      label: "Avg Risk",
      value: avgRisk != null ? `${avgRisk.toFixed(0)}%` : "—",
      sub: `${highRisk} high risk`,
      color: avgRisk != null ? (avgRisk >= 60 ? "#ef4444" : avgRisk >= 30 ? "#f59e0b" : "#10b981") : "#6b7280",
      tooltip: "Average risk score across all assessed assets (0–100). Higher = more risk flags. Detects data leakage, missing guardrails, broad permissions, and sensitive domain exposure.",
      page: "risk",
    },
    {
      label: "Ghost Assets",
      value: ghostCount,
      sub: hasConvData ? "zero conversations in 30 days" : "low adoption score",
      color: ghostCount > 0 ? "#f59e0b" : "#6b7280",
      tooltip: "Assets shared with 5+ users but with zero recorded conversations in the last 30 days. These are 'built but not used' — prime candidates for promotion, improvement, or retirement.",
      page: "adoption",
    },
    {
      label: "Hidden Gems",
      value: summary?.hidden_gems ?? 0,
      sub: "high quality, low adoption",
      color: "#6366f1",
      tooltip: "High-quality assets (quality score ≥ 60%) with low adoption (adoption score < 60%). These are underutilised — they're well-built but employees don't know about them. Promote them.",
      page: "portfolio",
    },
  ];

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
      {kpis.map((kpi) => {
        const isClickable = !!(kpi.page && onSetPage);
        return (
          <KpiCard
            key={kpi.label}
            kpi={kpi}
            isClickable={isClickable}
            onClick={isClickable ? () => onSetPage!(kpi.page!) : undefined}
          />
        );
      })}
    </div>
  );
}

function KpiCard({
  kpi,
  isClickable,
  onClick,
}: {
  kpi: { label: string; value: string | number; sub: string; color: string; tooltip: string };
  isClickable: boolean;
  onClick?: () => void;
}) {
  const [showTip, setShowTip] = useState(false);
  return (
    <div
      onClick={onClick}
      className="rounded-xl p-4 relative"
      style={{
        background: "var(--c-surface)",
        border: "1px solid var(--c-border)",
        cursor: isClickable ? "pointer" : "default",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => { if (isClickable) (e.currentTarget as HTMLDivElement).style.borderColor = kpi.color + "60"; }}
      onMouseLeave={(e) => { if (isClickable) (e.currentTarget as HTMLDivElement).style.borderColor = "var(--c-border)"; }}
    >
      {/* Header row with label + info button */}
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs" style={{ color: "var(--c-text-5)" }}>{kpi.label}</p>
        <button
          onClick={(e) => { e.stopPropagation(); setShowTip((v) => !v); }}
          className="w-4 h-4 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors"
          style={{
            background: showTip ? kpi.color + "30" : "var(--c-border)",
            color: showTip ? kpi.color : "var(--c-text-5)",
            lineHeight: 1,
          }}
          title="What is this?"
        >
          ?
        </button>
      </div>
      <p className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
      {showTip ? (
        <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--c-text-3)" }}>
          {kpi.tooltip}
        </p>
      ) : (
        <p className="text-xs mt-0.5" style={{ color: isClickable ? kpi.color + "99" : "var(--c-text-5)" }}>
          {kpi.sub}{isClickable ? " →" : ""}
        </p>
      )}
    </div>
  );
}

// ── Workflow coverage summary card ─────────────────────────────────────────

function WorkflowSummaryCard({
  workflows,
  onSetPage,
}: {
  workflows: import("../../types").WorkflowCoverageItem[];
  onSetPage?: (p: import("./Sidebar").LeaderPage) => void;
}) {
  const covered = workflows.filter((w) => w.status === "covered");
  const ghost = workflows.filter((w) => w.status === "ghost");
  const gaps = workflows.filter((w) => w.status === "intent_gap");
  const topGaps = gaps.filter((w) => w.priority_level === "high" || w.priority_level === "critical").slice(0, 3);

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold" style={{ color: "var(--c-text-1)" }}>
            Workflow Coverage
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--c-text-5)" }}>
            Business processes covered by your AI portfolio · powered by conversation analysis
          </p>
        </div>
        {onSetPage && (
          <button
            onClick={() => onSetPage("workflows")}
            className="text-xs font-medium"
            style={{ color: "var(--c-text-4)" }}
          >
            View all →
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        {[
          { label: "Covered", value: covered.length, color: "#10b981", sub: "active assets + users" },
          { label: "Ghost",   value: ghost.length,   color: "#f59e0b", sub: "built but unused" },
          { label: "Gaps",    value: gaps.length,    color: "#ef4444", sub: "demand with no asset" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-lg p-3 text-center cursor-pointer"
            style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
            onClick={() => onSetPage?.("workflows")}
          >
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs font-medium mt-0.5" style={{ color: "var(--c-text-2)" }}>{s.label}</div>
            <div className="text-xs" style={{ color: "var(--c-text-5)" }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {topGaps.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: "var(--c-text-4)" }}>
            Top priority gaps
          </p>
          <div className="space-y-2">
            {topGaps.map((w) => (
              <div
                key={w.name}
                className="flex items-start gap-3 px-3 py-2 rounded-lg cursor-pointer"
                style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
                onClick={() => onSetPage?.("workflows")}
              >
                <span className="text-xs mt-0.5 shrink-0" style={{ color: "#ef4444" }}>⚡</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium" style={{ color: "var(--c-text-1)" }}>{w.name}</div>
                  {w.priority_action && (
                    <div className="text-xs mt-0.5" style={{ color: "var(--c-text-5)" }}>
                      {w.priority_action}
                    </div>
                  )}
                </div>
                <span
                  className="text-xs px-1.5 py-0.5 rounded shrink-0"
                  style={{ background: "#1c0000", color: "#ef4444" }}
                >
                  {w.priority_level}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Executive summary ──────────────────────────────────────────────────────

function ExecutiveSummary({ summary, onSetPage }: { summary: string; onSetPage?: (p: import("./Sidebar").LeaderPage) => void }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#6366f1" }}>
          AI Executive Summary
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: "var(--c-text-5)" }}>Based on last pipeline run · asset quality scores</span>
          {onSetPage && (
            <button
              onClick={() => onSetPage("adoption")}
              className="text-xs font-medium"
              style={{ color: "#6366f1" }}
            >
              Live adoption →
            </button>
          )}
        </div>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: "var(--c-text-2)" }}>
        {summary}
      </p>
    </div>
  );
}

// ── Portfolio Health Timeline chart ────────────────────────────────────────

function PortfolioHealthChart({ data }: { data: PortfolioTrendPoint[] }) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center" style={{ height: 120 }}>
        <p className="text-sm" style={{ color: "var(--c-text-5)" }}>
          Run the pipeline at least twice to see trends over time.
        </p>
      </div>
    );
  }

  const W = 780, H = 110, PAD = { top: 12, right: 16, bottom: 24, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  // Normalize scores (0-100) to SVG y coords
  const ys = (val: number | null) => val == null ? null : PAD.top + innerH - (val / 100) * innerH;
  const xs = (i: number) => PAD.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);

  const toPath = (getter: (p: PortfolioTrendPoint) => number | null) => {
    const pts = data.map((p, i) => ({ x: xs(i), y: ys(getter(p)) })).filter((p) => p.y != null);
    if (pts.length < 2) return "";
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y!.toFixed(1)}`).join(" ");
  };

  const LINES = [
    { key: "quality", getter: (p: PortfolioTrendPoint) => p.avg_quality_score, color: "#10b981", label: "Avg Quality" },
    { key: "adoption", getter: (p: PortfolioTrendPoint) => p.avg_adoption_score, color: "#3b82f6", label: "Avg Adoption" },
    { key: "risk", getter: (p: PortfolioTrendPoint) => p.avg_risk_score, color: "#ef4444", label: "Avg Risk" },
  ];

  // Y-axis ticks
  const yTicks = [0, 25, 50, 75, 100];

  // X-axis labels (first + last + up to 3 middle)
  const xLabelIndices = data.length <= 5
    ? data.map((_, i) => i)
    : [0, Math.floor(data.length / 4), Math.floor(data.length / 2), Math.floor((3 * data.length) / 4), data.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }}>
        {/* Grid lines */}
        {yTicks.map((tick) => {
          const y = ys(tick)!;
          return (
            <g key={tick}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y}
                stroke="var(--c-border)" strokeWidth={0.5} strokeDasharray="3,3" />
              <text x={PAD.left - 4} y={y + 3.5} textAnchor="end" fontSize={8}
                fill="var(--c-text-5)">{tick}</text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {xLabelIndices.map((i) => (
          <text key={i} x={xs(i)} y={H - 4} textAnchor="middle" fontSize={8} fill="var(--c-text-5)">
            {new Date(data[i].synced_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </text>
        ))}

        {/* Trend lines */}
        {LINES.map(({ key, getter, color }) => (
          <path key={key} d={toPath(getter)} fill="none" stroke={color} strokeWidth={2}
            strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
        ))}

        {/* Dots at each data point */}
        {LINES.map(({ key, getter, color }) =>
          data.map((p, i) => {
            const y = ys(getter(p));
            if (y == null) return null;
            return <circle key={`${key}-${i}`} cx={xs(i)} cy={y} r={2.5} fill={color} opacity={0.9} />;
          })
        )}
      </svg>

      {/* Legend */}
      <div className="flex gap-4 justify-end mt-1">
        {LINES.map(({ key, color, label }) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded" style={{ background: color }} />
            <span className="text-xs" style={{ color: "var(--c-text-5)" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main HomePage ──────────────────────────────────────────────────────────

export default function HomePage({ gpts, onSetPage }: HomePageProps) {
  const { data: rec } = useRecommendations();
  const { data: trendData = [] } = usePortfolioTrend();
  const { data: workflows = [] } = useWorkflowCoverage();
  const [drawerGpt, setDrawerGpt] = useState<GPTItem | null>(null);
  const [drawerFilter, setDrawerFilter] = useState<DrawerFilter | null>(null);
  const [drawerTab, setDrawerTab] = useState<DetailTab>("details");

  const priorityActions = rec?.recommendations ?? [];
  const executiveSummary = rec?.executive_summary ?? null;
  const scored = gpts.filter((g) => g.quality_score != null);

  const openActionDrawer = (label: string, subset: GPTItem[], tab: DetailTab) => {
    setDrawerGpt(null);
    setDrawerTab(tab);
    setDrawerFilter({ label, gpts: subset });
  };

  return (
    <div className="p-6 space-y-6" style={{ maxWidth: 1400, margin: "0 auto" }}>
      <GPTDrawer
        gpt={drawerGpt}
        filter={drawerFilter}
        initialTab={drawerTab}
        onClose={() => { setDrawerGpt(null); setDrawerFilter(null); }}
      />

      {/* Pulse strip */}
      <PulseStrip gpts={gpts} onSetPage={onSetPage} />

      {/* Executive summary (shown when available) */}
      {executiveSummary && <ExecutiveSummary summary={executiveSummary} onSetPage={onSetPage} />}

      {/* Main 2-column layout */}
      <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 380px" }}>
        {/* Left: Quadrant chart */}
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: "var(--c-text-1)" }}>
              Portfolio Quadrant
            </h2>
            <span className="text-xs" style={{ color: "var(--c-text-5)" }}>
              {scored.length} of {gpts.length} assets scored · click dot to inspect
            </span>
          </div>
          <QuadrantChart gpts={gpts} onSelectGpt={(g) => { setDrawerFilter(null); setDrawerGpt(g); }} />
        </div>

        {/* Right: Priority actions */}
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: "var(--c-text-1)" }}>
              Priority Actions
            </h2>
            <span className="text-xs" style={{ color: "var(--c-text-5)" }}>
              {priorityActions.length > 0 ? `${priorityActions.length} actions` : "Run pipeline to generate"}
            </span>
          </div>

          {priorityActions.length === 0 ? (
            <div className="flex flex-col items-center justify-center" style={{ height: 260 }}>
              <p className="text-sm text-center" style={{ color: "var(--c-text-5)" }}>
                Priority actions are generated after the pipeline runs and scores your AI portfolio.
              </p>
            </div>
          ) : (
            <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 460 }}>
              {priorityActions.map((action, i) => (
                <PriorityActionCard key={i} action={action} rank={i + 1} gpts={gpts} onOpenDrawer={openActionDrawer} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Workflow Coverage Summary */}
      {workflows.length > 0 && (
        <WorkflowSummaryCard workflows={workflows} onSetPage={onSetPage} />
      )}

      {/* Portfolio Health Over Time */}
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-semibold" style={{ color: "var(--c-text-1)" }}>
              Portfolio Health Over Time
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--c-text-5)" }}>
              Average Quality, Adoption, and Risk scores across all pipeline runs
            </p>
          </div>
          {trendData.length > 0 && (
            <span className="text-xs" style={{ color: "var(--c-text-5)" }}>
              {trendData.length} sync{trendData.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <PortfolioHealthChart data={trendData} />
      </div>

    </div>
  );
}
