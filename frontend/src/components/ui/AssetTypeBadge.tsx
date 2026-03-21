// Visual identity for each asset type. Add new types here as new providers are added.

export type AssetType = "gpt" | "project";

const TYPE_CONFIG: Record<AssetType, { label: string; color: string; bg: string }> = {
  gpt:     { label: "GPT",     color: "#8b5cf6", bg: "#8b5cf618" },
  project: { label: "Project", color: "#3b82f6", bg: "#3b82f618" },
};

export default function AssetTypeBadge({
  type,
  size = "sm",
}: {
  type: string;
  size?: "xs" | "sm";
}) {
  const cfg = TYPE_CONFIG[type as AssetType] ?? TYPE_CONFIG.gpt;
  return (
    <span
      style={{
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.color}35`,
        borderRadius: 4,
        padding: size === "xs" ? "0px 4px" : "1px 6px",
        fontSize: size === "xs" ? 9 : 10,
        fontWeight: 700,
        letterSpacing: "0.05em",
        flexShrink: 0,
        whiteSpace: "nowrap",
        lineHeight: 1.5,
      }}
    >
      {cfg.label}
    </span>
  );
}

// ── Type filter chips ─────────────────────────────────────────────────────────
// Shared UI for [ All ] [ GPTs ] [ Projects ] filter rows.
// Only renders when the dataset contains both types.

export type TypeFilter = "all" | "gpt" | "project";

export function TypeFilterChips({
  value,
  onChange,
  gptCount,
  projectCount,
}: {
  value: TypeFilter;
  onChange: (v: TypeFilter) => void;
  gptCount: number;
  projectCount: number;
}) {
  if (gptCount === 0 || projectCount === 0) return null;

  const opts: { key: TypeFilter; label: string; count: number; color: string }[] = [
    { key: "all",     label: "All",      count: gptCount + projectCount, color: "#6b7280" },
    { key: "gpt",     label: "GPTs",     count: gptCount,                color: "#8b5cf6" },
    { key: "project", label: "Projects", count: projectCount,            color: "#3b82f6" },
  ];

  return (
    <div className="flex gap-1.5">
      {opts.map(({ key, label, count, color }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className="text-xs px-2.5 py-1 rounded-lg font-medium transition-colors"
          style={
            value === key
              ? { background: color + "22", color, border: `1px solid ${color}55` }
              : { background: "var(--c-border)", color: "var(--c-text-4)", border: "1px solid transparent" }
          }
        >
          {label} <span style={{ opacity: 0.7 }}>({count})</span>
        </button>
      ))}
    </div>
  );
}

// ── Utility: filter a GPTItem[] by TypeFilter ─────────────────────────────────
import type { GPTItem } from "../../types";

export function filterByType(gpts: GPTItem[], filter: TypeFilter): GPTItem[] {
  if (filter === "all") return gpts;
  if (filter === "project") return gpts.filter((g) => g.asset_type === "project");
  return gpts.filter((g) => g.asset_type !== "project");
}
