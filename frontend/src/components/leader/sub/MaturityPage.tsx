import { useState } from "react";
import type { GPTItem } from "../../../types";
import GPTDrawer, { type DrawerFilter } from "../GPTDrawer";

interface MaturityPageProps {
  gpts: GPTItem[];
  onBack: () => void;
}

function ScoreDots({ score }: { score: number }) {
  const rounded = Math.round(score);
  return (
    <span className="inline-flex gap-0.5 items-center">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            background:
              i < rounded
                ? rounded >= 4
                  ? "#10b981"
                  : rounded >= 3
                  ? "#f59e0b"
                  : "#ef4444"
                : "var(--c-border)",
          }}
        />
      ))}
    </span>
  );
}

const TIERS = [
  {
    label: "Production",
    description: "Sophistication score ≥ 4 — fully featured, integrated GPTs",
    color: "#10b981",
    filter: (g: GPTItem) => (g.sophistication_score ?? 0) >= 4,
    scores: [4, 5],
  },
  {
    label: "Functional",
    description: "Sophistication score = 3 — useful GPTs with room to grow",
    color: "#f59e0b",
    filter: (g: GPTItem) => g.sophistication_score === 3,
    scores: [3],
  },
  {
    label: "Experimental",
    description: "Sophistication score ≤ 2 — early-stage or abandoned GPTs",
    color: "#3b82f6",
    filter: (g: GPTItem) => (g.sophistication_score ?? 0) <= 2,
    scores: [1, 2],
  },
];

export default function MaturityPage({ gpts, onBack }: MaturityPageProps) {
  const [drawer, setDrawer] = useState<DrawerFilter | null>(null);

  const enriched = gpts.filter((g) => g.semantic_enriched_at);
  const total = enriched.length || 1;

  const tiers = TIERS.map((tier) => ({
    ...tier,
    gptList: enriched.filter(tier.filter),
  }));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <GPTDrawer filter={drawer} onClose={() => setDrawer(null)} />

      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs mb-6"
        style={{ color: "var(--c-text-4)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        ← Overview
      </button>

      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-bold" style={{ color: "var(--c-text)" }}>Portfolio Maturity</h1>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: "#3b82f625", color: "#3b82f6" }}
        >
          {enriched.length} enriched GPTs
        </span>
      </div>

      {enriched.length === 0 && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-lg mb-5 text-sm"
          style={{ background: "#1c1200", border: "1px solid #78350f", color: "#f59e0b" }}
        >
          <span>⚠</span>
          <span>Run the pipeline with enrichment enabled to see maturity data.</span>
        </div>
      )}

      <div className="space-y-4">
        {tiers.map((tier) => {
          const pct = Math.round((tier.gptList.length / total) * 100);
          return (
            <div
              key={tier.label}
              className="rounded-xl overflow-hidden"
              style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
            >
              {/* Section header */}
              <button
                onClick={() =>
                  setDrawer({ label: tier.label, gpts: tier.gptList })
                }
                className="w-full flex items-center justify-between px-5 py-4 transition-colors"
                style={{ cursor: "pointer", textAlign: "left" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-bg)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: tier.color }}
                  />
                  <div>
                    <div className="font-semibold text-sm" style={{ color: "var(--c-text)" }}>
                      {tier.label}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--c-text-4)" }}>
                      {tier.description}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{ background: tier.color + "20", color: tier.color }}
                  >
                    {pct}%
                  </span>
                  <span className="text-xs" style={{ color: "var(--c-text-4)" }}>
                    {tier.gptList.length} GPTs
                  </span>
                  <span className="text-xs" style={{ color: "var(--c-text-5)" }}>↗</span>
                </div>
              </button>

              {/* GPT list */}
              {tier.gptList.length > 0 && (
                <div style={{ borderTop: "1px solid var(--c-border)" }}>
                  {tier.gptList.slice(0, 10).map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setDrawer({ label: g.name, gpts: [g] })}
                      className="w-full flex items-center justify-between px-5 py-2.5 text-xs transition-colors"
                      style={{
                        borderBottom: "1px solid var(--c-border)",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-bg)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div className="flex items-center gap-3">
                        <span className="truncate font-medium" style={{ color: "var(--c-text-2)", maxWidth: 280 }}>
                          {g.name}
                        </span>
                        <span style={{ color: "var(--c-text-5)" }}>
                          {g.owner_email ?? g.builder_name ?? ""}
                        </span>
                      </div>
                      <div className="shrink-0">
                        {g.prompting_quality_score != null ? (
                          <ScoreDots score={g.prompting_quality_score} />
                        ) : (
                          <span style={{ color: "var(--c-text-5)" }}>—</span>
                        )}
                      </div>
                    </button>
                  ))}
                  {tier.gptList.length > 10 && (
                    <button
                      onClick={() => setDrawer({ label: tier.label, gpts: tier.gptList })}
                      className="w-full py-2.5 text-xs transition-colors"
                      style={{
                        color: "#3b82f6",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-bg)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      +{tier.gptList.length - 10} more — view all
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
