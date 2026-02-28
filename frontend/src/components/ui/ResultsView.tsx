import { useState } from "react";
import type { GPTItem, PipelineSummary } from "../../types";
import Card from "../layout/Card";

interface ResultsViewProps {
  summary: PipelineSummary;
  gpts: GPTItem[];
}

const VISIBILITY_LABELS: Record<string, string> = {
  "invite-only": "Invite Only",
  "workspace-with-link": "Anyone with Link",
  "everyone-in-workspace": "Everyone",
  "just-me": "Just Me",
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ResultsView({ summary, gpts }: ResultsViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Compute stats
  const builderMap = new Map<string, number>();
  const visibilityMap = new Map<string, number>();
  for (const g of gpts) {
    const builder = g.builder_name || "Unknown";
    builderMap.set(builder, (builderMap.get(builder) || 0) + 1);
    const vis = g.visibility || "unknown";
    visibilityMap.set(vis, (visibilityMap.get(vis) || 0) + 1);
  }
  const builders = [...builderMap.entries()].sort((a, b) => b[1] - a[1]);
  const visibilities = [...visibilityMap.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <Card title="Results Overview">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-blue-700">
              {summary.total_gpts}
            </div>
            <div className="text-xs text-blue-500 mt-1">GPTs Discovered</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-green-700">
              {summary.filtered_gpts}
            </div>
            <div className="text-xs text-green-500 mt-1">After Filtering</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-purple-700">
              {builders.length}
            </div>
            <div className="text-xs text-purple-500 mt-1">Builders</div>
          </div>
          <div className="bg-amber-50 rounded-lg p-4 text-center">
            <div className="text-3xl font-bold text-amber-700">
              {summary.classified_gpts}
            </div>
            <div className="text-xs text-amber-500 mt-1">Classified</div>
          </div>
        </div>
      </Card>

      {/* Breakdown cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="By Builder">
          <div className="space-y-2">
            {builders.map(([name, count]) => (
              <div key={name} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">{name}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{
                        width: `${(count / gpts.length) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-900 w-6 text-right">
                    {count}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="By Visibility">
          <div className="space-y-2">
            {visibilities.map(([vis, count]) => (
              <div key={vis} className="flex items-center justify-between">
                <span className="text-sm text-gray-700">
                  {VISIBILITY_LABELS[vis] || vis}
                </span>
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full"
                      style={{
                        width: `${(count / gpts.length) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-900 w-6 text-right">
                    {count}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Category distribution */}
      {summary.categories_used.length > 0 && (
        <Card title="By Category">
          <div className="flex flex-wrap gap-2">
            {summary.categories_used.map((cat) => (
              <span
                key={cat.name}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
                style={{
                  backgroundColor: cat.color + "15",
                  color: cat.color,
                  border: `1px solid ${cat.color}30`,
                }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                {cat.name}
                <span className="font-bold">({cat.count})</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* GPT Table */}
      <Card title={`All GPTs (${gpts.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="pb-2 font-medium text-gray-500">Name</th>
                <th className="pb-2 font-medium text-gray-500">Builder</th>
                <th className="pb-2 font-medium text-gray-500">Visibility</th>
                <th className="pb-2 font-medium text-gray-500 text-center">
                  Shared
                </th>
                <th className="pb-2 font-medium text-gray-500 text-center">
                  Tools
                </th>
                <th className="pb-2 font-medium text-gray-500">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {gpts.map((gpt) => (
                <>
                  <tr
                    key={gpt.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() =>
                      setExpandedId(expandedId === gpt.id ? null : gpt.id)
                    }
                  >
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          {expandedId === gpt.id ? "\u25BC" : "\u25B6"}
                        </span>
                        <div>
                          <div className="font-medium text-gray-900">
                            {gpt.name}
                          </div>
                          {gpt.primary_category && (
                            <span className="text-xs text-gray-400">
                              {gpt.primary_category}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-gray-600">
                      {gpt.builder_name || "—"}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          gpt.visibility === "invite-only"
                            ? "bg-yellow-50 text-yellow-700"
                            : gpt.visibility === "workspace-with-link"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {VISIBILITY_LABELS[gpt.visibility || ""] ||
                          gpt.visibility ||
                          "—"}
                      </span>
                    </td>
                    <td className="py-2.5 text-center text-gray-600">
                      {gpt.shared_user_count}
                    </td>
                    <td className="py-2.5 text-center text-gray-600">
                      {(gpt.tools || []).length}
                    </td>
                    <td className="py-2.5 text-gray-500 text-xs">
                      {formatDate(gpt.created_at)}
                    </td>
                  </tr>
                  {expandedId === gpt.id && (
                    <tr key={`${gpt.id}-detail`}>
                      <td colSpan={6} className="py-3 px-8 bg-gray-50">
                        <div className="space-y-2 text-sm">
                          {gpt.description && (
                            <div>
                              <span className="font-medium text-gray-500">
                                Description:{" "}
                              </span>
                              <span className="text-gray-700">
                                {gpt.description}
                              </span>
                            </div>
                          )}
                          <div>
                            <span className="font-medium text-gray-500">
                              Owner:{" "}
                            </span>
                            <span className="text-gray-700">
                              {gpt.owner_email || "—"}
                            </span>
                          </div>
                          {gpt.llm_summary && (
                            <div>
                              <span className="font-medium text-gray-500">
                                AI Summary:{" "}
                              </span>
                              <span className="text-gray-700">
                                {gpt.llm_summary}
                              </span>
                            </div>
                          )}
                          {gpt.primary_category && (
                            <div>
                              <span className="font-medium text-gray-500">
                                Categories:{" "}
                              </span>
                              <span className="text-gray-700">
                                {gpt.primary_category}
                                {gpt.secondary_category &&
                                  `, ${gpt.secondary_category}`}
                                {gpt.classification_confidence != null &&
                                  ` (${Math.round(gpt.classification_confidence * 100)}% confidence)`}
                              </span>
                            </div>
                          )}
                          {(gpt.tools || []).length > 0 && (
                            <div>
                              <span className="font-medium text-gray-500">
                                Tools:{" "}
                              </span>
                              <span className="text-gray-700">
                                {(gpt.tools || [])
                                  .map((t: any) => t.type || t)
                                  .join(", ")}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
