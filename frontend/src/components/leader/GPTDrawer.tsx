import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { GPTItem } from "../../types";
import AssetTypeBadge, { TypeFilterChips, filterByType, type TypeFilter } from "../ui/AssetTypeBadge";
import { useAssetUsageInsight } from "../../hooks/useConversations";
import { useGptScoreHistory } from "../../hooks/usePipeline";

// ── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const RISK_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const RISK_STYLE: Record<string, { bg: string; color: string }> = {
  low:      { bg: "#052e16", color: "#4ade80" },
  medium:   { bg: "#1c1200", color: "#f59e0b" },
  high:     { bg: "#1c0a00", color: "#f97316" },
  critical: { bg: "#1c0000", color: "#ef4444" },
};

type SortKey = "name" | "risk" | "quality" | "date";
export type DetailTab = "details" | "usage" | "quality" | "risk" | "journey";

function sortGpts(gpts: GPTItem[], key: SortKey): GPTItem[] {
  return [...gpts].sort((a, b) => {
    if (key === "name") return (a.name ?? "").localeCompare(b.name ?? "");
    if (key === "risk") return (RISK_ORDER[a.risk_level ?? ""] ?? 4) - (RISK_ORDER[b.risk_level ?? ""] ?? 4);
    if (key === "quality") return (b.prompting_quality_score ?? 0) - (a.prompting_quality_score ?? 0);
    if (key === "date") return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    return 0;
  });
}

function ScoreBar({ value, max = 5, color }: { value: number | null; max?: number; color: string }) {
  if (value == null) return <span style={{ color: "var(--c-text-5)" }}>—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {Array.from({ length: max }).map((_, i) => (
          <div
            key={i}
            className="rounded-sm"
            style={{
              width: 10, height: 10,
              background: i < value ? color : "var(--c-border)",
            }}
          />
        ))}
      </div>
      <span className="text-xs" style={{ color: "var(--c-text-3)" }}>{value}/{max}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--c-text-5)" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Journey Tab (score history sparkline) ────────────────────────────────────

function JourneyTab({ gptId }: { gptId: string }) {
  const { data: history = [] } = useGptScoreHistory(gptId);

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2">
        <p className="text-sm" style={{ color: "var(--c-text-3)" }}>No score history yet.</p>
        <p className="text-xs text-center" style={{ color: "var(--c-text-4)" }}>
          Run the pipeline to start tracking quality, adoption, and risk trends over time.
        </p>
      </div>
    );
  }

  const series = [
    { key: "quality_score" as const,  color: "#3b82f6", label: "Quality" },
    { key: "adoption_score" as const, color: "#6366f1", label: "Adoption" },
    { key: "risk_score" as const,     color: "#ef4444", label: "Risk" },
  ];

  const latestPoint = history[history.length - 1];
  const prevPoint = history.length > 1 ? history[history.length - 2] : null;

  if (history.length === 1) {
    return (
      <div className="space-y-4">
        <p className="text-xs" style={{ color: "var(--c-text-4)" }}>
          First pipeline run recorded. Run the pipeline again to see trends.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {series.map(({ key, color, label }) => (
            <div key={key} className="rounded-lg p-3 text-center" style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}>
              <p className="text-xl font-bold" style={{ color }}>{latestPoint[key]?.toFixed(0) ?? "—"}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--c-text-3)" }}>{label}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const W = 420, H = 160, PAD = { top: 12, right: 20, bottom: 30, left: 32 };
  const iW = W - PAD.left - PAD.right;
  const iH = H - PAD.top - PAD.bottom;
  const xScale = (i: number) => PAD.left + (i / (history.length - 1)) * iW;
  const yScale = (v: number) => PAD.top + iH - (v / 100) * iH;

  function makePath(key: "quality_score" | "adoption_score" | "risk_score") {
    const pts = history
      .map((d, i) => (d[key] != null ? `${xScale(i).toFixed(1)},${yScale(d[key]!).toFixed(1)}` : null))
      .filter(Boolean);
    return pts.length >= 2 ? `M ${pts.join(" L ")}` : null;
  }

  const labelIdxs = [0, history.length - 1];
  if (history.length >= 4) labelIdxs.splice(1, 0, Math.floor(history.length / 2));

  return (
    <div className="space-y-4">
      <div className="rounded-lg p-3" style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}>
        <p className="text-xs font-medium mb-3" style={{ color: "var(--c-text-3)" }}>
          Score history · {history.length} syncs
        </p>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1={PAD.left} y1={yScale(v)} x2={PAD.left + iW} y2={yScale(v)} stroke="#1a2235" strokeWidth={0.5} />
              <text x={PAD.left - 4} y={yScale(v) + 3.5} textAnchor="end" fontSize={8} fill="#3d5070">{v}</text>
            </g>
          ))}
          {series.map(({ key, color }) => {
            const d = makePath(key);
            return d ? <path key={key} d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null;
          })}
          {series.map(({ key, color }) =>
            history.map((pt, i) =>
              pt[key] != null ? (
                <circle key={`${key}-${i}`} cx={xScale(i)} cy={yScale(pt[key]!)} r={3} fill={color} />
              ) : null
            )
          )}
          {labelIdxs.map((i) => (
            <text
              key={i}
              x={xScale(i)}
              y={H - 4}
              textAnchor={i === 0 ? "start" : i === history.length - 1 ? "end" : "middle"}
              fontSize={8}
              fill="#3d5070"
            >
              {new Date(history[i].synced_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </text>
          ))}
        </svg>
        <div className="flex items-center gap-4 mt-2 justify-center">
          {series.map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div style={{ width: 12, height: 2, background: color, borderRadius: 1 }} />
              <span style={{ fontSize: 10, color: "var(--c-text-4)" }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {prevPoint && (
        <div className="grid grid-cols-3 gap-3">
          {series.map(({ key, color, label }) => {
            const latest = latestPoint[key];
            const prev = prevPoint[key];
            const delta = latest != null && prev != null ? latest - prev : null;
            return (
              <div key={key} className="rounded-lg p-3" style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}>
                <p className="text-xs" style={{ color: "var(--c-text-4)" }}>{label}</p>
                <p className="text-xl font-bold mt-1" style={{ color }}>{latest?.toFixed(0) ?? "—"}</p>
                {delta != null && (
                  <p className="text-xs mt-0.5" style={{ color: Math.abs(delta) < 1 ? "var(--c-text-5)" : delta >= 0 ? "#10b981" : "#ef4444" }}>
                    {Math.abs(delta) < 1 ? "=" : delta > 0 ? `↑ ${delta.toFixed(0)}` : `↓ ${Math.abs(delta).toFixed(0)}`} vs prev
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── GPT Detail Panel ─────────────────────────────────────────────────────────

const QUADRANT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  champion:             { label: "Champion",       color: "#10b981", bg: "#052e16" },
  hidden_gem:          { label: "Hidden Gem",      color: "#6366f1", bg: "#1e1b4b" },
  scaled_risk:         { label: "Scaled Risk",     color: "#f59e0b", bg: "#1c1200" },
  retirement_candidate:{ label: "Retirement Cand.",color: "#6b7280", bg: "#111827" },
};

function ScoreGauge({ label, value, color, rationale, children }: {
  label: string;
  value: number | null;
  color: string;
  rationale?: string | null;
  children?: React.ReactNode;
}) {
  if (value == null) return null;
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium" style={{ color: "var(--c-text-3)" }}>{label}</span>
        <span className="text-lg font-bold" style={{ color }}>{value.toFixed(0)}<span className="text-xs font-normal" style={{ color: "var(--c-text-5)" }}>/100</span></span>
      </div>
      <div className="w-full rounded-full overflow-hidden mb-2" style={{ height: 6, background: "var(--c-border)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
      {rationale && <p className="text-xs leading-relaxed" style={{ color: "var(--c-text-4)" }}>{rationale}</p>}
      {children}
    </div>
  );
}

function GPTDetail({ gpt, onBack, initialTab }: { gpt: GPTItem; onBack: () => void; initialTab?: DetailTab }) {
  const tools = (gpt.tools ?? []) as { type: string }[];
  const riskStyle = gpt.risk_level ? RISK_STYLE[gpt.risk_level] : null;
  const riskFlags = (gpt.risk_flags ?? []) as string[];
  const promptFlags = (gpt.prompting_quality_flags ?? []) as string[];
  const integrations = (gpt.integration_flags ?? []) as string[];
  const starters = (gpt.conversation_starters ?? []) as string[];
  const cats = (gpt.builder_categories ?? []) as string[];
  const [activeTab, setActiveTab] = useState<DetailTab>(initialTab ?? "details");
  const { data: usageInsight } = useAssetUsageInsight(gpt.id);
  const hasScores = gpt.quality_score != null || gpt.adoption_score != null || gpt.risk_score != null;
  const quadrant = gpt.quadrant_label ? QUADRANT_CONFIG[gpt.quadrant_label] : null;

  return (
    <div className="flex flex-col h-full">
      <div className="p-5 shrink-0" style={{ borderBottom: "1px solid var(--c-border)" }}>
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs mb-3"
          style={{ color: "var(--c-text-4)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          ← Back
        </button>
        <div className="flex items-start gap-2 mb-1">
          <h2 className="font-bold text-base leading-tight flex-1" style={{ color: "var(--c-text)" }}>
            {gpt.name}
          </h2>
          <AssetTypeBadge type={gpt.asset_type ?? "gpt"} />
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {gpt.primary_category && (
            <span className="px-2 py-0.5 rounded-full" style={{ background: "var(--c-accent-bg)", color: "#3b82f6" }}>
              {gpt.primary_category}
            </span>
          )}
          {riskStyle && gpt.risk_level && (
            <span className="px-2 py-0.5 rounded-full" style={{ background: riskStyle.bg, color: riskStyle.color }}>
              {gpt.risk_level} risk
            </span>
          )}
          {gpt.output_type && (
            <span className="px-2 py-0.5 rounded-full" style={{ background: "var(--c-border)", color: "var(--c-text-3)" }}>
              {gpt.output_type}
            </span>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b px-5 overflow-x-auto" style={{ borderColor: "var(--c-border)" }}>
        {([
          { id: "details", label: "Overview" },
          { id: "usage",   label: "Usage" },
          { id: "quality", label: "Quality" },
          { id: "risk",    label: "Risk" },
          { id: "journey", label: "Journey" },
        ] as { id: DetailTab; label: string }[]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-3 py-2 text-sm whitespace-nowrap flex-shrink-0"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              borderBottom: activeTab === tab.id ? "2px solid var(--c-accent-blue)" : "2px solid transparent",
              color: activeTab === tab.id ? "var(--c-accent-blue)" : "var(--c-text-3)",
              marginBottom: -1,
            }}
          >
            {tab.label}
            {tab.id === "usage" && usageInsight && usageInsight.conversation_count > 0 && (
              <span
                className="ml-1 text-xs px-1.5 py-0.5 rounded-full"
                style={{ background: "var(--c-accent-blue)20", color: "var(--c-accent-blue)" }}
              >
                {usageInsight.conversation_count}
              </span>
            )}
            {tab.id === "quality" && gpt.quality_score != null && (
              <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full" style={{ background: "#10b98120", color: "#10b981" }}>
                {gpt.quality_score.toFixed(0)}
              </span>
            )}
            {tab.id === "risk" && gpt.risk_score != null && gpt.risk_score >= 50 && (
              <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full" style={{ background: "#ef444420", color: "#ef4444" }}>
                {gpt.risk_score.toFixed(0)}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Usage tab */}
      {activeTab === "usage" && (
        <div className="flex-1 overflow-y-auto p-5">
          {!usageInsight ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <p className="text-sm" style={{ color: "var(--c-text-3)" }}>
                No conversation data yet.
              </p>
              <p className="text-xs" style={{ color: "var(--c-text-4)" }}>
                Run Conversation Analysis to see usage insights.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Conversations", value: usageInsight.conversation_count },
                  { label: "Unique users", value: usageInsight.unique_user_count },
                  {
                    label: "Avg messages",
                    value: usageInsight.avg_messages_per_conversation?.toFixed(1) ?? "—",
                  },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="rounded-lg p-3 text-center"
                    style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}
                  >
                    <p className="text-lg font-bold" style={{ color: "var(--c-text-1)" }}>
                      {value}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--c-text-3)" }}>
                      {label}
                    </p>
                  </div>
                ))}
              </div>

              {/* Week-over-week trend */}
              {usageInsight.conversation_count_delta != null && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
                >
                  <span style={{ color: usageInsight.conversation_count_delta >= 0 ? "#10b981" : "#ef4444" }}>
                    {usageInsight.conversation_count_delta >= 0 ? "↑" : "↓"}
                  </span>
                  <span style={{ color: "var(--c-text-2)" }}>
                    {Math.abs(usageInsight.conversation_count_delta)} conversations vs prior period
                  </span>
                  {usageInsight.prior_conversation_count != null && (
                    <span style={{ color: "var(--c-text-4)" }}>
                      (was {usageInsight.prior_conversation_count})
                    </span>
                  )}
                </div>
              )}

              {/* Drift alert */}
              {usageInsight.drift_alert && (
                <div
                  className="flex items-start gap-2 px-3 py-2 rounded-lg text-sm"
                  style={{ background: "#f59e0b10", border: "1px solid #f59e0b40" }}
                >
                  <span style={{ color: "#f59e0b" }}>⚠</span>
                  <span style={{ color: "#f59e0b" }}>{usageInsight.drift_alert}</span>
                </div>
              )}

              {/* Topics */}
              {usageInsight.top_topics && usageInsight.top_topics.length > 0 && (
                <Section title="Top topics">
                  <div className="space-y-2">
                    {usageInsight.top_topics.map((t) => (
                      <div key={t.topic}>
                        <div className="flex justify-between text-xs mb-1">
                          <span style={{ color: "var(--c-text-2)" }}>{t.topic}</span>
                          <span style={{ color: "var(--c-text-3)" }}>{t.pct.toFixed(0)}%</span>
                        </div>
                        <div
                          className="w-full rounded-full overflow-hidden"
                          style={{ height: 6, background: "var(--c-border)" }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${t.pct}%`,
                              background: "var(--c-accent-blue)",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Knowledge gap signals */}
              {usageInsight.knowledge_gap_signals &&
                usageInsight.knowledge_gap_signals.length > 0 && (
                  <Section title="Knowledge gaps">
                    <div className="space-y-2">
                      {usageInsight.knowledge_gap_signals.map((gap, i) => (
                        <div
                          key={i}
                          className="px-3 py-2 rounded-lg text-xs"
                          style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}
                        >
                          <p
                            className="font-medium mb-1"
                            style={{ color: "var(--c-text-2)" }}
                          >
                            {gap.topic} ({gap.frequency}×)
                          </p>
                          <p
                            className="italic"
                            style={{ color: "var(--c-text-4)" }}
                          >
                            "{gap.example_question}"
                          </p>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}
            </div>
          )}
        </div>
      )}

      {/* Quality tab */}
      {activeTab === "quality" && (
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {!hasScores ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <p className="text-sm" style={{ color: "var(--c-text-3)" }}>No scores yet.</p>
              <p className="text-xs" style={{ color: "var(--c-text-4)" }}>Run the pipeline to assess this asset.</p>
            </div>
          ) : (
            <>
              {quadrant && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: quadrant.bg, border: `1px solid ${quadrant.color}40` }}>
                  <span className="text-sm font-bold" style={{ color: quadrant.color }}>{quadrant.label}</span>
                  {gpt.score_confidence && (
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)", color: "var(--c-text-4)" }}>
                      {gpt.score_confidence} confidence
                    </span>
                  )}
                </div>
              )}

              <ScoreGauge label="Quality Score" value={gpt.quality_score} color="#3b82f6" rationale={gpt.quality_score_rationale}>
                {gpt.quality_main_strength && (
                  <div className="mt-2 text-xs">
                    <span style={{ color: "#10b981" }}>✓ </span>
                    <span style={{ color: "var(--c-text-3)" }}>{gpt.quality_main_strength}</span>
                  </div>
                )}
                {gpt.quality_main_weakness && (
                  <div className="mt-1 text-xs">
                    <span style={{ color: "#f59e0b" }}>✗ </span>
                    <span style={{ color: "var(--c-text-3)" }}>{gpt.quality_main_weakness}</span>
                  </div>
                )}
              </ScoreGauge>

              <ScoreGauge label="Adoption Score" value={gpt.adoption_score} color="#6366f1" rationale={gpt.adoption_score_rationale}>
                {gpt.adoption_signal && (
                  <div className="mt-2 text-xs">
                    <span style={{ color: "#6366f1" }}>● </span>
                    <span style={{ color: "var(--c-text-3)" }}>{gpt.adoption_signal}</span>
                  </div>
                )}
                {gpt.adoption_barrier && (
                  <div className="mt-1 text-xs">
                    <span style={{ color: "#f59e0b" }}>↯ </span>
                    <span style={{ color: "var(--c-text-3)" }}>{gpt.adoption_barrier}</span>
                  </div>
                )}
              </ScoreGauge>

              {gpt.top_action && (
                <div className="rounded-lg p-3" style={{ background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#3b82f6" }}>Recommended Action</p>
                  <p className="text-sm" style={{ color: "var(--c-text-2)" }}>{gpt.top_action}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Risk tab */}
      {activeTab === "risk" && (
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {!hasScores ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <p className="text-sm" style={{ color: "var(--c-text-3)" }}>No risk assessment yet.</p>
              <p className="text-xs" style={{ color: "var(--c-text-4)" }}>Run the pipeline to assess this asset.</p>
            </div>
          ) : (
            <>
              <ScoreGauge label="Risk Score" value={gpt.risk_score} color="#ef4444" rationale={gpt.risk_score_rationale}>
                {gpt.risk_primary_driver && (
                  <div className="mt-2 text-xs">
                    <span style={{ color: "#ef4444" }}>⚠ Primary driver: </span>
                    <span style={{ color: "var(--c-text-3)" }}>{gpt.risk_primary_driver}</span>
                  </div>
                )}
                {gpt.risk_urgency && (
                  <div className="mt-1 text-xs">
                    <span style={{ color: "var(--c-text-4)" }}>Urgency: </span>
                    <span style={{ color: gpt.risk_urgency === "high" ? "#ef4444" : gpt.risk_urgency === "medium" ? "#f59e0b" : "#10b981" }}>
                      {gpt.risk_urgency}
                    </span>
                  </div>
                )}
              </ScoreGauge>

              {/* Semantic risk flags */}
              {riskFlags.length > 0 && (
                <div className="rounded-lg p-3" style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}>
                  <p className="text-xs font-medium mb-2" style={{ color: "var(--c-text-4)" }}>Risk Flags (semantic analysis)</p>
                  <div className="flex flex-wrap gap-1">
                    {riskFlags.map((f) => (
                      <span key={f} className="text-xs px-2 py-0.5 rounded" style={{ background: "#1c0a00", color: "#f97316" }}>
                        {f.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {gpt.risk_level && (
                <div className="rounded-lg p-3" style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}>
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: "var(--c-text-4)" }}>Semantic Risk Level</span>
                    {riskStyle && (
                      <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: riskStyle.bg, color: riskStyle.color }}>
                        {gpt.risk_level}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Journey tab */}
      {activeTab === "journey" && (
        <div className="flex-1 overflow-y-auto p-5">
          <JourneyTab gptId={gpt.id} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-5 space-y-0" style={{ display: activeTab === "details" ? undefined : "none" }}>
        {(gpt.use_case_description || gpt.llm_summary || gpt.description) && (
          <Section title="Summary">
            <p className="text-sm leading-relaxed" style={{ color: "var(--c-text-2)" }}>
              {gpt.use_case_description || gpt.llm_summary || gpt.description}
            </p>
          </Section>
        )}

        <Section title="Details">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {gpt.owner_email && (
              <>
                <span style={{ color: "var(--c-text-4)" }}>Owner</span>
                <span style={{ color: "var(--c-text-2)" }}>{gpt.owner_email}</span>
              </>
            )}
            {gpt.builder_name && (
              <>
                <span style={{ color: "var(--c-text-4)" }}>Builder</span>
                <span style={{ color: "var(--c-text-2)" }}>{gpt.builder_name}</span>
              </>
            )}
            <span style={{ color: "var(--c-text-4)" }}>Visibility</span>
            <span style={{ color: "var(--c-text-2)" }}>{gpt.visibility ?? "—"}</span>
            <span style={{ color: "var(--c-text-4)" }}>Shared with</span>
            <span style={{ color: "var(--c-text-2)" }}>{gpt.shared_user_count} users</span>
            {gpt.created_at && (
              <>
                <span style={{ color: "var(--c-text-4)" }}>Created</span>
                <span style={{ color: "var(--c-text-2)" }}>
                  {new Date(gpt.created_at).toLocaleDateString()}
                </span>
              </>
            )}
            {gpt.business_process && (
              <>
                <span style={{ color: "var(--c-text-4)" }}>Business process</span>
                <span style={{ color: "var(--c-text-2)" }}>{gpt.business_process}</span>
              </>
            )}
            {gpt.intended_audience && (
              <>
                <span style={{ color: "var(--c-text-4)" }}>Intended for</span>
                <span style={{ color: "var(--c-text-2)" }}>{gpt.intended_audience}</span>
              </>
            )}
          </div>
          {cats.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {cats.map((c) => (
                <span key={c} className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--c-border)", color: "var(--c-text-3)" }}>
                  {c}
                </span>
              ))}
            </div>
          )}
        </Section>

        {gpt.semantic_enriched_at && (
          <Section title="Intelligence Scores">
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span style={{ color: "var(--c-text-4)" }}>Sophistication</span>
                  <ScoreBar value={gpt.sophistication_score} color="#3b82f6" />
                </div>
                {gpt.sophistication_rationale && (
                  <p className="text-xs leading-relaxed" style={{ color: "var(--c-text-3)" }}>{gpt.sophistication_rationale}</p>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span style={{ color: "var(--c-text-4)" }}>Prompting quality</span>
                  <ScoreBar value={gpt.prompting_quality_score} color="#6366f1" />
                </div>
                {gpt.prompting_quality_rationale && (
                  <p className="text-xs leading-relaxed mb-1" style={{ color: "var(--c-text-3)" }}>{gpt.prompting_quality_rationale}</p>
                )}
                {promptFlags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {promptFlags.map((f) => (
                      <span key={f} className="text-xs px-1.5 py-0.5 rounded" style={{ background: "#1a1025", color: "#a78bfa" }}>
                        {f.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span style={{ color: "var(--c-text-4)" }}>ROI potential</span>
                  <ScoreBar value={gpt.roi_potential_score} color="#10b981" />
                </div>
                {gpt.roi_rationale && (
                  <p className="text-xs leading-relaxed" style={{ color: "var(--c-text-3)" }}>{gpt.roi_rationale}</p>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span style={{ color: "var(--c-text-4)" }}>Adoption ease</span>
                  <ScoreBar value={gpt.adoption_friction_score} color="#10b981" />
                </div>
                {gpt.adoption_friction_rationale && (
                  <p className="text-xs leading-relaxed" style={{ color: "var(--c-text-3)" }}>{gpt.adoption_friction_rationale}</p>
                )}
              </div>
            </div>
          </Section>
        )}

        {(riskFlags.length > 0 || gpt.risk_level) && (
          <Section title="Risk">
            {riskFlags.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {riskFlags.map((f) => (
                  <span key={f} className="text-xs px-2 py-0.5 rounded" style={{ background: "#1c0a00", color: "#f97316" }}>
                    {f.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}
          </Section>
        )}

        {(integrations.length > 0 || tools.length > 0) && (
          <Section title="Tools & Integrations">
            <div className="flex flex-wrap gap-1">
              {tools.map((t) => (
                <span key={t.type} className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--c-border)", color: "var(--c-text-3)" }}>
                  {t.type}
                </span>
              ))}
              {integrations.map((i) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--c-accent-deep)", color: "#3b82f6" }}>
                  {i}
                </span>
              ))}
            </div>
          </Section>
        )}

        {starters.length > 0 && (
          <Section title="Conversation Starters">
            <div className="space-y-1">
              {starters.map((s, i) => (
                <div
                  key={i}
                  className="text-xs px-3 py-2 rounded-lg"
                  style={{ background: "var(--c-bg)", color: "var(--c-text-2)", border: "1px solid var(--c-border)" }}
                >
                  "{s}"
                </div>
              ))}
            </div>
          </Section>
        )}

        {gpt.instructions && (
          <Section title="System Prompt">
            <pre
              className="text-xs leading-relaxed whitespace-pre-wrap rounded-lg p-4 overflow-x-auto"
              style={{
                background: "var(--c-bg)",
                border: "1px solid var(--c-border)",
                color: "var(--c-text-3)",
                fontFamily: "ui-monospace, monospace",
                maxHeight: 400,
                overflowY: "auto",
              }}
            >
              {gpt.instructions}
            </pre>
          </Section>
        )}

        <div className="pt-2 pb-4">
          <a
            href={`https://chatgpt.com/g/${gpt.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-xs px-4 py-2 rounded-lg font-medium"
            style={{ background: "var(--c-accent-bg)", color: "#3b82f6" }}
          >
            Open in ChatGPT →
          </a>
        </div>
      </div>
    </div>
  );
}

// ── GPT List Item ─────────────────────────────────────────────────────────────

function GPTListItem({ gpt, onClick }: { gpt: GPTItem; onClick: () => void }) {
  const riskStyle = gpt.risk_level ? RISK_STYLE[gpt.risk_level] : null;
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-3 flex items-start gap-3 transition-colors"
      style={{ borderBottom: "1px solid var(--c-border)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-surface)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: "var(--c-text)" }}>
          {gpt.name}
        </div>
        <div className="text-xs truncate mt-0.5" style={{ color: "var(--c-text-4)" }}>
          {gpt.owner_email ?? gpt.builder_name ?? "—"}
        </div>
        {gpt.business_process && (
          <div className="text-xs truncate mt-0.5" style={{ color: "var(--c-text-5)" }}>
            {gpt.business_process}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <AssetTypeBadge type={gpt.asset_type ?? "gpt"} size="xs" />
        {gpt.primary_category && (
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--c-accent-bg)", color: "#3b82f6" }}>
            {gpt.primary_category}
          </span>
        )}
        {riskStyle && gpt.risk_level && (
          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: riskStyle.bg, color: riskStyle.color }}>
            {gpt.risk_level}
          </span>
        )}
      </div>
    </button>
  );
}

// ── GPT List Panel ────────────────────────────────────────────────────────────

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "risk", label: "Risk" },
  { key: "quality", label: "Quality" },
  { key: "date", label: "Newest" },
];

function GPTListPanel({
  filter,
  onSelect,
  onClose,
}: {
  filter: { label: string; gpts: GPTItem[] };
  onSelect: (g: GPTItem) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const gptCount = filter.gpts.filter((g) => g.asset_type !== "project").length;
  const projectCount = filter.gpts.filter((g) => g.asset_type === "project").length;

  // Reset pagination + type filter when filter changes
  useEffect(() => { setPage(1); setTypeFilter("all"); }, [filter.gpts]);
  useEffect(() => { setPage(1); }, [search, sort, typeFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byType = filterByType(filter.gpts, typeFilter);
    const base = q
      ? byType.filter(
          (g) =>
            g.name?.toLowerCase().includes(q) ||
            g.owner_email?.toLowerCase().includes(q) ||
            g.builder_name?.toLowerCase().includes(q) ||
            g.business_process?.toLowerCase().includes(q) ||
            g.primary_category?.toLowerCase().includes(q)
        )
      : byType;
    return sortGpts(base, sort);
  }, [filter.gpts, search, sort, typeFilter]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = visible.length < filtered.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--c-border)" }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-semibold text-sm" style={{ color: "var(--c-text)" }}>
              {filter.label}
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--c-text-4)" }}>
              {search
                ? `${filtered.length.toLocaleString()} of ${filter.gpts.length.toLocaleString()} assets`
                : `${filter.gpts.length.toLocaleString()} asset${filter.gpts.length !== 1 ? "s" : ""}`}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-lg leading-none"
            style={{ color: "var(--c-text-4)", background: "none", border: "none", cursor: "pointer" }}
          >
            ×
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search by name, owner, process…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg px-3 py-2 text-xs outline-none"
          style={{
            background: "var(--c-bg)",
            border: "1px solid var(--c-border)",
            color: "var(--c-text)",
          }}
        />

        {/* Sort */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex gap-1">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSort(opt.key)}
                className="text-xs px-2 py-1 rounded"
                style={{
                  background: sort === opt.key ? "var(--c-accent-bg)" : "transparent",
                  color: sort === opt.key ? "#3b82f6" : "var(--c-text-4)",
                  border: sort === opt.key ? "1px solid #3b82f640" : "1px solid transparent",
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <TypeFilterChips
            value={typeFilter}
            onChange={setTypeFilter}
            gptCount={gptCount}
            projectCount={projectCount}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-sm text-center mt-20" style={{ color: "var(--c-text-4)" }}>
            {search ? `No assets matching "${search}"` : "No assets in this group."}
          </div>
        ) : (
          <>
            {visible.map((g) => (
              <GPTListItem key={g.id} gpt={g} onClick={() => onSelect(g)} />
            ))}
            {hasMore && (
              <button
                onClick={() => setPage((p) => p + 1)}
                className="w-full py-3 text-xs transition-colors"
                style={{
                  color: "#3b82f6",
                  background: "none",
                  border: "none",
                  borderTop: "1px solid var(--c-border)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-surface)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                Show more ({(filtered.length - visible.length).toLocaleString()} remaining)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main Drawer ───────────────────────────────────────────────────────────────

export interface DrawerFilter {
  label: string;
  gpts: GPTItem[];
}

interface GPTDrawerProps {
  // List mode (shows filterable list then detail on click)
  filter?: DrawerFilter | null;
  // Direct mode (opens single asset detail immediately)
  gpt?: GPTItem | null;
  onClose: () => void;
  initialTab?: DetailTab;
}

export default function GPTDrawer({ filter, gpt: directGpt, onClose, initialTab }: GPTDrawerProps) {
  const [selected, setSelected] = useState<GPTItem | null>(null);

  useEffect(() => {
    setSelected(null);
  }, [filter]);

  const isOpen = !!(filter || directGpt);
  if (!isOpen) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-30"
        style={{ background: "rgba(0,0,0,0.5)" }}
        onClick={onClose}
      />
      <div
        className="fixed right-0 top-0 h-full z-40 flex flex-col"
        style={{
          width: 480,
          background: "var(--c-surface)",
          borderLeft: "1px solid var(--c-border)",
          boxShadow: "-8px 0 32px var(--c-shadow)",
        }}
      >
        {directGpt ? (
          // Direct mode: show detail with a close button
          <GPTDetail
            gpt={directGpt}
            onBack={onClose}
            initialTab={initialTab}
          />
        ) : selected ? (
          <GPTDetail gpt={selected} onBack={() => setSelected(null)} />
        ) : (
          <GPTListPanel filter={filter!} onSelect={setSelected} onClose={onClose} />
        )}
      </div>
    </>,
    document.body
  );
}
