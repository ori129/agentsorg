import { useState, useMemo, useEffect, useRef } from "react";
import type { GPTItem, GPTSearchResult } from "../../types";
import { usePipelineGPTs } from "../../hooks/usePipeline";
import { useCategories } from "../../hooks/useCategories";
import GPTDrawer, { type DrawerFilter } from "../leader/GPTDrawer";

type SortOption = "shared" | "newest" | "alpha";
type ViewMode = "grid" | "orgchart" | "tree";

// ── Helpers ───────────────────────────────────────────────────────────────────

function frictionLabel(score: number | null) {
  if (score === null) return null;
  if (score >= 4) return { label: "Easy to start", color: "#10b981" };
  if (score === 3) return { label: "Some setup", color: "#f59e0b" };
  return { label: "Requires setup", color: "#ef4444" };
}

function matchColor(score: number) {
  if (score >= 75) return "#10b981";
  if (score >= 50) return "#f59e0b";
  return "var(--c-text-2)";
}

// ── Browse card (grid / org chart) ───────────────────────────────────────────

function GPTCard({ gpt, onClick }: { gpt: GPTItem; onClick: () => void }) {
  const starters = (gpt.conversation_starters ?? []) as string[];
  const integrations = (gpt.integration_flags ?? []) as string[];
  const friction = frictionLabel(gpt.adoption_friction_score);
  const desc = gpt.use_case_description || gpt.llm_summary || gpt.description;

  return (
    <div
      className="rounded-xl flex flex-col"
      style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", cursor: "pointer" }}
      onClick={onClick}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#3b82f6")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--c-border)")}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3 className="font-semibold text-sm leading-tight" style={{ color: "var(--c-text)" }}>{gpt.name}</h3>
          {gpt.shared_user_count > 0 && (
            <span className="text-xs shrink-0" style={{ color: "var(--c-text-4)" }}>👤 {gpt.shared_user_count}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {gpt.primary_category && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--c-accent-bg)", color: "#3b82f6" }}>
              {gpt.primary_category}
            </span>
          )}
          {gpt.output_type && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--c-border)", color: "var(--c-text-3)" }}>
              → {gpt.output_type}
            </span>
          )}
          {friction && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--c-bg)", color: friction.color }}>
              {friction.label}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 flex flex-col gap-2 flex-1">
        {desc && (
          <p className="text-xs leading-relaxed line-clamp-3" style={{ color: "var(--c-text-2)" }}>{desc}</p>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          {gpt.intended_audience && (
            <span style={{ color: "var(--c-text-4)" }}>For: <span style={{ color: "var(--c-text-3)" }}>{gpt.intended_audience}</span></span>
          )}
          {gpt.business_process && (
            <span style={{ color: "var(--c-text-4)" }}>Process: <span style={{ color: "var(--c-text-3)" }}>{gpt.business_process}</span></span>
          )}
        </div>

        {integrations.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {integrations.slice(0, 3).map((i) => (
              <span key={i} className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--c-accent-deep)", color: "#3b82f6", border: "1px solid var(--c-accent-bg)" }}>
                {i}
              </span>
            ))}
          </div>
        )}

        {starters.length > 0 && (
          <div className="text-xs truncate px-2 py-1.5 rounded" style={{ background: "var(--c-bg)", color: "var(--c-text-3)", border: "1px solid var(--c-border)" }}>
            "{starters[0]}"
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 pb-3 flex items-center justify-between">
        <span className="text-xs" style={{ color: "var(--c-text-5)" }}>
          {gpt.owner_email ? `by ${gpt.owner_email.split("@")[0]}` : ""}
        </span>
        <a
          href={`https://chatgpt.com/g/${gpt.id}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs px-3 py-1.5 rounded-lg font-medium"
          style={{ background: "var(--c-accent-bg)", color: "#3b82f6" }}
          onClick={(e) => e.stopPropagation()}
        >
          Open →
        </a>
      </div>
    </div>
  );
}

// ── Search result card ────────────────────────────────────────────────────────

function RecommendationCard({ gpt, onClick }: { gpt: GPTSearchResult; onClick: () => void }) {
  const starters = (gpt.conversation_starters ?? []) as string[];
  const integrations = (gpt.integration_flags ?? []) as string[];
  const friction = frictionLabel(gpt.adoption_friction_score);
  const score = gpt.match_score ?? (gpt.confidence === "high" ? 82 : gpt.confidence === "medium" ? 60 : null);
  const desc = gpt.use_case_description || gpt.llm_summary || gpt.description;

  return (
    <div
      className="rounded-xl flex flex-col"
      style={{ background: "var(--c-surface)", border: "1px solid var(--c-accent-bg)", cursor: "pointer" }}
      onClick={onClick}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#3b82f6")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--c-accent-bg)")}
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
        <div className="flex items-start gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm leading-tight" style={{ color: "var(--c-text)" }}>{gpt.name}</h3>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {gpt.primary_category && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--c-accent-bg)", color: "#3b82f6" }}>
                  {gpt.primary_category}
                </span>
              )}
              {gpt.output_type && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--c-border)", color: "var(--c-text-3)" }}>
                  → {gpt.output_type}
                </span>
              )}
              {friction && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--c-bg)", color: friction.color }}>
                  {friction.label}
                </span>
              )}
            </div>
          </div>
          {/* Match score — only shown when a real score exists */}
          {score !== null && (
            <div className="shrink-0 text-right">
              <div className="text-xl font-bold leading-none" style={{ color: matchColor(score) }}>{score}%</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--c-text-4)" }}>match</div>
            </div>
          )}
        </div>

        {/* Why it matched */}
        {gpt.reasoning && (
          <div className="text-xs leading-relaxed rounded-lg px-3 py-2" style={{ background: "var(--c-bg)", color: "#93c5fd", border: "1px solid var(--c-accent-bg)" }}>
            <span className="font-semibold" style={{ color: "#3b82f6" }}>↳ </span>{gpt.reasoning}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-3 flex flex-col gap-2">
        {desc && (
          <p className="text-xs leading-relaxed" style={{ color: "var(--c-text-2)" }}>{desc}</p>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
          {gpt.intended_audience && (
            <span style={{ color: "var(--c-text-4)" }}>For: <span style={{ color: "var(--c-text-3)" }}>{gpt.intended_audience}</span></span>
          )}
          {gpt.business_process && (
            <span style={{ color: "var(--c-text-4)" }}>Process: <span style={{ color: "var(--c-text-3)" }}>{gpt.business_process}</span></span>
          )}
          {gpt.shared_user_count > 0 && (
            <span style={{ color: "var(--c-text-4)" }}>Used by: <span style={{ color: "var(--c-text-3)" }}>{gpt.shared_user_count} people</span></span>
          )}
        </div>

        {integrations.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {integrations.map((i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--c-accent-deep)", color: "#3b82f6", border: "1px solid var(--c-accent-bg)" }}>
                {i}
              </span>
            ))}
          </div>
        )}

        {starters.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="text-xs mb-0.5" style={{ color: "var(--c-text-5)" }}>Try asking:</div>
            {starters.slice(0, 2).map((s, i) => (
              <div key={i} className="text-xs px-3 py-1.5 rounded-lg truncate"
                style={{ background: "var(--c-bg)", color: "var(--c-text-2)", border: "1px solid var(--c-border)" }}>
                "{s}"
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 pb-4 flex items-center justify-between">
        <span className="text-xs" style={{ color: "var(--c-text-5)" }}>
          {gpt.owner_email ? `by ${gpt.owner_email.split("@")[0]}` : ""}
        </span>
        <a
          href={`https://chatgpt.com/g/${gpt.id}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs px-4 py-1.5 rounded-lg font-medium"
          style={{ background: "var(--c-accent-bg)", color: "#3b82f6" }}
          onClick={(e) => e.stopPropagation()}
        >
          Open in ChatGPT →
        </a>
      </div>
    </div>
  );
}

// ── Org chart view ────────────────────────────────────────────────────────────

function OrgChartView({ gpts, onSelect }: { gpts: GPTItem[]; onSelect: (g: GPTItem) => void }) {
  const groups = useMemo(() => {
    const map: Record<string, GPTItem[]> = {};
    for (const g of gpts) {
      const key = g.primary_category || "Other";
      if (!map[key]) map[key] = [];
      map[key].push(g);
    }
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [gpts]);

  return (
    <div className="space-y-6">
      {groups.map(([dept, deptGpts]) => {
        const avgSoph = deptGpts.filter(g => g.sophistication_score != null).length > 0
          ? (deptGpts.reduce((s, g) => s + (g.sophistication_score ?? 0), 0) / deptGpts.filter(g => g.sophistication_score != null).length).toFixed(1)
          : null;
        const totalUsers = deptGpts.reduce((s, g) => s + g.shared_user_count, 0);

        return (
          <div key={dept}>
            {/* Department header */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-1 h-6 rounded-full" style={{ background: "#3b82f6" }} />
                <h2 className="font-semibold text-sm" style={{ color: "var(--c-text)" }}>{dept}</h2>
              </div>
              <div className="flex items-center gap-3 text-xs" style={{ color: "var(--c-text-4)" }}>
                <span>{deptGpts.length} GPT{deptGpts.length !== 1 ? "s" : ""}</span>
                {avgSoph && <span>Avg sophistication: {avgSoph}/5</span>}
                {totalUsers > 0 && <span>👤 {totalUsers} users</span>}
              </div>
              <div className="flex-1 h-px" style={{ background: "var(--c-border)" }} />
            </div>

            {/* GPT rows for this dept */}
            <div className="grid grid-cols-1 gap-2 ml-3">
              {deptGpts.map((g) => {
                const friction = frictionLabel(g.adoption_friction_score);
                const desc = g.use_case_description || g.llm_summary || g.description;
                return (
                  <div
                    key={g.id}
                    className="rounded-lg px-4 py-3 flex items-center gap-4"
                    style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", cursor: "pointer" }}
                    onClick={() => onSelect(g)}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#3b82f6")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--c-border)")}
                  >
                    {/* Name + desc */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium" style={{ color: "var(--c-text)" }}>{g.name}</span>
                        {g.output_type && (
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--c-border)", color: "var(--c-text-3)" }}>
                            {g.output_type}
                          </span>
                        )}
                        {friction && (
                          <span className="text-xs" style={{ color: friction.color }}>{friction.label}</span>
                        )}
                      </div>
                      {desc && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: "var(--c-text-4)" }}>{desc}</p>
                      )}
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-4 shrink-0 text-xs" style={{ color: "var(--c-text-4)" }}>
                      {g.intended_audience && (
                        <span className="hidden md:block truncate max-w-32" style={{ color: "var(--c-text-3)" }}>{g.intended_audience}</span>
                      )}
                      {(g.integration_flags ?? []).slice(0, 2).map((i) => (
                        <span key={i as string} className="px-1.5 py-0.5 rounded" style={{ background: "var(--c-accent-deep)", color: "#3b82f6" }}>{i as string}</span>
                      ))}
                      {g.shared_user_count > 0 && <span>👤 {g.shared_user_count}</span>}
                      {g.sophistication_score != null && (
                        <div className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="rounded-sm" style={{ width: 6, height: 6, background: i < (g.sophistication_score ?? 0) ? "#3b82f6" : "var(--c-border)" }} />
                          ))}
                        </div>
                      )}
                    </div>

                    <a
                      href={`https://chatgpt.com/g/${g.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs px-3 py-1.5 rounded-lg shrink-0"
                      style={{ background: "var(--c-accent-bg)", color: "#3b82f6" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      Open →
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tree view ─────────────────────────────────────────────────────────────────

function TreeView({ gpts, onSelect }: { gpts: GPTItem[]; onSelect: (g: GPTItem) => void }) {
  const groups = useMemo(() => {
    const map: Record<string, GPTItem[]> = {};
    for (const g of gpts) {
      const key = g.primary_category || "Other";
      if (!map[key]) map[key] = [];
      map[key].push(g);
    }
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [gpts]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (dept: string) => setCollapsed((p) => ({ ...p, [dept]: !p[dept] }));

  return (
    <div className="font-mono text-xs select-none" style={{ color: "var(--c-text-3)" }}>
      {/* Root */}
      <div className="flex items-center gap-2 mb-1 pb-2" style={{ borderBottom: "1px solid var(--c-border)" }}>
        <span style={{ color: "#3b82f6" }}>◉</span>
        <span className="font-semibold text-sm" style={{ color: "var(--c-text)", fontFamily: "inherit" }}>
          AI Portfolio
        </span>
        <span style={{ color: "var(--c-text-5)" }}>— {gpts.length} GPTs</span>
      </div>

      <div className="space-y-0.5">
        {groups.map(([dept, deptGpts], di) => {
          const isLast = di === groups.length - 1;
          const isOpen = !collapsed[dept];
          const totalUsers = deptGpts.reduce((s, g) => s + g.shared_user_count, 0);

          return (
            <div key={dept}>
              {/* Department node */}
              <div
                className="flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer"
                onClick={() => toggle(dept)}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-surface)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ color: "var(--c-text-5)" }}>{isLast ? "└─" : "├─"}</span>
                <span style={{ color: isOpen ? "#f59e0b" : "var(--c-text-5)" }}>{isOpen ? "▼" : "▶"}</span>
                <span className="font-semibold" style={{ color: "var(--c-text)" }}>{dept}</span>
                <span style={{ color: "var(--c-text-5)" }}>({deptGpts.length})</span>
                {totalUsers > 0 && <span style={{ color: "var(--c-accent-bg)" }}>· 👤 {totalUsers}</span>}
              </div>

              {/* GPT leaf nodes */}
              {isOpen && (
                <div>
                  {deptGpts.map((g, gi) => {
                    const isLastGpt = gi === deptGpts.length - 1;
                    const prefix = isLast ? "   " : "│  ";
                    const branch = isLastGpt ? "└─" : "├─";
                    const friction = frictionLabel(g.adoption_friction_score);
                    const desc = g.use_case_description || g.llm_summary || g.description;

                    return (
                      <div
                        key={g.id}
                        className="flex items-start gap-1.5 py-1.5 px-2 rounded cursor-pointer group"
                        onClick={() => onSelect(g)}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-surface)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <span className="shrink-0 mt-0.5" style={{ color: "var(--c-border)" }}>{prefix}{branch}</span>
                        <span className="shrink-0 mt-0.5" style={{ color: "#3b82f6" }}>◆</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium" style={{ color: "var(--c-text)" }}>{g.name}</span>
                            {g.output_type && (
                              <span className="px-1.5 py-0.5 rounded" style={{ background: "var(--c-border)", color: "var(--c-text-3)" }}>
                                {g.output_type}
                              </span>
                            )}
                            {friction && (
                              <span style={{ color: friction.color }}>{friction.label}</span>
                            )}
                            {g.shared_user_count > 0 && (
                              <span style={{ color: "var(--c-text-5)" }}>👤 {g.shared_user_count}</span>
                            )}
                            {(g.integration_flags ?? []).slice(0, 2).map((i) => (
                              <span key={i as string} className="px-1.5 py-0.5 rounded" style={{ background: "var(--c-accent-deep)", color: "#3b82f6" }}>
                                {i as string}
                              </span>
                            ))}
                          </div>
                          {desc && (
                            <div className="mt-0.5 truncate" style={{ color: "var(--c-text-5)" }}>{desc}</div>
                          )}
                        </div>
                        <a
                          href={`https://chatgpt.com/g/${g.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-2 py-1 rounded shrink-0 opacity-0 group-hover:opacity-100"
                          style={{ background: "var(--c-accent-bg)", color: "#3b82f6" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          Open →
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Portal ───────────────────────────────────────────────────────────────

export default function Portal() {
  const { data: allGpts = [], isLoading: allLoading } = usePipelineGPTs();
  const { data: categories = [] } = useCategories();
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("shared");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchResults, setSearchResults] = useState<GPTSearchResult[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [drawer, setDrawer] = useState<DrawerFilter | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = search.trim();
    if (trimmed.length < 3) { setSearchResults(null); return; }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/v1/pipeline/search?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) setSearchResults(await res.json());
      } catch { setSearchResults(null); }
      finally { setSearchLoading(false); }
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const publicGpts = useMemo(() => allGpts.filter((g) => g.visibility !== "just-me"), [allGpts]);
  const deptCategories = useMemo(() => categories.filter((c) => c.enabled).sort((a, b) => a.sort_order - b.sort_order), [categories]);
  const isSearchMode = searchResults !== null;

  const filtered = useMemo(() => {
    const base = searchResults ?? publicGpts;
    return base
      .filter((g) => deptFilter === "all" || g.primary_category === deptFilter || (g.builder_categories ?? []).includes(deptFilter as string))
      .sort((a, b) => {
        if (isSearchMode) return 0;
        if (sortBy === "shared") return b.shared_user_count - a.shared_user_count;
        if (sortBy === "newest") return (b.created_at ?? "").localeCompare(a.created_at ?? "");
        return a.name.localeCompare(b.name);
      });
  }, [searchResults, publicGpts, deptFilter, sortBy, isSearchMode]);

  const openDrawer = (g: GPTItem) => setDrawer({ label: g.name, gpts: [g] });

  return (
    <div className="min-h-screen" style={{ background: "var(--c-bg)" }}>
      <GPTDrawer filter={drawer} onClose={() => setDrawer(null)} />

      {/* Header */}
      <div className="px-8 py-6" style={{ background: "var(--c-surface)", borderBottom: "1px solid var(--c-border)" }}>
        <h1 className="text-xl font-bold mb-1" style={{ color: "var(--c-text)" }}>AI Tools for Employees</h1>
        <p className="text-sm mb-5" style={{ color: "var(--c-text-4)" }}>Describe what you need — we'll find the right GPT for your role</p>

        <div className="flex gap-3 items-center">
          <div className="relative flex-1 max-w-2xl">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--c-text-4)" }}>🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. 'I'm a recruiter looking for help with compensation benchmarking'"
              className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)", color: "var(--c-text)" }}
            />
            {searchLoading && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs animate-pulse" style={{ color: "#3b82f6" }}>
                searching…
              </span>
            )}
          </div>

          {!isSearchMode && (
            <>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)", color: "var(--c-text-3)" }}
              >
                <option value="shared">Most Used</option>
                <option value="newest">Newest</option>
                <option value="alpha">A–Z</option>
              </select>

              {/* View toggle */}
              <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--c-border)" }}>
                {([["grid", "⊞ Grid"], ["orgchart", "≡ By Dept"], ["tree", "⌥ Tree"]] as const).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setViewMode(v)}
                    className="px-3 py-2 text-xs font-medium"
                    style={viewMode === v
                      ? { background: "var(--c-accent-bg)", color: "#3b82f6" }
                      : { background: "var(--c-surface)", color: "var(--c-text-4)" }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {isSearchMode && (
            <button onClick={() => setSearch("")} className="px-3 py-2.5 rounded-lg text-xs" style={{ background: "var(--c-border)", color: "var(--c-text-3)" }}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside className="py-6 px-4" style={{ width: 180, minWidth: 180, borderRight: "1px solid var(--c-border)" }}>
          <div className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--c-text-5)" }}>Category</div>
          <button
            onClick={() => setDeptFilter("all")}
            className="w-full text-left px-3 py-2 rounded-md text-xs mb-0.5"
            style={deptFilter === "all" ? { background: "var(--c-accent-bg)", color: "#3b82f6" } : { color: "var(--c-text-3)" }}
          >
            All categories
          </button>
          {deptCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setDeptFilter(cat.name)}
              className="w-full text-left px-3 py-2 rounded-md text-xs mb-0.5 flex items-center gap-2"
              style={deptFilter === cat.name ? { background: "var(--c-accent-bg)", color: "#3b82f6" } : { color: "var(--c-text-3)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cat.color }} />
              {cat.name}
            </button>
          ))}
        </aside>

        {/* Main */}
        <main className="flex-1 p-6">
          {allLoading && !filtered.length ? (
            <div className="text-sm text-center mt-20" style={{ color: "var(--c-text-4)" }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-center mt-20" style={{ color: "var(--c-text-4)" }}>
              {allGpts.length === 0 ? "No GPTs found. Run the pipeline first." : "No GPTs match your search."}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs" style={{ color: "var(--c-text-4)" }}>
                  {isSearchMode
                    ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""} for "${search}" — click any card for details`
                    : `${filtered.length} GPTs — click any card for details`}
                </div>
                {searchLoading && (
                  <span className="text-xs animate-pulse" style={{ color: "#3b82f6" }}>Finding best matches…</span>
                )}
              </div>

              {isSearchMode ? (
                <div className="flex flex-col gap-4 max-w-3xl">
                  {(filtered as GPTSearchResult[]).map((g) => (
                    <RecommendationCard key={g.id} gpt={g} onClick={() => openDrawer(g)} />
                  ))}
                </div>
              ) : viewMode === "orgchart" ? (
                <OrgChartView gpts={filtered} onSelect={openDrawer} />
              ) : viewMode === "tree" ? (
                <TreeView gpts={filtered} onSelect={openDrawer} />
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {filtered.map((g) => (
                    <GPTCard key={g.id} gpt={g} onClick={() => openDrawer(g)} />
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
