from fastapi import APIRouter, Depends
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import (
    GPT,
    Category,
    PipelineLogEntry,
    SyncLog,
    Workshop,
    WorkshopGPTTag,
    WorkshopParticipant,
)
from app.services.demo_state import set_demo_state

router = APIRouter(tags=["admin"])


@router.post("/admin/reset")
async def reset_registry(db: AsyncSession = Depends(get_db)):
    # Delete in dependency order to avoid FK violations
    await db.execute(delete(WorkshopGPTTag))
    await db.execute(delete(WorkshopParticipant))
    await db.execute(delete(Workshop))
    await db.execute(delete(GPT))
    await db.execute(delete(PipelineLogEntry))
    await db.execute(delete(SyncLog))
    await db.execute(delete(Category))
    await db.commit()
    # Reset in-memory demo flag so auto-restore doesn't re-enable it
    set_demo_state(False, "medium")
    return {"message": "Full reset complete."}
