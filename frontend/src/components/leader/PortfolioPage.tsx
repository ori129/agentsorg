import { useMemo, useState } from "react";
import type { GPTItem } from "../../types";
import GPTDrawer, { type DrawerFilter } from "./GPTDrawer";
import AssetTypeBadge from "../ui/AssetTypeBadge";

interface PortfolioPageProps {
  gpts: GPTItem[];
}

type PortfolioTab = "all" | "health" | "ghost" | "risk";

// ── Helpers ────────────────────────────────────────────────────────────────

const QUADRANT_COLORS: Record<string, string> = {
  champion:              "#10b981",
  hidden_gem:           "#6366f1",
  scaled_risk:          "#f59e0b",
  retirement_candidate: "#6b7280",
};

const QUADRANT_LABELS: Record<string, string> = {
  champion:              "Champion",
  hidden_gem:           "Hidden Gem",
  scaled_risk:          "Scaled Risk",
  retirement_candidate: "Retirement",
};

const RISK_STYLE: Record<string, { bg: string; color: string }> = {
  low:      { bg: "#052e16", color: "#4ade80" },
  medium:   { bg: "#1c1200", color: "#f59e0b" },
  high:     { bg: "#1c0a00", color: "#f97316" },
  critical: { bg: "#1c0000", color: "#ef4444" },
};

// ── Asset row ──────────────────────────────────────────────────────────────

function AssetRow({ gpt, onClick }: { gpt: GPTItem; onClick: () => void }) {
  const riskStyle = gpt.risk_level ? RISK_STYLE[gpt.risk_level] : null;
  const quadrantColor = gpt.quadrant_label ? QUADRANT_COLORS[gpt.quadrant_label] : null;

  return (
    <tr
      className="cursor-pointer transition-colors"
      onClick={onClick}
      style={{ borderBottom: "1px solid var(--c-border)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-surface)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <AssetTypeBadge type={gpt.asset_type ?? "gpt"} size="xs" />
          <div>
            <div className="text-sm font-medium" style={{ color: "var(--c-text-1)" }}>{gpt.name}</div>
            {gpt.primary_category && (
              <div className="text-xs" style={{ color: "var(--c-text-5)" }}>{gpt.primary_category}</div>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: "var(--c-text-4)" }}>
        {gpt.owner_email ?? gpt.builder_name ?? "—"}
      </td>
      <td className="px-4 py-3 text-center">
        {gpt.quality_score != null ? (
          <span className="text-sm font-semibold" style={{ color: gpt.quality_score >= 60 ? "#10b981" : gpt.quality_score >= 40 ? "#f59e0b" : "#ef4444" }}>
            {gpt.quality_score.toFixed(0)}
          </span>
        ) : <span style={{ color: "var(--c-text-5)" }}>—</span>}
      </td>
      <td className="px-4 py-3 text-center">
        {gpt.adoption_score != null ? (
          <span className="text-sm font-semibold" style={{ color: gpt.adoption_score >= 60 ? "#10b981" : gpt.adoption_score >= 30 ? "#f59e0b" : "#ef4444" }}>
            {gpt.adoption_score.toFixed(0)}
          </span>
        ) : <span style={{ color: "var(--c-text-5)" }}>—</span>}
      </td>
      <td className="px-4 py-3 text-center">
        {gpt.risk_score != null ? (
          <span className="text-sm font-semibold" style={{ color: gpt.risk_score >= 60 ? "#ef4444" : gpt.risk_score >= 30 ? "#f59e0b" : "#10b981" }}>
            {gpt.risk_score.toFixed(0)}
          </span>
        ) : <span style={{ color: "var(--c-text-5)" }}>—</span>}
      </td>
      <td className="px-4 py-3">
        {quadrantColor && gpt.quadrant_label ? (
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: quadrantColor + "20", color: quadrantColor }}
          >
            {QUADRANT_LABELS[gpt.quadrant_label]}
          </span>
        ) : <span style={{ color: "var(--c-text-5)" }}>—</span>}
      </td>
      <td className="px-4 py-3 text-xs text-right" style={{ color: "var(--c-text-4)" }}>
        {gpt.shared_user_count}
      </td>
      <td className="px-4 py-3 text-xs text-right" style={{ color: "var(--c-text-4)" }}>
        {gpt.conversation_count > 0 ? gpt.conversation_count : <span style={{ color: "var(--c-text-5)" }}>0</span>}
      </td>
    </tr>
  );
}

// ── Health view (quadrant breakdown cards) ─────────────────────────────────

function HealthView({ gpts, onShowGroup }: {
  gpts: GPTItem[];
  onShowGroup: (filter: DrawerFilter) => void;
}) {
  const scored = gpts.filter((g) => g.quality_score != null);
  const groups = [
    {
      key: "champion",
      label: "Champions",
      desc: "High quality + high adoption. Showcase and replicate.",
      color: "#10b981",
      bg: "#052e16",
      items: scored.filter((g) => (g.quality_score ?? 0) >= 60 && (g.adoption_score ?? 0) >= 60),
    },
    {
      key: "hidden_gem",
      label: "Hidden Gems",
      desc: "High quality but underadopted. Promote these.",
      color: "#6366f1",
      bg: "#1e1b4b",
      items: scored.filter((g) => (g.quality_score ?? 0) >= 60 && (g.adoption_score ?? 0) < 60),
    },
    {
      key: "scaled_risk",
      label: "Scaled Risk",
      desc: "High adoption but low quality. Urgent quality review.",
      color: "#f59e0b",
      bg: "#1c1200",
      items: scored.filter((g) => (g.quality_score ?? 0) < 60 && (g.adoption_score ?? 0) >= 60),
    },
    {
      key: "retirement_candidate",
      label: "Retirement Candidates",
      desc: "Low quality + low adoption. Archive or rebuild.",
      color: "#6b7280",
      bg: "#111827",
      items: scored.filter((g) => (g.quality_score ?? 0) < 60 && (g.adoption_score ?? 0) < 60),
    },
  ];

  if (scored.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ height: 260 }}>
        <p className="text-sm" style={{ color: "var(--c-text-5)" }}>
          No scored assets yet — run the pipeline to assess your portfolio.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 p-6">
      {groups.map((g) => (
        <button
          key={g.key}
          onClick={() => onShowGroup({ label: g.label, gpts: g.items })}
          className="rounded-xl p-5 text-left transition-opacity hover:opacity-90"
          style={{ background: g.bg, border: `1px solid ${g.color}40`, cursor: "pointer" }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-sm" style={{ color: g.color }}>{g.label}</span>
            <span className="text-3xl font-bold" style={{ color: g.color }}>{g.items.length}</span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--c-text-4)" }}>{g.desc}</p>
          {g.items.slice(0, 3).map((item) => (
            <div key={item.id} className="mt-1 text-xs truncate" style={{ color: "var(--c-text-5)" }}>
              · {item.name}
            </div>
          ))}
          {g.items.length > 3 && (
            <div className="mt-1 text-xs" style={{ color: g.color }}>+ {g.items.length - 3} more</div>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Ghost assets view ──────────────────────────────────────────────────────

function GhostView({ gpts, onSelectGpt }: { gpts: GPTItem[]; onSelectGpt: (g: GPTItem) => void }) {
  const ghosts = gpts.filter((g) => g.conversation_count === 0 && g.shared_user_count >= 5);

  if (ghosts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12" style={{ color: "var(--c-text-5)" }}>
        <p className="text-2xl mb-2">👻</p>
        <p className="text-sm">No ghost assets. All shared assets have been used.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div
        className="flex items-start gap-3 px-4 py-3 rounded-lg mb-4 text-sm"
        style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}
      >
        <span style={{ color: "#f59e0b" }}>⚠</span>
        <p style={{ color: "var(--c-text-3)" }}>
          These {ghosts.length} assets are shared with 5+ users but have zero conversations. Click any asset to review it.
        </p>
      </div>
      <div className="space-y-2">
        {ghosts.map((g) => (
          <button
            key={g.id}
            onClick={() => onSelectGpt(g)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors text-left"
            style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", cursor: "pointer" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#f59e0b60")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--c-border)")}
          >
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--c-text-1)" }}>{g.name}</p>
              <p className="text-xs" style={{ color: "var(--c-text-5)" }}>
                Shared with {g.shared_user_count} users · {g.primary_category ?? "Uncategorized"}
              </p>
            </div>
            <div className="flex gap-2 text-xs items-center">
              <AssetTypeBadge type={g.asset_type ?? "gpt"} size="xs" />
              {g.top_action && (
                <span
                  className="px-2 py-0.5 rounded"
                  style={{ background: "#f59e0b20", color: "#f59e0b", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {g.top_action}
                </span>
              )}
              <span style={{ color: "var(--c-text-5)", fontSize: 10 }}>View →</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Risk view ──────────────────────────────────────────────────────────────

function RiskView({ gpts, onSelectGpt }: { gpts: GPTItem[]; onSelectGpt: (g: GPTItem) => void }) {
  const highRisk = gpts
    .filter((g) => g.risk_score != null && g.risk_score >= 50)
    .sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0));

  if (highRisk.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12" style={{ color: "var(--c-text-5)" }}>
        <p className="text-2xl mb-2">✓</p>
        <p className="text-sm">No high-risk assets detected. Portfolio risk looks healthy.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-2">
      {highRisk.map((g) => (
        <button
          key={g.id}
          onClick={() => onSelectGpt(g)}
          className="w-full rounded-lg p-4 text-left transition-colors"
          style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", cursor: "pointer" }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#ef444440")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--c-border)")}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: "var(--c-text-1)" }}>{g.name}</p>
              {g.risk_primary_driver && (
                <p className="text-xs mt-1" style={{ color: "var(--c-text-4)" }}>
                  ⚠ {g.risk_primary_driver}
                </p>
              )}
              {g.risk_score_rationale && (
                <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--c-text-5)" }}>
                  {g.risk_score_rationale}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <span
                className="text-lg font-bold"
                style={{ color: (g.risk_score ?? 0) >= 70 ? "#ef4444" : "#f59e0b" }}
              >
                {g.risk_score?.toFixed(0)}/100
              </span>
              {g.risk_urgency && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: g.risk_urgency === "high" ? "#ef444420" : "#f59e0b20",
                    color: g.risk_urgency === "high" ? "#ef4444" : "#f59e0b",
                  }}
                >
                  {g.risk_urgency} urgency
                </span>
              )}
              <span className="text-xs mt-1" style={{ color: "var(--c-text-5)" }}>View risk →</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── All assets table ────────────────────────────────────────────────────────

type SortCol = "name" | "quality" | "adoption" | "risk" | "users" | "conversations";

function AllAssetsTable({ gpts }: { gpts: GPTItem[] }) {
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<SortCol>("quality");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [drawerFilter, setDrawerFilter] = useState<DrawerFilter | null>(null);
  const [selectedGpt, setSelectedGpt] = useState<GPTItem | null>(null);

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("desc"); }
  };

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    let base = q
      ? gpts.filter((g) => g.name.toLowerCase().includes(q) || (g.owner_email ?? "").toLowerCase().includes(q) || (g.primary_category ?? "").toLowerCase().includes(q))
      : [...gpts];

    base.sort((a, b) => {
      let diff = 0;
      if (sortCol === "name") diff = a.name.localeCompare(b.name);
      else if (sortCol === "quality") diff = (a.quality_score ?? -1) - (b.quality_score ?? -1);
      else if (sortCol === "adoption") diff = (a.adoption_score ?? -1) - (b.adoption_score ?? -1);
      else if (sortCol === "risk") diff = (a.risk_score ?? -1) - (b.risk_score ?? -1);
      else if (sortCol === "users") diff = a.shared_user_count - b.shared_user_count;
      else if (sortCol === "conversations") diff = a.conversation_count - b.conversation_count;
      return sortDir === "asc" ? diff : -diff;
    });
    return base;
  }, [gpts, search, sortCol, sortDir]);

  const SortHeader = ({ col, label, align = "left" }: { col: SortCol; label: string; align?: string }) => (
    <th
      className="px-4 py-3 text-xs font-medium cursor-pointer select-none"
      style={{
        color: sortCol === col ? "#3b82f6" : "var(--c-text-5)",
        textAlign: align as "left" | "right" | "center",
        whiteSpace: "nowrap",
      }}
      onClick={() => handleSort(col)}
    >
      {label} {sortCol === col ? (sortDir === "desc" ? "↓" : "↑") : ""}
    </th>
  );

  return (
    <>
      <div className="px-6 py-4 flex items-center gap-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
        <input
          type="text"
          placeholder="Search assets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg px-3 py-2 text-xs outline-none"
          style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", color: "var(--c-text)", width: 240 }}
        />
        <span className="text-xs" style={{ color: "var(--c-text-5)" }}>{sorted.length} assets</span>
      </div>

      <div className="overflow-auto flex-1">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead style={{ background: "var(--c-surface)", position: "sticky", top: 0 }}>
            <tr>
              <SortHeader col="name" label="Asset" />
              <th className="px-4 py-3 text-xs" style={{ color: "var(--c-text-5)", textAlign: "left" }}>Owner</th>
              <SortHeader col="quality" label="Quality" align="center" />
              <SortHeader col="adoption" label="Adoption" align="center" />
              <SortHeader col="risk" label="Risk" align="center" />
              <th className="px-4 py-3 text-xs" style={{ color: "var(--c-text-5)" }}>Quadrant</th>
              <SortHeader col="users" label="Users" align="right" />
              <SortHeader col="conversations" label="Convos" align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((g) => (
              <AssetRow key={g.id} gpt={g} onClick={() => setSelectedGpt(g)} />
            ))}
          </tbody>
        </table>
      </div>

      {selectedGpt && (
        <GPTDrawer gpt={selectedGpt} onClose={() => setSelectedGpt(null)} />
      )}
    </>
  );
}

// ── Main PortfolioPage ──────────────────────────────────────────────────────

export default function PortfolioPage({ gpts }: PortfolioPageProps) {
  const [tab, setTab] = useState<PortfolioTab>("all");
  const [drawerFilter, setDrawerFilter] = useState<DrawerFilter | null>(null);
  const [selectedGpt, setSelectedGpt] = useState<GPTItem | null>(null);

  const TABS: { id: PortfolioTab; label: string; badge?: number }[] = [
    { id: "all",    label: "All Assets",  badge: gpts.length },
    { id: "health", label: "Health",      badge: gpts.filter((g) => g.quality_score != null).length },
    { id: "ghost",  label: "Ghost Assets", badge: gpts.filter((g) => g.conversation_count === 0 && g.shared_user_count >= 5).length },
    { id: "risk",   label: "Risk",        badge: gpts.filter((g) => (g.risk_score ?? 0) >= 50).length },
  ];

  return (
    <div className="flex flex-col" style={{ height: "100%" }}>
      {/* Tab bar */}
      <div className="flex border-b px-6" style={{ borderColor: "var(--c-border)", background: "var(--c-bg)", flexShrink: 0 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-4 py-3 text-sm"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              borderBottom: tab === t.id ? "2px solid #3b82f6" : "2px solid transparent",
              color: tab === t.id ? "#3b82f6" : "var(--c-text-3)",
              marginBottom: -1,
            }}
          >
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{
                  background: tab === t.id ? "#3b82f620" : "var(--c-border)",
                  color: tab === t.id ? "#3b82f6" : "var(--c-text-5)",
                }}
              >
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "all"    && <AllAssetsTable gpts={gpts} />}
        {tab === "health" && <HealthView gpts={gpts} onShowGroup={(f) => setDrawerFilter(f)} />}
        {tab === "ghost"  && <GhostView gpts={gpts} onSelectGpt={setSelectedGpt} />}
        {tab === "risk"   && <RiskView gpts={gpts} onSelectGpt={setSelectedGpt} />}
      </div>

      {/* Drawer from health group click */}
      <GPTDrawer filter={drawerFilter} onClose={() => setDrawerFilter(null)} />
      {/* Drawer for direct asset selection (ghost / risk views) */}
      <GPTDrawer gpt={selectedGpt} onClose={() => setSelectedGpt(null)} />
    </div>
  );
}
