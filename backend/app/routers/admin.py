from fastapi import APIRouter, Depends
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import GPT, PipelineLogEntry

router = APIRouter(tags=["admin"])


@router.post("/admin/reset")
async def reset_registry(db: AsyncSession = Depends(get_db)):
    await db.execute(delete(GPT))
    await db.execute(delete(PipelineLogEntry))
    await db.commit()
    return {"message": "Registry reset. GPTs and pipeline logs cleared. Sync history and categories preserved."}
