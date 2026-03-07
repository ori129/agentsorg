import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.encryption import decrypt
from app.models.models import Configuration, WorkspaceUser
from app.schemas.schemas import SystemRoleUpdate, UserImportResult, WorkspaceUserRead
from app.services.demo_state import is_demo_mode

router = APIRouter(tags=["users"])
logger = logging.getLogger(__name__)

VALID_SYSTEM_ROLES = {"system-admin", "ai-leader", "employee"}


@router.post("/users/import", response_model=UserImportResult)
async def import_users(db: AsyncSession = Depends(get_db)):
    config = await db.get(Configuration, 1)
    if not config or not config.workspace_id:
        raise ValueError("Configuration not set — configure workspace ID first")

    if is_demo_mode():
        from app.services.mock_fetcher import MockComplianceAPIClient

        client = MockComplianceAPIClient()
    else:
        from app.services.compliance_api import ComplianceAPIClient

        api_key = (
            decrypt(config.compliance_api_key) if config.compliance_api_key else ""
        )
        client = ComplianceAPIClient(api_key=api_key, base_url=config.base_url)

    try:
        raw_users = await client.fetch_all_users(config.workspace_id)
    finally:
        await client.close()

    imported = 0
    updated = 0

    for u in raw_users:
        email = (u.get("email") or "").strip().lower()

        # Match by email first (handles admin who registered before import)
        existing = None
        if email:
            result = await db.execute(
                select(WorkspaceUser).where(WorkspaceUser.email == email)
            )
            existing = result.scalar_one_or_none()

        # Fallback: match by OpenAI ID
        if not existing:
            existing = await db.get(WorkspaceUser, u["id"])

        if existing:
            # Update OpenAI fields but preserve system_role
            if existing.id != u["id"] and existing.id.startswith("local-"):
                # Admin registered locally — update to real OpenAI ID
                await db.delete(existing)
                await db.flush()
                db.add(
                    WorkspaceUser(
                        id=u["id"],
                        email=email or existing.email,
                        name=u.get("name") or existing.name,
                        created_at=u.get("created_at") or existing.created_at,
                        role=u.get("role", existing.role),
                        status=u.get("status", existing.status),
                        system_role=existing.system_role,
                    )
                )
            else:
                existing.email = email or existing.email
                existing.name = u.get("name") or existing.name
                existing.created_at = u.get("created_at") or existing.created_at
                existing.role = u.get("role", existing.role)
                existing.status = u.get("status", existing.status)
            updated += 1
        else:
            db.add(
                WorkspaceUser(
                    id=u["id"],
                    email=email,
                    name=u.get("name"),
                    created_at=u.get("created_at"),
                    role=u.get("role", "standard-user"),
                    status=u.get("status", "active"),
                    system_role="employee",
                )
            )
            imported += 1

    await db.commit()
    logger.info(
        f"User import complete: {imported} new, {updated} updated, {len(raw_users)} total"
    )

    return UserImportResult(imported=imported, updated=updated, total=len(raw_users))


@router.get("/users", response_model=list[WorkspaceUserRead])
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(WorkspaceUser).order_by(WorkspaceUser.email))
    return result.scalars().all()


@router.patch("/users/{user_id}/role", response_model=WorkspaceUserRead)
async def update_user_role(
    user_id: str,
    body: SystemRoleUpdate,
    db: AsyncSession = Depends(get_db),
):
    if body.system_role not in VALID_SYSTEM_ROLES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid role. Must be one of: {', '.join(VALID_SYSTEM_ROLES)}",
        )

    user = await db.get(WorkspaceUser, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent removing the last system admin
    if user.system_role == "system-admin" and body.system_role != "system-admin":
        admin_count = await db.scalar(
            select(func.count())
            .select_from(WorkspaceUser)
            .where(WorkspaceUser.system_role == "system-admin")
        )
        if admin_count <= 1:
            raise HTTPException(
                status_code=409,
                detail="Cannot remove the last System Admin. Promote another user first.",
            )

    user.system_role = body.system_role
    await db.commit()
    await db.refresh(user)
    logger.info(f"Updated system_role for {user.email} to {body.system_role}")
    return user
