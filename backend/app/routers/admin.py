from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import require_system_admin
from app.database import get_db
from app.encryption import decrypt, encrypt, get_fernet
from app.models.models import (
    GPT,
    Category,
    GptScoreHistory,
    OidcProvider,
    PipelineLogEntry,
    SyncLog,
    Workshop,
    WorkshopGPTTag,
    WorkshopParticipant,
    WorkspaceUser,
)
from app.models.models import Configuration
from app.services.demo_state import set_demo_state

router = APIRouter(tags=["admin"])


@router.post("/admin/reset")
async def reset_registry(
    _: WorkspaceUser = Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
):
    # Delete in dependency order to avoid FK violations
    await db.execute(delete(WorkshopGPTTag))
    await db.execute(delete(WorkshopParticipant))
    await db.execute(delete(Workshop))
    await db.execute(delete(GptScoreHistory))
    await db.execute(delete(GPT))
    await db.execute(delete(PipelineLogEntry))
    await db.execute(delete(SyncLog))
    await db.execute(delete(Category))
    await db.commit()
    # Reset in-memory demo flag so auto-restore doesn't re-enable it
    set_demo_state(False, "medium")
    return {"message": "Full reset complete."}


class RotateKeyRequest(BaseModel):
    new_fernet_key: str


@router.post("/admin/rotate-encryption-key")
async def rotate_encryption_key(
    body: RotateKeyRequest,
    _: WorkspaceUser = Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
):
    """Re-encrypt all secrets with a new Fernet key.

    After this succeeds, update FERNET_KEY in your environment and restart
    the backend. The new key is not persisted here — it is only used to
    produce the new ciphertexts.

    Generate a new key: python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    """
    from cryptography.fernet import Fernet, InvalidToken

    try:
        new_fernet = Fernet(body.new_fernet_key.encode())
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Fernet key format.")

    rotated: dict[str, int] = {"config_fields": 0, "oidc_secrets": 0}

    # Re-encrypt workspace config secrets
    config_result = await db.execute(select(Configuration))
    config = config_result.scalar_one_or_none()
    if config:
        for field in ("compliance_api_key", "openai_api_key"):
            old_enc = getattr(config, field)
            if old_enc:
                try:
                    plaintext = decrypt(old_enc)
                    setattr(config, field, new_fernet.encrypt(plaintext.encode()).decode())
                    rotated["config_fields"] += 1
                except InvalidToken:
                    raise HTTPException(
                        status_code=422,
                        detail=f"Could not decrypt {field} with current key. Aborting.",
                    )

    # Re-encrypt OIDC client secrets
    oidc_result = await db.execute(select(OidcProvider))
    for provider in oidc_result.scalars().all():
        if provider.client_secret_encrypted:
            try:
                plaintext = decrypt(provider.client_secret_encrypted)
                provider.client_secret_encrypted = new_fernet.encrypt(plaintext.encode()).decode()
                rotated["oidc_secrets"] += 1
            except InvalidToken:
                raise HTTPException(
                    status_code=422,
                    detail=f"Could not decrypt OIDC secret for provider {provider.id}. Aborting.",
                )

    await db.commit()
    return {
        "message": "Key rotation complete. Update FERNET_KEY in your environment and restart the backend.",
        "rotated": rotated,
    }
