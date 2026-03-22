import { useMemo, useState } from "react";
import type { ClusterGroup, GPTItem } from "../../types";
import GPTDrawer, { type DrawerFilter } from "./GPTDrawer";
import AssetTypeBadge from "../ui/AssetTypeBadge";

const API = "/api/v1/clustering";

interface StandardizationOpportunitiesProps { gpts: GPTItem[] }

export default function StandardizationOpportunities({ gpts }: StandardizationOpportunitiesProps) {
  const [drawer, setDrawer] = useState<DrawerFilter | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "completed">("idle");
  const [clusters, setClusters] = useState<ClusterGroup[]>([]);
  const [error, setError] = useState<string | null>(null);

  const runClustering = async () => {
    setStatus("running");
    setError(null);
    try {
      const runRes = await fetch(`${API}/run`, { method: "POST" });
      if (!runRes.ok) {
        const body = await runRes.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to start analysis. Make sure the pipeline has run and assets are loaded.");
      }

      // Poll for results
      let attempts = 0;
      const poll = async () => {
        attempts++;
        const statusRes = await fetch(`${API}/status`);
        const statusData = await statusRes.json();
        if (statusData.status === "completed") {
          const resultsRes = await fetch(`${API}/results`);
          const results = await resultsRes.json();
          setClusters(results);
          setStatus("completed");
        } else if (statusData.status === "running" && attempts < 60) {
          setTimeout(poll, 1500);
        } else {
          setStatus("idle");
          setError("Analysis timed out. This can happen with large datasets — try again, or run the pipeline first to ensure assets are loaded.");
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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <GPTDrawer filter={drawer} onClose={() => setDrawer(null)} />
      <h1 className="text-xl font-bold mb-2" style={{ color: "var(--c-text)" }}>
        Standardization Opportunities
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--c-text-4)" }}>
        Groups AI assets with similar purpose to identify standardization opportunities.
        When multiple employees independently build similar GPTs for the same workflow,
        that is a strong signal that a shared, certified solution should probably exist.
      </p>

      {status === "idle" && clusters.length === 0 && (
        <div
          className="rounded-xl p-8 flex flex-col items-center gap-4 text-center"
          style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
        >
          <div className="text-4xl">🔍</div>
          <div>
            <div className="font-medium mb-1" style={{ color: "var(--c-text)" }}>
              Demand Cluster Analysis
            </div>
            <div className="text-sm" style={{ color: "var(--c-text-4)" }}>
              Uses pgvector cosine similarity to find AI assets built for the same purpose
              by different teams. Each cluster is a candidate for a shared, certified solution.
              Run this after a pipeline sync.
            </div>
          </div>
          <button
            onClick={runClustering}
            className="px-6 py-2.5 rounded-lg font-medium text-sm"
            style={{ background: "#3b82f6", color: "#fff" }}
          >
            Detect Opportunities
          </button>
          {error && (
            <div className="text-sm" style={{ color: "#ef4444" }}>
              {error}
            </div>
          )}
        </div>
      )}

      {status === "running" && (
        <div
          className="rounded-xl p-8 flex flex-col items-center gap-3"
          style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
        >
          <div
            className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: "#3b82f6", borderTopColor: "transparent" }}
          />
          <div className="text-sm" style={{ color: "var(--c-text-3)" }}>
            Detecting standardization opportunities…
          </div>
        </div>
      )}

      {status === "completed" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm" style={{ color: "var(--c-text-3)" }}>
              {clusters.length === 0
                ? "No standardization opportunities found."
                : `${clusters.length} standardization opportunit${clusters.length !== 1 ? "ies" : "y"} detected`}
            </div>
            <button
              onClick={runClustering}
              className="text-xs px-3 py-1.5 rounded"
              style={{ background: "var(--c-border)", color: "var(--c-text-3)" }}
            >
              Re-run
            </button>
          </div>

          {clusters.length === 0 ? (
            <div
              className="rounded-xl p-8 text-center text-sm"
              style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", color: "var(--c-text-4)" }}
            >
              No clusters found above the similarity threshold. No standardization opportunities detected at this time.
            </div>
          ) : (
            <div className="space-y-4">
              {clusters.map((cluster, idx) => (
                <div
                  key={idx}
                  className="rounded-xl p-5"
                  style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-medium text-sm capitalize" style={{ color: "var(--c-text)" }}>
                        {cluster.theme}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--c-text-4)" }}>
                        {cluster.gpt_ids.length} similar assets · demand cluster
                      </div>
                    </div>
                    {cluster.estimated_wasted_hours && (
                      <div
                        className="px-3 py-1 rounded-lg text-xs font-medium"
                        style={{ background: "#1c1200", color: "#f59e0b", border: "1px solid #78350f" }}
                      >
                        ~{cluster.estimated_wasted_hours}h build effort
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    {cluster.gpt_names.map((name, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 px-3 py-2 rounded text-xs cursor-pointer"
                        style={{ background: "var(--c-bg)" }}
                        onClick={() => openGpt(cluster.gpt_ids[i], name)}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-border)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--c-bg)")}
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: i === 0 ? "#10b981" : "var(--c-text-5)" }}
                        />
                        <AssetTypeBadge type={gptById[cluster.gpt_ids[i]]?.asset_type ?? "gpt"} size="xs" />
                        <span style={{ color: i === 0 ? "var(--c-text)" : "var(--c-text-3)" }}>
                          {name}
                          {i === 0 && (
                            <span
                              className="ml-2 px-1.5 py-0.5 rounded text-xs"
                              style={{ background: "#0a1a0f", color: "#10b981" }}
                            >
                              best candidate
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs mt-3" style={{ color: "var(--c-text-4)" }}>
                    Recommendation: certify the best candidate as an org standard. Publish to the employee portal. Archive weaker variants.
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
