import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import settings
from app.database import async_session
from app.models.models import Configuration, SyncLog
from app.routers import (
    admin,
    auth,
    categories,
    clustering,
    configuration,
    demo,
    learning,
    pipeline,
    users,
)
from app.services.pipeline import get_pipeline_status, run_pipeline

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s"
)
logger = logging.getLogger(__name__)

_AUTO_SYNC_INTERVAL_CHECK = 3600  # check once per hour


def _should_run_auto_sync(
    config,
    last_sync,
    pipeline_running: bool,
) -> bool:
    """Pure logic: given current state, should we fire a sync?

    Args:
        config: Configuration ORM object (or None)
        last_sync: Most recent completed SyncLog (or None)
        pipeline_running: whether the pipeline is currently running

    Returns:
        True if auto-sync should be triggered now.
    """
    if not config or not config.auto_sync_enabled:
        return False
    if pipeline_running:
        return False
    if last_sync and last_sync.finished_at:
        elapsed_hours = (
            datetime.now(timezone.utc) - last_sync.finished_at
        ).total_seconds() / 3600
        if elapsed_hours < config.auto_sync_interval_hours:
            return False
    return True


async def _auto_sync_loop():
    """Background task: fires run_pipeline() when auto-sync conditions are met.

    Wakes up every hour. Checks:
      1. auto_sync_enabled is True
      2. last completed sync was >= auto_sync_interval_hours ago (or never synced)
      3. pipeline is not already running
    """
    while True:
        await asyncio.sleep(_AUTO_SYNC_INTERVAL_CHECK)
        try:
            async with async_session() as db:
                result = await db.execute(
                    select(Configuration).where(Configuration.id == 1)
                )
                config = result.scalar_one_or_none()

                last_result = await db.execute(
                    select(SyncLog)
                    .where(SyncLog.status == "completed")
                    .order_by(SyncLog.finished_at.desc())
                    .limit(1)
                )
                last_sync = last_result.scalar_one_or_none()

            pipeline_running = get_pipeline_status()["running"]
            if not _should_run_auto_sync(config, last_sync, pipeline_running):
                continue

            logger.info("Auto-sync: triggering scheduled pipeline run")
            asyncio.create_task(run_pipeline())

        except Exception as e:
            logger.warning(f"Auto-sync check failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(_auto_sync_loop())
    yield


app = FastAPI(title="AgentsOrg", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.backend_cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(configuration.router, prefix="/api/v1")
app.include_router(categories.router, prefix="/api/v1")
app.include_router(pipeline.router, prefix="/api/v1")
app.include_router(demo.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(clustering.router, prefix="/api/v1")
app.include_router(learning.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")


@app.get("/api/v1/health")
async def health():
    return {"status": "ok"}
