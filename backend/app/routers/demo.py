from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import SyncLog
from app.services.demo_state import SIZE_MAP, get_demo_state, set_demo_state

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
async def get_demo(db: AsyncSession = Depends(get_db)):
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
async def update_demo(body: DemoStateUpdate, db: AsyncSession = Depends(get_db)):
    state = set_demo_state(body.enabled, body.size)
    was_demo = await _last_sync_was_demo(db)
    return DemoStateRead(
        enabled=state["enabled"],
        size=state["size"],
        gpt_count=SIZE_MAP[state["size"]],
        last_sync_was_demo=was_demo,
    )
