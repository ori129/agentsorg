from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class ConfigurationRead(BaseModel):
    id: int
    workspace_id: str | None
    compliance_api_key: str | None  # masked
    base_url: str
    openai_api_key: str | None  # masked
    classification_enabled: bool
    classification_model: str
    max_categories_per_gpt: int
    visibility_filters: dict
    include_all: bool
    min_shared_users: int
    excluded_emails: list[str]
    auto_sync_enabled: bool = False
    auto_sync_interval_hours: int = 24

    model_config = {"from_attributes": True}


class ConfigurationUpdate(BaseModel):
    workspace_id: str | None = None
    compliance_api_key: str | None = None
    base_url: str | None = None
    openai_api_key: str | None = None
    classification_enabled: bool | None = None
    classification_model: str | None = None
    max_categories_per_gpt: int | None = None
    visibility_filters: dict | None = None
    include_all: bool | None = None
    min_shared_users: int | None = None
    excluded_emails: list[str] | None = None


class TestConnectionResult(BaseModel):
    success: bool
    message: str
    gpt_count: int | None = None


class CategoryRead(BaseModel):
    id: int
    name: str
    description: str | None
    color: str
    enabled: bool
    sort_order: int

    model_config = {"from_attributes": True}


class CategoryCreate(BaseModel):
    name: str
    description: str | None = None
    color: str = "#6B7280"
    enabled: bool = True
    sort_order: int = 0


class CategoryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    color: str | None = None
    enabled: bool | None = None
    sort_order: int | None = None


class PipelineLogEntryRead(BaseModel):
    id: int
    sync_log_id: int
    timestamp: datetime
    level: str
    message: str

    model_config = {"from_attributes": True}


class SyncLogRead(BaseModel):
    id: int
    started_at: datetime
    finished_at: datetime | None
    status: str
    total_gpts_found: int
    gpts_after_filter: int
    gpts_classified: int
    gpts_embedded: int
    errors: list
    tokens_input: int = 0
    tokens_output: int = 0
    estimated_cost_usd: float | None = None
    # KPI snapshots (migration 017)
    avg_quality_score: float | None = None
    avg_adoption_score: float | None = None
    avg_risk_score: float | None = None
    champion_count: int = 0
    hidden_gem_count: int = 0
    scaled_risk_count: int = 0
    retirement_count: int = 0
    ghost_asset_count: int = 0
    high_risk_count: int = 0
    total_asset_count: int = 0

    model_config = {"from_attributes": True}


class PortfolioTrendPoint(BaseModel):
    """One data point per pipeline run for the Portfolio Health timeline chart."""

    sync_log_id: int
    synced_at: datetime
    avg_quality_score: float | None
    avg_adoption_score: float | None
    avg_risk_score: float | None
    champion_count: int
    hidden_gem_count: int
    scaled_risk_count: int
    retirement_count: int
    ghost_asset_count: int
    high_risk_count: int
    total_asset_count: int

    model_config = {"from_attributes": True}


class GptScoreHistoryPoint(BaseModel):
    """One per-asset score snapshot for the longitudinal asset journey view."""

    id: int
    gpt_id: str
    sync_log_id: int | None
    synced_at: datetime
    quality_score: float | None
    adoption_score: float | None
    risk_score: float | None
    quadrant_label: str | None

    model_config = {"from_attributes": True}


class SyncConfigPatch(BaseModel):
    auto_sync_enabled: bool | None = None
    auto_sync_interval_hours: int | None = None


class SyncConfigRead(BaseModel):
    auto_sync_enabled: bool
    auto_sync_interval_hours: int

    model_config = {"from_attributes": True}


class PipelineStatus(BaseModel):
    running: bool
    sync_log_id: int | None
    progress: float
    stage: str


class CategoryCount(BaseModel):
    name: str
    count: int
    color: str


class PipelineSummary(BaseModel):
    total_gpts: int
    filtered_gpts: int
    classified_gpts: int
    embedded_gpts: int
    gpt_count: int
    project_count: int
    categories_used: list[CategoryCount]
    last_sync: SyncLogRead | None
    # Score stats (populated after Stage 6)
    scores_assessed: int = 0
    avg_quality_score: float | None = None
    avg_adoption_score: float | None = None
    avg_risk_score: float | None = None
    champions: int = 0
    hidden_gems: int = 0
    scaled_risk: int = 0
    retirement_candidates: int = 0
    ghost_assets: int = 0
    # Workflow coverage counts (populated by /pipeline/workflows)
    workflows_covered: int = 0
    workflow_gaps: int = 0


class WorkflowAssetRef(BaseModel):
    id: str
    name: str
    conversation_count: int
    quadrant_label: str | None = None


class WorkflowCoverageItem(BaseModel):
    """One canonical business workflow and its coverage status."""

    name: str
    status: str  # "covered" | "ghost" | "intent_gap"
    asset_count: int
    conversation_count: int
    assets: list[WorkflowAssetRef]
    intent_signals: list[dict]  # matching topics [{topic, pct, example_phrases}]
    example_phrases: list[str]  # top example phrases (for intent_gap rows)
    # LLM-generated analysis (populated after /pipeline/workflows/analyze)
    reasoning: str | None = None
    priority_action: str | None = None
    priority_level: str | None = None  # "low" | "medium" | "high" | "critical"


class GPTRead(BaseModel):
    id: str
    name: str
    description: str | None
    owner_email: str | None
    builder_name: str | None
    created_at: datetime | None
    visibility: str | None
    shared_user_count: int
    tools: list | None
    builder_categories: list | None
    conversation_starters: list | None = None
    primary_category: str | None = None
    secondary_category: str | None = None
    classification_confidence: float | None
    llm_summary: str | None
    use_case_description: str | None = None
    instructions: str | None = None
    asset_type: str = "gpt"
    # Semantic enrichment fields
    business_process: str | None = None
    risk_flags: list | None = None
    risk_level: str | None = None
    sophistication_score: int | None = None
    sophistication_rationale: str | None = None
    prompting_quality_score: int | None = None
    prompting_quality_rationale: str | None = None
    prompting_quality_flags: list | None = None
    roi_potential_score: int | None = None
    roi_rationale: str | None = None
    intended_audience: str | None = None
    integration_flags: list | None = None
    output_type: str | None = None
    adoption_friction_score: int | None = None
    adoption_friction_rationale: str | None = None
    semantic_enriched_at: datetime | None = None
    purpose_fingerprint: str | None = None
    # Conversation stats
    conversation_count: int = 0
    last_conversation_at: datetime | None = None
    # LLM-assessed composite scores
    quality_score: float | None = None
    quality_score_rationale: str | None = None
    quality_main_strength: str | None = None
    quality_main_weakness: str | None = None
    adoption_score: float | None = None
    adoption_score_rationale: str | None = None
    adoption_signal: str | None = None
    adoption_barrier: str | None = None
    risk_score: float | None = None
    risk_score_rationale: str | None = None
    risk_primary_driver: str | None = None
    risk_urgency: str | None = None
    quadrant_label: str | None = None
    top_action: str | None = None
    score_confidence: str | None = None
    scores_assessed_at: datetime | None = None

    model_config = {"from_attributes": True}


class GPTSearchResult(GPTRead):
    reasoning: str | None = None
    confidence: str | None = None  # "high" | "medium" | "low"
    match_score: int | None = None  # 0-100


class WorkshopCreate(BaseModel):
    title: str
    description: str | None = None
    event_date: date
    duration_hours: float | None = None
    facilitator: str | None = None


class WorkshopRead(WorkshopCreate):
    id: int
    created_at: datetime
    participant_count: int
    participant_emails: list[str] = []
    tagged_gpt_count: int
    model_config = ConfigDict(from_attributes=True)


class CustomCourseRead(BaseModel):
    id: int
    url: str
    description: str
    uploaded_at: datetime
    model_config = ConfigDict(from_attributes=True)


class CustomCourseUploadResult(BaseModel):
    added: int
    updated: int
    errors: list[str]


class BuilderRecognition(BaseModel):
    email: str
    name: str | None
    composite_score: float
    volume_score: float
    quality_score: float
    adoption_score: float
    risk_hygiene_score: float
    gpt_count: int
    avg_sophistication: float | None
    avg_quality: float | None


class CourseRecommendation(BaseModel):
    course_name: str
    url: str
    category: str
    reasoning: str
    priority: int


class OrgLearningReport(BaseModel):
    skill_gaps: list[str]
    recommended_courses: list[CourseRecommendation]
    summary: str


class EmployeeLearningReport(BaseModel):
    employee_email: str
    recommended_courses: list[CourseRecommendation]
    gap_summary: str


class WorkshopImpactAuto(BaseModel):
    participant_email: str
    gpts_before: int
    gpts_after: int
    avg_quality_before: float | None
    avg_quality_after: float | None
    avg_sophistication_before: float | None
    avg_sophistication_after: float | None


class TaggedAssetDetail(BaseModel):
    gpt_id: str
    name: str
    asset_type: str
    owner_email: str | None
    quality_score: float | None
    sophistication_score: float | None
    roi_potential_score: float | None
    risk_level: str | None
    primary_category: str | None


class WorkshopImpact(BaseModel):
    workshop_id: int
    auto_stats: list[WorkshopImpactAuto]
    tagged_gpts: list[str]
    tagged_asset_details: list[TaggedAssetDetail]
    summary_delta_quality: float | None
    summary_delta_sophistication: float | None


class ClusterGroup(BaseModel):
    cluster_id: str = ""
    theme: str
    gpt_ids: list[str]
    gpt_names: list[str]
    estimated_wasted_hours: float | None = None
    business_process: str | None = None
    departments: list[str] | None = None
    confidence: float | None = None
    candidate_gpt_id: str | None = None
    recommended_action: str | None = None
    cluster_explanation: str | None = None


class ClusterActionRequest(BaseModel):
    action: str  # certify | publish | assign_owner | archive_variants | add_notes
    owner_email: str | None = None
    notes: str | None = None


class ClusterActionResponse(BaseModel):
    cluster_id: str
    action: str
    owner_email: str | None = None
    notes: str | None = None
    saved_at: str


class ClusteringStatus(BaseModel):
    status: str  # idle | running | completed


class WorkspaceUserRead(BaseModel):
    id: str
    email: str
    name: str | None
    created_at: datetime | None
    role: str
    status: str
    system_role: str
    imported_at: datetime
    password_temp: bool = False

    model_config = ConfigDict(from_attributes=True)


class UserImportResult(BaseModel):
    imported: int
    updated: int
    total: int


class AuthStatus(BaseModel):
    initialized: bool


class RegisterRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str | None = None


class CheckEmailResponse(BaseModel):
    requires_password: bool


class LoginResponse(BaseModel):
    user: WorkspaceUserRead
    token: str


class ChangePasswordRequest(BaseModel):
    old_password: str | None = None
    new_password: str


class ResetPasswordResponse(BaseModel):
    temp_password: str


class SystemRoleUpdate(BaseModel):
    system_role: str  # system-admin | ai-leader | employee


class InviteUserRequest(BaseModel):
    email: str
    name: str | None = None
    system_role: str = "employee"


class InviteUserResponse(BaseModel):
    user: WorkspaceUserRead
    temp_password: str | None = None


# ── Conversation Intelligence ─────────────────────────────────────────────────


class ConversationConfig(BaseModel):
    conversation_privacy_level: int | None = None
    conversation_date_range_days: int | None = None
    conversation_token_budget_usd: float | None = None
    conversation_asset_scope: list[str] | None = None

    model_config = {"from_attributes": True}


class ConversationSyncLogRead(BaseModel):
    id: int
    started_at: datetime
    finished_at: datetime | None
    status: str
    date_range_start: datetime | None
    date_range_end: datetime | None
    privacy_level: int | None
    events_fetched: int
    events_processed: int
    assets_covered: int
    assets_analyzed: int
    assets_skipped_unchanged: int
    skipped_events: int
    estimated_cost_usd: float | None
    actual_cost_usd: float | None
    tokens_input: int
    tokens_output: int
    errors: list | None

    model_config = {"from_attributes": True}


class AssetUsageInsightRead(BaseModel):
    id: int
    asset_id: str
    date_range_start: datetime | None
    date_range_end: datetime | None
    conversation_count: int
    unique_user_count: int
    avg_messages_per_conversation: float | None
    top_topics: list | None
    task_distribution: dict | None
    drift_alert: str | None
    knowledge_gap_signals: list | None
    prompting_quality_from_messages: float | None
    analyzed_at: datetime
    tokens_used: int
    cost_usd: float | None
    privacy_level: int
    # Week-over-week fields (computed at query time, not stored)
    prior_conversation_count: int | None = None
    conversation_count_delta: int | None = None

    model_config = {"from_attributes": True}


class UserUsageInsightRead(BaseModel):
    id: int
    asset_id: str
    user_email: str
    user_department: str | None
    conversation_count: int
    last_active_at: datetime | None
    avg_messages_per_conversation: float | None
    prompting_quality_score: float | None
    primary_use_cases: list | None
    role_fit_score: float | None
    analyzed_at: datetime

    model_config = {"from_attributes": True}


class ConversationEstimate(BaseModel):
    assets_to_analyze: int
    assets_unchanged: int
    estimated_tokens: int
    estimated_cost_usd: float
    prerequisite_met: bool


class ConversationOverview(BaseModel):
    total_conversations: int
    active_users: int
    active_assets: int
    ghost_assets: int
    top_assets: list[dict]  # [{asset_id, conversation_count, avg_messages}]
    drift_alerts: int
    drift_asset_ids: list[str]
    drift_details: list[dict]  # [{asset_id, drift_alert}]
    ghost_asset_ids: list[str]  # IDs of ghost assets (zero conversations)
    knowledge_gap_assets: list[
        dict
    ]  # [{asset_id, signals: [{topic, frequency, example_question}]}]
    date_range_days: int


# ── Score Assessor / Priority Actions ────────────────────────────────────────


class PriorityAction(BaseModel):
    priority: int
    category: str  # quality | adoption | risk | learning | governance
    title: str
    description: str
    impact: str  # high | medium | low
    effort: str  # high | medium | low
    asset_ids: list[str] = []
    reasoning: str


class WorkspaceRecommendationRead(BaseModel):
    id: int
    generated_at: datetime
    sync_log_id: int | None
    recommendations: list[PriorityAction]
    executive_summary: str | None

    model_config = {"from_attributes": True}


class OrgLearningCacheRead(BaseModel):
    id: int
    generated_at: datetime
    skill_gaps: list | None
    recommended_courses: list | None
    summary: str | None

    model_config = {"from_attributes": True}


class EmployeeLearningCacheRead(BaseModel):
    id: int
    user_email: str
    generated_at: datetime
    skill_gaps: list | None
    recommended_courses: list | None
    gap_summary: str | None

    model_config = {"from_attributes": True}
