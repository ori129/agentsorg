import { useMemo, useState } from "react";
import type { GPTItem } from "../../../types";
import GPTDrawer, { type DrawerFilter } from "../GPTDrawer";

interface BuildersPageProps {
  gpts: GPTItem[];
  onBack: () => void;
}

type SortKey = "count" | "quality" | "name";

function ScoreDots({ score }: { score: number }) {
  const rounded = Math.round(score);
  return (
    <span className="inline-flex gap-1 items-center">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className="inline-block w-2 h-2 rounded-full"
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

export default function BuildersPage({ gpts, onBack }: BuildersPageProps) {
  const [sort, setSort] = useState<SortKey>("count");
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState<DrawerFilter | null>(null);

  const builders = useMemo(() => {
    const map: Record<string, { count: number; qualityScores: number[]; sophScores: number[] }> = {};
    for (const g of gpts) {
      const name = g.builder_name || g.owner_email || "Unknown";
      if (!map[name]) map[name] = { count: 0, qualityScores: [], sophScores: [] };
      map[name].count++;
      if (g.prompting_quality_score != null) map[name].qualityScores.push(g.prompting_quality_score);
      if (g.sophistication_score != null) map[name].sophScores.push(g.sophistication_score);
    }
    return Object.entries(map).map(([name, { count, qualityScores, sophScores }]) => ({
      name,
      count,
      avgQuality: qualityScores.length
        ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
        : 0,
      avgSoph: sophScores.length
        ? sophScores.reduce((a, b) => a + b, 0) / sophScores.length
        : 0,
    }));
  }, [gpts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q ? builders.filter((b) => b.name.toLowerCase().includes(q)) : builders;
    return [...base].sort((a, b) => {
      if (sort === "count") return b.count - a.count;
      if (sort === "quality") return b.avgQuality - a.avgQuality;
      return a.name.localeCompare(b.name);
    });
  }, [builders, search, sort]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <GPTDrawer filter={drawer} onClose={() => setDrawer(null)} />

      {/* Breadcrumb */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs mb-6"
        style={{ color: "var(--c-text-4)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        ← Overview
      </button>

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold" style={{ color: "var(--c-text)" }}>Builders</h1>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: "#3b82f625", color: "#3b82f6" }}
          >
            {builders.length} total
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name or email…"
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
        <div className="flex gap-1">
          {(["count", "quality", "name"] as SortKey[]).map((key) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className="text-xs px-3 py-1.5 rounded"
              style={{
                background: sort === key ? "var(--c-accent-bg)" : "var(--c-surface)",
                color: sort === key ? "#3b82f6" : "var(--c-text-4)",
                border: sort === key ? "1px solid #3b82f640" : "1px solid var(--c-border)",
                cursor: "pointer",
              }}
            >
              {key === "count" ? "Count" : key === "quality" ? "Quality" : "Name"}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
      >
        {/* Table header */}
        <div
          className="grid text-xs font-semibold uppercase tracking-widest px-4 py-2"
          style={{
            gridTemplateColumns: "40px 1fr 80px 120px 120px",
            color: "var(--c-text-5)",
            borderBottom: "1px solid var(--c-border)",
          }}
        >
          <div>#</div>
          <div>Builder</div>
          <div className="text-right">GPTs</div>
          <div className="text-center">Avg Quality</div>
          <div className="text-center">Avg Sophistication</div>
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="text-sm text-center py-12" style={{ color: "var(--c-text-4)" }}>
            {search ? `No builders matching "${search}"` : "No builders found."}
          </div>
        ) : (
          filtered.map((b, idx) => (
            <button
              key={b.name}
              onClick={() =>
                setDrawer({
                  label: `GPTs by ${b.name}`,
                  gpts: gpts.filter((g) => (g.builder_name ?? g.owner_email) === b.name),
                })
              }
              className="w-full grid text-xs px-4 py-3 transition-colors"
              style={{
                gridTemplateColumns: "40px 1fr 80px 120px 120px",
                borderBottom: "1px solid var(--c-border)",
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ color: "var(--c-text-5)" }}>{idx + 1}</div>
              <div className="truncate font-medium" style={{ color: "var(--c-text-2)" }}>
                {b.name}
              </div>
              <div className="text-right" style={{ color: "var(--c-text-3)" }}>
                {b.count}
              </div>
              <div className="flex justify-center">
                {b.avgQuality > 0 ? (
                  <ScoreDots score={b.avgQuality} />
                ) : (
                  <span style={{ color: "var(--c-text-5)" }}>—</span>
                )}
              </div>
              <div className="flex justify-center">
                {b.avgSoph > 0 ? (
                  <ScoreDots score={b.avgSoph} />
                ) : (
                  <span style={{ color: "var(--c-text-5)" }}>—</span>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {search && filtered.length !== builders.length && (
        <div className="mt-3 text-xs" style={{ color: "var(--c-text-5)" }}>
          Showing {filtered.length} of {builders.length} builders
        </div>
      )}
    </div>
  );
}
