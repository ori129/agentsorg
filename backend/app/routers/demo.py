import asyncio

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import require_auth, require_system_admin
from app.database import get_db
from app.models.models import Category, SyncLog
from app.services.demo_state import SIZE_MAP, get_demo_state, set_demo_state
from app.services.pipeline import get_pipeline_status, run_pipeline

router = APIRouter(tags=["demo"])


class DemoStateRead(BaseModel):
    enabled: bool
    size: str
    gpt_count: int
    last_sync_was_demo: bool = False


class DemoStateUpdate(BaseModel):
    enabled: bool
    size: str = "medium"


async def _last_sync_was_demo(db: AsyncSession) -> bool:
    result = await db.execute(
        select(SyncLog)
        .where(SyncLog.status.in_(["completed", "failed"]))
        .order_by(SyncLog.finished_at.desc())
        .limit(1)
    )
    last_sync = result.scalar_one_or_none()
    if not last_sync or not last_sync.configuration_snapshot:
        return False
    return bool(last_sync.configuration_snapshot.get("demo_mode", False))


@router.get("/demo", response_model=DemoStateRead)
async def get_demo(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    await require_auth(authorization, db)
    state = get_demo_state()
    was_demo = await _last_sync_was_demo(db)
    # Auto-restore in-memory state if server restarted mid-demo
    if was_demo and not state["enabled"]:
        set_demo_state(True, state["size"])
        state = get_demo_state()
    return DemoStateRead(
        enabled=state["enabled"],
        size=state["size"],
        gpt_count=SIZE_MAP[state["size"]],
        last_sync_was_demo=was_demo,
    )


@router.put("/demo", response_model=DemoStateRead)
async def update_demo(
    body: DemoStateUpdate,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    await require_system_admin(authorization, db)
    state = set_demo_state(body.enabled, body.size)
    was_demo = await _last_sync_was_demo(db)

    # Auto-run everything when demo mode is first enabled and no data exists yet.
    # Seed categories + asset pipeline + conversation pipeline run automatically —
    # the user never has to visit Sync.
    if body.enabled and not was_demo:
        # Seed default categories if none exist
        from app.routers.categories import DEFAULT_CATEGORIES

        cat_count_result = await db.execute(select(func.count()).select_from(Category))
        if cat_count_result.scalar_one() == 0:
            for i, cat_data in enumerate(DEFAULT_CATEGORIES):
                db.add(Category(**cat_data, sort_order=i))
            await db.commit()

        # Launch asset pipeline (conversation pipeline auto-triggers at end — see pipeline.py)
        status = get_pipeline_status()
        if not status["running"]:
            asyncio.create_task(run_pipeline())

    return DemoStateRead(
        enabled=state["enabled"],
        size=state["size"],
        gpt_count=SIZE_MAP[state["size"]],
        last_sync_was_demo=was_demo,
    )
