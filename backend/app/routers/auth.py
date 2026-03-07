import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import WorkspaceUser
from app.schemas.schemas import (
    AuthStatus,
    LoginRequest,
    RegisterRequest,
    WorkspaceUserRead,
)

router = APIRouter(tags=["auth"])
logger = logging.getLogger(__name__)


@router.get("/auth/status", response_model=AuthStatus)
async def auth_status(db: AsyncSession = Depends(get_db)):
    count = await db.scalar(select(func.count()).select_from(WorkspaceUser))
    return AuthStatus(initialized=count > 0)


@router.post("/auth/register", response_model=WorkspaceUserRead)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    count = await db.scalar(select(func.count()).select_from(WorkspaceUser))
    if count > 0:
        raise HTTPException(status_code=409, detail="System already initialized")

    user = WorkspaceUser(
        id=f"local-{uuid.uuid4().hex[:12]}",
        email=body.email.strip().lower(),
        name=None,
        role="account-owner",
        status="active",
        system_role="system-admin",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    logger.info(f"First admin registered: {user.email}")
    return user


@router.post("/auth/login", response_model=WorkspaceUserRead)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(WorkspaceUser).where(WorkspaceUser.email == body.email.strip().lower())
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
