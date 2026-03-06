import { useMemo, useState } from "react";
import type { GPTItem } from "../../../types";
import GPTDrawer, { type DrawerFilter } from "../GPTDrawer";

interface OutputTypesPageProps {
  gpts: GPTItem[];
  onBack: () => void;
}

export default function OutputTypesPage({ gpts, onBack }: OutputTypesPageProps) {
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState<DrawerFilter | null>(null);

  const enriched = gpts.filter((g) => g.semantic_enriched_at);

  const outputTypes = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of enriched) {
      const t = g.output_type ?? "other";
      counts[t] = (counts[t] ?? 0) + 1;
    }
    const total = enriched.length || 1;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({
        type,
        displayName: type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " "),
        count,
        pct: Math.round((count / total) * 100),
      }));
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? outputTypes.filter((o) => o.displayName.toLowerCase().includes(q))
      : outputTypes;
  }, [outputTypes, search]);

  const maxCount = Math.max(...filtered.map((o) => o.count), 1);

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

      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold" style={{ color: "var(--c-text)" }}>Output Types</h1>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: "#6366f125", color: "#6366f1" }}
          >
            {enriched.length} enriched GPTs
          </span>
        </div>
      </div>

      {enriched.length === 0 && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-lg mb-5 text-sm"
          style={{ background: "#1c1200", border: "1px solid #78350f", color: "#f59e0b" }}
        >
          <span>⚠</span>
          <span>Run the pipeline with enrichment enabled to see output type data.</span>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search output types…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg px-3 py-2 text-xs outline-none"
          style={{
            background: "var(--c-surface)",
            border: "1px solid var(--c-border)",
            color: "var(--c-text)",
            width: 280,
          }}
        />
      </div>

      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
      >
        <div
          className="grid text-xs font-semibold uppercase tracking-widest px-4 py-2"
          style={{
            gridTemplateColumns: "1fr 200px 60px 60px",
            color: "var(--c-text-5)",
            borderBottom: "1px solid var(--c-border)",
          }}
        >
          <div>Output Type</div>
          <div>Distribution</div>
          <div className="text-right">GPTs</div>
          <div className="text-right">%</div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-sm text-center py-12" style={{ color: "var(--c-text-4)" }}>
            {search ? `No types matching "${search}"` : "No output type data yet."}
          </div>
        ) : (
          filtered.map((o) => (
            <button
              key={o.type}
              onClick={() =>
                setDrawer({
                  label: o.displayName,
                  gpts: gpts.filter(
                    (g) =>
                      (g.output_type ?? "other").toLowerCase() === o.type.toLowerCase()
                  ),
                })
              }
              className="w-full grid text-xs px-4 py-3 transition-colors"
              style={{
                gridTemplateColumns: "1fr 200px 60px 60px",
                borderBottom: "1px solid var(--c-border)",
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div className="truncate font-medium pr-4" style={{ color: "var(--c-text-2)" }}>
                {o.displayName}
              </div>
              <div className="flex items-center pr-4">
                <div
                  className="flex-1 rounded-full overflow-hidden"
                  style={{ background: "var(--c-border)", height: 6 }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(o.count / maxCount) * 100}%`,
                      background: "#6366f1",
                    }}
                  />
                </div>
              </div>
              <div className="text-right" style={{ color: "var(--c-text-3)" }}>
                {o.count}
              </div>
              <div className="text-right" style={{ color: "var(--c-text-5)" }}>
                {o.pct}%
              </div>
            </button>
          ))
        )}
      </div>

      {search && filtered.length !== outputTypes.length && (
        <div className="mt-3 text-xs" style={{ color: "var(--c-text-5)" }}>
          Showing {filtered.length} of {outputTypes.length} types
        </div>
      )}
    </div>
  );
}
