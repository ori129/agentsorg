from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import require_system_admin
from app.database import get_db
from app.encryption import decrypt, encrypt, mask
from app.models.models import Configuration
from app.schemas.schemas import (
    ConfigurationRead,
    ConfigurationUpdate,
    TestConnectionResult,
)

router = APIRouter(tags=["configuration"])


async def get_or_create_config(db: AsyncSession) -> Configuration:
    result = await db.execute(select(Configuration).where(Configuration.id == 1))
    config = result.scalar_one_or_none()
    if config is None:
        config = Configuration(id=1)
        db.add(config)
        await db.commit()
        await db.refresh(config)
    return config


@router.get("/config", response_model=ConfigurationRead)
async def get_config(db: AsyncSession = Depends(get_db)):
    config = await get_or_create_config(db)
    return ConfigurationRead(
        id=config.id,
        workspace_id=config.workspace_id,
        compliance_api_key=mask(config.compliance_api_key),
        base_url=config.base_url,
        openai_api_key=mask(config.openai_api_key),
        classification_enabled=config.classification_enabled,
        classification_model=config.classification_model,
        max_categories_per_gpt=config.max_categories_per_gpt,
        visibility_filters=config.visibility_filters or {},
        include_all=config.include_all,
        min_shared_users=config.min_shared_users,
        excluded_emails=config.excluded_emails or [],
    )


@router.put("/config", response_model=ConfigurationRead)
async def update_config(
    data: ConfigurationUpdate,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    await require_system_admin(authorization, db)
    config = await get_or_create_config(db)
    update_data = data.model_dump(exclude_unset=True)

    # Encrypt API keys before storing
    if "compliance_api_key" in update_data and update_data["compliance_api_key"]:
        update_data["compliance_api_key"] = encrypt(update_data["compliance_api_key"])
    if "openai_api_key" in update_data and update_data["openai_api_key"]:
        update_data["openai_api_key"] = encrypt(update_data["openai_api_key"])

    for key, value in update_data.items():
        setattr(config, key, value)

    await db.commit()
    await db.refresh(config)

    return ConfigurationRead(
        id=config.id,
        workspace_id=config.workspace_id,
        compliance_api_key=mask(config.compliance_api_key),
        base_url=config.base_url,
        openai_api_key=mask(config.openai_api_key),
        classification_enabled=config.classification_enabled,
        classification_model=config.classification_model,
        max_categories_per_gpt=config.max_categories_per_gpt,
        visibility_filters=config.visibility_filters or {},
        include_all=config.include_all,
        min_shared_users=config.min_shared_users,
        excluded_emails=config.excluded_emails or [],
    )


@router.post("/config/test-connection", response_model=TestConnectionResult)
async def test_connection(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    await require_system_admin(authorization, db)
    config = await get_or_create_config(db)

    if not config.compliance_api_key:
        return TestConnectionResult(
            success=False, message="No Compliance API key configured."
        )

    if not config.workspace_id:
        return TestConnectionResult(success=False, message="Workspace ID is required.")

    import httpx

    try:
        api_key = decrypt(config.compliance_api_key)
        base_url = config.base_url.rstrip("/")
        headers = {"Authorization": f"Bearer {api_key}"}

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{base_url}/compliance/workspaces/{config.workspace_id}/gpts",
                headers=headers,
                params={"limit": 1},
            )

        if resp.status_code == 200:
            data = resp.json()
            count_msg = ""
            if "data" in data:
                count_msg = f" Found {len(data['data'])} GPT(s) on first page."
                if data.get("has_more"):
                    count_msg += " More pages available."
            return TestConnectionResult(
                success=True,
                message=f"Successfully connected to the Compliance API.{count_msg}",
            )
        else:
            return TestConnectionResult(
                success=False,
                message=f"API returned status {resp.status_code}: {resp.text[:300]}",
            )
    except Exception as e:
        return TestConnectionResult(success=False, message=f"Connection failed: {e}")


@router.post("/config/test-openai-connection", response_model=TestConnectionResult)
async def test_openai_connection(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    await require_system_admin(authorization, db)
    config = await get_or_create_config(db)

    if not config.openai_api_key:
        return TestConnectionResult(
            success=False, message="No OpenAI API key configured."
        )

    import httpx

    try:
        api_key = decrypt(config.openai_api_key)
        headers = {"Authorization": f"Bearer {api_key}"}

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json={
                    "model": config.classification_model or "gpt-4o-mini",
                    "messages": [{"role": "user", "content": "ping"}],
                    "max_tokens": 1,
                },
            )

        if resp.status_code == 200:
            model_used = resp.json().get("model", config.classification_model)
            return TestConnectionResult(
                success=True,
                message=f"Successfully connected to the OpenAI API using model '{model_used}'.",
            )
        else:
            return TestConnectionResult(
                success=False,
                message=f"API returned status {resp.status_code}: {resp.text[:300]}",
            )
    except Exception as e:
        return TestConnectionResult(success=False, message=f"Connection failed: {e}")
