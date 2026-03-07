import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: api.getUsers,
  });
}

export function useImportUsers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.importUsers,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, systemRole }: { userId: string; systemRole: string }) =>
      api.updateUserRole(userId, systemRole),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
