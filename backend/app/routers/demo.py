import asyncio
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import require_auth, require_system_admin
from app.config import settings
from app.database import get_db
from app.models.models import Category, LoginSession, SyncLog, WorkspaceUser
from app.services.demo_state import SIZE_MAP, get_demo_state, set_demo_state
from app.services.pipeline import get_pipeline_status, run_pipeline

router = APIRouter(tags=["demo"])

DEMO_USER_EMAIL = "guest@demo.agentsorg.ai"


# ── Public endpoints (no auth) ─────────────────────────────────────────────────

@router.get("/app-config")
async def app_config():
    """Public config the frontend reads before any auth to detect hosted-demo mode."""
    return {"hosted_demo": settings.hosted_demo}


@router.post("/demo/guest-session")
async def guest_session(response: Response, db: AsyncSession = Depends(get_db)):
    """Auto-login for hosted demo: returns a session for the shared demo user.
    Only available when HOSTED_DEMO=true.
    """
    if not settings.hosted_demo:
        raise HTTPException(status_code=403, detail="Not a hosted demo instance")

    # Find or create the shared demo user
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
        await db.refresh(user)

    # Issue a 7-day session (refreshed on every visit)
    token = secrets.token_urlsafe(32)
    session = LoginSession(
        user_id=user.id,
        token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        token_type="session",
    )
    db.add(session)
    await db.commit()

    response.set_cookie(
        "session_token",
        token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=60 * 60 * 24 * 7,
    )
    return {
        "id": user.id,
        "email": user.email,
        "system_role": user.system_role,
        "password_temp": False,
        "totp_enabled": False,
    }


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
    _: WorkspaceUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
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
    _: WorkspaceUser = Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
):
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
