import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Card from "../layout/Card";
import {
  usePipelineGPTs,
  usePipelineLogs,
  usePipelineStatus,
  usePipelineSummary,
  useRunPipeline,
} from "../../hooks/usePipeline";
import {
  useConversationStatus,
  useStartConversationPipeline,
} from "../../hooks/useConversations";

// Overall phases: idle → assets → conversations → done
type Phase = "idle" | "assets" | "conversations" | "done";

const MIN_DISPLAY_MS = 4000;

interface Step4Props {
  onViewResults: () => void;
  onComplete?: () => void;
}

export default function Step4FetchClassify({ onViewResults, onComplete }: Step4Props) {
  const qc = useQueryClient();
  const runPipeline = useRunPipeline();
  const startConvPipeline = useStartConversationPipeline();

  const [phase, setPhase] = useState<Phase>("idle");
  const [syncLogId, setSyncLogId] = useState<number | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const runStartedAt = useRef(0);
  const mountCheckedRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // prevent double-triggering conversation pipeline
  const convStartedRef = useRef(false);

  const assetsPolling = phase === "assets";
  const convPolling = phase === "conversations";

  const { data: assetStatus } = usePipelineStatus(assetsPolling);
  const { data: convStatus } = useConversationStatus(convPolling);
  const { data: summary, refetch: refetchSummary } = usePipelineSummary();
  const { data: logs = [], refetch: refetchLogs } = usePipelineLogs(syncLogId, assetsPolling);
  const { data: gpts = [], refetch: refetchGPTs } = usePipelineGPTs();

  // --- Mount check: detect already-running asset pipeline ---
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

  // --- Asset pipeline completion → auto-start conversations ---
  useEffect(() => {
    if (phase !== "assets") return;
    if (assetStatus?.running !== false) return;
    if (convStartedRef.current) return;
    convStartedRef.current = true;

    const elapsed = Date.now() - runStartedAt.current;
    const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);

    phaseTimerRef.current = setTimeout(() => {
      refetchLogs();
      // Start conversation pipeline
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
            // Conversation pipeline failed to start — still mark as done
            refetchSummary();
            refetchGPTs();
            setPhase("done");
          },
        }
      );
    }, remaining);
  }, [phase, assetStatus?.running, refetchLogs, refetchSummary, refetchGPTs, startConvPipeline, qc]);

  // --- Conversation pipeline completion ---
  useEffect(() => {
    if (phase !== "conversations") return;
    if (convStatus?.running !== false) return;

    const elapsed = Date.now() - runStartedAt.current;
    const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);

    phaseTimerRef.current = setTimeout(() => {
      refetchSummary();
      refetchGPTs();
      qc.invalidateQueries({ queryKey: ["conversation-overview"] });
      qc.invalidateQueries({ queryKey: ["conversation-history"] });
      setPhase("done");
    }, remaining);
  }, [phase, convStatus?.running, refetchSummary, refetchGPTs, qc]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (phaseTimerRef.current) clearTimeout(phaseTimerRef.current);
    };
  }, []);

  // Auto-scroll logs
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
          running: true,
          progress: 0,
          stage: "Starting...",
          sync_log_id: data.sync_log_id,
        });
        setPhase("assets");
      },
    });
  }, [runPipeline, qc]);

  const isActive = phase === "assets" || phase === "conversations";
  const hasExistingGPTs = phase === "idle" && gpts.length > 0;

  // Compute unified 0–100% progress
  let overallProgress = 0;
  let overallStage = "";
  if (phase === "assets" && assetStatus) {
    overallProgress = assetStatus.progress * 0.5;
    overallStage = `Phase 1 / Assets — ${assetStatus.stage}`;
  } else if (phase === "conversations" && convStatus) {
    overallProgress = 50 + convStatus.progress * 0.5;
    overallStage = `Phase 2 / Conversations — ${convStatus.stage}`;
  } else if (phase === "done") {
    overallProgress = 100;
    overallStage = "Complete";
  }

  return (
    <div className="space-y-6">
      <Card
        title="Run Pipeline"
        description="Fetch and classify all AI assets, then analyze employee conversations — both phases run automatically."
      >
        <div className="space-y-4">
          {/* Phase indicator */}
          {(isActive || phase === "done") && (
            <div className="flex items-center gap-3 text-xs" style={{ color: "var(--c-text-4)" }}>
              <span
                className="px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: phase === "assets" ? "#3b82f620" : phase === "done" || phase === "conversations" ? "#10b98120" : "var(--c-border)",
                  color: phase === "assets" ? "#3b82f6" : phase === "done" || phase === "conversations" ? "#10b981" : "var(--c-text-4)",
                }}
              >
                Phase 1: Assets
              </span>
              <span style={{ color: "var(--c-border)" }}>→</span>
              <span
                className="px-2 py-0.5 rounded-full font-medium"
                style={{
                  background: phase === "conversations" ? "#3b82f620" : phase === "done" ? "#10b98120" : "var(--c-border)",
                  color: phase === "conversations" ? "#3b82f6" : phase === "done" ? "#10b981" : "var(--c-text-5)",
                }}
              >
                Phase 2: Conversations
              </span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleRun}
              disabled={runPipeline.isPending || isActive}
              className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {runPipeline.isPending
                ? "Starting..."
                : phase === "assets"
                  ? "Syncing Assets..."
                  : phase === "conversations"
                    ? "Analyzing Conversations..."
                    : "Run Pipeline"}
            </button>

            {hasExistingGPTs && (
              <button
                onClick={onViewResults}
                className="text-sm text-blue-600 hover:text-blue-800 underline"
              >
                View Previous Results ({gpts.length} AI assets)
              </button>
            )}
          </div>

          {runPipeline.isError && (
            <div className="alert-error">
              {(runPipeline.error as Error).message}
            </div>
          )}

          {/* Unified progress bar */}
          {isActive && (
            <div>
              <div className="flex justify-between text-sm mb-1" style={{ color: "var(--c-text-3)" }}>
                <span>{overallStage}</span>
                <span>{Math.round(overallProgress)}%</span>
              </div>
              <div className="w-full rounded-full h-2" style={{ background: "var(--c-border)" }}>
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Done banner */}
          {phase === "done" && summary && (
            <div className="alert-success p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-8 h-8 bg-green-500 rounded-full text-white text-lg">
                    &#10003;
                  </span>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "#10b981" }}>
                      Pipeline completed successfully
                    </p>
                    <p className="text-xs" style={{ color: "#10b981", opacity: 0.8 }}>
                      {summary.total_gpts} discovered → {summary.filtered_gpts} after filtering
                      {(summary.gpt_count > 0 || summary.project_count > 0) && (
                        <span>
                          {" "}({summary.gpt_count} GPT{summary.gpt_count !== 1 ? "s" : ""}
                          {summary.project_count > 0 ? ` · ${summary.project_count} Project${summary.project_count !== 1 ? "s" : ""}` : ""})
                        </span>
                      )}
                      {convStatus && !convStatus.running && (
                        <span> · Conversation analysis complete</span>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowLogs((s) => !s)}
                  className="text-xs underline"
                  style={{ color: "#10b981" }}
                >
                  {showLogs ? "Hide Logs" : "View Logs"}
                </button>
              </div>
              <div className="mt-3 pt-3 border-t border-green-200 flex items-center gap-3">
                <button
                  onClick={onViewResults}
                  className="px-5 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                >
                  View Results &rarr;
                </button>
                {onComplete && (
                  <button
                    onClick={onComplete}
                    className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                  >
                    Go to Dashboard &rarr;
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Asset pipeline logs */}
      {logs.length > 0 && showLogs && (
        <Card title="Asset Pipeline Logs">
          <div
            className="rounded-md p-4 max-h-64 overflow-y-auto font-mono text-xs"
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
                <span className="uppercase">[{entry.level}]</span>{" "}
                {entry.message}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </Card>
      )}

      {/* Conversation pipeline status summary (shown during/after phase 2) */}
      {(phase === "conversations" || (phase === "done" && convStatus)) && showLogs && (
        <Card title="Conversation Analysis">
          <div
            className="rounded-md p-4 font-mono text-xs"
            style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}
          >
            {phase === "conversations" && convStatus && (
              <div className="text-green-400 py-0.5">
                <span style={{ color: "var(--c-text-4)" }}>{new Date().toLocaleTimeString()}</span>{" "}
                <span className="uppercase">[info]</span>{" "}
                {convStatus.stage} — {Math.round(convStatus.progress)}%
              </div>
            )}
            {phase === "done" && (
              <div className="text-green-400 py-0.5">
                <span style={{ color: "var(--c-text-4)" }}>{new Date().toLocaleTimeString()}</span>{" "}
                <span className="uppercase">[info]</span>{" "}
                Conversation analysis complete.
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
