import { useMemo, useState } from "react";
import type { GPTItem } from "../../../types";
import GPTDrawer, { type DrawerFilter } from "../GPTDrawer";
import { TypeFilterChips, filterByType, type TypeFilter } from "../../ui/AssetTypeBadge";

interface DepartmentsPageProps {
  gpts: GPTItem[];
  onBack: () => void;
}

export default function DepartmentsPage({ gpts, onBack }: DepartmentsPageProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [drawer, setDrawer] = useState<DrawerFilter | null>(null);

  const filteredGpts = useMemo(() => filterByType(gpts, typeFilter), [gpts, typeFilter]);

  const departments = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of filteredGpts) {
      const dept = g.primary_category || (g.builder_categories?.[0] as string) || "General";
      counts[dept] = (counts[dept] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([dept, count]) => ({ dept, count }));
  }, [filteredGpts]);

  const total = filteredGpts.length || 1;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? departments.filter((d) => d.dept.toLowerCase().includes(q)) : departments;
  }, [departments, search]);

  const maxCount = Math.max(...filtered.map((d) => d.count), 1);

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
          <h1 className="text-xl font-bold" style={{ color: "var(--c-text)" }}>Departments</h1>
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: "#6366f125", color: "#6366f1" }}
          >
            {departments.length} depts
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <TypeFilterChips
          value={typeFilter}
          onChange={setTypeFilter}
          gptCount={gpts.filter((g) => g.asset_type !== "project").length}
          projectCount={gpts.filter((g) => g.asset_type === "project").length}
        />
        <input
          type="text"
          placeholder="Search departments…"
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
          <div>Department</div>
          <div>Distribution</div>
          <div className="text-right">Assets</div>
          <div className="text-right">%</div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-sm text-center py-12" style={{ color: "var(--c-text-4)" }}>
            {search ? `No departments matching "${search}"` : "No data yet."}
          </div>
        ) : (
          filtered.map((d) => (
            <button
              key={d.dept}
              onClick={() =>
                setDrawer({
                  label: d.dept,
                  gpts: filteredGpts.filter(
                    (g) =>
                      (g.primary_category || (g.builder_categories?.[0] as string) || "General") ===
                      d.dept
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
                {d.dept}
              </div>
              <div className="flex items-center pr-4">
                <div
                  className="flex-1 rounded-full overflow-hidden"
                  style={{ background: "var(--c-border)", height: 6 }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(d.count / maxCount) * 100}%`,
                      background: "#6366f1",
                    }}
                  />
                </div>
              </div>
              <div className="text-right" style={{ color: "var(--c-text-3)" }}>
                {d.count}
              </div>
              <div className="text-right" style={{ color: "var(--c-text-5)" }}>
                {Math.round((d.count / total) * 100)}%
              </div>
            </button>
          ))
        )}
      </div>

      {search && filtered.length !== departments.length && (
        <div className="mt-3 text-xs" style={{ color: "var(--c-text-5)" }}>
          Showing {filtered.length} of {departments.length} departments
        </div>
      )}
    </div>
  );
}
