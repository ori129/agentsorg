import { useMemo, useState } from "react";
import type { GPTItem } from "../../../types";
import GPTDrawer, { type DrawerFilter } from "../GPTDrawer";

interface ProcessesPageProps {
  gpts: GPTItem[];
  onBack: () => void;
}

export default function ProcessesPage({ gpts, onBack }: ProcessesPageProps) {
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState<DrawerFilter | null>(null);

  const processes = useMemo(() => {
    const counts: Record<string, number> = {};
    const display: Record<string, string> = {};
    for (const g of gpts) {
      if (g.business_process) {
        const key = g.business_process.trim().toLowerCase();
        counts[key] = (counts[key] ?? 0) + 1;
        if (!display[key]) display[key] = g.business_process.trim();
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ name: display[key], count }));
  }, [gpts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? processes.filter((p) => p.name.toLowerCase().includes(q)) : processes;
  }, [processes, search]);

  const maxCount = Math.max(...filtered.map((p) => p.count), 1);

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
          <h1 className="text-xl font-bold" style={{ color: "var(--c-text)" }}>Business Processes</h1>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: "#10b98125", color: "#10b981" }}
          >
            {processes.length} unique
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search processes…"
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
            gridTemplateColumns: "40px 1fr 200px 60px",
            color: "var(--c-text-5)",
            borderBottom: "1px solid var(--c-border)",
          }}
        >
          <div>#</div>
          <div>Process</div>
          <div>Distribution</div>
          <div className="text-right">GPTs</div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-sm text-center py-12" style={{ color: "var(--c-text-4)" }}>
            {search ? `No processes matching "${search}"` : "No business process data yet. Run the pipeline with enrichment enabled."}
          </div>
        ) : (
          filtered.map((p, idx) => (
            <button
              key={p.name}
              onClick={() =>
                setDrawer({
                  label: p.name,
                  gpts: gpts.filter((g) => g.business_process === p.name),
                })
              }
              className="w-full grid text-xs px-4 py-3 transition-colors"
              style={{
                gridTemplateColumns: "40px 1fr 200px 60px",
                borderBottom: "1px solid var(--c-border)",
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ color: "var(--c-text-5)" }}>{idx + 1}</div>
              <div className="truncate font-medium pr-4" style={{ color: "var(--c-text-2)" }}>
                {p.name}
              </div>
              <div className="flex items-center pr-4">
                <div
                  className="flex-1 rounded-full overflow-hidden"
                  style={{ background: "var(--c-border)", height: 6 }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(p.count / maxCount) * 100}%`,
                      background: "linear-gradient(90deg, #10b981, #3b82f6)",
                    }}
                  />
                </div>
              </div>
              <div className="text-right" style={{ color: "var(--c-text-3)" }}>
                {p.count}
              </div>
            </button>
          ))
        )}
      </div>

      {search && filtered.length !== processes.length && (
        <div className="mt-3 text-xs" style={{ color: "var(--c-text-5)" }}>
          Showing {filtered.length} of {processes.length} processes
        </div>
      )}
    </div>
  );
}
