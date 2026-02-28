import { useEffect, useRef, useState } from "react";
import Card from "../layout/Card";
import {
  usePipelineLogs,
  usePipelineStatus,
  usePipelineSummary,
  useRunPipeline,
} from "../../hooks/usePipeline";

export default function Step4FetchClassify() {
  const runPipeline = useRunPipeline();
  const [polling, setPolling] = useState(false);
  const { data: status } = usePipelineStatus(polling);
  const { data: summary, refetch: refetchSummary } = usePipelineSummary();
  const syncLogId = status?.sync_log_id ?? null;
  const { data: logs = [] } = usePipelineLogs(syncLogId, polling);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status && !status.running && polling) {
      setPolling(false);
      refetchSummary();
    }
  }, [status, polling, refetchSummary]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const handleRun = () => {
    runPipeline.mutate(undefined, {
      onSuccess: () => setPolling(true),
    });
  };

  return (
    <div className="space-y-6">
      <Card
        title="Fetch & Classify"
        description="Run the pipeline to discover and classify GPTs from your workspace."
      >
        <div className="space-y-4">
          <button
            onClick={handleRun}
            disabled={runPipeline.isPending || (status?.running ?? false)}
            className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {status?.running ? "Pipeline Running..." : "Run Pipeline"}
          </button>

          {runPipeline.isError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
              {(runPipeline.error as Error).message}
            </div>
          )}

          {status?.running && (
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
        </div>
      </Card>

      {logs.length > 0 && (
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
                <span className="uppercase">[{entry.level}]</span> {entry.message}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </Card>
      )}

      {summary && summary.last_sync && (
        <Card title="Summary">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">
                {summary.total_gpts}
              </div>
              <div className="text-xs text-gray-500">Total GPTs Found</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">
                {summary.filtered_gpts}
              </div>
              <div className="text-xs text-gray-500">After Filtering</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">
                {summary.classified_gpts}
              </div>
              <div className="text-xs text-gray-500">Classified</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">
                {summary.embedded_gpts}
              </div>
              <div className="text-xs text-gray-500">Embedded</div>
            </div>
          </div>

          {summary.categories_used.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Categories Distribution
              </h3>
              <div className="flex flex-wrap gap-2">
                {summary.categories_used.map((cat) => (
                  <span
                    key={cat.name}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                    style={{
                      backgroundColor: cat.color + "20",
                      color: cat.color,
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    {cat.name} ({cat.count})
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
