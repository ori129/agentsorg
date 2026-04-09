const BASE = "/api/v1/learning";
const SESSION_KEY = "session_token";

function authHeader(): Record<string, string> {
  const token = localStorage.getItem(SESSION_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeader(), ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface BuilderRecognition {
  email: string;
  name: string | null;
  composite_score: number;
  volume_score: number;
  quality_score: number;
  adoption_score: number;
  risk_hygiene_score: number;
  gpt_count: number;
  avg_sophistication: number | null;
  avg_quality: number | null;
}

export interface CourseRecommendation {
  course_name: string;
  url: string;
  category: string;
  reasoning: string;
  priority: number;
}

export interface OrgLearningReport {
  skill_gaps: string[];
  recommended_courses: CourseRecommendation[];
  summary: string;
}

export interface EmployeeLearningReport {
  employee_email: string;
  recommended_courses: CourseRecommendation[];
  gap_summary: string;
}

export interface CustomCourseRead {
  id: number;
  url: string;
  description: string;
  uploaded_at: string;
}

export interface CustomCourseUploadResult {
  added: number;
  updated: number;
  errors: string[];
}

export interface WorkshopPayload {
  title: string;
  description?: string;
  event_date: string; // ISO date string YYYY-MM-DD
  duration_hours?: number;
  facilitator?: string;
}

export interface Workshop extends WorkshopPayload {
  id: number;
  created_at: string;
  participant_count: number;
  participant_emails: string[];
  tagged_gpt_count: number;
}

export interface WorkshopImpactAuto {
  participant_email: string;
  gpts_before: number;
  gpts_after: number;
  avg_quality_before: number | null;
  avg_quality_after: number | null;
  avg_sophistication_before: number | null;
  avg_sophistication_after: number | null;
}

export interface TaggedAssetDetail {
  gpt_id: string;
  name: string;
  asset_type: string;
  owner_email: string | null;
  quality_score: number | null;
  sophistication_score: number | null;
  roi_potential_score: number | null;
  risk_level: string | null;
  primary_category: string | null;
}

export interface WorkshopImpact {
  workshop_id: number;
  auto_stats: WorkshopImpactAuto[];
  tagged_gpts: string[];
  tagged_asset_details: TaggedAssetDetail[];
  summary_delta_quality: number | null;
  summary_delta_sophistication: number | null;
}

export const customCoursesApi = {
  list: () => req<CustomCourseRead[]>("/custom-courses"),
  upload: (file: File): Promise<CustomCourseUploadResult> => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${BASE}/custom-courses/upload`, {
      method: "POST",
      headers: authHeader(),
      body: fd,
    }).then((r) => r.json());
  },
  delete: (id: number) => req<void>(`/custom-courses/${id}`, { method: "DELETE" }),
};

export const learningApi = {
  getRecognition: () => req<BuilderRecognition[]>("/recognition"),
  recommendOrg: () => req<OrgLearningReport>("/recommend-org", { method: "POST" }),
  recommendEmployee: (email: string) =>
    req<EmployeeLearningReport>("/recommend-employee", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  getWorkshops: () => req<Workshop[]>("/workshops"),
  createWorkshop: (data: WorkshopPayload) =>
    req<Workshop>("/workshops", { method: "POST", body: JSON.stringify(data) }),
  updateWorkshop: (id: number, data: WorkshopPayload) =>
    req<Workshop>(`/workshops/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteWorkshop: (id: number) => req<void>(`/workshops/${id}`, { method: "DELETE" }),
  addParticipant: (workshopId: number, email: string) =>
    req<void>(`/workshops/${workshopId}/participants`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  removeParticipant: (workshopId: number, email: string) =>
    req<void>(`/workshops/${workshopId}/participants/${encodeURIComponent(email)}`, {
      method: "DELETE",
    }),
  tagGpt: (workshopId: number, gptId: string) =>
    req<void>(`/workshops/${workshopId}/tag-gpt`, {
      method: "POST",
      body: JSON.stringify({ gpt_id: gptId }),
    }),
  untagGpt: (workshopId: number, gptId: string) =>
    req<void>(`/workshops/${workshopId}/tag-gpt/${encodeURIComponent(gptId)}`, {
      method: "DELETE",
    }),
  getWorkshopImpact: (id: number) => req<WorkshopImpact>(`/workshops/${id}/impact`),
};
