import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  usePipelineHistory,
  usePipelineLogs,
  usePipelineStatus,
  usePipelineSummary,
  usePatchSyncConfig,
  useRunPipeline,
  useSyncConfig,
} from "../../hooks/usePipeline";
import type { SyncLog } from "../../types";

type Phase = "idle" | "running" | "finishing" | "done";
const MIN_DISPLAY_MS = 3000;

const INTERVAL_OPTIONS = [
  { label: "Daily", hours: 24 },
  { label: "Weekly", hours: 168 },
  { label: "Monthly", hours: 720 },
];

interface SyncPageProps {
  isAdmin?: boolean;
}

function statusBadge(status: SyncLog["status"]) {
  const map = {
    completed: { label: "Completed", bg: "#10b98120", color: "#10b981" },
    running: { label: "Running", bg: "#f59e0b20", color: "#f59e0b" },
    failed: { label: "Failed", bg: "#ef444420", color: "#ef4444" },
  };
  const s = map[status] ?? { label: status, bg: "var(--c-border)", color: "var(--c-text-3)" };
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
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNextSync(lastSyncAt: string | null | undefined, intervalHours: number): string {
  if (!lastSyncAt) return "Next sync: scheduled";
  const next = new Date(new Date(lastSyncAt).getTime() + intervalHours * 3600 * 1000);
  const now = new Date();
  if (next <= now) return "Next sync: soon";
  return `Next sync: ${next.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
}

function formatTokens(n: number): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCost(usd: number | null): string {
  if (usd === null || usd === undefined) return "—";
  if (usd === 0) return "$0.00";
  if (usd < 0.001) return `$${usd.toFixed(6)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

export default function SyncPage({ isAdmin }: SyncPageProps) {
  const qc = useQueryClient();
  const runPipeline = useRunPipeline();
  const patchSyncConfig = usePatchSyncConfig();
  const { data: syncConfig } = useSyncConfig();

  const [phase, setPhase] = useState<Phase>("idle");
  const [syncLogId, setSyncLogId] = useState<number | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const runStartedAt = useRef(0);
  const mountCheckedRef = useRef(false);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const polling = phase === "running" || phase === "finishing";
  const { data: status } = usePipelineStatus(polling);
  const { data: summary, refetch: refetchSummary } = usePipelineSummary();
  const { data: logs = [], refetch: refetchLogs } = usePipelineLogs(syncLogId, polling);
  const { data: history = [], refetch: refetchHistory } = usePipelineHistory();

  // Detect already-running pipeline on mount
  useEffect(() => {
    if (mountCheckedRef.current) return;
    if (status === undefined) return;
    mountCheckedRef.current = true;
    if (status.running) {
      setSyncLogId(status.sync_log_id);
      setPhase("running");
      setShowLogs(true);
      runStartedAt.current = Date.now();
    }
  }, [status]);

  // Completion detection
  useEffect(() => {
    if (phase !== "running") return;
    if (status?.running !== false) return;

    setPhase("finishing");
    const elapsed = Date.now() - runStartedAt.current;
    const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);

    finishTimerRef.current = setTimeout(() => {
      refetchLogs();
      refetchSummary();
      refetchHistory();
      setPhase("done");
    }, remaining);
  }, [phase, status?.running, refetchLogs, refetchSummary, refetchHistory]);

  useEffect(() => () => { if (finishTimerRef.current) clearTimeout(finishTimerRef.current); }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleRun = useCallback(() => {
    setPhase("idle");
    setShowLogs(true);
    runPipeline.mutate(undefined, {
      onSuccess: (data) => {
        setSyncLogId(data.sync_log_id);
        runStartedAt.current = Date.now();
        qc.setQueryData(["pipeline-status"], {
          running: true,
          progress: 0,
          stage: "Starting...",
          sync_log_id: data.sync_log_id,
        });
        setPhase("running");
      },
    });
  }, [runPipeline, qc]);

  const handleAutoSyncToggle = useCallback((newVal: boolean) => {
    if (!syncConfig) return;
    qc.setQueryData(["sync-config"], { ...syncConfig, auto_sync_enabled: newVal });
    setConfigError(null);
    patchSyncConfig.mutate(
      { auto_sync_enabled: newVal },
      {
        onError: () => {
          qc.setQueryData(["sync-config"], { ...syncConfig, auto_sync_enabled: !newVal });
          setConfigError("Failed to save — try again");
        },
      }
    );
  }, [syncConfig, patchSyncConfig, qc]);

  const handleIntervalChange = useCallback((hours: number) => {
    if (!syncConfig) return;
    qc.setQueryData(["sync-config"], { ...syncConfig, auto_sync_interval_hours: hours });
    setConfigError(null);
    patchSyncConfig.mutate(
      { auto_sync_interval_hours: hours },
      {
        onError: () => {
          qc.setQueryData(["sync-config"], syncConfig);
          setConfigError("Failed to save — try again");
        },
      }
    );
  }, [syncConfig, patchSyncConfig, qc]);

  const isActive = phase === "running" || phase === "finishing";
  const lastSync = summary?.last_sync;
  const autoEnabled = syncConfig?.auto_sync_enabled ?? false;
  const intervalHours = syncConfig?.auto_sync_interval_hours ?? 24;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--c-text)" }}>Sync</h2>
        <p className="text-sm mt-0.5" style={{ color: "var(--c-text-3)" }}>
          Fetch and classify all AI assets from your workspace.
        </p>
      </div>

      {/* Run card */}
      <div
        className="rounded-xl p-5 space-y-4"
        style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}
      >
        {/* Top row: status + Sync Now */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium" style={{ color: "var(--c-text)" }}>
              {isActive ? "Sync in progress" : phase === "done" ? "Sync complete" : "Ready to sync"}
            </div>
            {lastSync?.finished_at && phase === "idle" && (
              <div className="text-xs mt-0.5" style={{ color: "var(--c-text-4)" }}>
                Last run: {formatDate(lastSync.finished_at)} · {lastSync.gpts_after_filter} assets
              </div>
            )}
            {autoEnabled && phase === "idle" && (
              <div className="text-xs mt-0.5" style={{ color: "var(--c-text-5)" }}>
                {formatNextSync(lastSync?.finished_at, intervalHours)}
              </div>
            )}
          </div>
          <button
            onClick={handleRun}
            disabled={!isAdmin || runPipeline.isPending || isActive}
            className="px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-40 shrink-0"
            style={{ background: isActive ? "#6366f1" : "#3b82f6" }}
            title={!isAdmin ? "Only admins can run sync" : undefined}
          >
            {runPipeline.isPending
              ? "Starting..."
              : isActive
                ? "Running..."
                : "Sync Now"}
          </button>
        </div>

        {/* Auto-sync row — admin only */}
        {isAdmin && syncConfig && (
          <div
            className="flex items-center gap-4 pt-3"
            style={{ borderTop: "1px solid var(--c-border)" }}
          >
            <span className="text-sm" style={{ color: "var(--c-text-3)" }}>Auto-sync</span>

            {/* Toggle */}
            <button
              onClick={() => handleAutoSyncToggle(!autoEnabled)}
              className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
              style={{ background: autoEnabled ? "#3b82f6" : "var(--c-border)" }}
              aria-label={autoEnabled ? "Disable auto-sync" : "Enable auto-sync"}
            >
              <span
                className="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform"
                style={{ transform: autoEnabled ? "translateX(18px)" : "translateX(2px)" }}
              />
            </button>

            {/* Schedule dropdown */}
            {autoEnabled && (
              <select
                value={intervalHours}
                onChange={(e) => handleIntervalChange(Number(e.target.value))}
                className="text-xs rounded-md px-2 py-1"
                style={{
                  background: "var(--c-bg)",
                  border: "1px solid var(--c-border)",
                  color: "var(--c-text-3)",
                }}
              >
                {INTERVAL_OPTIONS.map((o) => (
                  <option key={o.hours} value={o.hours}>{o.label}</option>
                ))}
              </select>
            )}

            {configError && (
              <span className="text-xs" style={{ color: "#ef4444" }}>{configError}</span>
            )}
          </div>
        )}

        {runPipeline.isError && (
          <div className="text-xs rounded-lg px-3 py-2" style={{ background: "#ef444415", color: "#ef4444" }}>
            {(runPipeline.error as Error).message}
          </div>
        )}

        {/* Progress bar */}
        {isActive && status && (
          <div>
            <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--c-text-4)" }}>
              <span>{status.stage}</span>
              <span>{Math.round(status.progress)}%</span>
            </div>
            <div className="w-full rounded-full h-1.5" style={{ background: "var(--c-border)" }}>
              <div
                className="h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${status.progress}%`, background: "#3b82f6" }}
              />
            </div>
          </div>
        )}

        {/* Done banner */}
        {phase === "done" && summary && (
          <div className="rounded-lg px-4 py-3" style={{ background: "#10b98115", border: "1px solid #10b98130" }}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium" style={{ color: "#10b981" }}>
                Sync completed — {summary.filtered_gpts} assets
                {(summary.gpt_count > 0 || summary.project_count > 0) && (
                  <span className="text-xs font-normal ml-1.5" style={{ opacity: 0.8 }}>
                    ({summary.gpt_count} GPT{summary.gpt_count !== 1 ? "s" : ""}
                    {summary.project_count > 0 ? ` · ${summary.project_count} Project${summary.project_count !== 1 ? "s" : ""}` : ""})
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowLogs((s) => !s)}
                className="text-xs underline"
                style={{ color: "#10b981" }}
              >
                {showLogs ? "Hide logs" : "View logs"}
              </button>
            </div>
          </div>
        )}

        {/* Logs */}
        {logs.length > 0 && showLogs && (
          <div
            className="rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs"
            style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}
          >
            {logs.map((entry) => (
              <div
                key={entry.id}
                className={`py-0.5 ${
                  entry.level === "error"
                    ? "text-red-400"
                    : entry.level === "warn"
                      ? "text-yellow-400"
                      : "text-green-400"
                }`}
              >
                <span style={{ color: "var(--c-text-4)" }}>
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>{" "}
                <span className="uppercase">[{entry.level}]</span> {entry.message}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>

      {/* Sync history */}
      <div>
        <h3 className="text-sm font-medium mb-3" style={{ color: "var(--c-text)" }}>Sync History</h3>
        {history.length === 0 ? (
          <div className="text-sm" style={{ color: "var(--c-text-4)" }}>No sync runs yet.</div>
        ) : (
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--c-border)" }}
          >
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "var(--c-surface)", borderBottom: "1px solid var(--c-border)" }}>
                  {["Date", "Status", "Discovered", "After Filter", "Classified", "Tokens In", "Tokens Out", "Cost", "Duration", "Errors"].map((h) => (
                    <th
                      key={h}
                      className="text-left px-3 py-2.5 font-medium"
                      style={{ color: "var(--c-text-4)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((run, i) => (
                  <tr
                    key={run.id}
                    style={{
                      borderBottom: i < history.length - 1 ? "1px solid var(--c-border)" : undefined,
                      background: i % 2 === 0 ? "var(--c-bg)" : "var(--c-surface)",
                    }}
                  >
                    <td className="px-3 py-2.5" style={{ color: "var(--c-text-3)" }}>
                      {formatDate(run.started_at)}
                    </td>
                    <td className="px-3 py-2.5">{statusBadge(run.status)}</td>
                    <td className="px-3 py-2.5" style={{ color: "var(--c-text-3)" }}>
                      {run.total_gpts_found}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--c-text-3)" }}>
                      {run.gpts_after_filter}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--c-text-3)" }}>
                      {run.gpts_classified}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--c-text-4)" }}>
                      {formatTokens(run.tokens_input)}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--c-text-4)" }}>
                      {formatTokens(run.tokens_output)}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: run.estimated_cost_usd ? "var(--c-text-3)" : "var(--c-text-5)" }}>
                      {formatCost(run.estimated_cost_usd)}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--c-text-3)" }}>
                      {formatDuration(run.started_at, run.finished_at)}
                    </td>
                    <td className="px-3 py-2.5">
                      {run.errors.length > 0 ? (
                        <span style={{ color: "#ef4444" }}>{run.errors.length}</span>
                      ) : (
                        <span style={{ color: "#10b981" }}>0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
