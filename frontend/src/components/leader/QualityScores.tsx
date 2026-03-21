import { useState } from "react";
import type { GPTItem } from "../../types";
import GPTDrawer, { type DrawerFilter } from "./GPTDrawer";

interface QualityScoresProps { gpts: GPTItem[] }
type SortKey = "sophistication" | "quality" | "roi" | "name";

function ScoreDots({ score, max = 5 }: { score: number | null; max?: number }) {
  if (score === null) return <span className="text-xs" style={{ color: "var(--c-text-5)" }}>—</span>;
  return (
    <span className="inline-flex gap-1 items-center">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className="inline-block w-2 h-2 rounded-full"
          style={{ background: i < score ? (score >= 4 ? "#10b981" : score >= 3 ? "#f59e0b" : "#ef4444") : "var(--c-border)" }} />
      ))}
    </span>
  );
}

const PAGE = 50;

export default function QualityScores({ gpts }: QualityScoresProps) {
  const [sortKey, setSortKey] = useState<SortKey>("sophistication");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [drawer, setDrawer] = useState<DrawerFilter | null>(null);
  const [showAll, setShowAll] = useState(false);

  const displayGpts = gpts.filter((g) => g.semantic_enriched_at);

  const sorted = [...displayGpts].sort((a, b) => {
    let aVal: number | string = 0, bVal: number | string = 0;
    if (sortKey === "name") { aVal = a.name; bVal = b.name; }
    else if (sortKey === "sophistication") { aVal = a.sophistication_score ?? -1; bVal = b.sophistication_score ?? -1; }
    else if (sortKey === "quality") { aVal = a.prompting_quality_score ?? -1; bVal = b.prompting_quality_score ?? -1; }
    else if (sortKey === "roi") { aVal = a.roi_potential_score ?? -1; bVal = b.roi_potential_score ?? -1; }
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortBtn = ({ label, k }: { label: string; k: SortKey }) => (
    <button onClick={() => toggleSort(k)} className="text-xs font-medium flex items-center gap-1"
      style={{ color: sortKey === k ? "#3b82f6" : "var(--c-text-4)" }}>
      {label} {sortKey === k ? (sortDir === "desc" ? "↓" : "↑") : ""}
    </button>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <GPTDrawer filter={drawer} onClose={() => setDrawer(null)} />

      <h1 className="text-xl font-bold mb-2" style={{ color: "var(--c-text)" }}>Quality Scores</h1>
      <p className="text-sm mb-6" style={{ color: "var(--c-text-4)" }}>
        Per-asset sophistication, prompting quality, and ROI potential. Click any row to inspect.
      </p>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--c-border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--c-surface)", borderBottom: "1px solid var(--c-border)" }}>
              <th className="text-left px-4 py-3"><SortBtn label="Name" k="name" /></th>
              <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--c-text-4)" }}>Category</th>
              <th className="px-4 py-3 text-center"><SortBtn label="Sophistication" k="sophistication" /></th>
              <th className="px-4 py-3 text-center"><SortBtn label="Quality" k="quality" /></th>
              <th className="px-4 py-3 text-center"><SortBtn label="ROI" k="roi" /></th>
              <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--c-text-4)" }}>Output</th>
            </tr>
          </thead>
          <tbody>
            {(showAll ? sorted : sorted.slice(0, PAGE)).map((g, idx) => (
              <tr key={g.id}
                style={{ background: idx % 2 === 0 ? "var(--c-bg)" : "var(--c-surface)", borderBottom: "1px solid var(--c-border)", cursor: "pointer" }}
                onClick={() => setDrawer({ label: g.name, gpts: [g] })}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-border)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? "var(--c-bg)" : "var(--c-surface)")}>
                <td className="px-4 py-3">
                  <div className="font-medium text-xs" style={{ color: "var(--c-text)" }}>{g.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--c-text-4)" }}>{g.owner_email ?? "—"}</div>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--c-text-3)" }}>{g.primary_category ?? "—"}</td>
                <td className="px-4 py-3 text-center"><ScoreDots score={g.sophistication_score} /></td>
                <td className="px-4 py-3 text-center"><ScoreDots score={g.prompting_quality_score} /></td>
                <td className="px-4 py-3 text-center"><ScoreDots score={g.roi_potential_score} /></td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--c-text-3)" }}>{g.output_type ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length > PAGE && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="w-full py-2.5 text-xs"
            style={{ color: "#3b82f6", borderTop: "1px solid var(--c-border)", background: "var(--c-surface)" }}
          >
            {showAll ? "Show less" : `Show all ${sorted.length} assets`}
          </button>
        )}
      </div>
    </div>
  );
}
