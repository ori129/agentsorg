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
