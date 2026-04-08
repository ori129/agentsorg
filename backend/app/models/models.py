from datetime import date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Configuration(Base):
    __tablename__ = "configurations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    workspace_id: Mapped[str | None] = mapped_column(String(255))
    compliance_api_key: Mapped[str | None] = mapped_column(Text)  # Fernet encrypted
    base_url: Mapped[str] = mapped_column(
        String(512), default="https://api.chatgpt.com/v1"
    )
    openai_api_key: Mapped[str | None] = mapped_column(Text)  # Fernet encrypted
    classification_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    classification_model: Mapped[str] = mapped_column(
        String(100), default="gpt-4o-mini"
    )
    max_categories_per_gpt: Mapped[int] = mapped_column(Integer, default=2)
    visibility_filters: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    include_all: Mapped[bool] = mapped_column(Boolean, default=True)
    min_shared_users: Mapped[int] = mapped_column(Integer, default=0)
    excluded_emails: Mapped[list | None] = mapped_column(JSONB, default=list)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    # Auto-sync scheduler config
    auto_sync_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_sync_interval_hours: Mapped[int] = mapped_column(Integer, default=24)
    # Conversation Intelligence config
    conversation_privacy_level: Mapped[int] = mapped_column(Integer, default=3)
    conversation_date_range_days: Mapped[int] = mapped_column(Integer, default=30)
    conversation_token_budget_usd: Mapped[float] = mapped_column(Float, default=10.0)
    conversation_asset_scope: Mapped[list | None] = mapped_column(JSONB, default=None)


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    color: Mapped[str] = mapped_column(String(7), default="#6B7280")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class SyncLog(Base):
    __tablename__ = "sync_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="running")
    total_gpts_found: Mapped[int] = mapped_column(Integer, default=0)
    gpts_after_filter: Mapped[int] = mapped_column(Integer, default=0)
    gpts_classified: Mapped[int] = mapped_column(Integer, default=0)
    gpts_embedded: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[dict | None] = mapped_column(JSONB, default=list)
    configuration_snapshot: Mapped[dict | None] = mapped_column(JSONB)
    # LLM token consumption tracking
    tokens_input: Mapped[int] = mapped_column(Integer, default=0)
    tokens_output: Mapped[int] = mapped_column(Integer, default=0)
    estimated_cost_usd: Mapped[float | None] = mapped_column(Float)
    # KPI snapshots — written at end of every pipeline run (migration 017)
    avg_quality_score: Mapped[float | None] = mapped_column(Float)
    avg_adoption_score: Mapped[float | None] = mapped_column(Float)
    avg_risk_score: Mapped[float | None] = mapped_column(Float)
    champion_count: Mapped[int] = mapped_column(Integer, default=0)
    hidden_gem_count: Mapped[int] = mapped_column(Integer, default=0)
    scaled_risk_count: Mapped[int] = mapped_column(Integer, default=0)
    retirement_count: Mapped[int] = mapped_column(Integer, default=0)
    ghost_asset_count: Mapped[int] = mapped_column(Integer, default=0)
    high_risk_count: Mapped[int] = mapped_column(Integer, default=0)
    total_asset_count: Mapped[int] = mapped_column(Integer, default=0)

    gpts: Mapped[list["GPT"]] = relationship(back_populates="sync_log")
    log_entries: Mapped[list["PipelineLogEntry"]] = relationship(
        back_populates="sync_log"
    )


class GPT(Base):
    __tablename__ = "gpts"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    instructions: Mapped[str | None] = mapped_column(Text)
    owner_email: Mapped[str | None] = mapped_column(String(255))
    builder_name: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    visibility: Mapped[str | None] = mapped_column(String(50))
    recipients: Mapped[list | None] = mapped_column(JSONB)
    shared_user_count: Mapped[int] = mapped_column(Integer, default=0)
    tools: Mapped[list | None] = mapped_column(JSONB)
    files: Mapped[list | None] = mapped_column(JSONB)
    builder_categories: Mapped[list | None] = mapped_column(JSONB)
    conversation_starters: Mapped[list | None] = mapped_column(JSONB)

    primary_category_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("categories.id", ondelete="SET NULL")
    )
    secondary_category_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("categories.id", ondelete="SET NULL")
    )
    classification_confidence: Mapped[float | None] = mapped_column(Float)
    llm_summary: Mapped[str | None] = mapped_column(Text)
    use_case_description: Mapped[str | None] = mapped_column(Text)

    embedding = mapped_column(Vector(1536), nullable=True)

    # Semantic enrichment fields
    business_process: Mapped[str | None] = mapped_column(Text)
    risk_flags: Mapped[list | None] = mapped_column(JSONB)
    risk_level: Mapped[str | None] = mapped_column(String(10))
    sophistication_score: Mapped[int | None] = mapped_column(Integer)
    sophistication_rationale: Mapped[str | None] = mapped_column(Text)
    prompting_quality_score: Mapped[int | None] = mapped_column(Integer)
    prompting_quality_rationale: Mapped[str | None] = mapped_column(Text)
    prompting_quality_flags: Mapped[list | None] = mapped_column(JSONB)
    roi_potential_score: Mapped[int | None] = mapped_column(Integer)
    roi_rationale: Mapped[str | None] = mapped_column(Text)
    intended_audience: Mapped[str | None] = mapped_column(Text)
    integration_flags: Mapped[list | None] = mapped_column(JSONB)
    output_type: Mapped[str | None] = mapped_column(String(50))
    adoption_friction_score: Mapped[int | None] = mapped_column(Integer)
    adoption_friction_rationale: Mapped[str | None] = mapped_column(Text)
    semantic_enriched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    purpose_fingerprint: Mapped[str | None] = mapped_column(Text)

    asset_type: Mapped[str] = mapped_column(String(32), default="gpt", nullable=False)
    conversation_count: Mapped[int] = mapped_column(Integer, default=0)
    last_conversation_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )

    # LLM-assessed composite scores (P04 — Stage 6)
    quality_score: Mapped[float | None] = mapped_column(Float)
    quality_score_rationale: Mapped[str | None] = mapped_column(Text)
    quality_main_strength: Mapped[str | None] = mapped_column(Text)
    quality_main_weakness: Mapped[str | None] = mapped_column(Text)

    adoption_score: Mapped[float | None] = mapped_column(Float)
    adoption_score_rationale: Mapped[str | None] = mapped_column(Text)
    adoption_signal: Mapped[str | None] = mapped_column(Text)
    adoption_barrier: Mapped[str | None] = mapped_column(Text)

    risk_score: Mapped[float | None] = mapped_column(Float)
    risk_score_rationale: Mapped[str | None] = mapped_column(Text)
    risk_primary_driver: Mapped[str | None] = mapped_column(Text)
    risk_urgency: Mapped[str | None] = mapped_column(String(10))  # low|medium|high|critical

    quadrant_label: Mapped[str | None] = mapped_column(String(30))  # champion|hidden_gem|scaled_risk|retirement_candidate
    top_action: Mapped[str | None] = mapped_column(Text)
    score_confidence: Mapped[str | None] = mapped_column(String(10))  # low|medium|high
    scores_assessed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    content_hash: Mapped[str | None] = mapped_column(String(64))
    sync_log_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("sync_logs.id"))
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    primary_category: Mapped["Category | None"] = relationship(
        foreign_keys=[primary_category_id]
    )
    secondary_category: Mapped["Category | None"] = relationship(
        foreign_keys=[secondary_category_id]
    )
    sync_log: Mapped["SyncLog | None"] = relationship(back_populates="gpts")


class Workshop(Base):
    __tablename__ = "workshops"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    event_date: Mapped[date] = mapped_column(Date, nullable=False)
    duration_hours: Mapped[float | None] = mapped_column(Float)
    facilitator: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    participants: Mapped[list["WorkshopParticipant"]] = relationship(
        back_populates="workshop", cascade="all, delete-orphan"
    )
    gpt_tags: Mapped[list["WorkshopGPTTag"]] = relationship(
        back_populates="workshop", cascade="all, delete-orphan"
    )


class WorkshopParticipant(Base):
    __tablename__ = "workshop_participants"

    workshop_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("workshops.id", ondelete="CASCADE"), primary_key=True
    )
    employee_email: Mapped[str] = mapped_column(String(200), primary_key=True)
    workshop: Mapped["Workshop"] = relationship(back_populates="participants")


class WorkshopGPTTag(Base):
    __tablename__ = "workshop_gpt_tags"

    workshop_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("workshops.id", ondelete="CASCADE"), primary_key=True
    )
    gpt_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    tagged_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    workshop: Mapped["Workshop"] = relationship(back_populates="gpt_tags")


class CustomCourse(Base):
    __tablename__ = "custom_courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    url: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class PipelineLogEntry(Base):
    __tablename__ = "pipeline_log_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sync_log_id: Mapped[int] = mapped_column(Integer, ForeignKey("sync_logs.id"))
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    level: Mapped[str] = mapped_column(String(10), default="info")
    message: Mapped[str] = mapped_column(Text, nullable=False)

    sync_log: Mapped["SyncLog"] = relationship(back_populates="log_entries")


class GptScoreHistory(Base):
    """Append-only per-asset score snapshot written at end of every pipeline run.
    Never overwritten. Powers the longitudinal asset journey view.
    """

    __tablename__ = "gpt_score_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    gpt_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("gpts.id", ondelete="CASCADE"), nullable=False
    )
    sync_log_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("sync_logs.id", ondelete="SET NULL"), nullable=True
    )
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    quality_score: Mapped[float | None] = mapped_column(Float)
    adoption_score: Mapped[float | None] = mapped_column(Float)
    risk_score: Mapped[float | None] = mapped_column(Float)
    quadrant_label: Mapped[str | None] = mapped_column(String(30))


class WorkspaceUser(Base):
    __tablename__ = "workspace_users"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    system_role: Mapped[str] = mapped_column(
        String(20), nullable=False, default="employee"
    )
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    password_temp: Mapped[bool] = mapped_column(Boolean, default=False)


class ConversationEvent(Base):
    """One row per JSONL event (one message). Raw message content NEVER stored."""

    __tablename__ = "conversation_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    conversation_id: Mapped[str] = mapped_column(String(255), nullable=False)
    asset_id: Mapped[str | None] = mapped_column(
        String(255), ForeignKey("gpts.id", ondelete="SET NULL"), nullable=True
    )
    user_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AssetUsageInsight(Base):
    """Aggregated LLM-derived insights per asset per analysis run."""

    __tablename__ = "asset_usage_insights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asset_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("gpts.id", ondelete="CASCADE"), nullable=False
    )
    date_range_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    date_range_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    conversation_count: Mapped[int] = mapped_column(Integer, default=0)
    unique_user_count: Mapped[int] = mapped_column(Integer, default=0)
    avg_messages_per_conversation: Mapped[float | None] = mapped_column(Float)
    top_topics: Mapped[list | None] = mapped_column(JSONB)
    task_distribution: Mapped[dict | None] = mapped_column(JSONB)
    drift_alert: Mapped[str | None] = mapped_column(Text)
    knowledge_gap_signals: Mapped[list | None] = mapped_column(JSONB)
    prompting_quality_from_messages: Mapped[float | None] = mapped_column(Float)
    analyzed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float | None] = mapped_column(Float)
    privacy_level: Mapped[int] = mapped_column(Integer, default=3)


class UserUsageInsight(Base):
    """Per-employee per-asset insight. Level 3 only."""

    __tablename__ = "user_usage_insights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    asset_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("gpts.id", ondelete="CASCADE"), nullable=False
    )
    user_email: Mapped[str] = mapped_column(String(255), nullable=False)
    user_department: Mapped[str | None] = mapped_column(String(255))
    conversation_count: Mapped[int] = mapped_column(Integer, default=0)
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    avg_messages_per_conversation: Mapped[float | None] = mapped_column(Float)
    prompting_quality_score: Mapped[float | None] = mapped_column(Float)
    primary_use_cases: Mapped[list | None] = mapped_column(JSONB)
    role_fit_score: Mapped[float | None] = mapped_column(Float)
    analyzed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ConversationSyncLog(Base):
    """Audit log for each conversation pipeline run."""

    __tablename__ = "conversation_sync_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(30), default="running")
    date_range_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    date_range_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    privacy_level: Mapped[int | None] = mapped_column(Integer)
    events_fetched: Mapped[int] = mapped_column(Integer, default=0)
    events_processed: Mapped[int] = mapped_column(Integer, default=0)
    assets_covered: Mapped[int] = mapped_column(Integer, default=0)
    assets_analyzed: Mapped[int] = mapped_column(Integer, default=0)
    assets_skipped_unchanged: Mapped[int] = mapped_column(Integer, default=0)
    skipped_events: Mapped[int] = mapped_column(Integer, default=0)
    estimated_cost_usd: Mapped[float | None] = mapped_column(Float)
    actual_cost_usd: Mapped[float | None] = mapped_column(Float)
    tokens_input: Mapped[int] = mapped_column(Integer, default=0)
    tokens_output: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[list | None] = mapped_column(JSONB)


class WorkspaceRecommendation(Base):
    """Pre-computed workspace-level priority actions + executive summary.
    One row per pipeline run — frontend reads the most recent row.
    """

    __tablename__ = "workspace_recommendations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    sync_log_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("sync_logs.id", ondelete="SET NULL"), nullable=True
    )
    recommendations: Mapped[list] = mapped_column(JSONB, nullable=False)  # list[PriorityAction]
    executive_summary: Mapped[str | None] = mapped_column(Text)


class OrgLearningCache(Base):
    """Cached org-level L&D recommendations — one row per pipeline run."""

    __tablename__ = "org_learning_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    sync_log_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("sync_logs.id", ondelete="SET NULL"), nullable=True
    )
    skill_gaps: Mapped[list | None] = mapped_column(JSONB)
    recommended_courses: Mapped[list | None] = mapped_column(JSONB)
    summary: Mapped[str | None] = mapped_column(Text)


class EmployeeLearningCache(Base):
    """Cached per-employee L&D recommendations — one row per employee, upserted on rebuild."""

    __tablename__ = "employee_learning_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    skill_gaps: Mapped[list | None] = mapped_column(JSONB)
    recommended_courses: Mapped[list | None] = mapped_column(JSONB)
    gap_summary: Mapped[str | None] = mapped_column(Text)


class ClusterCache(Base):
    """Persisted clustering results — one row per run, most-recent wins.
    Survives container restarts; loaded into _clustering_results on first GET.
    """

    __tablename__ = "cluster_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    results: Mapped[list] = mapped_column(JSONB, nullable=False)
    decisions: Mapped[list | None] = mapped_column(JSONB, nullable=True)


class WorkflowAnalysisCache(Base):
    """LLM-analyzed workflow coverage — one row per conversation pipeline run.
    Stores reasoning, priority action, and priority level per workflow.
    """

    __tablename__ = "workflow_analysis_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    conversation_sync_log_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("conversation_sync_logs.id", ondelete="SET NULL"), nullable=True
    )
    # list[{name, status, reasoning, priority_action, priority_level}]
    workflow_items: Mapped[list] = mapped_column(JSONB, nullable=False)


class LoginSession(Base):
    __tablename__ = "login_sessions"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(255),
        ForeignKey("workspace_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    user: Mapped["WorkspaceUser"] = relationship()
