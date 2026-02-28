import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function useDemoState() {
  return useQuery({
    queryKey: ["demo-state"],
    queryFn: api.getDemoState,
  });
}

export function useUpdateDemoState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { enabled: boolean; size: string }) =>
      api.updateDemoState(data),
    onSuccess: (data) => {
      qc.setQueryData(["demo-state"], data);
    },
  });
}
