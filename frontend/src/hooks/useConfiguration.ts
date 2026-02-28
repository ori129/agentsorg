import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Configuration } from "../types";

export function useConfiguration() {
  return useQuery({
    queryKey: ["config"],
    queryFn: api.getConfig,
  });
}

export function useUpdateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Configuration>) => api.updateConfig(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["config"] }),
  });
}

export function useTestConnection() {
  return useMutation({ mutationFn: api.testConnection });
}
