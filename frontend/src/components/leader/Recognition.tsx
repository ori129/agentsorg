import { useState } from "react";
import { useRecognition } from "../../hooks/useLearning";
import type { BuilderRecognition } from "../../api/learning";

type SortKey = "composite_score" | "quality_score" | "adoption_score" | "risk_hygiene_score" | "gpt_count";

const MEDALS = ["🥇", "🥈", "🥉"];

function ScoreRing({ score }: { score: number }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color =
    score >= 75 ? "#10b981" : score >= 50 ? "#3b82f6" : score >= 30 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={56} height={56} viewBox="0 0 56 56">
      <circle cx={28} cy={28} r={r} fill="none" strokeWidth={5} style={{ stroke: "var(--c-border)" }} />
      <circle
        cx={28}
        cy={28}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeDasharray={`${fill} ${circ - fill}`}
        strokeDashoffset={circ * 0.25}
        strokeLinecap="round"
      />
      <text x={28} y={33} textAnchor="middle" fontSize={12} fontWeight={700} fill={color}>
        {Math.round(score)}
      </text>
    </svg>
  );
}

function MiniBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span style={{ color: "var(--c-text-5)", width: 70, flexShrink: 0 }}>{label}</span>
      <div
        className="flex-1 rounded-full overflow-hidden"
        style={{ height: 5, background: "var(--c-border)" }}
      >
        <div
          style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 999 }}
        />
      </div>
      <span style={{ color: "var(--c-text-3)", width: 28, textAlign: "right" }}>
        {Math.round(value)}
      </span>
    </div>
  );
}

function PodiumCard({ builder, rank }: { builder: BuilderRecognition; rank: number }) {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3"
      style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)", flex: 1, minWidth: 0 }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm"
          style={{ background: "var(--c-accent-bg)", color: "#3b82f6", border: "1px solid var(--c-border)" }}
        >
          {(builder.name || builder.email).slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate" style={{ color: "var(--c-text-1)" }}>
            {MEDALS[rank]} {builder.name || builder.email.split("@")[0]}
          </div>
          <div className="text-xs truncate" style={{ color: "var(--c-text-5)" }}>
            {builder.email}
          </div>
        </div>
        <div className="ml-auto">
          <ScoreRing score={builder.composite_score} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <MiniBar label="Quality" value={builder.quality_score} color="#6366f1" />
        <MiniBar label="Adoption" value={builder.adoption_score} color="#3b82f6" />
        <MiniBar label="Risk hygiene" value={builder.risk_hygiene_score} color="#10b981" />
        <MiniBar label="Volume" value={builder.volume_score} color="#f59e0b" />
      </div>
      <div className="text-xs" style={{ color: "var(--c-text-5)" }}>
        {builder.gpt_count} GPT{builder.gpt_count !== 1 ? "s" : ""}
        {builder.avg_quality != null && (
          <> · avg quality {builder.avg_quality}/10</>
        )}
        {builder.avg_sophistication != null && (
          <> · soph {builder.avg_sophistication}/10</>
        )}
      </div>
    </div>
  );
}

const SORT_LABELS: Record<SortKey, string> = {
  composite_score: "Composite",
  quality_score: "Quality",
  adoption_score: "Adoption",
  risk_hygiene_score: "Risk hygiene",
  gpt_count: "GPT count",
};

export default function Recognition() {
  const { data: builders = [], isLoading } = useRecognition();
  const [sortKey, setSortKey] = useState<SortKey>("composite_score");

  const sorted = [...builders].sort((a, b) => b[sortKey] - a[sortKey]);
  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-2" style={{ color: "var(--c-text-5)" }}>
        <div className="animate-spin w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full" />
        Loading recognition data…
      </div>
    );
  }

  if (!builders.length) {
    return (
      <div className="p-8" style={{ color: "var(--c-text-5)" }}>
        No builders found. Run a sync to populate the registry.
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--c-text-1)" }}>
          Builder Recognition
        </h2>
        <p className="text-sm" style={{ color: "var(--c-text-5)" }}>
          Composite score = quality 35% · adoption 25% · risk hygiene 25% · volume 15%
        </p>
      </div>

      {/* Podium */}
      {top3.length > 0 && (
        <div className="flex gap-4 flex-wrap">
          {top3.map((b, i) => (
            <PodiumCard key={b.email} builder={b} rank={i} />
          ))}
        </div>
      )}

      {/* Full table */}
      {sorted.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: "1px solid var(--c-border)" }}
        >
          {/* Sort controls */}
          <div
            className="flex items-center gap-2 px-4 py-3 border-b"
            style={{ borderColor: "var(--c-border)", background: "var(--c-surface)" }}
          >
            <span className="text-xs" style={{ color: "var(--c-text-5)" }}>
              Sort by:
            </span>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setSortKey(k)}
                className="text-xs px-2 py-1 rounded"
                style={
                  sortKey === k
                    ? { background: "var(--c-accent-bg)", color: "#3b82f6" }
                    : { color: "var(--c-text-5)" }
                }
              >
                {SORT_LABELS[k]}
              </button>
            ))}
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-xs uppercase"
                style={{ color: "var(--c-text-5)", background: "var(--c-surface)" }}
              >
                <th className="px-4 py-2 text-left font-medium">#</th>
                <th className="px-4 py-2 text-left font-medium">Builder</th>
                <th className="px-4 py-2 text-right font-medium">Score</th>
                <th className="px-4 py-2 text-right font-medium">GPTs</th>
                <th className="px-4 py-2 text-right font-medium">Quality</th>
                <th className="px-4 py-2 text-right font-medium">Adoption</th>
                <th className="px-4 py-2 text-right font-medium">Hygiene</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((b, i) => (
                <tr
                  key={b.email}
                  className="border-t"
                  style={{ borderColor: "var(--c-border)" }}
                >
                  <td
                    className="px-4 py-2.5 text-xs"
                    style={{ color: "var(--c-text-5)" }}
                  >
                    {i + 1}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium" style={{ color: "var(--c-text-1)" }}>
                      {b.name || b.email.split("@")[0]}
                    </div>
                    <div className="text-xs" style={{ color: "var(--c-text-5)" }}>
                      {b.email}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className="font-bold"
                      style={{
                        color:
                          b.composite_score >= 75
                            ? "#10b981"
                            : b.composite_score >= 50
                            ? "#3b82f6"
                            : "#f59e0b",
                      }}
                    >
                      {b.composite_score}
                    </span>
                  </td>
                  <td
                    className="px-4 py-2.5 text-right"
                    style={{ color: "var(--c-text-3)" }}
                  >
                    {b.gpt_count}
                  </td>
                  <td
                    className="px-4 py-2.5 text-right"
                    style={{ color: "var(--c-text-3)" }}
                  >
                    {Math.round(b.quality_score)}
                  </td>
                  <td
                    className="px-4 py-2.5 text-right"
                    style={{ color: "var(--c-text-3)" }}
                  >
                    {Math.round(b.adoption_score)}
                  </td>
                  <td
                    className="px-4 py-2.5 text-right"
                    style={{ color: "var(--c-text-3)" }}
                  >
                    {Math.round(b.risk_hygiene_score)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
