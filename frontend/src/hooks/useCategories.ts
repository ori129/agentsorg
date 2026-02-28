import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Category } from "../types";

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: api.getCategories,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Category>) => api.createCategory(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Category> & { id: number }) =>
      api.updateCategory(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteCategory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });
}

export function useSeedCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.seedCategories,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });
}
