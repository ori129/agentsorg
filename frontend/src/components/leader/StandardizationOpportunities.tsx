import { useEffect, useMemo, useState } from "react";
import type { ClusterGroup, GPTItem } from "../../types";
import GPTDrawer, { type DrawerFilter } from "./GPTDrawer";
import AssetTypeBadge from "../ui/AssetTypeBadge";
import { api } from "../../api/client";

function tier(n: number): { label: string; color: string; bg: string; border: string } {
  if (n >= 5) return { label: "High Signal", color: "#10b981", bg: "#0a1a0f", border: "#14532d" };
  if (n >= 3) return { label: "Strong Signal", color: "#3b82f6", bg: "#0a1020", border: "#1d4ed8" };
  return { label: "Emerging Signal", color: "#6b7280", bg: "var(--c-bg)", border: "var(--c-border)" };
}

interface StandardizationOpportunitiesProps { gpts: GPTItem[] }

export default function StandardizationOpportunities({ gpts }: StandardizationOpportunitiesProps) {
  const [drawer, setDrawer] = useState<DrawerFilter | null>(null);
  const [status, setStatus] = useState<"loading" | "running" | "completed">("loading");
  const [clusters, setClusters] = useState<ClusterGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Auto-load results on mount; poll if clustering is still running from the pipeline
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const statusData = await api.getClusteringStatus();
        if (statusData.status === "running") {
          setStatus("running");
          setTimeout(load, 2000);
          return;
        }
        const results = await api.getClusteringResults();
        if (cancelled) return;
        setClusters(results);
        if (results.length > 0) setSelected(results[0].cluster_id);
        setStatus("completed");
      } catch (e) {
        if (!cancelled) { setError(String(e)); setStatus("completed"); }
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const gptById = useMemo(() => {
    const map: Record<string, GPTItem> = {};
    for (const g of gpts) map[g.id] = g;
    return map;
  }, [gpts]);

  const openGpt = (id: string, name: string) => {
    const found = gptById[id];
    if (found) setDrawer({ label: name, gpts: [found] });
  };

  // Summary stats
  const totalAssets = clusters.reduce((s, c) => s + c.gpt_ids.length, 0);
  const totalHours = clusters.reduce((s, c) => s + (c.estimated_wasted_hours ?? 0), 0);

  // Group clusters by tier
  const certify = clusters.filter(c => c.gpt_ids.length >= 5);
  const review = clusters.filter(c => c.gpt_ids.length >= 3 && c.gpt_ids.length < 5);
  const assess = clusters.filter(c => c.gpt_ids.length < 3);

  const selectedCluster = clusters.find(c => c.cluster_id === selected) ?? null;

  // ── Loading / running states ──────────────────────────────────────────────
  if (status === "loading" || status === "running") {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-xl font-bold mb-6" style={{ color: "var(--c-text)" }}>
          Build Signals
        </h1>
        <div
          className="rounded-xl p-10 flex flex-col items-center gap-4"
          style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
        >
          <div
            className="w-7 h-7 rounded-full border-2 animate-spin"
            style={{ borderColor: "#3b82f6", borderTopColor: "transparent" }}
          />
          <div className="text-sm" style={{ color: "var(--c-text-3)" }}>
            {status === "running" ? "Analyzing demand signals…" : "Loading…"}
          </div>
        </div>
      </div>
    );
  }

  // ── No results ─────────────────────────────────────────────────────────────
  if (clusters.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <GPTDrawer filter={drawer} onClose={() => setDrawer(null)} />
        <h1 className="text-xl font-bold mb-2" style={{ color: "var(--c-text)" }}>
          Build Signals
        </h1>
        <div
          className="rounded-xl p-10 flex flex-col items-center gap-4 text-center"
          style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
        >
          <div style={{ fontSize: 36 }}>📡</div>
          <div className="font-medium" style={{ color: "var(--c-text)" }}>No overlapping demand detected</div>
          <div className="text-sm max-w-sm" style={{ color: "var(--c-text-4)" }}>
            Each area of your portfolio has a clear, distinct owner. This analysis runs automatically
            after each pipeline sync.
          </div>
          {error && <div className="text-sm" style={{ color: "#ef4444" }}>{error}</div>}
        </div>
      </div>
    );
  }

  // ── Main two-pane layout ────────────────────────────────────────────────
  return (
    <div className="flex flex-col" style={{ height: "100%", minHeight: 0 }}>
      <GPTDrawer filter={drawer} onClose={() => setDrawer(null)} />

      {/* ── Header + summary strip ── */}
      <div className="px-6 pt-5 pb-0 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--c-text)" }}>
              Build Signals
            </h1>
          </div>
          <p className="text-xs" style={{ color: "var(--c-text-5)" }}>
            Updated on each pipeline sync
          </p>
        </div>

        {/* Summary strip */}
        <div
          className="grid grid-cols-4 rounded-xl mb-4"
          style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
        >
          {[
            { label: "Demand clusters", value: clusters.length },
            { label: "Assets in clusters", value: totalAssets },
            { label: "Proven investment signal", value: `~${Math.round(totalHours)}h` },
          ].map(({ label, value }, i) => (
            <div key={label} className="px-5 py-3" style={i > 0 ? { borderLeft: "1px solid var(--c-border)" } : {}}>
              <div className="text-xs mb-0.5" style={{ color: "var(--c-text-5)" }}>{label}</div>
              <div className="text-lg font-semibold" style={{ color: "var(--c-text)" }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Two-pane ── */}
      <div className="flex flex-1 min-h-0 gap-0 px-6 pb-6">

        {/* Left: cluster list */}
        <div
          className="flex flex-col shrink-0 overflow-y-auto rounded-l-xl"
          style={{
            width: 300,
            background: "var(--c-surface)",
            border: "1px solid var(--c-border)",
            borderRight: "none",
          }}
        >
          {clusters.length === 0 ? (
            <div className="p-6 text-sm text-center" style={{ color: "var(--c-text-4)" }}>
              No opportunities found.
            </div>
          ) : (
            <>
              {[
                { label: "High signal — build now", items: certify, t: tier(5) },
                { label: "Strong signal — prioritise", items: review, t: tier(3) },
                { label: "Emerging signal — watch", items: assess, t: tier(2) },
              ].map(({ label, items, t }) =>
                items.length === 0 ? null : (
                  <div key={label}>
                    <div
                      className="px-4 py-2 text-xs font-semibold uppercase tracking-widest sticky top-0"
                      style={{
                        color: t.color,
                        background: "var(--c-surface)",
                        borderBottom: "1px solid var(--c-border)",
                      }}
                    >
                      {label} · {items.length}
                    </div>
                    {items.map(c => {
                      const cid = c.cluster_id;
                      const isSelected = selected === cid;
                      return (
                        <button
                          key={cid}
                          onClick={() => setSelected(cid)}
                          className="w-full text-left px-4 py-3 transition-colors"
                          style={{
                            background: isSelected ? "var(--c-accent-bg)" : "transparent",
                            borderBottom: "1px solid var(--c-border)",
                            borderLeft: `3px solid ${isSelected ? "#3b82f6" : t.color}`,
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div
                              className="text-sm font-medium leading-snug"
                              style={{
                                color: isSelected ? "#3b82f6" : "var(--c-text)",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {c.theme}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span
                              className="text-xs font-medium px-1.5 py-0.5 rounded"
                              style={{ background: t.bg, color: t.color, border: `1px solid ${t.border}` }}
                            >
                              {c.gpt_ids.length} assets
                            </span>
                            {c.estimated_wasted_hours && (
                              <span className="text-xs" style={{ color: "var(--c-text-5)" }}>
                                ~{c.estimated_wasted_hours}h
                              </span>
                            )}
                          </div>
                          {c.departments && c.departments.length > 0 && (
                            <div className="mt-1 text-xs truncate" style={{ color: "var(--c-text-5)" }}>
                              {c.departments.join(" · ")}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )
              )}
            </>
          )}
        </div>

        {/* Right: detail panel */}
        <div
          className="flex-1 min-w-0 overflow-y-auto rounded-r-xl"
          style={{
            background: "var(--c-bg)",
            border: "1px solid var(--c-border)",
          }}
        >
          {!selectedCluster ? (
            <div className="flex items-center justify-center h-full text-sm" style={{ color: "var(--c-text-5)" }}>
              Select a cluster to review
            </div>
          ) : (
            <ClusterDetail
              cluster={selectedCluster}
              gptById={gptById}
              onOpenGpt={openGpt}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Cluster detail panel ────────────────────────────────────────────────────
interface ClusterDetailProps {
  cluster: ClusterGroup;
  gptById: Record<string, GPTItem>;
  onOpenGpt: (id: string, name: string) => void;
}

function ClusterDetail({ cluster, gptById, onOpenGpt }: ClusterDetailProps) {
  const t = tier(cluster.gpt_ids.length);
  const n = cluster.gpt_ids.length;

  return (
    <div className="p-6">
      {/* Cluster header */}
      <div className="mb-5">
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 className="text-base font-semibold capitalize leading-snug" style={{ color: "var(--c-text)" }}>
            {cluster.theme}
          </h2>
          <span
            className="text-xs font-semibold px-2 py-1 rounded shrink-0"
            style={{ background: t.bg, color: t.color, border: `1px solid ${t.border}` }}
          >
            {t.label}
          </span>
        </div>
        {cluster.cluster_explanation && (
          <div
            className="text-sm mb-3 px-3 py-2 rounded-lg"
            style={{ background: "var(--c-surface)", color: "var(--c-text-3)", borderLeft: "3px solid #3b82f6" }}
          >
            {cluster.cluster_explanation}
          </div>
        )}
        {!cluster.cluster_explanation && cluster.business_process && (
          <div className="text-sm mb-3" style={{ color: "var(--c-text-4)" }}>
            {cluster.business_process}
          </div>
        )}

        {/* Stat pills */}
        <div className="flex flex-wrap gap-3 text-xs">
          <span
            className="px-2.5 py-1 rounded-full font-medium"
            style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-3)" }}
          >
            {n} independent builds
          </span>
          {cluster.estimated_wasted_hours && (
            <span
              className="px-2.5 py-1 rounded-full font-medium"
              style={{ background: "#0a1a0f", border: "1px solid #14532d", color: "#10b981" }}
            >
              ~{cluster.estimated_wasted_hours}h of proven demand
            </span>
          )}
          {cluster.departments && cluster.departments.length > 0 && (
            <span
              className="px-2.5 py-1 rounded-full"
              style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-4)" }}
            >
              {cluster.departments.join(", ")}
            </span>
          )}
          {cluster.recommended_action && (
            <span
              className="px-2.5 py-1 rounded-full capitalize"
              style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-4)" }}
            >
              → {cluster.recommended_action}
            </span>
          )}
        </div>
      </div>

      {/* Asset list */}
      <div
        className="rounded-xl mb-5 overflow-hidden"
        style={{ border: "1px solid var(--c-border)" }}
      >
        <div
          className="px-4 py-2 text-xs font-semibold uppercase tracking-widest"
          style={{ background: "var(--c-surface)", borderBottom: "1px solid var(--c-border)", color: "var(--c-text-5)" }}
        >
          Independent builds in this area
        </div>
        {cluster.gpt_names.map((name, i) => {
          const id = cluster.gpt_ids[i];
          const isCandidate = id === cluster.candidate_gpt_id;
          const gpt = gptById[id];
          return (
            <button
              key={id}
              onClick={() => onOpenGpt(id, name)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
              style={{
                borderBottom: i < cluster.gpt_names.length - 1 ? "1px solid var(--c-border)" : "none",
                background: isCandidate ? "var(--c-surface)" : "transparent",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--c-surface)")}
              onMouseLeave={e => (e.currentTarget.style.background = isCandidate ? "var(--c-surface)" : "transparent")}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: isCandidate ? "#10b981" : "var(--c-border)" }}
              />
              <AssetTypeBadge type={gpt?.asset_type ?? "gpt"} size="xs" />
              <span
                className="text-sm flex-1 truncate"
                style={{ color: isCandidate ? "var(--c-text)" : "var(--c-text-3)" }}
              >
                {name}
              </span>
              {isCandidate && (
                <span
                  className="text-xs px-2 py-0.5 rounded shrink-0"
                  style={{ background: "#0a1a0f", color: "#10b981", border: "1px solid #10b98140" }}
                >
                  best candidate
                </span>
              )}
              {gpt?.sophistication_score != null && (
                <span className="text-xs shrink-0" style={{ color: "var(--c-text-5)" }}>
                  quality {gpt.sophistication_score}/10
                </span>
              )}
              <span className="text-xs shrink-0" style={{ color: "var(--c-text-5)" }}>→</span>
            </button>
          );
        })}
      </div>

    </div>
  );
}
