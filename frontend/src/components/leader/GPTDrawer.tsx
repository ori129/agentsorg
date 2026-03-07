import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { GPTItem } from "../../types";

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

// ── GPT Detail Panel ─────────────────────────────────────────────────────────

function GPTDetail({ gpt, onBack }: { gpt: GPTItem; onBack: () => void }) {
  const tools = (gpt.tools ?? []) as { type: string }[];
  const riskStyle = gpt.risk_level ? RISK_STYLE[gpt.risk_level] : null;
  const riskFlags = (gpt.risk_flags ?? []) as string[];
  const promptFlags = (gpt.prompting_quality_flags ?? []) as string[];
  const integrations = (gpt.integration_flags ?? []) as string[];
  const starters = (gpt.conversation_starters ?? []) as string[];
  const cats = (gpt.builder_categories ?? []) as string[];

  return (
    <div className="flex flex-col h-full">
      <div className="p-5 shrink-0" style={{ borderBottom: "1px solid var(--c-border)" }}>
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs mb-3"
          style={{ color: "var(--c-text-4)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          ← Back to list
        </button>
        <h2 className="font-bold text-base leading-tight mb-1" style={{ color: "var(--c-text)" }}>
          {gpt.name}
        </h2>
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

      <div className="flex-1 overflow-y-auto p-5 space-y-0">
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

  // Reset pagination when search/sort changes
  useEffect(() => { setPage(1); }, [search, sort]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? filter.gpts.filter(
          (g) =>
            g.name?.toLowerCase().includes(q) ||
            g.owner_email?.toLowerCase().includes(q) ||
            g.builder_name?.toLowerCase().includes(q) ||
            g.business_process?.toLowerCase().includes(q) ||
            g.primary_category?.toLowerCase().includes(q)
        )
      : filter.gpts;
    return sortGpts(base, sort);
  }, [filter.gpts, search, sort]);

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
                ? `${filtered.length.toLocaleString()} of ${filter.gpts.length.toLocaleString()} GPTs`
                : `${filter.gpts.length.toLocaleString()} GPT${filter.gpts.length !== 1 ? "s" : ""}`}
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
        <div className="flex gap-1 mt-2">
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
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-sm text-center mt-20" style={{ color: "var(--c-text-4)" }}>
            {search ? `No GPTs matching "${search}"` : "No GPTs in this group."}
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
  filter: DrawerFilter | null;
  onClose: () => void;
}

export default function GPTDrawer({ filter, onClose }: GPTDrawerProps) {
  const [selected, setSelected] = useState<GPTItem | null>(null);

  useEffect(() => {
    setSelected(null);
  }, [filter]);

  if (!filter) return null;

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
        {selected ? (
          <GPTDetail gpt={selected} onBack={() => setSelected(null)} />
        ) : (
          <GPTListPanel filter={filter} onSelect={setSelected} onClose={onClose} />
        )}
      </div>
    </>,
    document.body
  );
}
