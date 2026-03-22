import { useMemo, useState } from "react";
import type { ClusterGroup, GPTItem } from "../../types";
import GPTDrawer, { type DrawerFilter } from "./GPTDrawer";
import AssetTypeBadge from "../ui/AssetTypeBadge";

const API = "/api/v1/clustering";

function tier(n: number): { label: string; color: string; bg: string; border: string } {
  if (n >= 5) return { label: "Certify", color: "#ef4444", bg: "#1c0a0a", border: "#7f1d1d" };
  if (n >= 3) return { label: "Review", color: "#f59e0b", bg: "#1c1200", border: "#78350f" };
  return { label: "Assess", color: "#6b7280", bg: "var(--c-bg)", border: "var(--c-border)" };
}

interface StandardizationOpportunitiesProps { gpts: GPTItem[] }

export default function StandardizationOpportunities({ gpts }: StandardizationOpportunitiesProps) {
  const [drawer, setDrawer] = useState<DrawerFilter | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "completed">("idle");
  const [clusters, setClusters] = useState<ClusterGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const runClustering = async () => {
    setStatus("running");
    setError(null);
    setSelected(null);
    try {
      const runRes = await fetch(`${API}/run`, { method: "POST" });
      if (!runRes.ok) {
        const body = await runRes.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to start. Make sure the pipeline has run first.");
      }
      let attempts = 0;
      const poll = async () => {
        attempts++;
        const statusRes = await fetch(`${API}/status`);
        const statusData = await statusRes.json();
        if (statusData.status === "completed") {
          const resultsRes = await fetch(`${API}/results`);
          const results: ClusterGroup[] = await resultsRes.json();
          setClusters(results);
          if (results.length > 0) setSelected(results[0].cluster_id);
          setStatus("completed");
        } else if (statusData.status === "running" && attempts < 60) {
          setTimeout(poll, 1500);
        } else {
          setStatus("idle");
          setError("Analysis timed out. Try again.");
        }
      };
      setTimeout(poll, 1000);
    } catch (e) {
      setStatus("idle");
      setError(String(e));
    }
  };

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

  // ── Empty / loading states ──────────────────────────────────────────────
  if (status === "idle" && clusters.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <GPTDrawer filter={drawer} onClose={() => setDrawer(null)} />
        <h1 className="text-xl font-bold mb-2" style={{ color: "var(--c-text)" }}>
          Standardization Opportunities
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--c-text-4)" }}>
          Groups AI assets built for the same purpose by different teams.
          Each cluster is a candidate for a shared, certified solution.
        </p>
        <div
          className="rounded-xl p-10 flex flex-col items-center gap-4 text-center"
          style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
        >
          <div style={{ fontSize: 36 }}>◎</div>
          <div className="font-medium" style={{ color: "var(--c-text)" }}>Demand Cluster Analysis</div>
          <div className="text-sm max-w-sm" style={{ color: "var(--c-text-4)" }}>
            Uses semantic similarity to surface duplicated effort across your org.
            Run after a pipeline sync.
          </div>
          <button
            onClick={runClustering}
            className="mt-2 px-6 py-2.5 rounded-lg font-medium text-sm"
            style={{ background: "#3b82f6", color: "#fff" }}
          >
            Detect Opportunities
          </button>
          {error && <div className="text-sm" style={{ color: "#ef4444" }}>{error}</div>}
        </div>
      </div>
    );
  }

  if (status === "running") {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-xl font-bold mb-6" style={{ color: "var(--c-text)" }}>
          Standardization Opportunities
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
            Detecting standardization opportunities…
          </div>
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
              Standardization Opportunities
            </h1>
          </div>
          <button
            onClick={runClustering}
            className="text-xs px-3 py-1.5 rounded"
            style={{ background: "var(--c-border)", color: "var(--c-text-3)" }}
          >
            Re-run
          </button>
        </div>

        {/* Summary strip */}
        <div
          className="grid grid-cols-4 rounded-xl mb-4"
          style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
        >
          {[
            { label: "Clusters", value: clusters.length },
            { label: "Assets affected", value: totalAssets },
            { label: "Estimated build effort", value: `~${Math.round(totalHours)}h` },
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
                { label: "Certify as standard", items: certify, t: tier(5) },
                { label: "Review & consolidate", items: review, t: tier(3) },
                { label: "Assess & decide", items: assess, t: tier(2) },
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
            {n} similar assets
          </span>
          {cluster.estimated_wasted_hours && (
            <span
              className="px-2.5 py-1 rounded-full font-medium"
              style={{ background: "#1c1200", border: "1px solid #78350f", color: "#f59e0b" }}
            >
              ~{cluster.estimated_wasted_hours}h duplicated build effort
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
              Suggested: {cluster.recommended_action}
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
          Assets in cluster
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
