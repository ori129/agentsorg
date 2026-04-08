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
  tokens_input: number;
  tokens_output: number;
  estimated_cost_usd: number | null;
  // KPI snapshots (migration 017)
  avg_quality_score: number | null;
  avg_adoption_score: number | null;
  avg_risk_score: number | null;
  champion_count: number;
  hidden_gem_count: number;
  scaled_risk_count: number;
  retirement_count: number;
  ghost_asset_count: number;
  high_risk_count: number;
  total_asset_count: number;
}

export interface PortfolioTrendPoint {
  sync_log_id: number;
  synced_at: string;
  avg_quality_score: number | null;
  avg_adoption_score: number | null;
  avg_risk_score: number | null;
  champion_count: number;
  hidden_gem_count: number;
  scaled_risk_count: number;
  retirement_count: number;
  ghost_asset_count: number;
  high_risk_count: number;
  total_asset_count: number;
}

export interface GptScoreHistoryPoint {
  id: number;
  gpt_id: string;
  sync_log_id: number | null;
  synced_at: string;
  quality_score: number | null;
  adoption_score: number | null;
  risk_score: number | null;
  quadrant_label: string | null;
}

export interface SyncConfig {
  auto_sync_enabled: boolean;
  auto_sync_interval_hours: number;
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
  gpt_count: number;
  project_count: number;
  categories_used: { name: string; count: number; color: string }[];
  last_sync: SyncLog | null;
  // Score stats
  scores_assessed: number;
  avg_quality_score: number | null;
  avg_adoption_score: number | null;
  avg_risk_score: number | null;
  champions: number;
  hidden_gems: number;
  scaled_risk: number;
  retirement_candidates: number;
  ghost_assets: number;
  workflows_covered: number;
  workflow_gaps: number;
}

export interface WorkflowAssetRef {
  id: string;
  name: string;
  conversation_count: number;
  quadrant_label: string | null;
}

export interface WorkflowIntentSignal {
  topic: string;
  pct: number;
  example_phrases: string[];
}

export type WorkflowStatus = "covered" | "ghost" | "intent_gap";

export interface WorkflowCoverageItem {
  name: string;
  status: WorkflowStatus;
  asset_count: number;
  conversation_count: number;
  assets: WorkflowAssetRef[];
  intent_signals: WorkflowIntentSignal[];
  example_phrases: string[];
  reasoning: string | null;
  priority_action: string | null;
  priority_level: "low" | "medium" | "high" | "critical" | null;
}

export interface PriorityAction {
  priority: number;
  category: "quality" | "adoption" | "risk" | "learning" | "governance";
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  effort: "high" | "medium" | "low";
  asset_ids: string[];
  reasoning: string;
}

export interface WorkspaceRecommendation {
  id: number;
  generated_at: string;
  sync_log_id: number | null;
  recommendations: PriorityAction[];
  executive_summary: string | null;
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
  asset_type: "gpt" | "project";
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
  purpose_fingerprint: string | null;
  // Conversation stats
  conversation_count: number;
  last_conversation_at: string | null;
  // LLM-assessed composite scores
  quality_score: number | null;
  quality_score_rationale: string | null;
  quality_main_strength: string | null;
  quality_main_weakness: string | null;
  adoption_score: number | null;
  adoption_score_rationale: string | null;
  adoption_signal: string | null;
  adoption_barrier: string | null;
  risk_score: number | null;
  risk_score_rationale: string | null;
  risk_primary_driver: string | null;
  risk_urgency: "low" | "medium" | "high" | null;
  quadrant_label: "champion" | "hidden_gem" | "scaled_risk" | "retirement_candidate" | null;
  top_action: string | null;
  score_confidence: "high" | "medium" | "low" | null;
  scores_assessed_at: string | null;
}

export interface GPTSearchResult extends GPTItem {
  reasoning: string | null;
  confidence: "high" | "medium" | "low" | null;
  match_score: number | null;
}

export interface ClusterGroup {
  cluster_id: string;
  theme: string;
  gpt_ids: string[];
  gpt_names: string[];
  estimated_wasted_hours: number | null;
  business_process: string | null;
  departments: string[] | null;
  confidence: number | null;
  candidate_gpt_id: string | null;
  recommended_action: string | null;
  cluster_explanation: string | null;
}

export interface ClusterAction {
  cluster_id: string;
  action: string;
  owner_email: string | null;
  notes: string | null;
  saved_at: string;
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
  last_sync_was_demo: boolean;
}

export interface WorkspaceUser {
  id: string;
  email: string;
  name: string | null;
  created_at: string | null;
  role: "account-owner" | "account-admin" | "standard-user";
  status: "active" | "inactive";
  system_role: SystemRole;
  imported_at: string;
  password_temp: boolean;
}

export interface LoginResponse {
  user: WorkspaceUser;
  token: string;
}

export interface CheckEmailResponse {
  requires_password: boolean;
}

export interface UserImportResult {
  imported: number;
  updated: number;
  total: number;
}

export interface InviteUserResponse {
  user: WorkspaceUser;
  temp_password: string | null;
}

export type SystemRole = "system-admin" | "ai-leader" | "employee";

export interface AuthStatus {
  initialized: boolean;
}

// ── Conversation Intelligence ──────────────────────────────────────────────

export interface ConversationConfig {
  conversation_privacy_level: number | null;
  conversation_date_range_days: number | null;
  conversation_token_budget_usd: number | null;
  conversation_asset_scope: string[] | null;
}

export interface ConversationSyncLog {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  date_range_start: string | null;
  date_range_end: string | null;
  privacy_level: number | null;
  events_fetched: number;
  events_processed: number;
  assets_covered: number;
  assets_analyzed: number;
  assets_skipped_unchanged: number;
  skipped_events: number;
  estimated_cost_usd: number | null;
  actual_cost_usd: number | null;
  tokens_input: number;
  tokens_output: number;
  errors: Record<string, unknown>[] | null;
}

export interface TopicItem {
  topic: string;
  pct: number;
  example_phrases: string[];
}

export interface KnowledgeGapSignal {
  topic: string;
  frequency: number;
  example_question: string;
}

export interface AssetUsageInsight {
  id: number;
  asset_id: string;
  date_range_start: string | null;
  date_range_end: string | null;
  conversation_count: number;
  unique_user_count: number;
  avg_messages_per_conversation: number | null;
  top_topics: TopicItem[] | null;
  task_distribution: Record<string, number> | null;
  drift_alert: string | null;
  knowledge_gap_signals: KnowledgeGapSignal[] | null;
  prompting_quality_from_messages: number | null;
  analyzed_at: string;
  tokens_used: number;
  cost_usd: number | null;
  privacy_level: number;
  // Week-over-week (computed at query time)
  prior_conversation_count: number | null;
  conversation_count_delta: number | null;
}

export interface UserUsageInsight {
  id: number;
  asset_id: string;
  user_email: string;
  user_department: string | null;
  conversation_count: number;
  last_active_at: string | null;
  avg_messages_per_conversation: number | null;
  prompting_quality_score: number | null;
  primary_use_cases: { topic: string; pct: number }[] | null;
  role_fit_score: number | null;
  analyzed_at: string;
}

export interface ConversationEstimate {
  assets_to_analyze: number;
  assets_unchanged: number;
  estimated_tokens: number;
  estimated_cost_usd: number;
  prerequisite_met: boolean;
}

export interface ConversationOverview {
  total_conversations: number;
  active_users: number;
  active_assets: number;
  ghost_assets: number;
  top_assets: { asset_id: string; conversation_count: number; avg_messages?: number }[];
  drift_alerts: number;
  drift_asset_ids: string[];
  drift_details: { asset_id: string; drift_alert: string }[];
  ghost_asset_ids: string[];
  knowledge_gap_assets: { asset_id: string; signals: { topic: string; frequency: number; example_question: string }[] }[];
  date_range_days: number;
}

export interface ConversationPipelineStatus {
  running: boolean;
  progress: number;
  stage: string;
  assets_total: number;
  assets_done: number;
  assets_skipped: number;
  sync_log_id: number | null;
  error: string | null;
}
