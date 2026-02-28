from datetime import datetime

from pydantic import BaseModel


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
    categories_used: list[CategoryCount]
    last_sync: SyncLogRead | None


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
    primary_category: str | None = None
    secondary_category: str | None = None
    classification_confidence: float | None
    llm_summary: str | None

    model_config = {"from_attributes": True}
