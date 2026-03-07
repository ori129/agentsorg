import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customCoursesApi, learningApi } from "../api/learning";

export function useRecognition() {
  return useQuery({
    queryKey: ["recognition"],
    queryFn: learningApi.getRecognition,
  });
}

export function useWorkshops() {
  return useQuery({
    queryKey: ["workshops"],
    queryFn: learningApi.getWorkshops,
  });
}

export function useWorkshopImpact(id: number | null) {
  return useQuery({
    queryKey: ["workshop-impact", id],
    queryFn: () => learningApi.getWorkshopImpact(id!),
    enabled: id !== null,
  });
}

export function useRecommendOrg() {
  return useMutation({ mutationFn: learningApi.recommendOrg });
}

export function useRecommendEmployee() {
  return useMutation({
    mutationFn: (email: string) => learningApi.recommendEmployee(email),
  });
}

export function useCustomCourses() {
  const qc = useQueryClient();
  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["custom-courses"],
    queryFn: customCoursesApi.list,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["custom-courses"] });
  return { courses, loading: isLoading, refresh };
}

export function useWorkshopMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["workshops"] });

  const create = useMutation({ mutationFn: learningApi.createWorkshop, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof learningApi.updateWorkshop>[1] }) =>
      learningApi.updateWorkshop(id, data),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: learningApi.deleteWorkshop, onSuccess: invalidate });
  const addParticipant = useMutation({
    mutationFn: ({ wid, email }: { wid: number; email: string }) =>
      learningApi.addParticipant(wid, email),
    onSuccess: invalidate,
  });
  const removeParticipant = useMutation({
    mutationFn: ({ wid, email }: { wid: number; email: string }) =>
      learningApi.removeParticipant(wid, email),
    onSuccess: invalidate,
  });
  const tagGpt = useMutation({
    mutationFn: ({ wid, gptId }: { wid: number; gptId: string }) =>
      learningApi.tagGpt(wid, gptId),
    onSuccess: invalidate,
  });
  const untagGpt = useMutation({
    mutationFn: ({ wid, gptId }: { wid: number; gptId: string }) =>
      learningApi.untagGpt(wid, gptId),
    onSuccess: invalidate,
  });

  return { create, update, remove, addParticipant, removeParticipant, tagGpt, untagGpt };
}
