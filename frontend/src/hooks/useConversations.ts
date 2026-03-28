import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteUserInsights,
  getAssetUsageInsight,
  getConversationEstimate,
  getConversationHistory,
  getConversationOverview,
  getConversationStatus,
  getUserInsights,
  patchConversationConfig,
  startConversationPipeline,
} from "../api/conversations";
import type { ConversationConfig } from "../types";

export function useConversationStatus(polling: boolean | number = false) {
  return useQuery({
    queryKey: ["conversation-status"],
    queryFn: getConversationStatus,
    refetchInterval:
      typeof polling === "number" ? polling : polling ? 2000 : false,
  });
}

export function useConversationHistory(limit = 20) {
  return useQuery({
    queryKey: ["conversation-history", limit],
    queryFn: () => getConversationHistory(limit),
  });
}

export function useConversationEstimate(
  dateRangeDays: number,
  privacyLevel: number,
  assetIds?: string[]
) {
  return useQuery({
    queryKey: ["conversation-estimate", dateRangeDays, privacyLevel, assetIds],
    queryFn: () => getConversationEstimate(dateRangeDays, privacyLevel, assetIds),
  });
}

export function useAssetUsageInsight(assetId: string | null) {
  return useQuery({
    queryKey: ["asset-usage-insight", assetId],
    queryFn: () => getAssetUsageInsight(assetId!),
    enabled: assetId !== null,
  });
}

export function useConversationOverview(dateRangeDays = 30) {
  return useQuery({
    queryKey: ["conversation-overview", dateRangeDays],
    queryFn: () => getConversationOverview(dateRangeDays),
  });
}

export function useUserInsights(userEmail: string | null) {
  return useQuery({
    queryKey: ["user-insights", userEmail],
    queryFn: () => getUserInsights(userEmail!),
    enabled: userEmail !== null,
  });
}

export function useConversationConfig() {
  // Config is loaded as part of the main configuration — no separate endpoint.
  // PATCH is available via usePatchConversationConfig.
  return null;
}

export function usePatchConversationConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<ConversationConfig>) => patchConversationConfig(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversation-estimate"] });
    },
  });
}

export function useStartConversationPipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ assetIds, mock }: { assetIds?: string[]; mock?: boolean } = {}) =>
      startConversationPipeline(assetIds, mock),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversation-status"] });
    },
  });
}

export function useDeleteUserInsights() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userEmail: string) => deleteUserInsights(userEmail),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-insights"] });
    },
  });
}
