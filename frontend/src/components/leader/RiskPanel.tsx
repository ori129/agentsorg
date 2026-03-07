import { useState } from "react";
import type { GPTItem } from "../../types";
import GPTDrawer, { type DrawerFilter } from "./GPTDrawer";

interface RiskPanelProps { gpts: GPTItem[] }

const RISK_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const RISK_COLORS: Record<string, string> = {
  critical: "#8b5cf6", high: "#ef4444", medium: "#f59e0b", low: "#10b981",
};
const FLAG_LABELS: Record<string, string> = {
  accesses_hr_data: "HR Data", accesses_financial_data: "Financial Data",
  accesses_legal_data: "Legal Data", customer_data_exposure: "Customer Data",
  ip_exposure: "IP Exposure", output_used_externally: "External Output",
  impersonation_risk: "Impersonation", no_guardrails: "No Guardrails",
};

type RiskFilter = "all" | "critical" | "high" | "medium" | "low";

export default function RiskPanel({ gpts }: RiskPanelProps) {
  const [filter, setFilter] = useState<RiskFilter>("all");
  const [sortBy, setSortBy] = useState<"risk" | "name">("risk");
  const [drawer, setDrawer] = useState<DrawerFilter | null>(null);

  const hasEnrichment = gpts.some((g) => g.semantic_enriched_at);
  const enrichedGpts = gpts.filter((g) => g.semantic_enriched_at && g.risk_level);

  const mockGpts = hasEnrichment ? ([] as GPTItem[]) : ([
    { id: "m1", name: "HR Onboarding Guide (Compensation Access)", description: null, owner_email: "hrbp@acme.com", builder_name: "Lisa Chen", created_at: null, visibility: "invite-only", shared_user_count: 3, tools: [], builder_categories: ["hr"], primary_category: "HR", secondary_category: null, classification_confidence: null, llm_summary: null, use_case_description: null, instructions: null, risk_level: "critical", risk_flags: ["accesses_hr_data", "accesses_financial_data"], sophistication_score: 5, sophistication_rationale: null, prompting_quality_score: 4, prompting_quality_rationale: null, prompting_quality_flags: [], roi_potential_score: 5, roi_rationale: null, intended_audience: "HR Business Partners", integration_flags: ["Workday"], output_type: "document", adoption_friction_score: 2, adoption_friction_rationale: null, semantic_enriched_at: "2026-03-01T00:00:00Z", business_process: "employee onboarding" },
    { id: "m2", name: "Salesforce Deal Intelligence", description: null, owner_email: "sales.ops@acme.com", builder_name: "Marco Bianchi", created_at: null, visibility: "invite-only", shared_user_count: 12, tools: [], builder_categories: ["sales"], primary_category: "Sales", secondary_category: null, classification_confidence: null, llm_summary: null, use_case_description: null, instructions: null, risk_level: "high", risk_flags: ["customer_data_exposure", "accesses_financial_data"], sophistication_score: 5, sophistication_rationale: null, prompting_quality_score: 5, prompting_quality_rationale: null, prompting_quality_flags: [], roi_potential_score: 5, roi_rationale: null, intended_audience: "Sales team", integration_flags: ["Salesforce"], output_type: "analysis", adoption_friction_score: 3, adoption_friction_rationale: null, semantic_enriched_at: "2026-03-01T00:00:00Z", business_process: "deal qualification" },
    { id: "m3", name: "Legal Contract Risk Analyzer", description: null, owner_email: "legal@acme.com", builder_name: "Sophie Müller", created_at: null, visibility: "invite-only", shared_user_count: 4, tools: [], builder_categories: ["legal"], primary_category: "Legal", secondary_category: null, classification_confidence: null, llm_summary: null, use_case_description: null, instructions: null, risk_level: "high", risk_flags: ["accesses_legal_data", "ip_exposure"], sophistication_score: 5, sophistication_rationale: null, prompting_quality_score: 5, prompting_quality_rationale: null, prompting_quality_flags: [], roi_potential_score: 4, roi_rationale: null, intended_audience: "Legal team", integration_flags: [], output_type: "document", adoption_friction_score: 3, adoption_friction_rationale: null, semantic_enriched_at: "2026-03-01T00:00:00Z", business_process: "contract review" },
  ] as unknown as GPTItem[]);

  const displayGpts = hasEnrichment ? enrichedGpts : [...enrichedGpts, ...mockGpts];

  const filtered = displayGpts
    .filter((g) => filter === "all" || g.risk_level === filter)
    .sort((a, b) => {
      if (sortBy === "risk") return (RISK_ORDER[a.risk_level ?? "low"] ?? 3) - (RISK_ORDER[b.risk_level ?? "low"] ?? 3);
      return a.name.localeCompare(b.name);
    });

  const countByLevel = (level: string) => displayGpts.filter((g) => g.risk_level === level).length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <GPTDrawer filter={drawer} onClose={() => setDrawer(null)} />

      {!hasEnrichment && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg mb-5 text-sm"
          style={{ background: "#1c1200", border: "1px solid #78350f", color: "#f59e0b" }}>
          ⚠ Sample data — run pipeline with Classification enabled to see real risk analysis.
        </div>
      )}

      <h1 className="text-xl font-bold mb-2" style={{ color: "var(--c-text)" }}>Risk Panel</h1>
      <p className="text-sm mb-6" style={{ color: "var(--c-text-4)" }}>GPTs with sensitive data access or compliance exposure. Click any row to inspect.</p>

      <div className="flex gap-3 mb-6">
        {(["all", "critical", "high", "medium", "low"] as const).map((lvl) => {
          const count = lvl === "all" ? displayGpts.length : countByLevel(lvl);
          return (
            <button key={lvl} onClick={() => setFilter(lvl)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={filter === lvl
                ? { background: lvl === "all" ? "var(--c-accent-bg)" : RISK_COLORS[lvl] + "33", color: lvl === "all" ? "#3b82f6" : RISK_COLORS[lvl], border: `1px solid ${lvl === "all" ? "#3b82f6" : RISK_COLORS[lvl]}` }
                : { background: "var(--c-border)", color: "var(--c-text-3)", border: "1px solid var(--c-border)" }}>
              {lvl === "all" ? "All" : lvl.charAt(0).toUpperCase() + lvl.slice(1)} ({count})
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--c-text-4)" }}>Sort:</span>
          {(["risk", "name"] as const).map((s) => (
            <button key={s} onClick={() => setSortBy(s)}
              className="text-xs px-2 py-1 rounded"
              style={sortBy === s ? { background: "var(--c-accent-bg)", color: "#3b82f6" } : { color: "var(--c-text-4)" }}>
              {s === "risk" ? "Risk Level" : "Name"}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--c-border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--c-surface)", borderBottom: "1px solid var(--c-border)" }}>
              <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--c-text-4)" }}>GPT Name</th>
              <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--c-text-4)" }}>Risk Level</th>
              <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--c-text-4)" }}>Risk Flags</th>
              <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--c-text-4)" }}>Owner</th>
              <th className="text-left px-4 py-3 text-xs font-medium" style={{ color: "var(--c-text-4)" }}>Users</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g, idx) => (
              <tr key={g.id}
                style={{ background: idx % 2 === 0 ? "var(--c-bg)" : "var(--c-surface)", borderBottom: "1px solid var(--c-border)", cursor: "pointer" }}
                onClick={() => setDrawer({ label: g.name, gpts: [g] })}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-border)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? "var(--c-bg)" : "var(--c-surface)")}>
                <td className="px-4 py-3 font-medium text-sm" style={{ color: "var(--c-text)" }}>{g.name}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                    style={{ background: RISK_COLORS[g.risk_level ?? "low"] + "22", color: RISK_COLORS[g.risk_level ?? "low"] }}>
                    {g.risk_level ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(g.risk_flags ?? []).slice(0, 3).map((f) => (
                      <span key={f} className="px-1.5 py-0.5 rounded text-xs" style={{ background: "var(--c-border)", color: "var(--c-text-2)" }}>
                        {FLAG_LABELS[f as string] ?? f}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--c-text-3)" }}>{g.owner_email ?? "—"}</td>
                <td className="px-4 py-3 text-xs text-center" style={{ color: "var(--c-text-3)" }}>{g.shared_user_count}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: "var(--c-text-4)" }}>No GPTs match this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
