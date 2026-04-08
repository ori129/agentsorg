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
import {
  useConversationHistory,
  useConversationStatus,
  useStartConversationPipeline,
} from "../../hooks/useConversations";
import type { SyncLog } from "../../types";

type Phase = "idle" | "assets" | "conversations" | "done";
const MIN_DISPLAY_MS = 3000;

const INTERVAL_OPTIONS = [
  { label: "Daily", hours: 24 },
  { label: "Weekly", hours: 168 },
  { label: "Monthly", hours: 720 },
];

const PRIVACY_LABELS: Record<number, string> = {
  0: "Off",
  1: "Counts only",
  2: "Anonymous",
  3: "Named users",
};

interface SyncPageProps {
  isAdmin?: boolean;
}

function statusBadge(status: SyncLog["status"]) {
  const map = {
    completed: { label: "Completed", bg: "#10b98120", color: "#10b981" },
    running: { label: "Running", bg: "#f59e0b20", color: "#f59e0b" },
    failed: { label: "Failed", bg: "#ef444420", color: "#ef4444" },
    budget_exceeded: { label: "Budget exceeded", bg: "#f59e0b20", color: "#f59e0b" },
  } as Record<string, { label: string; bg: string; color: string }>;
  const s = map[status] ?? { label: status, bg: "var(--c-border)", color: "var(--c-text-3)" };
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function formatDuration(start: string, end: string | null) {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatNextSync(lastSyncAt: string | null | undefined, intervalHours: number): string {
  if (!lastSyncAt) return "Next sync: scheduled";
  const next = new Date(new Date(lastSyncAt).getTime() + intervalHours * 3600 * 1000);
  if (next <= new Date()) return "Next sync: soon";
  return `Next sync: ${next.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
}

function formatTokens(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCost(usd: number | null | undefined): string {
  if (usd === null || usd === undefined) return "—";
  if (usd === 0) return "$0.00";
  if (usd < 0.001) return `$${usd.toFixed(6)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--c-text-5)" }}>
      {children}
    </div>
  );
}

export default function SyncPage({ isAdmin }: SyncPageProps) {
  const qc = useQueryClient();
  const runPipeline = useRunPipeline();
  const startConvPipeline = useStartConversationPipeline();
  const patchSyncConfig = usePatchSyncConfig();
  const { data: syncConfig } = useSyncConfig();

  const [phase, setPhase] = useState<Phase>("idle");
  const [syncLogId, setSyncLogId] = useState<number | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const runStartedAt = useRef(0);
  const mountCheckedRef = useRef(false);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const convStartedRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  const assetsPolling = phase === "assets";
  const convPolling = phase === "conversations";

  const { data: assetStatus } = usePipelineStatus(assetsPolling);
  const { data: convStatus } = useConversationStatus(convPolling);
  const { data: summary, refetch: refetchSummary } = usePipelineSummary();
  const { data: logs = [], refetch: refetchLogs } = usePipelineLogs(syncLogId, assetsPolling);
  const { data: assetHistory = [], refetch: refetchAssetHistory } = usePipelineHistory();
  const { data: convHistory = [], refetch: refetchConvHistory } = useConversationHistory();

  // Detect already-running asset pipeline on mount
  useEffect(() => {
    if (mountCheckedRef.current) return;
    if (assetStatus === undefined) return;
    mountCheckedRef.current = true;
    if (assetStatus.running) {
      setSyncLogId(assetStatus.sync_log_id);
      setPhase("assets");
      setShowLogs(true);
      runStartedAt.current = Date.now();
    }
  }, [assetStatus]);

  // Asset pipeline done → auto-start conversations
  useEffect(() => {
    if (phase !== "assets") return;
    if (assetStatus?.running !== false) return;
    if (convStartedRef.current) return;
    convStartedRef.current = true;

    const elapsed = Date.now() - runStartedAt.current;
    const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);

    phaseTimerRef.current = setTimeout(() => {
      refetchLogs();
      startConvPipeline.mutate(
        {},
        {
          onSuccess: () => {
            qc.setQueryData(["conversation-status"], {
              running: true,
              progress: 0,
              stage: "Starting conversation analysis...",
            });
            runStartedAt.current = Date.now();
            setPhase("conversations");
          },
          onError: () => {
            refetchSummary();
            refetchAssetHistory();
            setPhase("done");
          },
        }
      );
    }, remaining);
  }, [phase, assetStatus?.running, refetchLogs, refetchSummary, refetchAssetHistory, startConvPipeline, qc]);

  // Conversation pipeline done
  useEffect(() => {
    if (phase !== "conversations") return;
    if (convStatus?.running !== false) return;

    const elapsed = Date.now() - runStartedAt.current;
    const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);

    phaseTimerRef.current = setTimeout(() => {
      refetchSummary();
      refetchAssetHistory();
      refetchConvHistory();
      qc.invalidateQueries({ queryKey: ["conversation-overview"] });
      setPhase("done");
    }, remaining);
  }, [phase, convStatus?.running, refetchSummary, refetchAssetHistory, refetchConvHistory, qc]);

  useEffect(() => () => { if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current); }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleRun = useCallback(() => {
    convStartedRef.current = false;
    setShowLogs(true);
    runPipeline.mutate(undefined, {
      onSuccess: (data) => {
        setSyncLogId(data.sync_log_id);
        runStartedAt.current = Date.now();
        qc.setQueryData(["pipeline-status"], {
          running: true, progress: 0, stage: "Starting...", sync_log_id: data.sync_log_id,
        });
        setPhase("assets");
      },
    });
  }, [runPipeline, qc]);

  const handleAutoSyncToggle = useCallback((newVal: boolean) => {
    if (!syncConfig) return;
    qc.setQueryData(["sync-config"], { ...syncConfig, auto_sync_enabled: newVal });
    setConfigError(null);
    patchSyncConfig.mutate({ auto_sync_enabled: newVal }, {
      onError: () => {
        qc.setQueryData(["sync-config"], { ...syncConfig, auto_sync_enabled: !newVal });
        setConfigError("Failed to save — try again");
      },
    });
  }, [syncConfig, patchSyncConfig, qc]);

  const handleIntervalChange = useCallback((hours: number) => {
    if (!syncConfig) return;
    qc.setQueryData(["sync-config"], { ...syncConfig, auto_sync_interval_hours: hours });
    setConfigError(null);
    patchSyncConfig.mutate({ auto_sync_interval_hours: hours }, {
      onError: () => {
        qc.setQueryData(["sync-config"], syncConfig);
        setConfigError("Failed to save — try again");
      },
    });
  }, [syncConfig, patchSyncConfig, qc]);

  const isActive = phase === "assets" || phase === "conversations";
  const lastSync = summary?.last_sync;
  const autoEnabled = syncConfig?.auto_sync_enabled ?? false;
  const intervalHours = syncConfig?.auto_sync_interval_hours ?? 24;

  // Unified progress
  let overallProgress = 0;
  let overallStage = "";
  if (phase === "assets" && assetStatus) {
    overallProgress = assetStatus.progress * 0.5;
    overallStage = `Phase 1: Assets — ${assetStatus.stage}`;
  } else if (phase === "conversations" && convStatus) {
    overallProgress = 50 + convStatus.progress * 0.5;
    overallStage = `Phase 2: Conversations — ${convStatus.stage}`;
  } else if (phase === "done") {
    overallProgress = 100;
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--c-text)" }}>Sync</h2>
        <p className="text-sm mt-0.5" style={{ color: "var(--c-text-3)" }}>
          Sync all AI assets and analyze employee conversations from your workspace.
        </p>
      </div>

      {/* Run card */}
      <div className="rounded-xl p-5 space-y-4" style={{ background: "var(--c-surface)", border: "1px solid var(--c-border)" }}>

        {/* Phase pills */}
        {(isActive || phase === "done") && (
          <div className="flex items-center gap-2 text-xs">
            {[
              { key: "assets", label: "Phase 1: Assets", active: phase === "assets", done: phase === "conversations" || phase === "done" },
              { key: "conversations", label: "Phase 2: Conversations", active: phase === "conversations", done: phase === "done" },
            ].map((p) => (
              <span
                key={p.key}
                className="px-2.5 py-0.5 rounded-full font-medium"
                style={{
                  background: p.active ? "#3b82f620" : p.done ? "#10b98115" : "var(--c-border)",
                  color: p.active ? "#3b82f6" : p.done ? "#10b981" : "var(--c-text-5)",
                }}
              >
                {p.done ? "✓ " : ""}{p.label}
              </span>
            ))}
          </div>
        )}

        {/* Top row: status + Sync Now */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-medium" style={{ color: "var(--c-text)" }}>
              {phase === "assets"
                ? "Syncing assets..."
                : phase === "conversations"
                  ? "Analyzing conversations..."
                  : phase === "done"
                    ? "Sync complete"
                    : "Ready to sync"}
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
            {runPipeline.isPending ? "Starting..." : isActive ? "Running..." : "Sync Now"}
          </button>
        </div>

        {/* Auto-sync — admin only */}
        {isAdmin && syncConfig && (
          <div className="flex items-center gap-4 pt-3" style={{ borderTop: "1px solid var(--c-border)" }}>
            <span className="text-sm" style={{ color: "var(--c-text-3)" }}>Auto-sync</span>
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
            {autoEnabled && (
              <select
                value={intervalHours}
                onChange={(e) => handleIntervalChange(Number(e.target.value))}
                className="text-xs rounded-md px-2 py-1"
                style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)", color: "var(--c-text-3)" }}
              >
                {INTERVAL_OPTIONS.map((o) => (
                  <option key={o.hours} value={o.hours}>{o.label}</option>
                ))}
              </select>
            )}
            {configError && <span className="text-xs" style={{ color: "#ef4444" }}>{configError}</span>}
          </div>
        )}

        {runPipeline.isError && (
          <div className="text-xs rounded-lg px-3 py-2" style={{ background: "#ef444415", color: "#ef4444" }}>
            {(runPipeline.error as Error).message}
          </div>
        )}

        {/* Unified progress bar */}
        {isActive && (
          <div>
            <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--c-text-4)" }}>
              <span>{overallStage}</span>
              <span>{Math.round(overallProgress)}%</span>
            </div>
            <div className="w-full rounded-full h-1.5" style={{ background: "var(--c-border)" }}>
              <div
                className="h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${overallProgress}%`, background: "#3b82f6" }}
              />
            </div>
          </div>
        )}

        {/* Done banner */}
        {phase === "done" && summary && (
          <div className="rounded-lg px-4 py-3" style={{ background: "#10b98115", border: "1px solid #10b98130" }}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium" style={{ color: "#10b981" }}>
                Sync completed — {summary.filtered_gpts} assets · conversation analysis done
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

        {/* Asset logs */}
        {logs.length > 0 && showLogs && (
          <div
            className="rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs"
            style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}
          >
            {logs.map((entry) => (
              <div
                key={entry.id}
                className={`py-0.5 ${entry.level === "error" ? "text-red-400" : entry.level === "warn" ? "text-yellow-400" : "text-green-400"}`}
              >
                <span style={{ color: "var(--c-text-4)" }}>{new Date(entry.timestamp).toLocaleTimeString()}</span>{" "}
                <span className="uppercase">[{entry.level}]</span> {entry.message}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>

      {/* Asset Sync History */}
      <div>
        <SectionLabel>Asset Sync History</SectionLabel>
        {assetHistory.length === 0 ? (
          <div className="text-sm" style={{ color: "var(--c-text-4)" }}>No sync runs yet.</div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--c-border)" }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "var(--c-surface)", borderBottom: "1px solid var(--c-border)" }}>
                  {["Date", "Status", "Assets", "Avg Quality", "Champions", "Ghosts", "Tokens In", "Tokens Out", "Cost", "Duration"].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 font-medium" style={{ color: "var(--c-text-4)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assetHistory.map((run, i) => (
                  <tr
                    key={run.id}
                    style={{
                      borderBottom: i < assetHistory.length - 1 ? "1px solid var(--c-border)" : undefined,
                      background: i % 2 === 0 ? "var(--c-bg)" : "var(--c-surface)",
                    }}
                  >
                    <td className="px-3 py-2.5" style={{ color: "var(--c-text-3)" }}>{formatDate(run.started_at)}</td>
                    <td className="px-3 py-2.5">{statusBadge(run.status)}</td>
                    <td className="px-3 py-2.5" style={{ color: "var(--c-text-3)" }}>{run.total_asset_count || run.gpts_after_filter}</td>
                    <td className="px-3 py-2.5" style={{ color: run.avg_quality_score != null ? "#10b981" : "var(--c-text-5)" }}>
                      {run.avg_quality_score != null ? `${run.avg_quality_score.toFixed(1)}` : "—"}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: run.champion_count > 0 ? "#10b981" : "var(--c-text-5)" }}>
                      {run.champion_count || "—"}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: run.ghost_asset_count > 0 ? "#f59e0b" : "var(--c-text-5)" }}>
                      {run.ghost_asset_count || "—"}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--c-text-4)" }}>{formatTokens(run.tokens_input)}</td>
                    <td className="px-3 py-2.5" style={{ color: "var(--c-text-4)" }}>{formatTokens(run.tokens_output)}</td>
                    <td className="px-3 py-2.5" style={{ color: run.estimated_cost_usd ? "var(--c-text-3)" : "var(--c-text-5)" }}>{formatCost(run.estimated_cost_usd)}</td>
                    <td className="px-3 py-2.5" style={{ color: "var(--c-text-3)" }}>{formatDuration(run.started_at, run.finished_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Conversation Analysis History */}
      <div>
        <SectionLabel>Conversation Analysis History</SectionLabel>
        {convHistory.length === 0 ? (
          <div className="text-sm" style={{ color: "var(--c-text-4)" }}>No conversation analysis runs yet.</div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--c-border)" }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "var(--c-surface)", borderBottom: "1px solid var(--c-border)" }}>
                  {["Date", "Status", "Events", "Assets", "Privacy", "Tokens In", "Tokens Out", "Cost", "Duration", "Errors"].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 font-medium" style={{ color: "var(--c-text-4)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {convHistory.map((run, i) => (
                  <tr
                    key={run.id}
                    style={{
                      borderBottom: i < convHistory.length - 1 ? "1px solid var(--c-border)" : undefined,
                      background: i % 2 === 0 ? "var(--c-bg)" : "var(--c-surface)",
                    }}
                  >
                    <td className="px-3 py-2.5" style={{ color: "var(--c-text-3)" }}>{formatDate(run.started_at)}</td>
                    <td className="px-3 py-2.5">{statusBadge(run.status as SyncLog["status"])}</td>
                    <td className="px-3 py-2.5" style={{ color: "var(--c-text-3)" }}>{run.events_processed ?? run.events_fetched ?? "—"}</td>
                    <td className="px-3 py-2.5" style={{ color: "var(--c-text-3)" }}>{run.assets_covered ?? "—"}</td>
                    <td className="px-3 py-2.5" style={{ color: "var(--c-text-4)" }}>
                      {run.privacy_level != null ? (PRIVACY_LABELS[run.privacy_level] ?? run.privacy_level) : "—"}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--c-text-4)" }}>{formatTokens(run.tokens_input)}</td>
                    <td className="px-3 py-2.5" style={{ color: "var(--c-text-4)" }}>{formatTokens(run.tokens_output)}</td>
                    <td className="px-3 py-2.5" style={{ color: (run.actual_cost_usd ?? run.estimated_cost_usd) ? "var(--c-text-3)" : "var(--c-text-5)" }}>
                      {formatCost(run.actual_cost_usd ?? run.estimated_cost_usd)}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--c-text-3)" }}>{formatDuration(run.started_at, run.finished_at)}</td>
                    <td className="px-3 py-2.5">
                      {(run.errors?.length ?? 0) > 0
                        ? <span style={{ color: "#ef4444" }}>{run.errors?.length}</span>
                        : <span style={{ color: "#10b981" }}>0</span>}
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
