import type {
  AuditLogEntry,
  AuthStatus,
  Category,
  CheckEmailResponse,
  ClusterGroup,
  Configuration,
  DemoState,
  GPTItem,
  GptScoreHistoryPoint,
  InviteUserResponse,
  LoginResponse,
  OidcProvider,
  OidcProviderCreate,
  OidcTestResult,
  PipelineLogEntry,
  PipelineStatus,
  PipelineSummary,
  PortfolioTrendPoint,
  SsoStatus,
  SyncConfig,
  SyncLog,
  TestConnectionResult,
  UserImportResult,
  WorkflowCoverageItem,
  WorkspaceRecommendation,
  WorkspaceUser,
} from "../types";

const BASE = "/api/v1";

// SESSION_KEY kept for backward compat — no longer used for auth, but
// some components still reference it for the transition period.
const SESSION_KEY = "session_token";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include", // sends HttpOnly session cookie automatically
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string> | undefined),
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }

  // 204 No Content — return undefined cast to T
  if (res.status === 204) return undefined as unknown as T;

  return res.json();
}

export const api = {
  // ------------------------------------------------------------------
  // App config (public — no auth required)
  // ------------------------------------------------------------------
  getAppConfig: () => request<{ hosted_demo: boolean }>("/app-config"),
  guestSession: () => request<WorkspaceUser>("/demo/guest-session", { method: "POST" }),

  // Auth
  // ------------------------------------------------------------------
  getAuthStatus: () => request<AuthStatus>("/auth/status"),

  register: (email: string, password: string) =>
    request<LoginResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  checkEmail: (email: string) =>
    request<CheckEmailResponse>("/auth/check-email", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  login: (email: string, password?: string) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password: password ?? null }),
    }),

  verifyTotpLogin: (challengeToken: string, code: string) =>
    request<LoginResponse>("/auth/totp/verify-login", {
      method: "POST",
      body: JSON.stringify({ challenge_token: challengeToken, code }),
    }),

  getMe: () => request<WorkspaceUser>("/auth/me"),

  logoutSession: () =>
    request<void>("/auth/session", { method: "DELETE" }),

  changePassword: (oldPassword: string | undefined, newPassword: string) =>
    request<WorkspaceUser>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        old_password: oldPassword ?? null,
        new_password: newPassword,
      }),
    }),

  resetUserPassword: (userId: string) =>
    request<{ temp_password: string }>(`/users/${userId}/reset-password`, {
      method: "POST",
    }),

  // ------------------------------------------------------------------
  // Users
  // ------------------------------------------------------------------
  updateUserRole: (userId: string, system_role: string) =>
    request<WorkspaceUser>(`/users/${userId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ system_role }),
    }),

  getUsers: () => request<WorkspaceUser[]>("/users"),

  importUsers: () =>
    request<UserImportResult>("/users/import", { method: "POST" }),

  inviteUser: (email: string, name: string | undefined, system_role: string) =>
    request<InviteUserResponse>("/users/invite", {
      method: "POST",
      body: JSON.stringify({ email, name: name || null, system_role }),
    }),

  // ------------------------------------------------------------------
  // Configuration
  // ------------------------------------------------------------------
  getConfig: () => request<Configuration>("/config"),
  updateConfig: (data: Partial<Configuration>) =>
    request<Configuration>("/config", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  testConnection: () =>
    request<TestConnectionResult>("/config/test-connection", {
      method: "POST",
    }),
  testOpenaiConnection: () =>
    request<TestConnectionResult>("/config/test-openai-connection", {
      method: "POST",
    }),

  // ------------------------------------------------------------------
  // Categories
  // ------------------------------------------------------------------
  getCategories: () => request<Category[]>("/categories"),
  createCategory: (data: Partial<Category>) =>
    request<Category>("/categories", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateCategory: (id: number, data: Partial<Category>) =>
    request<Category>(`/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteCategory: (id: number) =>
    request<void>(`/categories/${id}`, { method: "DELETE" }),
  seedCategories: () =>
    request<Category[]>("/categories/seed", { method: "POST" }),

  // ------------------------------------------------------------------
  // Pipeline
  // ------------------------------------------------------------------
  runPipeline: () => request<PipelineStatus>("/pipeline/run", { method: "POST" }),
  getPipelineStatus: () => request<PipelineStatus>("/pipeline/status"),
  getPipelineLogs: (syncLogId: number) =>
    request<PipelineLogEntry[]>(`/pipeline/logs/${syncLogId}`),
  getPipelineSummary: () => request<PipelineSummary>("/pipeline/summary"),
  getPipelineGPTs: () => request<GPTItem[]>("/pipeline/gpts"),
  getPipelineHistory: () => request<SyncLog[]>("/pipeline/history"),
  getSyncConfig: () => request<SyncConfig>("/pipeline/sync-config"),
  patchSyncConfig: (body: Partial<SyncConfig>) =>
    request<SyncConfig>("/pipeline/sync-config", { method: "PATCH", body: JSON.stringify(body) }),
  getRecommendations: () => request<WorkspaceRecommendation>("/pipeline/recommendations"),
  getWorkflowCoverage: () => request<WorkflowCoverageItem[]>("/pipeline/workflows"),
  getPortfolioTrend: () => request<PortfolioTrendPoint[]>("/pipeline/trend"),
  getGptScoreHistory: (gptId: string) =>
    request<GptScoreHistoryPoint[]>(`/pipeline/gpt/${encodeURIComponent(gptId)}/history`),

  // ------------------------------------------------------------------
  // Clustering
  // ------------------------------------------------------------------
  getClusteringStatus: () => request<{ status: string }>("/clustering/status"),
  getClusteringResults: () => request<ClusterGroup[]>("/clustering/results"),
  runClustering: () => request<{ message: string }>("/clustering/run", { method: "POST" }),

  // ------------------------------------------------------------------
  // OIDC / Enterprise SSO
  // ------------------------------------------------------------------
  getSsoStatus: () => request<SsoStatus>("/auth/oidc/status"),
  getOidcProviders: () => request<OidcProvider[]>("/auth/oidc/providers"),
  createOidcProvider: (data: OidcProviderCreate) =>
    request<OidcProvider>("/auth/oidc/providers", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateOidcProvider: (id: number, data: Partial<OidcProviderCreate>) =>
    request<OidcProvider>(`/auth/oidc/providers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteOidcProvider: (id: number) =>
    request<void>(`/auth/oidc/providers/${id}`, { method: "DELETE" }),
  testOidcProvider: (id: number) =>
    request<OidcTestResult>(`/auth/oidc/providers/${id}/test`, { method: "POST" }),
  setOidcEnforcement: (id: number, enforce_sso: boolean, allow_password_login: boolean) =>
    request<OidcProvider>(`/auth/oidc/providers/${id}/enforce`, {
      method: "PATCH",
      body: JSON.stringify({ enforce_sso, allow_password_login }),
    }),
  getAuditLog: (limit = 100, offset = 0) =>
    request<AuditLogEntry[]>(`/auth/audit?limit=${limit}&offset=${offset}`),
  /** Redirect URL for SSO login — browser navigates directly to this */
  getOidcLoginUrl: (providerId: number) => `${BASE}/auth/oidc/login/${providerId}`,

  // ------------------------------------------------------------------
  // Admin
  // ------------------------------------------------------------------
  resetRegistry: () => request<{ message: string }>("/admin/reset", { method: "POST" }),

  // ------------------------------------------------------------------
  // Demo
  // ------------------------------------------------------------------
  getDemoState: () => request<DemoState>("/demo"),
  updateDemoState: (data: { enabled: boolean; size: string }) =>
    request<DemoState>("/demo", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
};

export { SESSION_KEY };
