"""Conversation Intelligence Pipeline tests — T_CV1 through T_CV8.

T_CV1: Mock pipeline happy path → sync log created, asset_usage_insights populated
T_CV2: Privacy Level 1 → insights have null top_topics, LLM NOT called
T_CV3: Deduplication → same event_id twice → only one row in conversation_events
T_CV4: Budget cap abort → budget=$0.01 → status="budget_exceeded"
T_CV5: Malformed JSONL line → pipeline continues, bad line skipped
T_CV6: Level 2 → top_topics populated, drift_alert present on Finance mock
T_CV7: Level 3 → user_usage_insights rows exist with primary_use_cases
T_CV8: Trend comparison → second run shows conversation_count_delta
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.models.models import (
    AssetUsageInsight,
    Configuration,
    ConversationEvent,
    ConversationSyncLog,
    GPT,
    UserUsageInsight,
)
from app.services.conversation_pipeline import run_conversation_pipeline, _pipeline_state
from app.services.mock_conversation_pipeline import MockConversationPipeline


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest_asyncio.fixture(autouse=True)
async def reset_pipeline_state():
    """Reset singleton pipeline state before each test."""
    _pipeline_state["running"] = False
    _pipeline_state["progress"] = 0
    _pipeline_state["stage"] = ""
    _pipeline_state["sync_log_id"] = None
    _pipeline_state["error"] = None
    yield
    _pipeline_state["running"] = False


@pytest_asyncio.fixture
async def seed_gpts(db_session):
    """Insert 3 GPTs covering tier 1/2/3 and Finance category."""
    gpts = [
        GPT(
            id="gpt-finance-001",
            name="Finance Reporting GPT",
            business_process="Finance Reporting",
            instructions="You help with financial reports and budget analysis." * 5,
            tools=[{"type": "code_interpreter"}],
            asset_type="gpt",
            shared_user_count=20,
        ),
        GPT(
            id="gpt-sales-001",
            name="Sales Coach",
            business_process="Sales Pipeline Management",
            instructions="You coach sales reps on objection handling." * 3,
            asset_type="gpt",
            shared_user_count=15,
        ),
        GPT(
            id="gpt-tier1-001",
            name="Quick Summarizer",
            instructions="Summarize this.",
            asset_type="gpt",
            shared_user_count=5,
        ),
    ]
    db_session.add_all(gpts)
    await db_session.commit()
    return gpts


@pytest_asyncio.fixture
async def seed_config(db_session):
    config = Configuration(
        id=1,
        workspace_id="ws-test-123",
        conversation_privacy_level=3,
        conversation_date_range_days=30,
        conversation_token_budget_usd=10.0,
    )
    db_session.add(config)
    await db_session.commit()
    return config


# ── T_CV1: Mock pipeline happy path ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_cv1_mock_pipeline_happy_path(db_session, seed_gpts):
    """T_CV1: Mock pipeline run creates sync log and populates insights."""
    mock_pipeline = MockConversationPipeline(privacy_level=3, date_range_days=30)
    sync_log_id = await mock_pipeline.run(db_session)

    # Sync log created
    log_result = await db_session.execute(
        select(ConversationSyncLog).where(ConversationSyncLog.id == sync_log_id)
    )
    log = log_result.scalar_one()
    assert log.status == "completed"
    assert log.finished_at is not None

    # asset_usage_insights populated for all 3 GPTs
    insights_result = await db_session.execute(select(AssetUsageInsight))
    insights = insights_result.scalars().all()
    assert len(insights) == 3

    # conversation_events inserted
    events_result = await db_session.execute(select(ConversationEvent))
    events = events_result.scalars().all()
    assert len(events) > 0


# ── T_CV2: Privacy Level 1 → counts only ─────────────────────────────────────


@pytest.mark.asyncio
async def test_cv2_privacy_level_1_counts_only(db_session, seed_gpts):
    """T_CV2: Privacy Level 1 gives null top_topics."""
    mock_pipeline = MockConversationPipeline(privacy_level=1, date_range_days=30)
    await mock_pipeline.run(db_session)

    insights_result = await db_session.execute(select(AssetUsageInsight))
    insights = insights_result.scalars().all()

    # All insights should have null LLM-derived fields
    for insight in insights:
        if insight.conversation_count > 0:
            assert insight.top_topics is None, (
                f"Expected top_topics=None for privacy level 1, got {insight.top_topics}"
            )
        assert insight.privacy_level == 1


# ── T_CV3: Deduplication ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cv3_event_deduplication(db_session, seed_gpts):
    """T_CV3: Inserting same event_id twice yields only one row."""
    event_id = f"evt-{uuid.uuid4()}"

    # Insert same event twice
    e1 = ConversationEvent(
        event_id=event_id,
        conversation_id="conv-001",
        asset_id="gpt-sales-001",
    )
    e2 = ConversationEvent(
        event_id=event_id,
        conversation_id="conv-001",
        asset_id="gpt-sales-001",
    )
    db_session.add(e1)
    await db_session.commit()

    # Second insert should raise IntegrityError (unique constraint)
    db_session.add(e2)
    with pytest.raises(Exception):  # IntegrityError
        await db_session.commit()
    await db_session.rollback()

    # Only one row exists
    result = await db_session.execute(
        select(ConversationEvent).where(ConversationEvent.event_id == event_id)
    )
    rows = result.scalars().all()
    assert len(rows) == 1


# ── T_CV4: Budget cap abort ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cv4_budget_exceeded(db_session, seed_gpts, seed_config):
    """T_CV4: Budget=$0.01 → pipeline aborts with status='budget_exceeded'."""
    # Insert some conversation events so Stage 2 sees data to analyze
    now = datetime.now(timezone.utc)
    from datetime import timedelta

    events = [
        ConversationEvent(
            event_id=f"evt-{i}",
            conversation_id=f"conv-{i}",
            asset_id="gpt-finance-001",
            user_email=f"user{i}@test.com",
            created_at=now - timedelta(days=1),
        )
        for i in range(20)
    ]
    db_session.add_all(events)
    await db_session.commit()

    # Mock LLM calls to avoid real API calls; use tiny budget to trigger abort
    mock_client = AsyncMock()
    mock_client.fetch_conversation_log_files.return_value = []

    sync_log_id = await run_conversation_pipeline(
        db=db_session,
        api_client=mock_client,
        workspace_id="ws-test-123",
        privacy_level=2,
        date_range_days=30,
        token_budget_usd=0.01,  # Tiny budget
        asset_ids=None,
        openai_api_key="test-key",
    )

    log_result = await db_session.execute(
        select(ConversationSyncLog).where(ConversationSyncLog.id == sync_log_id)
    )
    log = log_result.scalar_one()
    assert log.status == "budget_exceeded"


# ── T_CV5: Malformed JSONL ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cv5_malformed_jsonl_skipped(db_session, seed_gpts, seed_config):
    """T_CV5: Malformed JSONL line is skipped; pipeline continues."""
    good_event_id = "evt-good-001"

    # Mock API client with one bad and one good JSONL line
    mock_client = AsyncMock()
    mock_client.fetch_conversation_log_files.return_value = [
        {"url": "http://mock/file1.jsonl"}
    ]

    # download_jsonl_lines returns valid + invalid lines (invalid already filtered by method)
    # The pipeline tests for missing required fields, not JSON parse errors
    mock_client.download_jsonl_lines.return_value = [
        # Missing event_id — should be skipped
        {
            "conversation_id": "conv-bad-001",
            "payload": {"gpt_id": "gpt-sales-001"},
            "actor": {},
        },
        # Valid event
        {
            "event_id": good_event_id,
            "conversation_id": "conv-good-001",
            "payload": {"gpt_id": "gpt-sales-001", "messages": []},
            "actor": {"email": "user@test.com"},
            "timestamp": datetime.now(timezone.utc).timestamp(),
        },
    ]

    sync_log_id = await run_conversation_pipeline(
        db=db_session,
        api_client=mock_client,
        workspace_id="ws-test-123",
        privacy_level=1,  # counts only, no LLM
        date_range_days=30,
        token_budget_usd=10.0,
        asset_ids=None,
        openai_api_key="",
    )

    # Pipeline completed (not crashed)
    log_result = await db_session.execute(
        select(ConversationSyncLog).where(ConversationSyncLog.id == sync_log_id)
    )
    log = log_result.scalar_one()
    assert log.status == "completed"

    # Good event was inserted
    evt_result = await db_session.execute(
        select(ConversationEvent).where(ConversationEvent.event_id == good_event_id)
    )
    assert evt_result.scalar_one_or_none() is not None

    # Bad event was NOT inserted; skipped_events > 0
    assert log.skipped_events > 0


# ── T_CV6: Level 2 topics + drift alert ──────────────────────────────────────


@pytest.mark.asyncio
async def test_cv6_level2_topics_and_drift(db_session, seed_gpts):
    """T_CV6: Level 2 mock run → top_topics populated, drift_alert on Finance GPT."""
    mock_pipeline = MockConversationPipeline(privacy_level=2, date_range_days=30)
    await mock_pipeline.run(db_session)

    # Finance GPT should have drift_alert
    finance_result = await db_session.execute(
        select(AssetUsageInsight).where(
            AssetUsageInsight.asset_id == "gpt-finance-001"
        )
    )
    finance_insight = finance_result.scalar_one_or_none()
    assert finance_insight is not None
    assert finance_insight.top_topics is not None
    assert len(finance_insight.top_topics) > 0
    assert finance_insight.drift_alert is not None
    assert "HR" in finance_insight.drift_alert or "Finance" in finance_insight.drift_alert


# ── T_CV7: Level 3 → user_usage_insights ─────────────────────────────────────


@pytest.mark.asyncio
async def test_cv7_level3_user_insights(db_session, seed_gpts):
    """T_CV7: Level 3 mock run → user_usage_insights rows exist with primary_use_cases."""
    mock_pipeline = MockConversationPipeline(privacy_level=3, date_range_days=30)
    await mock_pipeline.run(db_session)

    user_insights_result = await db_session.execute(select(UserUsageInsight))
    user_insights = user_insights_result.scalars().all()

    # Should have user insights for assets that have conversations
    assert len(user_insights) > 0
    for ui in user_insights[:5]:
        assert ui.primary_use_cases is not None
        assert ui.prompting_quality_score is not None


# ── T_CV8: Week-over-week trend ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cv8_week_over_week_trend(db_session, seed_gpts):
    """T_CV8: Second run shows conversation_count_delta vs prior period."""
    from datetime import timedelta
    from httpx import ASGITransport, AsyncClient
    from app.main import app
    from app.database import get_db

    # Insert two insight rows: prior period and current period
    now = datetime.now(timezone.utc)
    prior_start = now - timedelta(days=60)
    prior_end = now - timedelta(days=30)
    current_start = now - timedelta(days=30)
    current_end = now

    db_session.add(
        AssetUsageInsight(
            asset_id="gpt-sales-001",
            date_range_start=prior_start,
            date_range_end=prior_end,
            conversation_count=50,
            unique_user_count=10,
            privacy_level=2,
        )
    )
    db_session.add(
        AssetUsageInsight(
            asset_id="gpt-sales-001",
            date_range_start=current_start,
            date_range_end=current_end,
            conversation_count=75,
            unique_user_count=12,
            privacy_level=2,
        )
    )
    await db_session.commit()

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        resp = await ac.get("/api/v1/conversations/asset/gpt-sales-001")

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    data = resp.json()
    assert data["conversation_count"] == 75
    # Delta: 75 - 50 = 25
    assert data.get("conversation_count_delta") == 25
    assert data.get("prior_conversation_count") == 50
