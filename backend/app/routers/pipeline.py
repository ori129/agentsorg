import asyncio

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import Category, GPT, PipelineLogEntry, SyncLog
from app.schemas.schemas import (
    CategoryCount,
    PipelineLogEntryRead,
    PipelineStatus,
    PipelineSummary,
    SyncLogRead,
)
from app.services.pipeline import get_pipeline_status, run_pipeline

router = APIRouter(tags=["pipeline"])


@router.post("/pipeline/run")
async def start_pipeline(background_tasks: BackgroundTasks):
    status = get_pipeline_status()
    if status["running"]:
        raise HTTPException(status_code=409, detail="Pipeline is already running")
    background_tasks.add_task(run_pipeline)
    # Small delay to let the pipeline initialize sync_log_id
    await asyncio.sleep(0.2)
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
        .where(SyncLog.status == "completed")
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


@router.get("/pipeline/history", response_model=list[SyncLogRead])
async def get_history(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SyncLog).order_by(SyncLog.started_at.desc()).limit(20)
    )
    return result.scalars().all()
