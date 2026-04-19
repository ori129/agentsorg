import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import func, select

from app.config import settings
from app.database import async_session
from app.models.models import Configuration, GPT, SyncLog, WorkspaceUser
from app.routers import (
    admin,
    auth,
    categories,
    clustering,
    configuration,
    conversations,
    demo,
    fingerprint,
    learning,
    oidc,
    pipeline,
    users,
)
from app.services.pipeline import get_pipeline_status, run_pipeline

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s"
)
logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address)

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
    try:
        from app.database import async_session
        from app.models.models import ConversationSyncLog, SyncLog
        from datetime import datetime, timezone
        from sqlalchemy import select, update

        async with async_session() as db:
            # Clean up logs left in "running" state from a prior crash
            await db.execute(
                update(ConversationSyncLog)
                .where(ConversationSyncLog.status == "running")
                .values(status="error", finished_at=datetime.now(timezone.utc))
            )
            await db.execute(
                update(SyncLog)
                .where(SyncLog.status == "running")
                .values(status="error", finished_at=datetime.now(timezone.utc))
            )
            # Restore asset pipeline status from last completed sync log so the
            # progress bar shows 100% instead of 0% after a server restart.
            from app.services.pipeline import _current_status

            last_sync_result = await db.execute(
                select(SyncLog).order_by(SyncLog.started_at.desc()).limit(1)
            )
            last_sync = last_sync_result.scalar_one_or_none()
            if last_sync and last_sync.status == "completed":
                _current_status["progress"] = 100.0
                _current_status["stage"] = "idle"
                _current_status["sync_log_id"] = last_sync.id
            await db.commit()
    except Exception as e:
        logger.warning(f"Startup init failed: {e}")

    # Hosted demo: seed demo user + data on first boot
    if settings.hosted_demo:
        try:
            await _seed_hosted_demo()
        except Exception as e:
            logger.warning(f"Hosted demo seed failed: {e}")

    yield


async def _seed_hosted_demo():
    """Ensure demo user exists and demo data is populated."""
    from app.models.models import GPT, Category
    from app.routers.categories import DEFAULT_CATEGORIES
    from app.routers.demo import DEMO_USER_EMAIL
    from app.services.demo_state import set_demo_state

    async with async_session() as db:
        # Ensure demo user exists
        result = await db.execute(
            select(WorkspaceUser).where(WorkspaceUser.email == DEMO_USER_EMAIL)
        )
        user = result.scalar_one_or_none()
        if not user:
            user = WorkspaceUser(
                email=DEMO_USER_EMAIL,
                system_role="system-admin",
                password_hash=None,
            )
            db.add(user)
            await db.commit()
            logger.info("Hosted demo: created demo user")

        # Check if GPT data already exists
        gpt_count_result = await db.execute(
            select(func.count()).select_from(GPT)
        )
        gpt_count = gpt_count_result.scalar_one()

        if gpt_count > 0:
            logger.info(f"Hosted demo: {gpt_count} GPTs already in DB, skipping seed")
            set_demo_state(True, "medium")
            return

        # Seed categories
        cat_count_result = await db.execute(
            select(func.count()).select_from(Category)
        )
        if cat_count_result.scalar_one() == 0:
            for i, cat_data in enumerate(DEFAULT_CATEGORIES):
                db.add(Category(**cat_data, sort_order=i))
            await db.commit()
            logger.info("Hosted demo: seeded default categories")

    # Enable demo mode and kick off the pipeline
    set_demo_state(True, "medium")
    status = get_pipeline_status()
    if not status["running"]:
        logger.info("Hosted demo: launching mock pipeline to seed data")
        asyncio.create_task(run_pipeline())


app = FastAPI(title="AgentsOrg", version="1.0.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.backend_cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(oidc.router, prefix="/api/v1")
app.include_router(configuration.router, prefix="/api/v1")
app.include_router(categories.router, prefix="/api/v1")
app.include_router(pipeline.router, prefix="/api/v1")
app.include_router(demo.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(clustering.router, prefix="/api/v1")
app.include_router(fingerprint.router, prefix="/api/v1")
app.include_router(learning.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(conversations.router, prefix="/api/v1")


@app.get("/api/v1/health")
async def health():
    return {"status": "ok"}
