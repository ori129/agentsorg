import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { SyncConfig } from "../types";

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

/**
 * Global watcher — lives in App root. Polls pipeline status at all times.
 * When the pipeline transitions running→idle, invalidates all GPT data queries
 * so every view refreshes automatically regardless of which tab is active.
 */
export function useGlobalPipelineWatcher() {
  const qc = useQueryClient();
  const wasRunning = useRef<boolean | null>(null);

  const { data: status } = useQuery({
    queryKey: ["pipeline-status"],
    queryFn: api.getPipelineStatus,
    // Poll fast when running, slow otherwise
    refetchInterval: (query) =>
      (query.state.data as { running?: boolean } | undefined)?.running ? 1500 : 8000,
  });

  useEffect(() => {
    if (status === undefined) return;
    const isRunning = status.running;

    // Transition: running → stopped
    if (wasRunning.current === true && !isRunning) {
      qc.invalidateQueries({ queryKey: ["pipeline-gpts"] });
      qc.invalidateQueries({ queryKey: ["pipeline-summary"] });
      qc.invalidateQueries({ queryKey: ["pipeline-history"] });
    }

    wasRunning.current = isRunning;
  }, [status, qc]);
}

export function useSyncConfig() {
  return useQuery({
    queryKey: ["sync-config"],
    queryFn: api.getSyncConfig,
  });
}

export function usePatchSyncConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<SyncConfig>) => api.patchSyncConfig(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sync-config"] });
    },
  });
}
