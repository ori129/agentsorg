import { useEffect, useRef, useState } from "react";
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
 * Global watcher — lives in App root.
 *
 * Polling strategy:
 *  - running        → 1.5 s  (tight loop to catch completion)
 *  - tab hidden     → paused (no point hitting the server while user is away)
 *  - tab visible    → 60 s   (heartbeat — catches a sync started elsewhere)
 *  - tab re-focused → immediate refetch via refetchOnWindowFocus
 *
 * On running→idle transition, invalidates all derived data queries so every
 * view refreshes automatically regardless of which tab is active.
 */
export function useGlobalPipelineWatcher() {
  const qc = useQueryClient();
  const wasRunning = useRef<boolean | null>(null);
  const [tabVisible, setTabVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const handler = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const { data: status } = useQuery({
    queryKey: ["pipeline-status"],
    queryFn: api.getPipelineStatus,
    refetchInterval: (query) => {
      const running = (query.state.data as { running?: boolean } | undefined)?.running;
      if (running) return 1500;      // sync in progress — stay fast
      if (!tabVisible) return false; // tab hidden — save the requests
      return 60_000;                 // idle + visible — heartbeat once a minute
    },
    // Override the global refetchOnWindowFocus: false so we check immediately
    // when the user switches back to the tab.
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (status === undefined) return;
    const isRunning = status.running;

    // Transition: running → stopped → bust all derived caches
    if (wasRunning.current === true && !isRunning) {
      qc.invalidateQueries({ queryKey: ["pipeline-gpts"] });
      qc.invalidateQueries({ queryKey: ["pipeline-summary"] });
      qc.invalidateQueries({ queryKey: ["pipeline-history"] });
      qc.invalidateQueries({ queryKey: ["portfolio-trend"] });
      qc.invalidateQueries({ queryKey: ["workflow-coverage"] });
    }

    wasRunning.current = isRunning;
  }, [status, qc]);
}

export function usePortfolioTrend() {
  return useQuery({
    queryKey: ["portfolio-trend"],
    queryFn: api.getPortfolioTrend,
  });
}

export function useWorkflowCoverage() {
  return useQuery({
    queryKey: ["workflow-coverage"],
    queryFn: api.getWorkflowCoverage,
  });
}

export function useGptScoreHistory(gptId: string | null) {
  return useQuery({
    queryKey: ["gpt-score-history", gptId],
    queryFn: () => api.getGptScoreHistory(gptId!),
    enabled: !!gptId,
  });
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

export function useRecommendations() {
  return useQuery({
    queryKey: ["pipeline-recommendations"],
    queryFn: api.getRecommendations,
    // 404 means no recommendations yet — don't treat as error
    retry: (_, error) => {
      if (error instanceof Error && error.message.includes("404")) return false;
      return true;
    },
  });
}
