from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
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

    embedding = mapped_column(Vector(1536), nullable=True)

    sync_log_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("sync_logs.id")
    )
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    primary_category: Mapped["Category | None"] = relationship(
        foreign_keys=[primary_category_id]
    )
    secondary_category: Mapped["Category | None"] = relationship(
        foreign_keys=[secondary_category_id]
    )
    sync_log: Mapped["SyncLog | None"] = relationship(back_populates="gpts")


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
