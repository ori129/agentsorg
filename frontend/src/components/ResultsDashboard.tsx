import ResultsView from "./ui/ResultsView";
import { usePipelineGPTs, usePipelineSummary } from "../hooks/usePipeline";

interface ResultsDashboardProps {
  onBackToSetup: () => void;
}

export default function ResultsDashboard({
  onBackToSetup,
}: ResultsDashboardProps) {
  const { data: summary, isLoading: summaryLoading } = usePipelineSummary();
  const { data: gpts = [], isLoading: gptsLoading } = usePipelineGPTs();

  const isLoading = summaryLoading || gptsLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Results Dashboard
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Overview of discovered and classified GPTs
          </p>
        </div>
        <button
          onClick={onBackToSetup}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          <span>&larr;</span> Back to Setup
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-500 mt-3">Loading results...</p>
          </div>
        </div>
      ) : summary && gpts.length > 0 ? (
        <ResultsView summary={summary} gpts={gpts} />
      ) : (
        <div className="text-center py-16">
          <p className="text-gray-500">
            No results available. Run the pipeline first.
          </p>
          <button
            onClick={onBackToSetup}
            className="mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            Go to Setup
          </button>
        </div>
      )}
    </div>
  );
}
