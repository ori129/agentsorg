import { useState } from "react";
import { useConversationOverview } from "../../hooks/useConversations";
import { usePipelineGPTs } from "../../hooks/usePipeline";
import type { LeaderPage } from "./Sidebar";
import type { GPTItem } from "../../types";
import GPTDrawer, { type DetailTab } from "./GPTDrawer";

interface AdoptionPageProps {
  onSetPage: (p: LeaderPage) => void;
}

function buildNameMap(gpts: GPTItem[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const g of gpts) map[g.id] = g.name;
  return map;
}

function assetName(id: string, names: Record<string, string>): string {
  return names[id] ?? id;
}

type Severity = "critical" | "warning" | "opportunity";

interface Rec {
  id: string;
  severity: Severity;
  icon: string;
  headline: string;
  detail: string;
  action: string;
  page?: LeaderPage;
}

function buildRecommendations(
  overview: NonNullable<ReturnType<typeof useConversationOverview>["data"]>,
  names: Record<string, string>
): Rec[] {
  const recs: Rec[] = [];
  const totalAssets = overview.active_assets + overview.ghost_assets;
  const ghostPct = totalAssets > 0 ? Math.round((overview.ghost_assets / totalAssets) * 100) : 0;
  const topConvs = overview.top_assets[0]?.conversation_count ?? 0;
  const topConvPct = overview.total_conversations > 0
    ? Math.round((topConvs / overview.total_conversations) * 100) : 0;
  const utilizationPct = totalAssets > 0 ? Math.round((overview.active_assets / totalAssets) * 100) : 0;

  if (ghostPct >= 40) {
    recs.push({
      id: "ghost-rate",
      severity: "critical",
      icon: "👻",
      headline: `${ghostPct}% of assets are unused — high ghost rate`,
      detail: `${overview.ghost_assets} assets have zero conversations in 30 days despite being available. Archive or re-promote them to reduce portfolio clutter.`,
      action: "View ghost assets ↓",
    });
  } else if (ghostPct >= 20) {
    recs.push({
      id: "ghost-rate",
      severity: "warning",
      icon: "👻",
      headline: `${overview.ghost_assets} ghost assets detected`,
      detail: `${ghostPct}% of your portfolio is unused. Review and either run an awareness campaign or archive these assets.`,
      action: "View ghost assets ↓",
    });
  }

  for (const d of overview.drift_details) {
    const name = assetName(d.asset_id, names);
    recs.push({
      id: `drift-${d.asset_id}`,
      severity: "warning",
      icon: "⚡",
      headline: `"${name}" is being used outside its purpose`,
      detail: d.drift_alert,
      action: "Create a dedicated asset",
    });
  }

  if (overview.knowledge_gap_assets.length > 0) {
    const firstSignal = overview.knowledge_gap_assets[0]?.signals[0];
    recs.push({
      id: "knowledge-gap",
      severity: "opportunity",
      icon: "📚",
      headline: `Knowledge gaps found in ${overview.knowledge_gap_assets.length} asset${overview.knowledge_gap_assets.length > 1 ? "s" : ""}`,
      detail: firstSignal
        ? `Employees frequently ask: "${firstSignal.example_question}" — but get poor answers. Address in L&D.`
        : "Employees are asking questions your assets cannot answer well.",
      action: "Go to Learning →",
      page: "enablement:learning",
    });
  }

  if (topConvPct >= 40 && overview.top_assets.length > 0) {
    const name = assetName(overview.top_assets[0].asset_id, names);
    recs.push({
      id: "concentration",
      severity: "warning",
      icon: "⚖️",
      headline: `Dependency risk: "${name}" drives ${topConvPct}% of all conversations`,
      detail: "High concentration on a single asset creates fragility. Promote complementary assets or split responsibility.",
      action: "View portfolio →",
      page: "portfolio",
    });
  }

  if (utilizationPct < 50 && !recs.find((r) => r.id === "ghost-rate")) {
    recs.push({
      id: "low-adoption",
      severity: "warning",
      icon: "📣",
      headline: "Adoption below 50% — run an awareness campaign",
      detail: `Only ${utilizationPct}% of your AI assets are actively used. Workshops, demos, or Slack announcements can close this gap quickly.`,
      action: "Go to Workshops →",
      page: "enablement:workshops",
    });
  }

  if (recs.length === 0) {
    recs.push({
      id: "all-good",
      severity: "opportunity",
      icon: "🚀",
      headline: "Strong adoption across the portfolio",
      detail: `${utilizationPct}% utilization with no drift or knowledge gaps detected. Celebrate your builders and keep the momentum going.`,
      action: "Go to Recognition →",
      page: "enablement:recognition",
    });
  }

  return recs;
}

const SEVERITY_STYLES: Record<Severity, { bg: string; border: string; badge: string; badgeText: string; badgeLabel: string }> = {
  critical:    { bg: "#ef444408", border: "#ef444430", badge: "#ef444415", badgeText: "#ef4444", badgeLabel: "Critical" },
  warning:     { bg: "#f59e0b08", border: "#f59e0b30", badge: "#f59e0b15", badgeText: "#f59e0b",  badgeLabel: "Action needed" },
  opportunity: { bg: "#10b98108", border: "#10b98130", badge: "#10b98115", badgeText: "#10b981", badgeLabel: "Opportunity" },
};

export default function AdoptionPage({ onSetPage }: AdoptionPageProps) {
  const { data: overview, isLoading } = useConversationOverview(30);
  const { data: gpts = [] } = usePipelineGPTs();
  const names = buildNameMap(gpts);
  const [drawerGpt, setDrawerGpt] = useState<GPTItem | null>(null);
  const [drawerTab, setDrawerTab] = useState<DetailTab | undefined>(undefined);

  function openAsset(id: string, tab?: DetailTab) {
    const gpt = gpts.find((g) => g.id === id) ?? null;
    setDrawerGpt(gpt);
    setDrawerTab(tab);
  }

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center" style={{ minHeight: 300 }}>
        <p className="text-sm" style={{ color: "var(--c-text-4)" }}>Loading…</p>
      </div>
    );
  }

  if (!overview || overview.total_conversations === 0) {
    return (
      <div className="p-8 flex flex-col items-center justify-center" style={{ minHeight: 300 }}>
        <p className="text-lg font-semibold mb-2" style={{ color: "var(--c-text-1)" }}>
          Adoption Intelligence
        </p>
        <p className="text-sm text-center mb-4" style={{ color: "var(--c-text-4)", maxWidth: 400 }}>
          No conversation data yet. Run the pipeline from Sync to see adoption metrics,
          topic drift alerts, ghost assets, and actionable recommendations.
        </p>
        <button
          onClick={() => onSetPage("sync")}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: "#3b82f6", color: "white" }}
        >
          Go to Sync →
        </button>
      </div>
    );
  }

  const totalAssets = overview.active_assets + overview.ghost_assets;
  const utilizationPct = totalAssets > 0
    ? Math.round((overview.active_assets / totalAssets) * 100) : 0;
  const recs = buildRecommendations(overview, names);

  return (
    <>
    <div className="p-8 flex flex-col gap-6 max-w-5xl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold mb-1" style={{ color: "var(--c-text-1)" }}>
          Adoption Intelligence
        </h1>
        <p className="text-sm" style={{ color: "var(--c-text-3)" }}>
          Last 30 days · {totalAssets} assets tracked
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          {
            label: "Total conversations",
            value: overview.total_conversations.toLocaleString(),
            color: "#3b82f6",
            sub: overview.total_conversations >= 10
              ? `≈${Math.round(overview.total_conversations * 6 / 60)} hrs of work augmented`
              : "~6 min per conversation",
          },
          {
            label: "Active users",
            value: overview.active_users.toLocaleString(),
            color: "#10b981",
            sub: `across ${overview.active_assets} assets`,
          },
          {
            label: "Active assets",
            value: overview.active_assets.toLocaleString(),
            color: "#6366f1",
            sub: `${utilizationPct}% of portfolio`,
          },
          {
            label: "Ghost assets",
            value: overview.ghost_assets.toLocaleString(),
            color: overview.ghost_assets > 0 ? "#ef4444" : "#10b981",
            sub: "zero conversations",
          },
        ].map(({ label, value, color, sub }) => (
          <div
            key={label}
            className="rounded-xl p-4"
            style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
          >
            <p className="text-2xl font-bold" style={{ color }}>{value}</p>
            <p className="text-xs mt-1 font-medium" style={{ color: "var(--c-text-3)" }}>{label}</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--c-text-5)" }}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Smart recommendations */}
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
      >
        <p className="text-sm font-semibold mb-4" style={{ color: "var(--c-text-1)" }}>
          Recommended actions
        </p>
        <div className="flex flex-col gap-3">
          {recs.map((rec) => {
            const s = SEVERITY_STYLES[rec.severity];
            return (
              <div
                key={rec.id}
                className="flex items-start gap-3 p-3 rounded-lg"
                style={{ background: s.bg, border: `1px solid ${s.border}` }}
              >
                <span className="text-xl mt-0.5">{rec.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ background: s.badge, color: s.badgeText }}
                    >
                      {s.badgeLabel}
                    </span>
                    <p className="text-sm font-medium" style={{ color: "var(--c-text-1)" }}>
                      {rec.headline}
                    </p>
                  </div>
                  <p className="text-xs" style={{ color: "var(--c-text-3)" }}>{rec.detail}</p>
                </div>
                {rec.page && (
                  <button
                    onClick={() => onSetPage(rec.page!)}
                    className="text-xs px-3 py-1.5 rounded-lg whitespace-nowrap font-medium flex-shrink-0"
                    style={{ background: s.badge, color: s.badgeText }}
                  >
                    {rec.action}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Utilization bar */}
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
      >
        <div className="flex justify-between items-center mb-3">
          <p className="text-sm font-medium" style={{ color: "var(--c-text-1)" }}>
            Portfolio utilization
          </p>
          <p
            className="text-sm font-bold"
            style={{ color: utilizationPct >= 70 ? "#10b981" : utilizationPct >= 40 ? "#f59e0b" : "#ef4444" }}
          >
            {utilizationPct}%
          </p>
        </div>
        <div className="w-full rounded-full overflow-hidden" style={{ height: 8, background: "var(--c-border)" }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${utilizationPct}%`,
              background: utilizationPct >= 70 ? "#10b981" : utilizationPct >= 40 ? "#f59e0b" : "#ef4444",
            }}
          />
        </div>
        <p className="text-xs mt-2" style={{ color: "var(--c-text-3)" }}>
          {overview.active_assets} of {totalAssets} assets had conversations in the last 30 days
          {overview.ghost_assets > 0 &&
            ` · ${overview.ghost_assets} with zero usage despite being available`}
        </p>
      </div>

      {/* Top assets + Drift alerts */}
      <div className="grid grid-cols-2 gap-4">
        {/* Top assets */}
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
        >
          <p className="text-sm font-medium mb-4" style={{ color: "var(--c-text-1)" }}>
            Top assets by conversations
          </p>
          {overview.top_assets.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--c-text-4)" }}>No data</p>
          ) : (
            <div className="flex flex-col gap-3">
              {overview.top_assets.map((asset, i) => {
                const max = overview.top_assets[0]?.conversation_count ?? 1;
                const pct = Math.round((asset.conversation_count / max) * 100);
                const name = assetName(asset.asset_id, names);
                return (
                  <button
                    key={asset.asset_id}
                    onClick={() => openAsset(asset.asset_id, "usage")}
                    className="w-full text-left"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <p
                        className="text-xs font-medium truncate hover:underline"
                        style={{ color: "#3b82f6", maxWidth: "72%" }}
                        title={name}
                      >
                        {i + 1}. {name}
                      </p>
                      <p className="text-xs font-bold" style={{ color: "var(--c-text-1)" }}>
                        {asset.conversation_count.toLocaleString()}
                      </p>
                    </div>
                    <div className="w-full rounded-full overflow-hidden" style={{ height: 4, background: "var(--c-border)" }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#3b82f6" }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Drift alerts */}
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
        >
          <p className="text-sm font-medium mb-4" style={{ color: "var(--c-text-1)" }}>
            Topic drift alerts
          </p>
          {overview.drift_details.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 gap-2">
              <p className="text-2xl">✓</p>
              <p className="text-sm" style={{ color: "var(--c-text-3)" }}>No drift detected</p>
              <p className="text-xs text-center" style={{ color: "var(--c-text-4)" }}>
                All assets are being used for their intended purpose
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {overview.drift_details.map((d) => (
                <button
                  key={d.asset_id}
                  onClick={() => openAsset(d.asset_id, "usage")}
                  className="w-full text-left p-3 rounded-lg transition-opacity hover:opacity-80"
                  style={{ background: "#f59e0b0c", border: "1px solid #f59e0b30", cursor: "pointer" }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold" style={{ color: "#f59e0b" }}>
                      {assetName(d.asset_id, names)}
                    </p>
                    <span className="text-xs" style={{ color: "#f59e0b60" }}>View usage →</span>
                  </div>
                  <p className="text-xs" style={{ color: "var(--c-text-3)" }}>
                    {d.drift_alert}
                  </p>
                  <p className="text-xs mt-1.5 font-medium" style={{ color: "var(--c-text-4)" }}>
                    → Consider creating a dedicated asset for this use case
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Ghost assets list */}
      {overview.ghost_asset_ids.length > 0 && (
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
        >
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium" style={{ color: "var(--c-text-1)" }}>
                Ghost assets
              </p>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: "#ef444415", color: "#ef4444" }}
              >
                {overview.ghost_asset_ids.length}
              </span>
            </div>
            <p className="text-xs" style={{ color: "var(--c-text-4)" }}>
              Available to employees · zero conversations in 30 days
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {overview.ghost_asset_ids.slice(0, 12).map((id) => (
              <button
                key={id}
                onClick={() => openAsset(id)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors"
                style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)", cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#ef444440")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--c-border)")}
              >
                <span style={{ color: "#ef4444", fontSize: 8 }}>●</span>
                <p
                  className="text-xs truncate flex-1"
                  style={{ color: "var(--c-text-2)" }}
                  title={assetName(id, names)}
                >
                  {assetName(id, names)}
                </p>
                <span style={{ color: "var(--c-text-5)", fontSize: 9, flexShrink: 0 }}>→</span>
              </button>
            ))}
          </div>
          {overview.ghost_asset_ids.length > 12 && (
            <p className="text-xs mt-2" style={{ color: "var(--c-text-4)" }}>
              + {overview.ghost_asset_ids.length - 12} more ghost assets
            </p>
          )}
          <p className="text-xs mt-3 p-3 rounded-lg" style={{ background: "#ef444408", color: "var(--c-text-3)", border: "1px solid #ef444420" }}>
            <strong style={{ color: "var(--c-text-2)" }}>Recommended:</strong> For each ghost asset, decide — run an awareness campaign,
            improve instructions to increase quality, or archive it to keep your portfolio focused.
          </p>
        </div>
      )}

      {/* Knowledge gaps */}
      {overview.knowledge_gap_assets.length > 0 && (
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
        >
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm font-medium" style={{ color: "var(--c-text-1)" }}>
              Knowledge gaps — L&D opportunities
            </p>
            <button
              onClick={() => onSetPage("enablement:learning")}
              className="text-xs px-3 py-1 rounded-lg font-medium"
              style={{ background: "#10b98115", color: "#10b981" }}
            >
              Go to Learning →
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {overview.knowledge_gap_assets.map(({ asset_id, signals }) => (
              <div
                key={asset_id}
                className="p-3 rounded-lg"
                style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold" style={{ color: "var(--c-text-2)" }}>
                    {assetName(asset_id, names)}
                  </p>
                  <button
                    onClick={() => openAsset(asset_id, "usage")}
                    className="text-xs px-2 py-0.5 rounded font-medium"
                    style={{ background: "#6366f115", color: "#6366f1", cursor: "pointer", border: "none" }}
                  >
                    View usage →
                  </button>
                </div>
                <div className="flex flex-col gap-1.5">
                  {signals.slice(0, 2).map((sig, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-xs mt-0.5" style={{ color: "#6366f1" }}>▸</span>
                      <div>
                        <p className="text-xs font-medium" style={{ color: "var(--c-text-2)" }}>
                          {sig.topic}
                          <span className="ml-2 font-normal" style={{ color: "var(--c-text-4)" }}>
                            {sig.frequency}× asked
                          </span>
                        </p>
                        <p className="text-xs italic mt-0.5" style={{ color: "var(--c-text-4)" }}>
                          "{sig.example_question}"
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs mt-3 p-3 rounded-lg" style={{ background: "#6366f108", color: "var(--c-text-3)", border: "1px solid #6366f120" }}>
            <strong style={{ color: "var(--c-text-2)" }}>Next step:</strong> These are real questions employees asked that your assets couldn't answer well.
            Use them to design targeted workshops or update asset instructions to close the gap.
          </p>
        </div>
      )}

    </div>

    <GPTDrawer gpt={drawerGpt} onClose={() => setDrawerGpt(null)} initialTab={drawerTab} />
    </>
  );
}
