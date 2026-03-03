import asyncio

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import Category, GPT, PipelineLogEntry, SyncLog
from app.schemas.schemas import (
    CategoryCount,
    GPTRead,
    PipelineLogEntryRead,
    PipelineStatus,
    PipelineSummary,
    SyncLogRead,
)
from app.services.pipeline import get_pipeline_status, run_pipeline

router = APIRouter(tags=["pipeline"])


@router.post("/pipeline/run")
async def start_pipeline():
    status = get_pipeline_status()
    if status["running"]:
        raise HTTPException(status_code=409, detail="Pipeline is already running")
    # Start pipeline as a concurrent task (not BackgroundTasks which runs after response)
    asyncio.create_task(run_pipeline())
    # Wait for the pipeline to initialize and create sync_log
    for _ in range(20):
        await asyncio.sleep(0.1)
        status = get_pipeline_status()
        if status["sync_log_id"] is not None and status["running"]:
            break
    return get_pipeline_status()


@router.get("/pipeline/status", response_model=PipelineStatus)
async def get_status():
    return get_pipeline_status()


@router.get("/pipeline/logs/{sync_log_id}", response_model=list[PipelineLogEntryRead])
async def get_logs(sync_log_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PipelineLogEntry)
        .where(PipelineLogEntry.sync_log_id == sync_log_id)
        .order_by(PipelineLogEntry.id)
    )
    return result.scalars().all()


@router.get("/pipeline/summary", response_model=PipelineSummary)
async def get_summary(db: AsyncSession = Depends(get_db)):
    # Get last completed sync
    result = await db.execute(
        select(SyncLog)
        .where(SyncLog.status.in_(["completed", "failed"]))
        .order_by(SyncLog.finished_at.desc())
        .limit(1)
    )
    last_sync = result.scalar_one_or_none()

    # Count GPTs
    total_result = await db.execute(select(func.count(GPT.id)))
    total = total_result.scalar() or 0

    # Category distribution
    categories_used: list[CategoryCount] = []
    if total > 0:
        cat_result = await db.execute(
            select(Category.name, Category.color, func.count(GPT.id))
            .join(GPT, GPT.primary_category_id == Category.id)
            .group_by(Category.name, Category.color)
            .order_by(func.count(GPT.id).desc())
        )
        for name, color, count in cat_result.all():
            categories_used.append(CategoryCount(name=name, count=count, color=color))

    return PipelineSummary(
        total_gpts=last_sync.total_gpts_found if last_sync else 0,
        filtered_gpts=total,
        classified_gpts=last_sync.gpts_classified if last_sync else 0,
        embedded_gpts=last_sync.gpts_embedded if last_sync else 0,
        categories_used=categories_used,
        last_sync=SyncLogRead.model_validate(last_sync) if last_sync else None,
    )


@router.get("/pipeline/gpts", response_model=list[GPTRead])
async def list_gpts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(GPT).order_by(GPT.created_at.desc())
    )
    gpts = result.scalars().all()

    # Build category lookup for names
    cat_result = await db.execute(select(Category))
    cat_lookup = {c.id: c.name for c in cat_result.scalars().all()}

    out = []
    for g in gpts:
        out.append(GPTRead(
            id=g.id,
            name=g.name,
            description=g.description,
            owner_email=g.owner_email,
            builder_name=g.builder_name,
            created_at=g.created_at,
            visibility=g.visibility,
            shared_user_count=g.shared_user_count,
            tools=g.tools,
            builder_categories=g.builder_categories,
            primary_category=cat_lookup.get(g.primary_category_id),
            secondary_category=cat_lookup.get(g.secondary_category_id),
            classification_confidence=g.classification_confidence,
            llm_summary=g.llm_summary,
            use_case_description=g.use_case_description,
        ))
    return out


@router.get("/pipeline/history", response_model=list[SyncLogRead])
async def get_history(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SyncLog).order_by(SyncLog.started_at.desc()).limit(20)
    )
    return result.scalars().all()
