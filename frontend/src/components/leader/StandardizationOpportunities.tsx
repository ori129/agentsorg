import { useMemo, useState } from "react";
import type { ClusterAction, ClusterGroup, GPTItem } from "../../types";
import GPTDrawer, { type DrawerFilter } from "./GPTDrawer";
import AssetTypeBadge from "../ui/AssetTypeBadge";

const API = "/api/v1/clustering";

const ACTIONS = [
  { value: "certify", label: "Certify as org standard" },
  { value: "publish", label: "Publish to employee portal" },
  { value: "assign_owner", label: "Assign owner" },
  { value: "archive_variants", label: "Archive weaker variants" },
  { value: "add_notes", label: "Add training notes" },
];

function confidenceLabel(c: number | null): { label: string; color: string } {
  if (c === null) return { label: "–", color: "var(--c-text-5)" };
  if (c >= 0.92) return { label: "High", color: "#10b981" };
  if (c >= 0.87) return { label: "Medium", color: "#f59e0b" };
  return { label: "Low", color: "#ef4444" };
}

interface StandardizationOpportunitiesProps { gpts: GPTItem[] }

export default function StandardizationOpportunities({ gpts }: StandardizationOpportunitiesProps) {
  const [drawer, setDrawer] = useState<DrawerFilter | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "completed">("idle");
  const [clusters, setClusters] = useState<ClusterGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedAction, setSelectedAction] = useState<Record<string, string>>({});
  const [ownerEmail, setOwnerEmail] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [decisions, setDecisions] = useState<Record<string, ClusterAction>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const runClustering = async () => {
    setStatus("running");
    setError(null);
    setExpanded({});
    setDecisions({});
    try {
      const runRes = await fetch(`${API}/run`, { method: "POST" });
      if (!runRes.ok) {
        const body = await runRes.json().catch(() => ({}));
        throw new Error(body.detail || "Failed to start analysis. Make sure the pipeline has run and assets are loaded.");
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
          // Pre-select recommended action for each cluster
          const preselected: Record<string, string> = {};
          for (const c of results) {
            if (c.cluster_id && c.recommended_action) {
              const match = ACTIONS.find(a =>
                c.recommended_action!.includes(a.value.replace("_", " "))
              );
              if (match) preselected[c.cluster_id] = match.value;
            }
          }
          setSelectedAction(preselected);
          setStatus("completed");
        } else if (statusData.status === "running" && attempts < 60) {
          setTimeout(poll, 1500);
        } else {
          setStatus("idle");
          setError("Analysis timed out. Try again, or run the pipeline first to ensure assets are loaded.");
        }
      };
      setTimeout(poll, 1000);
    } catch (e) {
      setStatus("idle");
      setError(String(e));
    }
  };

  const saveDecision = async (cluster: ClusterGroup) => {
    const cid = cluster.cluster_id;
    const action = selectedAction[cid];
    if (!action) return;
    setSaving(s => ({ ...s, [cid]: true }));
    try {
      const res = await fetch(`${API}/${cid}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          owner_email: ownerEmail[cid] || null,
          notes: notes[cid] || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save decision");
      const saved: ClusterAction = await res.json();
      setDecisions(d => ({ ...d, [cid]: saved }));
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(s => ({ ...s, [cid]: false }));
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
        When multiple employees independently build similar GPTs or Projects for the same workflow,
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
              Uses pgvector cosine similarity to find GPTs and Projects built for the same purpose
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
          {error && <div className="text-sm" style={{ color: "#ef4444" }}>{error}</div>}
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
              {clusters.map((cluster) => {
                const cid = cluster.cluster_id || String(cluster.gpt_ids.join(","));
                const isExpanded = expanded[cid] ?? false;
                const decision = decisions[cid];
                const conf = confidenceLabel(cluster.confidence);
                const action = selectedAction[cid] ?? "";
                const isSaving = saving[cid] ?? false;

                return (
                  <div
                    key={cid}
                    className="rounded-xl"
                    style={{ background: "var(--c-surface)", border: `1px solid ${decision ? "#10b98140" : "var(--c-border)"}` }}
                  >
                    {/* ── Cluster header ── */}
                    <div
                      className="flex items-start justify-between p-5 cursor-pointer"
                      onClick={() => setExpanded(e => ({ ...e, [cid]: !isExpanded }))}
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <div className="font-medium text-sm capitalize" style={{ color: "var(--c-text)" }}>
                            {cluster.theme}
                          </div>
                          {decision && (
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{ background: "#0a1a0f", color: "#10b981", border: "1px solid #10b98140" }}
                            >
                              {ACTIONS.find(a => a.value === decision.action)?.label ?? decision.action}
                            </span>
                          )}
                        </div>
                        <div className="text-xs flex items-center gap-3" style={{ color: "var(--c-text-4)" }}>
                          <span>{cluster.gpt_ids.length} similar assets</span>
                          {cluster.business_process && (
                            <span style={{ color: "var(--c-text-5)" }}>· {cluster.business_process}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {cluster.estimated_wasted_hours && (
                          <div
                            className="px-3 py-1 rounded-lg text-xs font-medium"
                            style={{ background: "#1c1200", color: "#f59e0b", border: "1px solid #78350f" }}
                          >
                            ~{cluster.estimated_wasted_hours}h build effort
                          </div>
                        )}
                        <span style={{ color: "var(--c-text-5)", fontSize: 10 }}>
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>

                    {/* ── Asset list ── */}
                    <div className="px-5 pb-3 space-y-1">
                      {cluster.gpt_names.map((name, i) => {
                        const isCandidate = cluster.gpt_ids[i] === cluster.candidate_gpt_id;
                        return (
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
                              style={{ background: isCandidate ? "#10b981" : "var(--c-text-5)" }}
                            />
                            <AssetTypeBadge type={gptById[cluster.gpt_ids[i]]?.asset_type ?? "gpt"} size="xs" />
                            <span style={{ color: isCandidate ? "var(--c-text)" : "var(--c-text-3)" }}>
                              {name}
                              {isCandidate && (
                                <span
                                  className="ml-2 px-1.5 py-0.5 rounded text-xs"
                                  style={{ background: "#0a1a0f", color: "#10b981" }}
                                >
                                  best candidate
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* ── Expanded detail + action panel ── */}
                    {isExpanded && (
                      <div
                        className="px-5 pb-5 pt-2"
                        style={{ borderTop: "1px solid var(--c-border)" }}
                      >
                        {/* Metadata row */}
                        <div className="flex flex-wrap gap-4 mb-4 text-xs">
                          {cluster.departments && cluster.departments.length > 0 && (
                            <div>
                              <div className="mb-1 uppercase tracking-wider" style={{ color: "var(--c-text-5)", fontSize: 10 }}>Departments</div>
                              <div className="flex gap-1 flex-wrap">
                                {cluster.departments.map(d => (
                                  <span
                                    key={d}
                                    className="px-2 py-0.5 rounded"
                                    style={{ background: "var(--c-border)", color: "var(--c-text-3)" }}
                                  >
                                    {d}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div>
                            <div className="mb-1 uppercase tracking-wider" style={{ color: "var(--c-text-5)", fontSize: 10 }}>Confidence</div>
                            <span className="font-medium" style={{ color: conf.color }}>{conf.label}</span>
                          </div>
                          {cluster.recommended_action && (
                            <div>
                              <div className="mb-1 uppercase tracking-wider" style={{ color: "var(--c-text-5)", fontSize: 10 }}>Suggested action</div>
                              <span style={{ color: "var(--c-text-3)" }} className="capitalize">{cluster.recommended_action}</span>
                            </div>
                          )}
                        </div>

                        {/* Action selector */}
                        <div className="mb-3">
                          <div className="text-xs uppercase tracking-wider mb-2" style={{ color: "var(--c-text-5)" }}>
                            Decision
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {ACTIONS.map(a => (
                              <button
                                key={a.value}
                                onClick={() => setSelectedAction(s => ({ ...s, [cid]: a.value }))}
                                className="text-xs px-3 py-1.5 rounded-lg transition-all"
                                style={{
                                  border: `1px solid ${action === a.value ? "#3b82f6" : "var(--c-border)"}`,
                                  background: action === a.value ? "#1e3a5f" : "var(--c-bg)",
                                  color: action === a.value ? "#93c5fd" : "var(--c-text-3)",
                                }}
                              >
                                {a.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Owner email — shown when assign_owner selected */}
                        {action === "assign_owner" && (
                          <div className="mb-3">
                            <input
                              type="email"
                              placeholder="owner@company.com"
                              value={ownerEmail[cid] ?? ""}
                              onChange={e => setOwnerEmail(o => ({ ...o, [cid]: e.target.value }))}
                              className="text-xs px-3 py-2 rounded-lg w-full max-w-xs"
                              style={{
                                background: "var(--c-bg)",
                                border: "1px solid var(--c-border)",
                                color: "var(--c-text)",
                              }}
                            />
                          </div>
                        )}

                        {/* Notes — shown when add_notes selected */}
                        {action === "add_notes" && (
                          <div className="mb-3">
                            <textarea
                              placeholder="Training notes for builders in this cluster…"
                              value={notes[cid] ?? ""}
                              onChange={e => setNotes(n => ({ ...n, [cid]: e.target.value }))}
                              rows={3}
                              className="text-xs px-3 py-2 rounded-lg w-full resize-none"
                              style={{
                                background: "var(--c-bg)",
                                border: "1px solid var(--c-border)",
                                color: "var(--c-text)",
                              }}
                            />
                          </div>
                        )}

                        {/* Save / saved state */}
                        {decision ? (
                          <div className="flex items-center gap-2 text-xs" style={{ color: "#10b981" }}>
                            <span>✓</span>
                            <span>Decision saved — {ACTIONS.find(a => a.value === decision.action)?.label}</span>
                            <button
                              onClick={() => setDecisions(d => { const n = { ...d }; delete n[cid]; return n; })}
                              className="ml-2 underline"
                              style={{ color: "var(--c-text-5)" }}
                            >
                              change
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => saveDecision(cluster)}
                            disabled={!action || isSaving}
                            className="text-xs px-4 py-2 rounded-lg font-medium transition-all"
                            style={{
                              background: action ? "#3b82f6" : "var(--c-border)",
                              color: action ? "#fff" : "var(--c-text-5)",
                              opacity: isSaving ? 0.6 : 1,
                              cursor: action ? "pointer" : "default",
                            }}
                          >
                            {isSaving ? "Saving…" : "Save Decision"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
