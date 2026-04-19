import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ClusterGroup, GPTItem } from "../../types";
import { api } from "../../api/client";
import GPTDrawer, { type DrawerFilter } from "./GPTDrawer";
import type { LeaderPage } from "./Sidebar";
import { useDemoState } from "../../hooks/useDemo";
import { useConversationOverview } from "../../hooks/useConversations";

interface OverviewProps {
  gpts: GPTItem[];
  onSetPage: (p: LeaderPage) => void;
  onSwitchToProduction?: () => void;
}

// ── Data derivation ───────────────────────────────────────────────────────────

function useOverviewData(gpts: GPTItem[]) {
  return useMemo(() => {
    const hasData = gpts.length > 0;
    const hasEnrichment = gpts.some((g) => g.semantic_enriched_at);
    const enriched = gpts.filter((g) => g.semantic_enriched_at);

    // ── KPI strip ──
    const totalGpts = gpts.length;
    const gptCount = gpts.filter((g) => g.asset_type === "gpt" || !g.asset_type).length;
    const projectCount = gpts.filter((g) => g.asset_type === "project").length;
    const uniqueBuilders = new Set(gpts.map((g) => g.owner_email).filter(Boolean)).size;
    const avgSoph =
      enriched.length > 0
        ? (enriched.reduce((s, g) => s + (g.sophistication_score ?? 0), 0) / enriched.length).toFixed(1)
        : "—";
    const riskCount = gpts.filter((g) => g.risk_level === "high" || g.risk_level === "critical").length;

    // ── Creation velocity (last 6 months) ──
    const velocity: { month: string; count: number }[] = (() => {
      if (!hasData) return [];
      const now = new Date();
      const buckets: Record<string, number> = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toLocaleString("en-US", { month: "short" });
        buckets[key] = 0;
      }
      for (const g of gpts) {
        if (!g.created_at) continue;
        const d = new Date(g.created_at);
        const key = d.toLocaleString("en-US", { month: "short" });
        if (key in buckets) buckets[key]++;
      }
      return Object.entries(buckets).map(([month, count]) => ({ month, count }));
    })();

    // ── By department ──
    const byDept: { dept: string; count: number }[] = (() => {
      if (!hasData) return [];
      const counts: Record<string, number> = {};
      for (const g of gpts) {
        const dept = g.primary_category || (g.builder_categories?.[0] as string) || "General";
        counts[dept] = (counts[dept] ?? 0) + 1;
      }
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 7)
        .map(([dept, count]) => ({ dept, count }));
    })();

    // ── Business process distribution (from enrichment) ──
    const processDistribution: { name: string; count: number }[] = (() => {
      if (!hasEnrichment) return [];
      // key = lowercase for grouping; display name = first-seen casing (backend normalizes to Title Case)
      const counts: Record<string, number> = {};
      const display: Record<string, string> = {};
      enriched.forEach((g) => {
        if (g.business_process) {
          const key = g.business_process.trim().toLowerCase();
          counts[key] = (counts[key] ?? 0) + 1;
          if (!display[key]) display[key] = g.business_process.trim();
        }
      });
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([key, count]) => ({ name: display[key], count }));
    })();
    const noProcessCount = hasEnrichment
      ? enriched.filter((g) => !g.business_process).length
      : 0;
    const totalEnriched = enriched.length;

    // ── Top risks ──
    const topRisks: { name: string; level: string; flag: string }[] = (() => {
      if (!hasEnrichment) return [];
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return enriched
        .filter((g) => g.risk_level && g.risk_level !== "low")
        .sort((a, b) => (order[a.risk_level!] ?? 3) - (order[b.risk_level!] ?? 3))
        .slice(0, 5)
        .map((g) => ({
          name: g.name,
          level: g.risk_level!,
          flag: g.risk_flags?.[0] ?? "",
        }));
    })();

    // ── Maturity distribution ──
    const maturity = (() => {
      if (!hasEnrichment) return { tier1: 0, tier2: 0, tier3: 0 };
      const t1 = enriched.filter((g) => (g.sophistication_score ?? 0) <= 2).length;
      const t2 = enriched.filter((g) => g.sophistication_score === 3).length;
      const t3 = enriched.filter((g) => (g.sophistication_score ?? 0) >= 4).length;
      const total = enriched.length || 1;
      return {
        tier1: Math.round((t1 / total) * 100),
        tier2: Math.round((t2 / total) * 100),
        tier3: Math.round((t3 / total) * 100),
      };
    })();

    // ── Output type distribution ──
    const outputTypes: { type: string; count: number; pct: number }[] = (() => {
      if (!hasEnrichment) return [];
      const counts: Record<string, number> = {};
      for (const g of enriched) {
        const t = g.output_type ?? "other";
        counts[t] = (counts[t] ?? 0) + 1;
      }
      const total = enriched.length || 1;
      return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([type, count]) => ({
          type: type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " "),
          count,
          pct: Math.round((count / total) * 100),
        }));
    })();

    // ── Top builders ──
    const builderMap: Record<string, { count: number; gptCount: number; projectCount: number; scores: number[] }> = {};
    if (hasData) {
      for (const g of gpts) {
        const name = g.builder_name || g.owner_email || "Unknown";
        if (!builderMap[name]) builderMap[name] = { count: 0, gptCount: 0, projectCount: 0, scores: [] };
        builderMap[name].count++;
        if (g.asset_type === "project") builderMap[name].projectCount++;
        else builderMap[name].gptCount++;
        if (g.prompting_quality_score != null) builderMap[name].scores.push(g.prompting_quality_score);
      }
    }
    const allBuilders: { name: string; gpts: number; gptCount: number; projectCount: number; avgQuality: number }[] = Object.entries(builderMap)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([name, { count, gptCount, projectCount, scores }]) => ({
        name,
        gpts: count,
        gptCount,
        projectCount,
        avgQuality: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      }));
    const topBuilders = allBuilders.slice(0, 5);
    const totalBuilders = allBuilders.length;

    // ── Quality by dept ──
    const qualityByDept: { dept: string; avgScore: number }[] = (() => {
      if (!hasEnrichment) return [];
      const deptMap: Record<string, number[]> = {};
      for (const g of enriched) {
        if (g.prompting_quality_score == null) continue;
        const dept = g.primary_category || (g.builder_categories?.[0] as string) || "General";
        if (!deptMap[dept]) deptMap[dept] = [];
        deptMap[dept].push(g.prompting_quality_score);
      }
      return Object.entries(deptMap)
        .map(([dept, scores]) => ({
          dept,
          avgScore: scores.reduce((a, b) => a + b, 0) / scores.length,
        }))
        .sort((a, b) => b.avgScore - a.avgScore)
        .slice(0, 5);
    })();

    // ── Lowest quality dept for callout ──
    const lowestQualityDept = qualityByDept.length
      ? [...qualityByDept].sort((a, b) => a.avgScore - b.avgScore)[0]
      : null;

    return {
      hasData, hasEnrichment,
      totalGpts, gptCount, projectCount,
      uniqueBuilders, avgSoph, riskCount,
      velocity, byDept, processDistribution, noProcessCount, totalEnriched, topRisks,
      maturity, outputTypes, topBuilders, totalBuilders, allBuilders, qualityByDept, lowestQualityDept,
    };
  }, [gpts]);
}

// ── Small reusable components ─────────────────────────────────────────────────

const RISK_COLORS: Record<string, string> = {
  critical: "#8b5cf6", high: "#ef4444", medium: "#f59e0b", low: "#10b981",
};

function ScoreDots({ score }: { score: number }) {
  return (
    <span className="inline-flex gap-1 items-center">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className="inline-block w-2 h-2 rounded-full"
          style={{ background: i < score ? (score >= 4 ? "#10b981" : score >= 3 ? "#f59e0b" : "#ef4444") : "var(--c-border)" }}
        />
      ))}
    </span>
  );
}

function KpiCard({ label, value, sub, color, onClick }: { label: string; value: string | number; sub?: string; color: string; onClick?: () => void }) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-1 transition-colors"
      style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
      onMouseEnter={(e) => onClick && ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--c-accent-bg)")}
      onMouseLeave={(e) => onClick && ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--c-border)")}
    >
      <div className="text-xs" style={{ color: "var(--c-text-4)" }}>{label}</div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      {sub && <div className="text-xs" style={{ color: "var(--c-text-4)" }}>{sub}</div>}
    </div>
  );
}

const CLICKABLE_ROW = {
  cursor: "pointer",
  borderRadius: 6,
  padding: "2px 4px",
  margin: "0 -4px",
} as React.CSSProperties;

function Card({ title, children, onExpand }: { title: string; children: React.ReactNode; onExpand?: () => void }) {
  return (
    <div className="rounded-xl p-5" style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--c-text-4)" }}>
          {title}
        </div>
        {onExpand && (
          <button
            onClick={onExpand}
            className="text-xs px-1.5 py-0.5 rounded transition-colors"
            style={{ color: "var(--c-text-5)", background: "none", border: "none", cursor: "pointer" }}
            title="Open full view"
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "#3b82f6";
              (e.currentTarget as HTMLButtonElement).style.background = "var(--c-accent-bg)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--c-text-5)";
              (e.currentTarget as HTMLButtonElement).style.background = "none";
            }}
          >
            ↗
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function ViewAllLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-3 text-xs font-medium"
      style={{ color: "#3b82f6", background: "none", border: "none", cursor: "pointer", padding: 0 }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.7")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
    >
      {label} →
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Overview({ gpts, onSetPage, onSwitchToProduction }: OverviewProps) {
  const d = useOverviewData(gpts);
  const [drawer, setDrawer] = useState<DrawerFilter | null>(null);
  const { data: demoState } = useDemoState();
  const isDemoActive = demoState?.enabled ?? false;
  const { data: convOverview } = useConversationOverview(30);

  const { data: clusters = [] } = useQuery<ClusterGroup[]>({
    queryKey: ["clustering-results"],
    queryFn: () => api.getClusteringResults(),
    staleTime: 60_000,
  });

  const velMax = Math.max(...d.velocity.map((m) => m.count), 1);
  const deptMax = Math.max(...d.byDept.map((x) => x.count), 1);
  const procMax = Math.max(...d.processDistribution.map((p) => p.count), 1);
  const noProcessPct = d.totalEnriched > 0
    ? Math.round((d.noProcessCount / d.totalEnriched) * 100)
    : 0;

  const open = (label: string, subset: GPTItem[]) =>
    setDrawer({ label, gpts: subset });

  // Pre-compute filter subsets
  const riskGpts = gpts.filter((g) => g.risk_level === "high" || g.risk_level === "critical");
  const noProcessGpts = gpts.filter((g) => !g.business_process);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <GPTDrawer filter={drawer} onClose={() => setDrawer(null)} />

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--c-text)" }}>AI Portfolio Overview</h1>
          <div className="text-sm mt-0.5" style={{ color: "var(--c-text-4)" }}>
            {d.totalGpts} AI assets across organization
            {d.projectCount > 0 && (
              <span style={{ color: "var(--c-text-5)" }}>
                {" "}({d.gptCount} GPTs · {d.projectCount} Projects)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Demo mode callout */}
      {isDemoActive && (
        <div
          className="flex items-center justify-between rounded-xl px-5 py-4 mb-6"
          style={{ background: "#1c1200", border: "1px solid #78350f" }}
        >
          <div>
            <div className="text-sm font-semibold mb-0.5" style={{ color: "#fbbf24" }}>
              You're exploring with demo data
            </div>
            <div className="text-xs" style={{ color: "#d97706" }}>
              Connect your OpenAI Compliance API key to see your organization's real AI assets.
            </div>
          </div>
          {onSwitchToProduction && (
            <button
              onClick={onSwitchToProduction}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors hover:opacity-90 flex-shrink-0 ml-6"
              style={{ background: "#f59e0b", color: "#1c1200" }}
            >
              Connect to Production
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          )}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <div
          className="rounded-xl p-4 flex flex-col gap-1 transition-colors"
          style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", cursor: "pointer" }}
          onClick={() => open("All AI Assets", gpts)}
          onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--c-accent-bg)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = "var(--c-border)")}
        >
          <div className="text-xs" style={{ color: "var(--c-text-4)" }}>Total Assets</div>
          <div className="text-2xl font-bold" style={{ color: "#3b82f6" }}>{d.totalGpts.toLocaleString()}</div>
          {d.projectCount > 0 ? (
            <div className="flex items-center gap-2 mt-0.5">
              {/* Mini ring chart */}
              <svg width="28" height="28" viewBox="0 0 28 28">
                {(() => {
                  const total = d.totalGpts || 1;
                  const gptFrac = d.gptCount / total;
                  const cx = 14, cy = 14, r = 11, stroke = 5;
                  const circ = 2 * Math.PI * r;
                  const gptDash = gptFrac * circ;
                  return (
                    <>
                      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#6366f1" strokeWidth={stroke} />
                      <circle
                        cx={cx} cy={cy} r={r} fill="none"
                        stroke="#3b82f6" strokeWidth={stroke}
                        strokeDasharray={`${gptDash} ${circ}`}
                        strokeDashoffset={0}
                        transform="rotate(-90 14 14)"
                      />
                    </>
                  );
                })()}
              </svg>
              <div className="flex flex-col gap-0.5">
                <div className="text-xs" style={{ color: "var(--c-text-5)" }}>
                  <span style={{ color: "#3b82f6" }}>●</span> {d.gptCount} GPTs
                </div>
                <div className="text-xs" style={{ color: "var(--c-text-5)" }}>
                  <span style={{ color: "#6366f1" }}>●</span> {d.projectCount} Projects
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs" style={{ color: "var(--c-text-4)" }}>in registry</div>
          )}
        </div>
        <KpiCard label="Active Builders" value={d.uniqueBuilders.toLocaleString()} sub="created ≥1 asset" color="#6366f1"
          onClick={() => open("All assets — by builder", [...gpts].sort((a, b) => ((a.builder_name ?? a.owner_email) ?? "").localeCompare((b.builder_name ?? b.owner_email) ?? "")))} />
        <KpiCard label="Avg Sophistication" value={d.avgSoph} sub="out of 5" color="#f59e0b"
          onClick={() => open("By Sophistication", [...gpts].sort((a, b) => (b.sophistication_score ?? 0) - (a.sophistication_score ?? 0)))} />
        <KpiCard label="Risk Flags" value={d.riskCount.toLocaleString()} sub="high or critical" color="#ef4444"
          onClick={() => open("High & Critical Risk Assets", riskGpts)} />
        <KpiCard label="Business Processes" value={d.processDistribution.length.toLocaleString()} sub="unique workflows" color="#10b981"
          onClick={() => open("Assets with identified business process", gpts.filter((g) => g.business_process))} />
      </div>

      {/* Row 1: velocity + by dept */}
      <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: "60% 40%" }}>
        <Card title="Creation Velocity (last 6 months)">
          <div className="flex flex-col gap-1">
            <div className="flex items-end gap-2" style={{ height: 88 }}>
              {d.velocity.map((m) => (
                <div
                  key={m.month}
                  className="flex flex-col items-center justify-end flex-1 gap-1"
                  style={{ cursor: m.count > 0 ? "pointer" : "default" }}
                  onClick={() => {
                    if (!m.count) return;
                    const subset = gpts.filter((g) => {
                      if (!g.created_at) return false;
                      const d = new Date(g.created_at);
                      return d.toLocaleString("default", { month: "short" }) === m.month;
                    });
                    open(`Created in ${m.month}`, subset);
                  }}
                >
                  <div className="text-xs" style={{ color: "var(--c-text-4)" }}>{m.count}</div>
                  <div
                    className="w-full rounded-t transition-opacity hover:opacity-80"
                    style={{
                      height: m.count > 0 ? Math.max(4, (m.count / velMax) * 64) : 2,
                      background: "linear-gradient(180deg, #3b82f6, var(--c-accent-bg))",
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              {d.velocity.map((m) => (
                <div key={m.month} className="flex-1 text-center text-xs" style={{ color: "var(--c-text-4)" }}>
                  {m.month}
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card title="Assets by Department" onExpand={() => onSetPage("overview:departments")}>
          <div className="space-y-2">
            {d.byDept.map((dep) => (
              <div
                key={dep.dept}
                className="flex items-center gap-2 rounded px-1 -mx-1 transition-colors"
                style={{ cursor: "pointer" }}
                onClick={() => open(dep.dept, gpts.filter((g) => (g.primary_category || (g.builder_categories?.[0] as string) || "General") === dep.dept))}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-border)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div className="text-xs w-20 truncate" style={{ color: "var(--c-text-2)" }}>{dep.dept}</div>
                <div className="flex-1 rounded-full overflow-hidden" style={{ background: "var(--c-border)", height: 8 }}>
                  <div className="h-full rounded-full"
                    style={{ width: `${(dep.count / deptMax) * 100}%`, background: "#6366f1" }}
                  />
                </div>
                <div className="text-xs w-8 text-right" style={{ color: "var(--c-text-3)" }}>{dep.count.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Row 2: process distribution + risk list */}
      <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: "60% 40%" }}>
        <Card title="Business Processes in Use" onExpand={() => onSetPage("overview:processes")}>
          {d.processDistribution.length === 0 ? (
            <div className="text-xs" style={{ color: "var(--c-text-4)" }}>
              No enrichment data yet. Run the pipeline with an OpenAI key to extract business processes.
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {d.processDistribution.map((p, i) => (
                  <div
                    key={p.name}
                    className="flex items-center gap-2 rounded px-1 -mx-1 transition-colors"
                    style={{ cursor: "pointer" }}
                    onClick={() => open(p.name, gpts.filter((g) => g.business_process === p.name))}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-border)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div className="text-xs w-4 text-right shrink-0" style={{ color: "var(--c-text-5)" }}>{i + 1}</div>
                    <div className="text-xs truncate" style={{ color: "var(--c-text-2)", width: 160, minWidth: 160 }}>{p.name}</div>
                    <div className="flex-1 rounded-full overflow-hidden" style={{ background: "var(--c-border)", height: 6 }}>
                      <div className="h-full rounded-full"
                        style={{ width: `${(p.count / procMax) * 100}%`, background: "linear-gradient(90deg, #10b981, #3b82f6)" }}
                      />
                    </div>
                    <div className="text-xs w-6 text-right shrink-0" style={{ color: "var(--c-text-3)" }}>{p.count}</div>
                  </div>
                ))}
              </div>
              {d.noProcessCount > 0 && (
                <div
                  className="mt-3 flex items-center gap-2 text-xs rounded px-2 py-1 -mx-2 transition-colors"
                  style={{ color: "var(--c-text-4)", cursor: "pointer" }}
                  onClick={() => open("No identified business process (experimental)", noProcessGpts)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-border)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: "var(--c-text-5)" }} />
                  {d.noProcessCount.toLocaleString()} assets ({noProcessPct}%) have no identifiable business process — likely experimental
                </div>
              )}
            </>
          )}
        </Card>

        <Card title="Top Risk Items">
          <div className="space-y-2">
            {d.topRisks.length === 0 ? (
              <div className="text-xs" style={{ color: "var(--c-text-4)" }}>No high/critical risk assets found.</div>
            ) : d.topRisks.map((r) => (
              <div
                key={r.name}
                className="flex items-center justify-between text-xs py-1 rounded px-1 -mx-1 transition-colors"
                style={{ borderBottom: "1px solid var(--c-border)", cursor: "pointer" }}
                onClick={() => {
                  const g = gpts.find((g) => g.name === r.name);
                  if (g) open(r.name, [g]);
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-border)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div className="truncate" style={{ color: "var(--c-text-2)", maxWidth: 160 }}>{r.name}</div>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold ml-2 shrink-0"
                  style={{ background: RISK_COLORS[r.level] + "22", color: RISK_COLORS[r.level] }}>
                  {r.level}
                </span>
              </div>
            ))}
          </div>
          {riskGpts.length > 5 && (
            <ViewAllLink
              label={`View all ${riskGpts.length.toLocaleString()} risk assets`}
              onClick={() => open("High & Critical Risk Assets", riskGpts)}
            />
          )}
        </Card>
      </div>

      {/* Row 3: maturity + redundancy + output type */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <Card title="Portfolio Maturity" onExpand={() => onSetPage("overview:maturity")}>
          <div className="flex flex-col items-center py-2">
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="48" fill="none" stroke="var(--c-border)" strokeWidth="12" />
              <circle cx="60" cy="60" r="48" fill="none" stroke="#3b82f6" strokeWidth="12"
                strokeDasharray={`${301 * d.maturity.tier1 / 100} 301`} strokeLinecap="round"
                transform="rotate(-90 60 60)" />
              <circle cx="60" cy="60" r="48" fill="none" stroke="#f59e0b" strokeWidth="12"
                strokeDasharray={`${301 * d.maturity.tier2 / 100} 301`} strokeLinecap="round"
                transform={`rotate(${-90 + 360 * d.maturity.tier1 / 100} 60 60)`} />
              <circle cx="60" cy="60" r="48" fill="none" stroke="#10b981" strokeWidth="12"
                strokeDasharray={`${301 * d.maturity.tier3 / 100} 301`} strokeLinecap="round"
                transform={`rotate(${-90 + 360 * (d.maturity.tier1 + d.maturity.tier2) / 100} 60 60)`} />
            </svg>
            <div className="flex flex-col gap-1 mt-3 text-xs">
              {[
                { label: `Production (${d.maturity.tier3}%)`, color: "#10b981", scores: [4, 5] },
                { label: `Functional (${d.maturity.tier2}%)`, color: "#f59e0b", scores: [3] },
                { label: `Experimental (${d.maturity.tier1}%)`, color: "#3b82f6", scores: [1, 2] },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2 rounded px-1.5 py-0.5 -mx-1.5 transition-colors"
                  style={{ cursor: "pointer" }}
                  onClick={() => open(item.label, gpts.filter((g) => item.scores.includes(g.sophistication_score ?? 0)))}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-border)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                  <span style={{ color: "var(--c-text-3)" }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card title="Standardization Opportunities">
          {clusters.length === 0 ? (
            <div className="text-xs" style={{ color: "var(--c-text-4)" }}>
              No clusters yet. Run analysis from the Standardization Opportunities panel to detect demand clusters.
            </div>
          ) : (
            <div className="space-y-2 text-xs">
              {clusters.slice(0, 5).map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-2 py-1.5 rounded transition-colors"
                  style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)", cursor: "pointer" }}
                  onClick={() => {
                    const subset = gpts.filter((g) => c.gpt_ids.includes(g.id));
                    open(c.gpt_names[0] ?? c.theme, subset);
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-border)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "var(--c-bg)")}
                >
                  <span className="truncate" style={{ color: "var(--c-text-2)", maxWidth: 130 }}>
                    {c.gpt_names[0] ?? c.theme}
                  </span>
                  <span style={{ color: "#f59e0b", flexShrink: 0 }}>{c.gpt_ids.length} assets</span>
                </div>
              ))}
              {clusters.length > 5 && (
                <ViewAllLink
                  label={`View all ${clusters.length} clusters`}
                  onClick={() => {
                    const subset = gpts.filter((g) => clusters.some((c) => c.gpt_ids.includes(g.id)));
                    open(`All ${clusters.length} redundancy clusters`, subset);
                  }}
                />
              )}
            </div>
          )}
        </Card>

        <Card title="Output Types" onExpand={() => onSetPage("overview:output-types")}>
          <div className="space-y-2 text-xs">
            {d.outputTypes.map((o) => (
              <div
                key={o.type}
                className="flex items-center gap-2 rounded px-1 -mx-1 transition-colors"
                style={{ cursor: "pointer" }}
                onClick={() => open(o.type, gpts.filter((g) => (g.output_type ?? "other").replace(/_/g, " ").toLowerCase() === o.type.toLowerCase()))}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-border)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div className="w-24 text-right" style={{ color: "var(--c-text-3)" }}>{o.type}</div>
                <div className="flex-1 rounded-full overflow-hidden" style={{ background: "var(--c-border)", height: 6 }}>
                  <div className="h-full rounded-full" style={{ width: `${o.pct}%`, background: "#6366f1" }} />
                </div>
                <div style={{ color: "var(--c-text-4)" }}>{o.count}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Row 4: top builders + quality by dept */}
      <div className="grid grid-cols-2 gap-4">
        <Card title="Top Builders" onExpand={() => onSetPage("overview:builders")}>
          <div className="space-y-2">
            {d.topBuilders.map((b, idx) => (
              <div
                key={b.name}
                className="flex items-center justify-between text-xs py-1 rounded px-1 -mx-1 transition-colors"
                style={{ borderBottom: "1px solid var(--c-border)", cursor: "pointer" }}
                onClick={() => open(`Assets by ${b.name}`, gpts.filter((g) => (g.builder_name ?? g.owner_email) === b.name))}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-border)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div className="flex items-center gap-2">
                  <span style={{ color: "var(--c-text-5)", width: 16 }}>#{idx + 1}</span>
                  <span className="truncate" style={{ color: "var(--c-text-2)", maxWidth: 140 }}>{b.name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span style={{ color: "var(--c-text-4)" }}>
                    {b.gptCount > 0 && (
                      <span>{b.gptCount} <span style={{ color: "#8b5cf6", fontWeight: 700, fontSize: 10 }}>GPT{b.gptCount !== 1 ? "s" : ""}</span></span>
                    )}
                    {b.gptCount > 0 && b.projectCount > 0 && <span style={{ color: "var(--c-text-5)" }}> · </span>}
                    {b.projectCount > 0 && (
                      <span>{b.projectCount} <span style={{ color: "#3b82f6", fontWeight: 700, fontSize: 10 }}>Project{b.projectCount !== 1 ? "s" : ""}</span></span>
                    )}
                  </span>
                  {b.avgQuality > 0 && <ScoreDots score={Math.round(b.avgQuality)} />}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Prompting Quality by Department">
          <div className="space-y-3">
            {d.qualityByDept.map((dep) => (
              <div
                key={dep.dept}
                className="text-xs rounded px-1 -mx-1 pb-1 transition-colors"
                style={{ cursor: "pointer" }}
                onClick={() => open(`${dep.dept} assets`, gpts.filter((g) => (g.primary_category || (g.builder_categories?.[0] as string) || "General") === dep.dept))}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-border)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div className="flex items-center justify-between mb-1">
                  <span style={{ color: "var(--c-text-2)" }}>{dep.dept}</span>
                  <span style={{ color: "var(--c-text-4)" }}>{dep.avgScore.toFixed(1)}/5</span>
                </div>
                <div className="rounded-full overflow-hidden" style={{ background: "var(--c-border)", height: 6 }}>
                  <div className="h-full rounded-full"
                    style={{
                      width: `${(dep.avgScore / 5) * 100}%`,
                      background: dep.avgScore >= 3.5 ? "#10b981" : dep.avgScore >= 2.5 ? "#f59e0b" : "#ef4444",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          {d.lowestQualityDept && d.lowestQualityDept.avgScore < 3 && (
            <div className="mt-4 px-3 py-2 rounded-lg text-xs"
              style={{ background: "#1c1200", border: "1px solid #78350f", color: "#f59e0b" }}>
              {d.lowestQualityDept.dept} avg {d.lowestQualityDept.avgScore.toFixed(1)}/5 — prompt engineering
              workshop recommended.
            </div>
          )}
        </Card>
      </div>

      {/* ── Actual Adoption ─────────────────────────────────────────────── */}
      {convOverview && (
        <div className="mt-6">
          <h2
            className="text-sm font-semibold uppercase tracking-widest mb-4"
            style={{ color: "var(--c-text-4)" }}
          >
            Actual Adoption (last 30 days)
          </h2>

          {(() => {
            const totalAssets = convOverview.active_assets + convOverview.ghost_assets;
            const utilizationPct = totalAssets > 0 ? Math.round((convOverview.active_assets / totalAssets) * 100) : 0;
            return (
              <div className="flex items-center gap-3 mb-3 px-1">
                <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: "var(--c-border)" }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${utilizationPct}%`,
                      background: utilizationPct >= 70 ? "#10b981" : utilizationPct >= 40 ? "#f59e0b" : "#ef4444",
                    }}
                  />
                </div>
                <span className="text-xs font-semibold shrink-0"
                  style={{ color: utilizationPct >= 70 ? "#10b981" : utilizationPct >= 40 ? "#f59e0b" : "#ef4444" }}>
                  {utilizationPct}% utilized
                </span>
                <button
                  onClick={() => onSetPage("adoption")}
                  className="text-xs px-2 py-0.5 rounded font-medium shrink-0"
                  style={{ background: "var(--c-border)", color: "var(--c-text-3)" }}
                >
                  Full report →
                </button>
              </div>
            );
          })()}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-4">
            {[
              {
                label: "Conversations",
                value: convOverview.total_conversations.toLocaleString(),
                color: "#3b82f6",
              },
              {
                label: "Active users",
                value: convOverview.active_users.toLocaleString(),
                color: "#10b981",
              },
              {
                label: "Active assets",
                value: convOverview.active_assets.toLocaleString(),
                color: "#8b5cf6",
              },
              {
                label: "Ghost assets",
                value: convOverview.ghost_assets.toLocaleString(),
                color: convOverview.ghost_assets > 0 ? "#ef4444" : "#10b981",
              },
            ].map(({ label, value, color }) => (
              <KpiCard key={label} label={label} value={value} color={color} />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Top 5 assets */}
            {convOverview.top_assets.filter((a) => a.asset_id != null).length > 0 && (
              <Card title="Most-used assets">
                <div className="space-y-2">
                  {convOverview.top_assets.filter((a) => a.asset_id != null).map((a) => {
                    const gpt = gpts.find((g) => g.id === a.asset_id);
                    return (
                      <div
                        key={a.asset_id}
                        className="flex items-center justify-between text-xs rounded px-1 -mx-1 transition-colors"
                        style={{ cursor: gpt ? "pointer" : "default" }}
                        onClick={() => gpt && open(gpt.name, [gpt])}
                        onMouseEnter={(e) => { if (gpt) (e.currentTarget as HTMLElement).style.background = "var(--c-border)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                      >
                        <span style={{ color: "var(--c-text-2)" }}>
                          {gpt?.name ?? a.asset_id}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-full"
                          style={{ background: "#3b82f620", color: "#3b82f6" }}
                        >
                          {a.conversation_count} conv.
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Drift alerts */}
            {convOverview.drift_alerts > 0 && (
              <Card title="Topic drift alerts">
                <div className="space-y-2">
                  {(convOverview.drift_details ?? convOverview.drift_asset_ids.map((id) => ({ asset_id: id, drift_alert: "" }))).map((d) => {
                    const gpt = gpts.find((g) => g.id === d.asset_id);
                    return (
                      <div
                        key={d.asset_id}
                        className="flex items-start gap-3 px-3 py-3 rounded-lg transition-colors"
                        style={{
                          background: "#f59e0b10",
                          border: "1px solid #f59e0b40",
                          cursor: gpt ? "pointer" : "default",
                        }}
                        onClick={() => gpt && open(gpt.name, [gpt])}
                      >
                        <span style={{ color: "#f59e0b", fontSize: 16, marginTop: 2 }}>⚠</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm" style={{ color: "#f59e0b" }}>
                            {gpt?.name ?? d.asset_id}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--c-text-3)" }}>
                            {d.drift_alert || "Used outside its intended purpose"}
                          </p>
                        </div>
                        {gpt && (
                          <span className="text-xs shrink-0" style={{ color: "#f59e0b" }}>→</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
