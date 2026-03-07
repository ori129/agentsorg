const BASE = "/api/v1";

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  getAuthStatus: () => request<import("../types").AuthStatus>("/auth/status"),
  register: (email: string) =>
    request<import("../types").WorkspaceUser>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  login: (email: string) =>
    request<import("../types").WorkspaceUser>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  updateUserRole: (userId: string, system_role: string) =>
    request<import("../types").WorkspaceUser>(`/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ system_role }),
    }),

  getConfig: () => request<import("../types").Configuration>("/config"),
  updateConfig: (data: Partial<import("../types").Configuration>) =>
    request<import("../types").Configuration>("/config", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  testConnection: () =>
    request<import("../types").TestConnectionResult>("/config/test-connection", {
      method: "POST",
    }),

  getCategories: () => request<import("../types").Category[]>("/categories"),
  createCategory: (data: Partial<import("../types").Category>) =>
    request<import("../types").Category>("/categories", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateCategory: (id: number, data: Partial<import("../types").Category>) =>
    request<import("../types").Category>(`/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteCategory: (id: number) =>
    request<void>(`/categories/${id}`, { method: "DELETE" }),
  seedCategories: () =>
    request<import("../types").Category[]>("/categories/seed", { method: "POST" }),

  runPipeline: () => request<import("../types").PipelineStatus>("/pipeline/run", { method: "POST" }),
  getPipelineStatus: () => request<import("../types").PipelineStatus>("/pipeline/status"),
  getPipelineLogs: (syncLogId: number) =>
    request<import("../types").PipelineLogEntry[]>(`/pipeline/logs/${syncLogId}`),
  getPipelineSummary: () => request<import("../types").PipelineSummary>("/pipeline/summary"),
  getPipelineGPTs: () => request<import("../types").GPTItem[]>("/pipeline/gpts"),
  getPipelineHistory: () => request<import("../types").SyncLog[]>("/pipeline/history"),

  resetRegistry: () => request<{ message: string }>("/admin/reset", { method: "POST" }),

  getUsers: () => request<import("../types").WorkspaceUser[]>("/users"),
  importUsers: () =>
    request<import("../types").UserImportResult>("/users/import", { method: "POST" }),

  getDemoState: () => request<import("../types").DemoState>("/demo"),
  updateDemoState: (data: { enabled: boolean; size: string }) =>
    request<import("../types").DemoState>("/demo", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};
