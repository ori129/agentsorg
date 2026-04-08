import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useConversationEstimate,
  useConversationHistory,
  useConversationStatus,
  usePatchConversationConfig,
  useStartConversationPipeline,
} from "../../hooks/useConversations";
import type { ConversationSyncLog } from "../../types";

const PRIVACY_LABELS: Record<number, string> = {
  0: "Off",
  1: "Counts only (free)",
  2: "Anonymous topics ($)",
  3: "Named user analysis ($$)",
};

function statusBadge(status: string) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    completed: { label: "Completed", bg: "#10b98120", color: "#10b981" },
    running: { label: "Running", bg: "#f59e0b20", color: "#f59e0b" },
    budget_exceeded: { label: "Budget exceeded", bg: "#ef444420", color: "#ef4444" },
    skipped: { label: "Skipped (Off)", bg: "#94a3b820", color: "#94a3b8" },
    error: { label: "Error", bg: "#ef444420", color: "#ef4444" },
  };
  const s = map[status] ?? {
    label: status,
    bg: "var(--c-border)",
    color: "var(--c-text-3)",
  };
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

function formatDuration(start: string, end: string | null) {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STAGE_LABELS: Record<string, string> = {
  prerequisites: "Checking prerequisites",
  stage1_fetch: "Fetching conversation logs",
  stage2_aggregate: "Aggregating counts",
  stage3_topics: "Analyzing topics (LLM)",
  stage4_users: "Analyzing user patterns",
  stage5_commit: "Saving results",
  done: "Done",
  mock_stage1_fetch: "Generating mock data",
  mock_stage5_commit: "Saving results",
};

interface ConversationSyncPageProps {
  isAdmin?: boolean;
}

export default function ConversationSyncPage({ isAdmin = true }: ConversationSyncPageProps) {
  const [privacyLevel, setPrivacyLevel] = useState(3);
  const [dateRangeDays, setDateRangeDays] = useState(30);
  const [tokenBudget, setTokenBudget] = useState(10.0);
  const [assetScopeMode, setAssetScopeMode] = useState<"all" | "select">("all");
  const [justTriggered, setJustTriggered] = useState(false);

  const qc = useQueryClient();
  const prevRunning = useRef(false);

  // Poll at 500ms when justTriggered (catch fast mock pipelines), 2s otherwise
  const { data: status } = useConversationStatus(justTriggered ? 500 : true);
  const isRunning = status?.running ?? false;

  const { data: history = [], refetch: refetchHistory } = useConversationHistory(20);
  const { data: estimate } = useConversationEstimate(dateRangeDays, privacyLevel);
  const startPipeline = useStartConversationPipeline();
  const patchConfig = usePatchConversationConfig();

  const prerequisiteMet = estimate?.prerequisite_met ?? true;

  // When pipeline transitions from running → done, refresh history
  useEffect(() => {
    if (prevRunning.current && !isRunning) {
      refetchHistory();
      setJustTriggered(false);
    }
    prevRunning.current = isRunning;
  }, [isRunning, refetchHistory]);

  // Safety net: if justTriggered but status never went running (pipeline too fast),
  // refresh history after 3 seconds
  useEffect(() => {
    if (!justTriggered) return;
    const t = setTimeout(() => {
      refetchHistory();
      qc.invalidateQueries({ queryKey: ["conversation-status"] });
      setJustTriggered(false);
    }, 3000);
    return () => clearTimeout(t);
  }, [justTriggered, refetchHistory, qc]);

  function handleRun() {
    patchConfig.mutate({
      conversation_privacy_level: privacyLevel,
      conversation_date_range_days: dateRangeDays,
      conversation_token_budget_usd: tokenBudget,
    });
    setJustTriggered(true);
    startPipeline.mutate({});
  }


  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div>
        <h1
          className="text-2xl font-semibold mb-1"
          style={{ color: "var(--c-text-1)" }}
        >
          Conversation Analysis
        </h1>
        <p className="text-sm" style={{ color: "var(--c-text-3)" }}>
          Analyze how employees actually use GPTs and Projects — what they ask, how
          often, and where knowledge gaps exist.
        </p>
      </div>

      {/* Prerequisite banner */}
      {!prerequisiteMet && (
        <div
          className="flex items-start gap-3 p-4 rounded-lg border"
          style={{ background: "#f59e0b10", borderColor: "#f59e0b40" }}
        >
          <span style={{ color: "#f59e0b" }}>⚠</span>
          <div>
            <p className="font-medium text-sm" style={{ color: "#f59e0b" }}>
              Asset sync required first
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--c-text-3)" }}>
              Run the Asset Sync pipeline before analyzing conversations. Conversation
              analysis requires synced GPTs and Projects.
            </p>
          </div>
        </div>
      )}

      {/* Config panel */}
      {isAdmin && (
        <div
          className="rounded-xl p-5 flex flex-col gap-4"
          style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
        >
          <h2 className="font-medium" style={{ color: "var(--c-text-1)" }}>
            Configuration
          </h2>

          {/* Privacy level */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: "var(--c-text-2)" }}>
              Privacy level
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map((level) => (
                <button
                  key={level}
                  onClick={() => setPrivacyLevel(level)}
                  className="text-left px-3 py-2 rounded-lg text-sm transition-all"
                  style={{
                    background:
                      privacyLevel === level
                        ? "#3b82f620"
                        : "var(--c-bg)",
                    border: `1px solid ${
                      privacyLevel === level
                        ? "#3b82f6"
                        : "var(--c-border)"
                    }`,
                    color:
                      privacyLevel === level
                        ? "#3b82f6"
                        : "var(--c-text-2)",
                  }}
                >
                  {level}: {PRIVACY_LABELS[level]}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="flex gap-4">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs font-medium" style={{ color: "var(--c-text-2)" }}>
                Date range
              </label>
              <select
                value={dateRangeDays}
                onChange={(e) => setDateRangeDays(Number(e.target.value))}
                className="px-3 py-2 rounded-lg text-sm"
                style={{
                  background: "var(--c-bg)",
                  border: "1px solid var(--c-border)",
                  color: "var(--c-text-1)",
                }}
              >
                {[7, 14, 30, 60, 90].map((d) => (
                  <option key={d} value={d}>
                    Last {d} days
                  </option>
                ))}
              </select>
            </div>

            {/* Token budget */}
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs font-medium" style={{ color: "var(--c-text-2)" }}>
                Token budget cap (USD)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={tokenBudget}
                onChange={(e) => setTokenBudget(Number(e.target.value))}
                className="px-3 py-2 rounded-lg text-sm"
                style={{
                  background: "var(--c-bg)",
                  border: "1px solid var(--c-border)",
                  color: "var(--c-text-1)",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Cost estimate panel */}
      {estimate && prerequisiteMet && (
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
        >
          <h2 className="font-medium mb-3" style={{ color: "var(--c-text-1)" }}>
            Pre-run estimate
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-bold" style={{ color: "var(--c-text-1)" }}>
                {estimate.assets_to_analyze}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--c-text-3)" }}>
                assets to analyze
                {estimate.assets_unchanged > 0 && (
                  <span className="ml-1">
                    ({estimate.assets_unchanged} unchanged)
                  </span>
                )}
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold" style={{ color: "var(--c-text-1)" }}>
                {estimate.estimated_tokens.toLocaleString()}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--c-text-3)" }}>
                est. tokens
              </p>
            </div>
            <div>
              <p
                className="text-2xl font-bold"
                style={{
                  color:
                    estimate.estimated_cost_usd > tokenBudget
                      ? "#ef4444"
                      : "var(--c-text-1)",
                }}
              >
                ${estimate.estimated_cost_usd.toFixed(3)}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--c-text-3)" }}>
                est. cost
                {estimate.estimated_cost_usd > tokenBudget && (
                  <span className="ml-1 text-red-400"> (exceeds budget)</span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Run button + progress */}
      {isRunning && status ? (
        <div
          className="rounded-xl p-5"
          style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="font-medium text-sm" style={{ color: "var(--c-text-1)" }}>
              {STAGE_LABELS[status.stage] ?? status.stage}
            </p>
            <p className="text-sm" style={{ color: "var(--c-text-3)" }}>
              {status.assets_done} / {status.assets_total} assets
            </p>
          </div>
          <div
            className="w-full rounded-full overflow-hidden"
            style={{ height: 8, background: "var(--c-border)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${status.progress}%`,
                background: "#3b82f6",
              }}
            />
          </div>
          <p className="text-xs mt-2" style={{ color: "var(--c-text-3)" }}>
            {status.progress}% complete
          </p>
        </div>
      ) : (
        <button
          onClick={handleRun}
          disabled={!prerequisiteMet || isRunning || justTriggered}
          className="self-start px-5 py-2.5 rounded-lg font-medium text-sm transition-all"
          style={{
            background: prerequisiteMet ? "#3b82f6" : "var(--c-border)",
            color: prerequisiteMet ? "white" : "var(--c-text-3)",
            opacity: isRunning || justTriggered ? 0.7 : 1,
            cursor: !prerequisiteMet || isRunning || justTriggered ? "not-allowed" : "pointer",
          }}
        >
          {justTriggered ? "Starting…" : isRunning ? "Running…" : "Run Conversation Analysis"}
        </button>
      )}

      {/* Sync history */}
      {history.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: "1px solid var(--c-border)" }}
        >
          <div
            className="px-4 py-3 border-b"
            style={{
              background: "var(--c-surface)",
              borderColor: "var(--c-border)",
            }}
          >
            <h2 className="font-medium text-sm" style={{ color: "var(--c-text-1)" }}>
              Sync history
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--c-bg)" }}>
                  {[
                    "Date",
                    "Status",
                    "Duration",
                    "Events",
                    "Assets analyzed",
                    "Skipped",
                    "Cost",
                    "Privacy",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2 text-left text-xs font-medium whitespace-nowrap"
                      style={{ color: "var(--c-text-3)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((log: ConversationSyncLog) => (
                  <tr
                    key={log.id}
                    style={{ borderTop: "1px solid var(--c-border)" }}
                  >
                    <td
                      className="px-4 py-2 whitespace-nowrap"
                      style={{ color: "var(--c-text-2)" }}
                    >
                      {formatDate(log.started_at)}
                    </td>
                    <td className="px-4 py-2">{statusBadge(log.status)}</td>
                    <td
                      className="px-4 py-2"
                      style={{ color: "var(--c-text-3)" }}
                    >
                      {formatDuration(log.started_at, log.finished_at)}
                    </td>
                    <td
                      className="px-4 py-2"
                      style={{ color: "var(--c-text-2)" }}
                    >
                      {log.events_processed.toLocaleString()}
                    </td>
                    <td
                      className="px-4 py-2"
                      style={{ color: "var(--c-text-2)" }}
                    >
                      {log.assets_analyzed}
                    </td>
                    <td
                      className="px-4 py-2"
                      style={{ color: "var(--c-text-3)" }}
                    >
                      {log.assets_skipped_unchanged}
                    </td>
                    <td
                      className="px-4 py-2"
                      style={{ color: "var(--c-text-2)" }}
                    >
                      {log.actual_cost_usd != null
                        ? `$${log.actual_cost_usd.toFixed(3)}`
                        : "—"}
                    </td>
                    <td
                      className="px-4 py-2"
                      style={{ color: "var(--c-text-3)" }}
                    >
                      {log.privacy_level != null
                        ? PRIVACY_LABELS[log.privacy_level] ?? log.privacy_level
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
