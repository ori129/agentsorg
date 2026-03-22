export type LeaderPage =
  | "overview"
  | "overview:builders"
  | "overview:processes"
  | "overview:departments"
  | "overview:maturity"
  | "overview:output-types"
  | "enrichment"
  | "sync"
  | "risk"
  | "standardization"
  | "quality"
  | "recognition"
  | "learning"
  | "workshops"
  | "users";

interface SidebarProps {
  page: LeaderPage;
  onSetPage: (p: LeaderPage) => void;
  riskCount?: number;
  clusterCount?: number;
  enrichmentPct?: number;
  isAdmin?: boolean;
}

type NavItem =
  | { id: LeaderPage; label: string; sub?: false }
  | { id: LeaderPage; label: string; sub: true };

const SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "",
    items: [
      { id: "overview", label: "Overview" },
      { id: "overview:builders", label: "Builders", sub: true },
      { id: "overview:processes", label: "Processes", sub: true },
      { id: "overview:departments", label: "Departments", sub: true },
      { id: "overview:maturity", label: "Maturity", sub: true },
      { id: "overview:output-types", label: "Output Types", sub: true },
    ],
  },
  {
    label: "Governance",
    items: [
      { id: "risk", label: "Risk Panel" },
      { id: "standardization", label: "Standardization" },
      { id: "quality", label: "Quality Scores" },
    ],
  },
  {
    label: "Learning & Development",
    items: [
      { id: "recognition", label: "Recognition" },
      { id: "learning", label: "Learning" },
      { id: "workshops", label: "Workshops" },
    ],
  },
  {
    label: "Settings",
    items: [
      { id: "sync", label: "Sync" },
      { id: "enrichment", label: "Pipeline Setup" },
      { id: "users", label: "Users" },
    ],
  },
];

export default function Sidebar({
  page,
  onSetPage,
  riskCount,
  clusterCount,
  enrichmentPct,
  isAdmin,
}: SidebarProps) {
  const getBadge = (id: LeaderPage): { value: string | number; color: string } | null => {
    if (id === "risk" && riskCount !== undefined && riskCount > 0)
      return { value: riskCount, color: "#ef4444" };
    if (id === "standardization" && clusterCount !== undefined && clusterCount > 0)
      return { value: clusterCount, color: "#f59e0b" };
    if (id === "enrichment" && enrichmentPct !== undefined) {
      const color =
        enrichmentPct >= 70 ? "#10b981" : enrichmentPct >= 30 ? "#f59e0b" : "#ef4444";
      return { value: `${Math.round(enrichmentPct)}%`, color };
    }
    return null;
  };

  const isOverviewActive = page === "overview" || page.startsWith("overview:");

  return (
    <aside
      className="flex flex-col py-6 px-4"
      style={{
        width: 220,
        minWidth: 220,
        background: "var(--c-surface)",
        borderRight: "1px solid var(--c-border)",
      }}
    >
      {SECTIONS.filter((s) => s.label !== "Settings" || isAdmin).map((section) => (
        <div key={section.label} className="mb-6">
          {section.label && (
            <div
              className="text-xs uppercase tracking-widest mb-2 px-2"
              style={{ color: "var(--c-text-5)" }}
            >
              {section.label}
            </div>
          )}
          {section.items.map((item) => {
            const badge = getBadge(item.id);
            const isActive =
              item.id === "overview"
                ? isOverviewActive && page === "overview"
                : page === item.id;
            const isSub = item.sub === true;

            return (
              <button
                key={item.id}
                onClick={() => onSetPage(item.id)}
                className="w-full flex items-center justify-between rounded-md text-sm transition-colors mb-0.5"
                style={{
                  paddingLeft: isSub ? 20 : 12,
                  paddingRight: 12,
                  paddingTop: isSub ? 4 : 8,
                  paddingBottom: isSub ? 4 : 8,
                  ...(isActive
                    ? { background: "var(--c-accent-bg)", color: "#3b82f6" }
                    : { color: isSub ? "var(--c-text-5)" : "var(--c-text-3)" }),
                }}
              >
                <span className="flex items-center gap-1.5">
                  {isSub && (
                    <span style={{ color: "inherit", opacity: 0.5, fontSize: 10 }}>·</span>
                  )}
                  <span style={{ fontSize: isSub ? "0.7rem" : undefined }}>{item.label}</span>
                </span>
                {badge && (
                  <span
                    className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: badge.color + "25", color: badge.color }}
                  >
                    {badge.value}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
