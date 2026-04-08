"""Conversation Intelligence API router.

Mounted at /api/v1/conversations/

POST   /conversations/run           Start conversation pipeline
GET    /conversations/status        Current run status
GET    /conversations/history       ConversationSyncLog list
GET    /conversations/estimate      Cost estimate before running
GET    /conversations/asset/{id}    AssetUsageInsight for one asset
GET    /conversations/user/{email}  UserUsageInsight for one user (Level 3)
DELETE /conversations/user/{email}  Hard-delete user insights (GDPR)
GET    /conversations/overview      Aggregated workspace-level metrics
PATCH  /conversations/config        Update privacy_level, date_range, budget
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.encryption import decrypt
from app.models.models import (
    AssetUsageInsight,
    Configuration,
    ConversationEvent,
    ConversationSyncLog,
    GPT,
    UserUsageInsight,
)
from app.schemas.schemas import (
    AssetUsageInsightRead,
    ConversationConfig,
    ConversationEstimate,
    ConversationOverview,
    ConversationSyncLogRead,
    UserUsageInsightRead,
)
from app.services.conversation_pipeline import (
    get_pipeline_state,
    run_conversation_pipeline,
)

router = APIRouter(prefix="/conversations", tags=["conversations"])


class ConversationRunRequest(BaseModel):
    asset_ids: list[str] | None = None
    mock: bool = False  # Force mock pipeline regardless of demo mode (for testing)


# ── POST /run ─────────────────────────────────────────────────────────────────


@router.post("/run", status_code=202)
async def start_conversation_pipeline(
    body: ConversationRunRequest = Body(default_factory=ConversationRunRequest),
    db: AsyncSession = Depends(get_db),
):
    """Start the conversation intelligence pipeline.

    Body (optional JSON): { "asset_ids": ["gpt-xxx", ...] }
    asset_ids null/empty = analyze ALL synced assets.
    """
    from app.services.demo_state import is_demo_mode

    asset_ids: list[str] | None = body.asset_ids or None

    # Prerequisite: at least one GPT/Project synced
    gpt_count_result = await db.execute(select(func.count()).select_from(GPT))
    gpt_count = gpt_count_result.scalar_one()
    if gpt_count == 0:
        raise HTTPException(
            status_code=409,
            detail="No GPTs or Projects found. Run the asset sync pipeline first.",
        )

    # Prevent double-run
    state = get_pipeline_state()
    if state["running"]:
        raise HTTPException(
            status_code=409,
            detail="Conversation pipeline is already running.",
        )

    # Load config (demo mode can run without a config row)
    config_result = await db.execute(select(Configuration))
    config = config_result.scalar_one_or_none()
    if not config and not (is_demo_mode() or body.mock):
        raise HTTPException(status_code=400, detail="Configuration not found.")

    privacy_level = config.conversation_privacy_level if config else 3
    date_range_days = config.conversation_date_range_days if config else 30
    token_budget_usd = config.conversation_token_budget_usd if config else 10.0

    if is_demo_mode() or body.mock:
        from app.services.mock_conversation_pipeline import MockConversationPipeline

        async def _run_mock():
            from app.database import async_session as AsyncSessionLocal

            async with AsyncSessionLocal() as session:
                mock = MockConversationPipeline(
                    privacy_level=privacy_level,
                    date_range_days=date_range_days,
                )
                await mock.run(session)

        asyncio.ensure_future(_run_mock())
        return {"status": "started", "mode": "demo"}

    # Real pipeline
    api_key_enc = config.compliance_api_key
    openai_key_enc = config.openai_api_key
    workspace_id = config.workspace_id

    if not api_key_enc or not workspace_id:
        raise HTTPException(
            status_code=400,
            detail="Compliance API key and workspace ID are required.",
        )

    from app.services.compliance_api import ComplianceAPIClient

    api_key = decrypt(api_key_enc)
    openai_api_key = decrypt(openai_key_enc) if openai_key_enc else ""
    api_client = ComplianceAPIClient(api_key=api_key, base_url=config.base_url)

    async def _run_real():
        from app.database import async_session as AsyncSessionLocal

        async with AsyncSessionLocal() as session:
            try:
                await run_conversation_pipeline(
                    db=session,
                    api_client=api_client,
                    workspace_id=workspace_id,
                    privacy_level=privacy_level,
                    date_range_days=date_range_days,
                    token_budget_usd=token_budget_usd,
                    asset_ids=asset_ids,
                    openai_api_key=openai_api_key,
                )
            finally:
                await api_client.close()

    asyncio.ensure_future(_run_real())
    return {"status": "started", "mode": "real"}


# ── GET /status ───────────────────────────────────────────────────────────────


@router.get("/status")
async def get_status():
    """Return current pipeline run status."""
    return get_pipeline_state()


# ── GET /history ──────────────────────────────────────────────────────────────


@router.get("/history", response_model=list[ConversationSyncLogRead])
async def get_history(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ConversationSyncLog)
        .order_by(ConversationSyncLog.started_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


# ── GET /estimate ─────────────────────────────────────────────────────────────


@router.get("/estimate", response_model=ConversationEstimate)
async def get_estimate(
    date_range_days: int = Query(30, ge=1, le=90),
    privacy_level: int = Query(3, ge=0, le=3),
    asset_ids: list[str] | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Return cost estimate before running the pipeline."""
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=date_range_days)

    # Count events in range
    q = (
        select(func.count())
        .select_from(ConversationEvent)
        .where(ConversationEvent.created_at >= since)
    )
    if asset_ids:
        q = q.where(ConversationEvent.asset_id.in_(asset_ids))
    events_result = await db.execute(q)
    event_count = events_result.scalar_one()

    # Assets to analyze
    asset_q = select(func.count()).select_from(GPT)
    if asset_ids:
        asset_q = asset_q.where(GPT.id.in_(asset_ids))
    asset_result = await db.execute(asset_q)
    total_assets = asset_result.scalar_one()

    # Per-asset LLM invalidation: how many have new events since last analysis?
    assets_unchanged = 0
    all_asset_ids_result = await db.execute(
        select(GPT.id).where(GPT.id.in_(asset_ids)) if asset_ids else select(GPT.id)
    )
    all_asset_ids = [row[0] for row in all_asset_ids_result.fetchall()]

    for asset_id in all_asset_ids:
        last_result = await db.execute(
            select(AssetUsageInsight.analyzed_at)
            .where(AssetUsageInsight.asset_id == asset_id)
            .order_by(AssetUsageInsight.analyzed_at.desc())
            .limit(1)
        )
        last_analyzed = last_result.scalar_one_or_none()
        if last_analyzed is not None:
            new_evt_result = await db.execute(
                select(func.count())
                .select_from(ConversationEvent)
                .where(ConversationEvent.asset_id == asset_id)
                .where(ConversationEvent.synced_at > last_analyzed)
            )
            if new_evt_result.scalar_one() == 0:
                assets_unchanged += 1

    assets_to_analyze = total_assets - assets_unchanged

    # Cost estimate
    if privacy_level <= 1:
        estimated_tokens = 0
        estimated_cost_usd = 0.0
    else:
        sampled_msgs = min(event_count, assets_to_analyze * 500)
        batches = max(sampled_msgs / 50, 1)
        est_in = batches * 200 * 50
        est_out = batches * 200
        estimated_tokens = int(est_in + est_out)
        estimated_cost_usd = (est_in * 0.15 + est_out * 0.60) / 1_000_000
        if privacy_level >= 3:
            estimated_cost_usd *= 1.3
            estimated_tokens = int(estimated_tokens * 1.3)

    gpt_count_result = await db.execute(select(func.count()).select_from(GPT))
    prerequisite_met = gpt_count_result.scalar_one() > 0

    return ConversationEstimate(
        assets_to_analyze=assets_to_analyze,
        assets_unchanged=assets_unchanged,
        estimated_tokens=estimated_tokens,
        estimated_cost_usd=round(estimated_cost_usd, 4),
        prerequisite_met=prerequisite_met,
    )


# ── GET /asset/{id} ───────────────────────────────────────────────────────────


@router.get("/asset/{asset_id}", response_model=AssetUsageInsightRead | None)
async def get_asset_insight(
    asset_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return the most recent AssetUsageInsight for an asset."""
    result = await db.execute(
        select(AssetUsageInsight)
        .where(AssetUsageInsight.asset_id == asset_id)
        .order_by(
            AssetUsageInsight.date_range_end.desc().nullslast(),
            AssetUsageInsight.analyzed_at.desc(),
        )
        .limit(1)
    )
    insight = result.scalar_one_or_none()
    if insight is None:
        return None

    # Week-over-week: find prior period row (±1 day tolerance)
    if insight.date_range_start and insight.date_range_end:
        prior_end = insight.date_range_start
        prior_result = await db.execute(
            select(AssetUsageInsight)
            .where(AssetUsageInsight.asset_id == asset_id)
            .where(
                AssetUsageInsight.date_range_end.between(
                    prior_end - timedelta(days=1),
                    prior_end + timedelta(days=1),
                )
            )
            .order_by(AssetUsageInsight.analyzed_at.desc())
            .limit(1)
        )
        prior = prior_result.scalar_one_or_none()
        if prior and prior.id != insight.id:
            prior_count = prior.conversation_count or 0
            current_count = insight.conversation_count or 0
            insight.__dict__["prior_conversation_count"] = prior_count
            insight.__dict__["conversation_count_delta"] = current_count - prior_count

    return insight


# ── GET /user/{email} ─────────────────────────────────────────────────────────


@router.get("/user/{user_email}", response_model=list[UserUsageInsightRead])
async def get_user_insights(
    user_email: str,
    db: AsyncSession = Depends(get_db),
):
    """Return Level-3 insights for a specific user across all assets."""
    result = await db.execute(
        select(UserUsageInsight)
        .where(UserUsageInsight.user_email == user_email)
        .order_by(UserUsageInsight.analyzed_at.desc())
    )
    return result.scalars().all()


# ── DELETE /user/{email} (GDPR) ───────────────────────────────────────────────


@router.delete("/user/{user_email}", status_code=204)
async def delete_user_insights(
    user_email: str,
    db: AsyncSession = Depends(get_db),
):
    """Hard-delete all UserUsageInsight rows for a user. Admin GDPR action."""
    await db.execute(
        delete(UserUsageInsight).where(UserUsageInsight.user_email == user_email)
    )
    # Also null out conversation_events for this user (soft-delete identity)
    from sqlalchemy import update

    await db.execute(
        update(ConversationEvent)
        .where(ConversationEvent.user_email == user_email)
        .values(user_email=None)
    )
    await db.commit()
    return None


# ── GET /overview ─────────────────────────────────────────────────────────────


@router.get("/overview", response_model=ConversationOverview)
async def get_overview(
    date_range_days: int = Query(30, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Aggregated workspace-level conversation metrics."""
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=date_range_days)

    total_convs_result = await db.execute(
        select(func.count(func.distinct(ConversationEvent.conversation_id)))
        .where(ConversationEvent.created_at >= since)
        .where(ConversationEvent.asset_id.isnot(None))
    )
    total_conversations = total_convs_result.scalar_one()

    total_users_result = await db.execute(
        select(func.count(func.distinct(ConversationEvent.user_email)))
        .where(ConversationEvent.created_at >= since)
        .where(ConversationEvent.user_email.isnot(None))
    )
    active_users = total_users_result.scalar_one()

    # Ghost assets: assets with 0 conversations in range despite being in scope
    all_assets_result = await db.execute(select(func.count()).select_from(GPT))
    total_assets = all_assets_result.scalar_one()

    active_assets_result = await db.execute(
        select(func.count(func.distinct(ConversationEvent.asset_id)))
        .where(ConversationEvent.created_at >= since)
        .where(ConversationEvent.asset_id.isnot(None))
    )
    active_assets = active_assets_result.scalar_one()
    ghost_assets = total_assets - active_assets

    # Top 5 assets by conversation count (exclude null asset_id rows)
    top_assets_result = await db.execute(
        select(
            ConversationEvent.asset_id,
            func.count(func.distinct(ConversationEvent.conversation_id)).label(
                "conv_count"
            ),
        )
        .where(ConversationEvent.created_at >= since)
        .where(ConversationEvent.asset_id.isnot(None))
        .group_by(ConversationEvent.asset_id)
        .order_by(func.count(func.distinct(ConversationEvent.conversation_id)).desc())
        .limit(5)
    )
    top_assets = [
        {"asset_id": row[0], "conversation_count": row[1]}
        for row in top_assets_result.fetchall()
    ]

    # Drift alerts — with message text
    drift_result = await db.execute(
        select(AssetUsageInsight.asset_id, AssetUsageInsight.drift_alert)
        .where(AssetUsageInsight.drift_alert.isnot(None))
        .distinct(AssetUsageInsight.asset_id)
    )
    drift_rows = drift_result.fetchall()
    drift_asset_ids = [row[0] for row in drift_rows]
    drift_details = [{"asset_id": row[0], "drift_alert": row[1]} for row in drift_rows]

    # Ghost asset IDs — assets in GPT table with zero conversations in range
    active_ids_result = await db.execute(
        select(func.distinct(ConversationEvent.asset_id))
        .where(ConversationEvent.created_at >= since)
        .where(ConversationEvent.asset_id.isnot(None))
    )
    active_id_set = {
        row[0] for row in active_ids_result.fetchall() if row[0] is not None
    }
    all_gpt_ids_result = await db.execute(select(GPT.id))
    ghost_asset_ids = [
        row[0] for row in all_gpt_ids_result.fetchall() if row[0] not in active_id_set
    ]

    # Knowledge gap signals — assets that have non-null knowledge_gap_signals
    gaps_result = await db.execute(
        select(AssetUsageInsight.asset_id, AssetUsageInsight.knowledge_gap_signals)
        .where(AssetUsageInsight.knowledge_gap_signals.isnot(None))
        .distinct(AssetUsageInsight.asset_id)
    )
    knowledge_gap_assets = [
        {"asset_id": row[0], "signals": row[1]}
        for row in gaps_result.fetchall()
        if row[1]
    ]

    return ConversationOverview(
        total_conversations=total_conversations,
        active_users=active_users,
        active_assets=active_assets,
        ghost_assets=ghost_assets,
        top_assets=top_assets,
        drift_alerts=len(drift_asset_ids),
        drift_asset_ids=drift_asset_ids,
        drift_details=drift_details,
        ghost_asset_ids=ghost_asset_ids[:20],  # cap at 20 for UI
        knowledge_gap_assets=knowledge_gap_assets,
        date_range_days=date_range_days,
    )


# ── PATCH /config ─────────────────────────────────────────────────────────────


@router.patch("/config", response_model=ConversationConfig)
async def patch_config(
    body: ConversationConfig,
    db: AsyncSession = Depends(get_db),
):
    """Update conversation pipeline configuration."""
    result = await db.execute(select(Configuration))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=400, detail="Configuration not found.")

    if body.conversation_privacy_level is not None:
        config.conversation_privacy_level = body.conversation_privacy_level
    if body.conversation_date_range_days is not None:
        config.conversation_date_range_days = body.conversation_date_range_days
    if body.conversation_token_budget_usd is not None:
        config.conversation_token_budget_usd = body.conversation_token_budget_usd
    if body.conversation_asset_scope is not None:
        config.conversation_asset_scope = body.conversation_asset_scope

    await db.commit()
    await db.refresh(config)

    return ConversationConfig(
        conversation_privacy_level=config.conversation_privacy_level,
        conversation_date_range_days=config.conversation_date_range_days,
        conversation_token_budget_usd=config.conversation_token_budget_usd,
        conversation_asset_scope=config.conversation_asset_scope,
    )
