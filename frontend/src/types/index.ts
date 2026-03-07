export interface Configuration {
  id: number;
  workspace_id: string | null;
  compliance_api_key: string | null;
  base_url: string;
  openai_api_key: string | null;
  classification_enabled: boolean;
  classification_model: string;
  max_categories_per_gpt: number;
  visibility_filters: Record<string, boolean>;
  include_all: boolean;
  min_shared_users: number;
  excluded_emails: string[];
}

export interface Category {
  id: number;
  name: string;
  description: string | null;
  color: string;
  enabled: boolean;
  sort_order: number;
}

export interface SyncLog {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: "running" | "completed" | "failed";
  total_gpts_found: number;
  gpts_after_filter: number;
  gpts_classified: number;
  gpts_embedded: number;
  errors: unknown[];
}

export interface PipelineLogEntry {
  id: number;
  sync_log_id: number;
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
}

export interface PipelineStatus {
  running: boolean;
  sync_log_id: number | null;
  progress: number;
  stage: string;
}

export interface PipelineSummary {
  total_gpts: number;
  filtered_gpts: number;
  classified_gpts: number;
  embedded_gpts: number;
  categories_used: { name: string; count: number; color: string }[];
  last_sync: SyncLog | null;
}

export interface GPTItem {
  id: string;
  name: string;
  description: string | null;
  owner_email: string | null;
  builder_name: string | null;
  created_at: string | null;
  visibility: string | null;
  shared_user_count: number;
  tools: unknown[] | null;
  builder_categories: string[] | null;
  conversation_starters?: string[] | null;
  primary_category: string | null;
  secondary_category: string | null;
  classification_confidence: number | null;
  llm_summary: string | null;
  use_case_description: string | null;
  instructions: string | null;
  // Semantic enrichment
  business_process: string | null;
  risk_flags: string[] | null;
  risk_level: string | null;
  sophistication_score: number | null;
  sophistication_rationale: string | null;
  prompting_quality_score: number | null;
  prompting_quality_rationale: string | null;
  prompting_quality_flags: string[] | null;
  roi_potential_score: number | null;
  roi_rationale: string | null;
  intended_audience: string | null;
  integration_flags: string[] | null;
  output_type: string | null;
  adoption_friction_score: number | null;
  adoption_friction_rationale: string | null;
  semantic_enriched_at: string | null;
}

export interface GPTSearchResult extends GPTItem {
  reasoning: string | null;
  confidence: "high" | "medium" | "low" | null;
  match_score: number | null;
}

export interface ClusterGroup {
  theme: string;
  gpt_ids: string[];
  gpt_names: string[];
  estimated_wasted_hours: number | null;
}

export interface ClusteringStatus {
  status: "idle" | "running" | "completed";
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  gpt_count?: number;
}

export interface DemoState {
  enabled: boolean;
  size: "small" | "medium" | "large" | "enterprise";
  gpt_count: number;
}
