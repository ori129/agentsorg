import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function useRunPipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.runPipeline,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline-status"] });
    },
  });
}

export function usePipelineStatus(enabled: boolean) {
  return useQuery({
    queryKey: ["pipeline-status"],
    queryFn: api.getPipelineStatus,
    refetchInterval: enabled ? 1500 : false,
  });
}

export function usePipelineLogs(syncLogId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["pipeline-logs", syncLogId],
    queryFn: () => api.getPipelineLogs(syncLogId!),
    enabled: !!syncLogId && enabled,
    refetchInterval: enabled ? 1500 : false,
  });
}

export function usePipelineSummary() {
  return useQuery({
    queryKey: ["pipeline-summary"],
    queryFn: api.getPipelineSummary,
  });
}

export function usePipelineHistory() {
  return useQuery({
    queryKey: ["pipeline-history"],
    queryFn: api.getPipelineHistory,
  });
}
