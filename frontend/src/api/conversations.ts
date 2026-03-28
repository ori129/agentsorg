import type {
  AssetUsageInsight,
  ConversationConfig,
  ConversationEstimate,
  ConversationOverview,
  ConversationPipelineStatus,
  ConversationSyncLog,
  UserUsageInsight,
} from "../types";

const BASE = "/api/v1/conversations";
const SESSION_KEY = "session_token";

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem(SESSION_KEY);
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function startConversationPipeline(assetIds?: string[], mock = false): Promise<void> {
  await req("/run", {
    method: "POST",
    body: JSON.stringify({ asset_ids: assetIds ?? null, mock }),
  });
}

export async function getConversationStatus(): Promise<ConversationPipelineStatus> {
  return req("/status");
}

export async function getConversationHistory(
  limit = 20
): Promise<ConversationSyncLog[]> {
  return req(`/history?limit=${limit}`);
}

export async function getConversationEstimate(
  dateRangeDays: number,
  privacyLevel: number,
  assetIds?: string[]
): Promise<ConversationEstimate> {
  const params = new URLSearchParams({
    date_range_days: String(dateRangeDays),
    privacy_level: String(privacyLevel),
  });
  if (assetIds?.length) {
    assetIds.forEach((id) => params.append("asset_ids", id));
  }
  return req(`/estimate?${params}`);
}

export async function getAssetUsageInsight(
  assetId: string
): Promise<AssetUsageInsight | null> {
  return req(`/asset/${encodeURIComponent(assetId)}`);
}

export async function getUserInsights(
  userEmail: string
): Promise<UserUsageInsight[]> {
  return req(`/user/${encodeURIComponent(userEmail)}`);
}

export async function deleteUserInsights(userEmail: string): Promise<void> {
  await req(`/user/${encodeURIComponent(userEmail)}`, { method: "DELETE" });
}

export async function getConversationOverview(
  dateRangeDays = 30
): Promise<ConversationOverview> {
  return req(`/overview?date_range_days=${dateRangeDays}`);
}

export async function patchConversationConfig(
  patch: Partial<ConversationConfig>
): Promise<ConversationConfig> {
  return req("/config", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
