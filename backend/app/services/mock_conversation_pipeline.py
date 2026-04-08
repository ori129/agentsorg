"""Mock Conversation Intelligence Pipeline.

In demo mode, replaces the real pipeline with deterministic direct DB inserts.
No JSONL download, no LLM calls. Uses a fixed RNG seed (42) for reproducibility.

Mock data strategy:
  - Tier-3 assets (production): 50-200 conversations, diverse topics, no drift
  - Tier-2 assets (functional): 10-50 conversations
  - Tier-1 assets (abandoned): 0-5 conversations → ghost assets
  - One Finance GPT: pre-set drift_alert
  - Two assets: pre-set knowledge_gap_signals

Structure mirrors conversation_pipeline._run() but uses direct DB inserts.
"""

from __future__ import annotations

import asyncio
import logging
import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import (
    AssetUsageInsight,
    ConversationEvent,
    ConversationSyncLog,
    GPT,
    UserUsageInsight,
)
from app.services.conversation_pipeline import _pipeline_state, _set_state

logger = logging.getLogger(__name__)

_DEMO_USERS = [f"user_{i}@demo.com" for i in range(1, 26)]

_TOPICS_BY_ASSET_TYPE = {
    "sales": [
        {
            "topic": "Pipeline Review",
            "pct": 40.0,
            "example_phrases": ["deal status", "Q2 forecast"],
        },
        {
            "topic": "Objection Handling",
            "pct": 30.0,
            "example_phrases": ["customer pushback", "pricing concerns"],
        },
        {
            "topic": "Proposal Writing",
            "pct": 20.0,
            "example_phrases": ["RFP response", "executive summary"],
        },
        {
            "topic": "Competitor Analysis",
            "pct": 10.0,
            "example_phrases": ["vs competitor", "differentiation"],
        },
    ],
    "finance": [
        {
            "topic": "Budget Analysis",
            "pct": 35.0,
            "example_phrases": ["YTD variance", "cost center"],
        },
        {
            "topic": "Expense Reporting",
            "pct": 25.0,
            "example_phrases": ["T&E submission", "receipt upload"],
        },
        # Drift: HR topics in a Finance GPT
        {
            "topic": "HR Policy Questions",
            "pct": 32.0,
            "example_phrases": ["leave policy", "performance review"],
        },
        {
            "topic": "FX Reconciliation",
            "pct": 8.0,
            "example_phrases": ["currency conversion", "hedging"],
        },
    ],
    "engineering": [
        {
            "topic": "Code Review",
            "pct": 45.0,
            "example_phrases": ["PR feedback", "linting errors"],
        },
        {
            "topic": "Architecture Design",
            "pct": 25.0,
            "example_phrases": ["system design", "scalability"],
        },
        {
            "topic": "Debugging",
            "pct": 20.0,
            "example_phrases": ["stack trace", "null pointer"],
        },
        {
            "topic": "Documentation",
            "pct": 10.0,
            "example_phrases": ["API docs", "README"],
        },
    ],
    "hr": [
        {
            "topic": "Onboarding Assistance",
            "pct": 40.0,
            "example_phrases": ["new hire setup", "day 1 checklist"],
        },
        {
            "topic": "Policy Queries",
            "pct": 35.0,
            "example_phrases": ["PTO balance", "remote work policy"],
        },
        {
            "topic": "Performance Review Prep",
            "pct": 25.0,
            "example_phrases": ["self-assessment", "goal setting"],
        },
    ],
    "marketing": [
        {
            "topic": "Campaign Copywriting",
            "pct": 45.0,
            "example_phrases": ["email subject", "CTA text"],
        },
        {
            "topic": "SEO Content",
            "pct": 30.0,
            "example_phrases": ["keyword density", "meta description"],
        },
        {
            "topic": "Social Media Posts",
            "pct": 25.0,
            "example_phrases": ["LinkedIn post", "Twitter thread"],
        },
    ],
    "default": [
        {
            "topic": "General Assistance",
            "pct": 50.0,
            "example_phrases": ["help me with", "can you explain"],
        },
        {
            "topic": "Summarization",
            "pct": 30.0,
            "example_phrases": ["summarize this", "key points"],
        },
        {
            "topic": "Research",
            "pct": 20.0,
            "example_phrases": ["find information about", "what is"],
        },
    ],
}

_KNOWLEDGE_GAP_SIGNALS_TEMPLATE = [
    {
        "topic": "advanced configuration options",
        "frequency": 8,
        "example_question": "How do I configure the tool to handle edge cases with multi-currency transactions?",
    },
    {
        "topic": "integration with external systems",
        "frequency": 5,
        "example_question": "Can this be connected to our Salesforce instance to pull live data?",
    },
]


class MockConversationPipeline:
    """Deterministic mock pipeline for demo mode. seed=42."""

    def __init__(self, privacy_level: int = 3, date_range_days: int = 30) -> None:
        self.privacy_level = privacy_level
        self.date_range_days = date_range_days
        self._rng = random.Random(42)

    async def run(self, db: AsyncSession) -> int:
        """Run mock pipeline. Returns ConversationSyncLog.id."""
        if _pipeline_state["running"]:
            raise RuntimeError("Conversation pipeline is already running")

        _set_state(
            running=True,
            progress=0,
            stage="mock_starting",
            assets_total=0,
            assets_done=0,
            assets_skipped=0,
            sync_log_id=None,
            error=None,
        )

        sync_log = ConversationSyncLog(
            status="running",
            privacy_level=self.privacy_level,
        )
        db.add(sync_log)
        await db.commit()
        await db.refresh(sync_log)
        _set_state(sync_log_id=sync_log.id)

        try:
            return await self._run(db, sync_log)
        except Exception as exc:
            logger.error(f"Mock conversation pipeline error: {exc}", exc_info=True)
            sync_log.status = "error"
            sync_log.finished_at = datetime.now(timezone.utc)
            await db.commit()
            _set_state(running=False, error=str(exc))
            raise
        finally:
            if _pipeline_state["running"]:
                _set_state(running=False)

    async def _run(self, db: AsyncSession, sync_log: ConversationSyncLog) -> int:
        now = datetime.now(timezone.utc)
        date_range_end = now
        date_range_start = now - timedelta(days=self.date_range_days)

        sync_log.date_range_start = date_range_start
        sync_log.date_range_end = date_range_end
        await db.commit()

        # Stage 1: Fetch logs (simulated delay)
        _set_state(stage="mock_stage1_fetch", progress=5)
        await asyncio.sleep(1.2)
        _set_state(progress=15)
        await asyncio.sleep(1.0)

        result = await db.execute(select(GPT))
        all_assets = result.scalars().all()
        _set_state(assets_total=len(all_assets))

        # Stage 2: Aggregate counts
        _set_state(stage="stage2_aggregate", progress=20)
        await asyncio.sleep(0.8)

        events_inserted = 0
        insights_inserted = 0

        finance_asset_id: str | None = None
        gap_asset_ids: list[str] = []

        for idx, asset in enumerate(all_assets):
            pct = 15 + int(70 * (idx / max(len(all_assets), 1)))
            _set_state(progress=pct, assets_done=idx)

            # Assign tier based on asset properties
            tier = self._asset_tier(asset)
            conv_count = self._conv_count_for_tier(tier)

            if conv_count == 0:
                # Ghost asset — write a zero-count insight and skip
                db.add(
                    AssetUsageInsight(
                        asset_id=asset.id,
                        date_range_start=date_range_start,
                        date_range_end=date_range_end,
                        conversation_count=0,
                        unique_user_count=0,
                        privacy_level=self.privacy_level,
                    )
                )
                await db.commit()
                insights_inserted += 1
                continue

            # Generate conversation_events
            unique_users = self._rng.sample(
                _DEMO_USERS, min(conv_count // 3 + 1, len(_DEMO_USERS))
            )
            conversation_ids = [
                str(uuid.UUID(int=self._rng.getrandbits(128)))
                for _ in range(conv_count)
            ]

            for cid in conversation_ids:
                user_email = self._rng.choice(unique_users)
                ts = self._random_timestamp(date_range_start, date_range_end)
                msgs_per_conv = self._rng.randint(2, 8)
                for _ in range(msgs_per_conv):
                    db.add(
                        ConversationEvent(
                            event_id=str(uuid.UUID(int=self._rng.getrandbits(128))),
                            conversation_id=cid,
                            asset_id=asset.id,
                            user_email=user_email if self.privacy_level >= 3 else None,
                            created_at=ts,
                        )
                    )
                    events_inserted += 1

            await db.commit()

            # Detect Finance asset for drift alert
            asset_category = self._asset_category(asset)
            if asset_category == "finance" and finance_asset_id is None:
                finance_asset_id = asset.id
            if len(gap_asset_ids) < 2 and tier >= 2:
                gap_asset_ids.append(asset.id)

            if self.privacy_level <= 1:
                # Count-only insight
                db.add(
                    AssetUsageInsight(
                        asset_id=asset.id,
                        date_range_start=date_range_start,
                        date_range_end=date_range_end,
                        conversation_count=conv_count,
                        unique_user_count=len(unique_users),
                        avg_messages_per_conversation=self._rng.uniform(2.0, 7.0),
                        privacy_level=self.privacy_level,
                    )
                )
            else:
                # Full insight with topics
                topics = list(
                    _TOPICS_BY_ASSET_TYPE.get(
                        asset_category, _TOPICS_BY_ASSET_TYPE["default"]
                    )
                )
                drift_alert: str | None = None
                if asset.id == finance_asset_id:
                    # Pre-set drift: Finance GPT used for HR queries
                    drift_alert = (
                        f"Built for {asset.business_process or 'Finance Reporting'}, "
                        "but 32% of usage is about HR Policy Questions"
                    )

                knowledge_gaps: list[dict] | None = None
                if asset.id in gap_asset_ids:
                    knowledge_gaps = _KNOWLEDGE_GAP_SIGNALS_TEMPLATE

                prompting_quality = round(self._rng.uniform(4.0, 8.5), 1)

                db.add(
                    AssetUsageInsight(
                        asset_id=asset.id,
                        date_range_start=date_range_start,
                        date_range_end=date_range_end,
                        conversation_count=conv_count,
                        unique_user_count=len(unique_users),
                        avg_messages_per_conversation=round(
                            self._rng.uniform(2.0, 7.0), 1
                        ),
                        top_topics=topics,
                        drift_alert=drift_alert,
                        knowledge_gap_signals=knowledge_gaps,
                        prompting_quality_from_messages=prompting_quality,
                        tokens_used=0,
                        cost_usd=0.0,
                        privacy_level=self.privacy_level,
                    )
                )

                # Level 3: add user insights
                if self.privacy_level >= 3:
                    for user_email in unique_users:
                        db.add(
                            UserUsageInsight(
                                asset_id=asset.id,
                                user_email=user_email,
                                user_department=self._rng.choice(
                                    [
                                        "Sales",
                                        "Finance",
                                        "Engineering",
                                        "HR",
                                        "Marketing",
                                        None,
                                    ]
                                ),
                                conversation_count=self._rng.randint(
                                    1, max(1, conv_count // len(unique_users))
                                ),
                                avg_messages_per_conversation=round(
                                    self._rng.uniform(2.0, 6.0), 1
                                ),
                                prompting_quality_score=round(
                                    self._rng.uniform(3.0, 9.0), 1
                                ),
                                primary_use_cases=[
                                    {"topic": t["topic"], "pct": t["pct"]}
                                    for t in topics[:2]
                                ],
                                role_fit_score=round(self._rng.uniform(3.0, 9.5), 1),
                            )
                        )

            await db.commit()
            insights_inserted += 1
            _set_state(assets_done=idx + 1)

        # Stage 3/4: Topic analysis + user patterns (simulated delay)
        _set_state(stage="stage3_topics", progress=75)
        await asyncio.sleep(1.5)
        _set_state(stage="stage4_users", progress=88)
        await asyncio.sleep(0.8)

        # Write sync log
        _set_state(stage="mock_stage5_commit", progress=95)
        sync_log.status = "completed"
        sync_log.finished_at = datetime.now(timezone.utc)
        sync_log.events_fetched = events_inserted
        sync_log.events_processed = events_inserted
        sync_log.assets_covered = len(all_assets)
        sync_log.assets_analyzed = insights_inserted
        sync_log.actual_cost_usd = 0.0
        sync_log.tokens_input = 0
        sync_log.tokens_output = 0
        await db.commit()

        _set_state(stage="done", progress=100, running=False)
        return sync_log.id

    # ── Private helpers ───────────────────────────────────────────────────────

    def _asset_tier(self, asset: GPT) -> int:
        """Approximate tier from asset quality signals."""
        instructions_len = len(asset.instructions or "")
        if instructions_len > 500 and asset.tools:
            return 3
        if instructions_len > 100:
            return 2
        return 1

    def _conv_count_for_tier(self, tier: int) -> int:
        if tier == 3:
            return self._rng.randint(50, 200)
        if tier == 2:
            return self._rng.randint(10, 50)
        # tier 1: ~40% chance of being a ghost asset (0 conversations)
        if self._rng.random() < 0.4:
            return 0
        return self._rng.randint(1, 5)

    def _asset_category(self, asset: GPT) -> str:
        name_lower = (asset.name or "").lower()
        bp_lower = (asset.business_process or "").lower()
        combined = name_lower + " " + bp_lower
        for keyword in ("finance", "sales", "engineering", "hr", "marketing"):
            if keyword in combined:
                return keyword
        cats = asset.builder_categories or []
        if cats:
            return str(cats[0]).lower()
        return "default"

    def _random_timestamp(self, start: datetime, end: datetime) -> datetime:
        delta = (end - start).total_seconds()
        offset = self._rng.uniform(0, delta)
        return start + timedelta(seconds=offset)
