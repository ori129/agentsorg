import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function useRunPipeline() {
  return useMutation({
    mutationFn: api.runPipeline,
  });
}

export function usePipelineStatus(polling: boolean) {
  return useQuery({
    queryKey: ["pipeline-status"],
    queryFn: api.getPipelineStatus,
    refetchInterval: polling ? 1500 : false,
  });
}

export function usePipelineLogs(syncLogId: number | null, polling: boolean) {
  return useQuery({
    queryKey: ["pipeline-logs", syncLogId],
    queryFn: () => api.getPipelineLogs(syncLogId!),
    enabled: !!syncLogId,
    refetchInterval: polling ? 1500 : false,
  });
}

export function usePipelineSummary() {
  return useQuery({
    queryKey: ["pipeline-summary"],
    queryFn: api.getPipelineSummary,
  });
}

export function usePipelineGPTs() {
  return useQuery({
    queryKey: ["pipeline-gpts"],
    queryFn: api.getPipelineGPTs,
  });
}

export function usePipelineHistory() {
  return useQuery({
    queryKey: ["pipeline-history"],
    queryFn: api.getPipelineHistory,
  });
}
