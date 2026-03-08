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

type Phase = "idle" | "running" | "finishing" | "done";

const MIN_DISPLAY_MS = 4000;

interface Step4Props {
  onViewResults: () => void;
  onComplete?: () => void;
}

export default function Step4FetchClassify({ onViewResults, onComplete }: Step4Props) {
  const qc = useQueryClient();
  const runPipeline = useRunPipeline();

  const [phase, setPhase] = useState<Phase>("idle");
  const [syncLogId, setSyncLogId] = useState<number | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const runStartedAt = useRef(0);
  const mountCheckedRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const polling = phase === "running" || phase === "finishing";
  const { data: status } = usePipelineStatus(polling);
  const { data: summary, refetch: refetchSummary } = usePipelineSummary();
  const { data: logs = [], refetch: refetchLogs } = usePipelineLogs(
    syncLogId,
    polling
  );
  const { data: gpts = [], refetch: refetchGPTs } = usePipelineGPTs();

  // --- Effect 1: Mount check — detect already-running pipeline ---
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

  // --- Effect 2: Completion detection ---
  useEffect(() => {
    if (phase !== "running") return;
    if (status?.running !== false) return;

    setPhase("finishing");
    const elapsed = Date.now() - runStartedAt.current;
    const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);

    finishTimerRef.current = setTimeout(() => {
      refetchLogs();
      refetchSummary();
      refetchGPTs();
      setPhase("done");
    }, remaining);
  }, [phase, status?.running, refetchLogs, refetchSummary, refetchGPTs]);

  // Cleanup timer only on unmount
  useEffect(() => {
    return () => {
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    };
  }, []);

  // --- Effect 3: Auto-scroll logs ---
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // --- handleRun ---
  const handleRun = useCallback(() => {
    setPhase("idle");
    setShowLogs(true);

    runPipeline.mutate(undefined, {
      onSuccess: (data) => {
        setSyncLogId(data.sync_log_id);
        runStartedAt.current = Date.now();
        // Optimistically mark as running so Effect 2 doesn't race to "done"
        // before the first real poll comes back.
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

  const isActive = phase === "running" || phase === "finishing";
  const hasExistingGPTs = phase === "idle" && gpts.length > 0;

  return (
    <div className="space-y-6">
      <Card
        title="Fetch & Classify"
        description="Run the pipeline to discover and classify GPTs from your workspace."
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleRun}
              disabled={runPipeline.isPending || isActive}
              className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {runPipeline.isPending
                ? "Starting..."
                : isActive
                  ? "Pipeline Running..."
                  : "Run Pipeline"}
            </button>

            {/* Show "View Results" link if GPTs exist from a previous run */}
            {hasExistingGPTs && (
              <button
                onClick={onViewResults}
                className="text-sm text-blue-600 hover:text-blue-800 underline"
              >
                View Previous Results ({gpts.length} GPTs)
              </button>
            )}
          </div>

          {runPipeline.isError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
              {(runPipeline.error as Error).message}
            </div>
          )}

          {/* Progress bar */}
          {isActive && status && (
            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>{status.stage}</span>
                <span>{Math.round(status.progress)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${status.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Done banner */}
          {phase === "done" && summary && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex items-center justify-center w-8 h-8 bg-green-500 rounded-full text-white text-lg">
                    &#10003;
                  </span>
                  <div>
                    <p className="text-sm font-medium text-green-800">
                      Pipeline completed successfully
                    </p>
                    <p className="text-xs text-green-600">
                      {summary.total_gpts} GPTs found,{" "}
                      {summary.filtered_gpts} after filtering
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowLogs((s) => !s)}
                  className="text-xs text-green-700 hover:text-green-900 underline"
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

      {/* Logs panel */}
      {logs.length > 0 && showLogs && (
        <Card title="Pipeline Logs">
          <div className="bg-gray-900 rounded-md p-4 max-h-80 overflow-y-auto font-mono text-xs">
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
                <span className="text-gray-500">
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
    </div>
  );
}
