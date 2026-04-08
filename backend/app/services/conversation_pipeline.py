"""Conversation Intelligence Pipeline — 6-stage async pipeline.

Stage 1 — Fetch logs (10-40%)      Download JSONL, parse, dedup, upsert conversation_events
Stage 2 — Aggregate + invalidation (45%)  Count per asset, decide which need LLM
Stage 3 — Anonymous topic analysis (50-75%)  LLM topics, drift, knowledge gaps  [Level 2+]
Stage 4 — Named user analysis (75-90%)  Per-user insights                        [Level 3]
Stage 5 — Cost commit (95-100%)    Write sync log, trigger soft retention
Stage 6 — Workflow intelligence (97-100%)  LLM coverage analysis + intent gap reasoning

Privacy levels:
  0 = Off           (nothing runs)
  1 = Counts only   (Stage 1+2, no LLM)
  2 = Anonymous topics (Stage 1-3)
  3 = Named user analysis (Stage 1-4)

┌──────────────────────────────────────────────────────────────────────────┐
│  PIPELINE FLOW                                                            │
│                                                                           │
│  Prerequisite checks                                                      │
│     ↓ gpts > 0  AND  no pipeline already running                         │
│  Stage 1: fetch_logs → parse JSONL → upsert conversation_events          │
│     ↓                                                                     │
│  Stage 2: group by asset → counts → per-asset LLM invalidation check     │
│     ↓ (if privacy_level == 1: skip to Stage 5)                          │
│  Stage 3: reconstruct threads → sample → strip identity → LLM topics     │
│     ↓ (if privacy_level == 2: skip Stage 4)                             │
│  Stage 4: per-user analysis → user_usage_insights                        │
│     ↓                                                                     │
│  Stage 5: write ConversationSyncLog → trigger soft retention (async)     │
└──────────────────────────────────────────────────────────────────────────┘
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import delete, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import (
    AssetUsageInsight,
    ConversationEvent,
    ConversationSyncLog,
    GPT,
    UserUsageInsight,
)
from app.services.compliance_api import ComplianceAPIClient

logger = logging.getLogger(__name__)

# Shared state so the router can query progress and prevent double-runs.
_pipeline_state: dict[str, Any] = {
    "running": False,
    "progress": 0,
    "stage": "",
    "assets_total": 0,
    "assets_done": 0,
    "assets_skipped": 0,
    "sync_log_id": None,
    "error": None,
}

# Regex for stripping email addresses from message bodies (Level 2 identity stripping)
_EMAIL_PATTERN = re.compile(
    r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Z|a-z]{2,}\b"
)


def get_pipeline_state() -> dict[str, Any]:
    return dict(_pipeline_state)


def _set_state(**kwargs: Any) -> None:
    _pipeline_state.update(kwargs)


async def run_conversation_pipeline(
    db: AsyncSession,
    api_client: ComplianceAPIClient,
    workspace_id: str,
    privacy_level: int,
    date_range_days: int,
    token_budget_usd: float,
    asset_ids: list[str] | None,
    openai_api_key: str,
) -> int:
    """Entry point. Returns ConversationSyncLog.id on success, raises on fatal error."""
    if _pipeline_state["running"]:
        raise RuntimeError("Conversation pipeline is already running")

    _set_state(
        running=True,
        progress=0,
        stage="starting",
        assets_total=0,
        assets_done=0,
        assets_skipped=0,
        sync_log_id=None,
        error=None,
    )

    sync_log = ConversationSyncLog(status="running", privacy_level=privacy_level)
    db.add(sync_log)
    await db.commit()
    await db.refresh(sync_log)
    _set_state(sync_log_id=sync_log.id)

    try:
        result_id = await _run(
            db=db,
            api_client=api_client,
            workspace_id=workspace_id,
            privacy_level=privacy_level,
            date_range_days=date_range_days,
            token_budget_usd=token_budget_usd,
            asset_ids=asset_ids,
            openai_api_key=openai_api_key,
            sync_log=sync_log,
        )
        return result_id
    except Exception as exc:
        logger.error(f"Conversation pipeline fatal error: {exc}", exc_info=True)
        sync_log.status = "error"
        sync_log.finished_at = datetime.now(timezone.utc)
        if sync_log.errors is None:
            sync_log.errors = []
        sync_log.errors = list(sync_log.errors) + [
            {"stage": _pipeline_state["stage"], "error": str(exc)}
        ]
        await db.commit()
        _set_state(running=False, error=str(exc))
        raise
    finally:
        if _pipeline_state["running"]:
            _set_state(running=False)


async def _run(
    db: AsyncSession,
    api_client: ComplianceAPIClient,
    workspace_id: str,
    privacy_level: int,
    date_range_days: int,
    token_budget_usd: float,
    asset_ids: list[str] | None,
    openai_api_key: str,
    sync_log: ConversationSyncLog,
) -> int:
    errors: list[dict] = []
    tokens_input_total = 0
    tokens_output_total = 0
    cost_total = 0.0

    # ── Level 0: Off — write a skipped sync log and return immediately ───────
    if privacy_level == 0:
        return await _commit_sync_log(
            db=db,
            sync_log=sync_log,
            assets_analyzed=0,
            assets_skipped_unchanged=0,
            errors=[],
            tokens_input=0,
            tokens_output=0,
            cost=0.0,
            status="skipped",
        )

    # ── Prerequisite: assets must exist ─────────────────────────────────────
    _set_state(stage="prerequisites", progress=5)
    gpt_count_result = await db.execute(select(func.count()).select_from(GPT))
    gpt_count = gpt_count_result.scalar_one()
    if gpt_count == 0:
        raise RuntimeError(
            "No GPTs or Projects found in database. "
            "Run the asset sync pipeline first before analyzing conversations."
        )

    # ── Resolve asset scope ──────────────────────────────────────────────────
    if asset_ids:
        # Validate provided IDs exist
        existing = await db.execute(select(GPT.id).where(GPT.id.in_(asset_ids)))
        valid_ids = {row[0] for row in existing.fetchall()}
        unknown = set(asset_ids) - valid_ids
        for uid in unknown:
            logger.warning(f"Unknown asset_id in scope: {uid} — skipping")
        scope_ids = list(valid_ids)
    else:
        all_result = await db.execute(select(GPT.id))
        scope_ids = [row[0] for row in all_result.fetchall()]

    _set_state(assets_total=len(scope_ids))

    # ── Date range ───────────────────────────────────────────────────────────
    now = datetime.now(timezone.utc)
    date_range_end = now
    date_range_start = now - timedelta(days=date_range_days)
    sync_log.date_range_start = date_range_start
    sync_log.date_range_end = date_range_end
    await db.commit()

    # ─────────────────────────────────────────────────────────────────────────
    # Stage 1: Fetch conversation log files, parse JSONL, upsert events
    # ─────────────────────────────────────────────────────────────────────────
    _set_state(stage="stage1_fetch", progress=10)
    logger.info("Stage 1: Fetching conversation log files")

    # Clean up any orphaned events with asset_id=NULL — these were created by the
    # old pipeline's DELETE-all-GPTs + re-insert pattern which cascaded SET NULL on
    # conversation_events.asset_id. Delete them so they can be re-fetched with the
    # correct asset mapping from the JSONL payload.
    null_cleanup = await db.execute(
        delete(ConversationEvent).where(ConversationEvent.asset_id.is_(None))
    )
    null_count = null_cleanup.rowcount
    if null_count:
        await db.commit()
        logger.info(f"Stage 1: Deleted {null_count} orphaned events with asset_id=NULL")

    try:
        log_files = await api_client.fetch_conversation_log_files(
            workspace_id=workspace_id,
            since_timestamp=date_range_start.timestamp(),
        )
    except Exception as exc:
        logger.warning(
            f"Stage 1: Could not fetch log files from Compliance API ({exc}). "
            "Proceeding with existing conversation_events in DB."
        )
        errors.append({"stage": "stage1", "error": str(exc)})
        log_files = []

    # Raw events keyed by asset_id — held in memory for Stage 3 message reconstruction
    # Structure: { asset_id: { conversation_id: [user_message_text, ...] } }
    asset_threads: dict[str, dict[str, list[str]]] = defaultdict(
        lambda: defaultdict(list)
    )
    events_fetched = 0
    events_processed = 0
    skipped_events = 0

    # Snapshot of existing event_ids to avoid round-trip checks per line
    existing_ids_result = await db.execute(
        select(ConversationEvent.event_id).where(
            ConversationEvent.synced_at >= date_range_start
        )
    )
    existing_event_ids: set[str] = {row[0] for row in existing_ids_result.fetchall()}

    total_files = len(log_files)
    for file_idx, log_file in enumerate(log_files):
        # The /logs list endpoint returns metadata only (no download URL).
        # GET /logs/{id} redirects (307) to the signed JSONL download URL.
        log_id = log_file.get("id", "")
        file_url = (
            log_file.get("url")
            or log_file.get("download_url")
            or (api_client.get_log_file_download_url(workspace_id, log_id) if log_id else "")
        )
        if not file_url:
            logger.warning(f"Log file missing URL: {log_id}")
            continue

        progress_pct = 10 + int(30 * (file_idx / max(total_files, 1)))
        _set_state(progress=progress_pct)

        try:
            lines = await api_client.download_jsonl_lines(file_url)
        except Exception as exc:
            logger.warning(f"Failed to download log file {file_url}: {exc}")
            errors.append({"stage": "stage1", "file": file_url, "error": str(exc)})
            continue

        events_fetched += len(lines)

        new_events: list[ConversationEvent] = []
        # Track principal types seen for debugging
        principal_type_counts: dict[str, int] = {}
        if lines and file_idx == 0:
            logger.info(f"JSONL line[0] keys: {list(lines[0].keys())}")
            logger.info(f"JSONL line[0] full: {lines[0]}")
            if len(lines) > 1:
                logger.info(f"JSONL line[1] full: {lines[1]}")
            # Log all keys present across the conversation object to find gpt_id
            all_conv_keys: set[str] = set()
            for l in lines:
                conv_obj = l.get("conversation") or {}
                all_conv_keys.update(conv_obj.keys())
            logger.info(f"All conversation object keys across file: {sorted(all_conv_keys)}")
        for line in lines:
            event_id = line.get("event_id")
            # Support both API formats:
            # - Real API: conversation_id nested at line["conversation"]["id"]
            # - Plan-spec / test format: conversation_id at top level
            conversation_obj = line.get("conversation") or {}
            conversation_id = (
                line.get("conversation_id")
                or conversation_obj.get("id", "")
            )

            # Validate required fields
            if not event_id or not conversation_id:
                missing = "event_id" if not event_id else "conversation_id"
                skipped_events += 1
                errors.append(
                    {
                        "event_id": event_id,
                        "reason": f"missing field {missing}",
                    }
                )
                continue

            # Deduplicate
            if event_id in existing_event_ids:
                continue
            existing_event_ids.add(event_id)

            # Resolve asset_id from principal:
            # - principal.type == "GPT" / "CUSTOM_GPT" / "PROJECT" → principal.id is the asset
            # - principal.type == "CHATGPT_WORKSPACE" → generic workspace chat, skip
            principal = line.get("principal") or {}
            principal_type = principal.get("type", "")
            principal_id = principal.get("id", "")
            principal_type_counts[principal_type] = principal_type_counts.get(principal_type, 0) + 1

            # Resolve asset_id — check multiple field paths:
            # 1. principal.type != CHATGPT_WORKSPACE → principal.id is the asset (rare)
            # 2. conversation.gpt_id → Custom GPT the user was chatting with
            # 3. conversation.assistant_id → alternate field name seen in some API versions
            # 4. conversation.project_id → OpenAI Project (prefer gpt_id over project_id)
            # 5. None → generic base-ChatGPT chat (workspace-level metric only)
            if principal_type not in ("CHATGPT_WORKSPACE", "") and principal_id:
                asset_id: str | None = principal_id
            else:
                # Prefer gpt_id; fall back to project_id
                payload = line.get("payload") or {}
                raw_gpt_id = (
                    conversation_obj.get("gpt_id")
                    or conversation_obj.get("assistant_id")
                    or conversation_obj.get("custom_gpt_id")
                    or payload.get("gpt_id")
                    or payload.get("assistant_id")
                )
                raw_project_id = (
                    conversation_obj.get("project_id")
                    or payload.get("project_id")
                )
                asset_id = raw_gpt_id or raw_project_id or None
                if raw_gpt_id:
                    logger.info(f"Found gpt_id in conversation object: {asset_id} (conv={conversation_id})")
                elif raw_project_id:
                    logger.info(f"Found project_id in conversation object: {asset_id} (conv={conversation_id})")

            if asset_id is not None:
                # Filter GPT-linked events to scope
                if asset_id not in scope_ids:
                    continue

            actor = line.get("actor") or {}
            # Support both field names: "user_email" (real API) and "email" (plan spec / tests)
            user_email: str | None = actor.get("user_email") or actor.get("email")

            # Parse event timestamp
            ts_raw = line.get("timestamp") or line.get("created_at")
            created_at: datetime | None = None
            if isinstance(ts_raw, (int, float)):
                created_at = datetime.fromtimestamp(ts_raw, tz=timezone.utc)
            elif isinstance(ts_raw, str):
                try:
                    created_at = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
                except ValueError:
                    pass

            new_events.append(
                ConversationEvent(
                    event_id=event_id,
                    conversation_id=conversation_id,
                    asset_id=asset_id,
                    user_email=user_email,
                    created_at=created_at,
                )
            )

            # Collect user messages for Stage 3 (in memory only, never persisted)
            # Message lives at line["message"]["content"]["value"] for user-authored events
            msg_author = (line.get("message") or {}).get("author") or {}
            msg_role = msg_author.get("type", "")  # "user" or "assistant"
            if msg_role == "user":
                content = ((line.get("message") or {}).get("content") or {}).get("value", "")
                if content:
                    asset_threads[asset_id][conversation_id].append(content)

        if principal_type_counts:
            logger.info(f"File {file_idx}: principal type distribution: {principal_type_counts}")

            events_processed += 1

        if new_events:
            db.add_all(new_events)
            await db.commit()

    # Update gpts.conversation_count and last_conversation_at per asset
    for asset_id in scope_ids:
        count_result = await db.execute(
            select(func.count())
            .select_from(ConversationEvent)
            .where(ConversationEvent.asset_id == asset_id)
            .where(ConversationEvent.created_at >= date_range_start)
        )
        conv_count = count_result.scalar_one()

        last_result = await db.execute(
            select(func.max(ConversationEvent.created_at)).where(
                ConversationEvent.asset_id == asset_id
            )
        )
        last_at = last_result.scalar_one()

        await db.execute(
            update(GPT)
            .where(GPT.id == asset_id)
            .values(conversation_count=conv_count, last_conversation_at=last_at)
        )
    await db.commit()

    sync_log.events_fetched = events_fetched
    sync_log.events_processed = events_processed
    sync_log.skipped_events = skipped_events
    sync_log.assets_covered = len(
        [a for a in scope_ids if asset_id in asset_threads or True]
    )
    await db.commit()

    logger.info(
        f"Stage 1 complete: {events_fetched} fetched, {events_processed} processed, "
        f"{skipped_events} skipped"
    )

    # ─────────────────────────────────────────────────────────────────────────
    # Stage 2: Aggregate counts + per-asset LLM invalidation check
    # ─────────────────────────────────────────────────────────────────────────
    _set_state(stage="stage2_aggregate", progress=45)
    logger.info("Stage 2: Aggregating counts and checking LLM invalidation")

    assets_needing_llm: list[str] = []
    assets_skipped_unchanged: list[str] = []
    assets_ghost: list[str] = []  # No conversations in range — write zero-count insight
    asset_event_counts: dict[str, int] = {}  # DB event count per asset, for cost estimation

    for asset_id in scope_ids:
        # Count events in range
        count_result = await db.execute(
            select(func.count())
            .select_from(ConversationEvent)
            .where(ConversationEvent.asset_id == asset_id)
            .where(ConversationEvent.created_at >= date_range_start)
        )
        conv_events = count_result.scalar_one()

        asset_event_counts[asset_id] = conv_events

        if conv_events == 0:
            # Ghost asset: genuinely no conversations. Write a zero-count insight so
            # it appears in the dashboard (ghost_assets count). Do NOT treat as "unchanged".
            assets_ghost.append(asset_id)
            continue

        # Check for existing insight and whether new events exist since last analysis
        last_insight_result = await db.execute(
            select(AssetUsageInsight.analyzed_at)
            .where(AssetUsageInsight.asset_id == asset_id)
            .order_by(AssetUsageInsight.analyzed_at.desc())
            .limit(1)
        )
        last_analyzed = last_insight_result.scalar_one_or_none()

        if last_analyzed is not None:
            new_events_result = await db.execute(
                select(func.count())
                .select_from(ConversationEvent)
                .where(ConversationEvent.asset_id == asset_id)
                .where(ConversationEvent.synced_at > last_analyzed)
            )
            new_event_count = new_events_result.scalar_one()
            if new_event_count == 0:
                assets_skipped_unchanged.append(asset_id)
                continue

        assets_needing_llm.append(asset_id)

    # Write zero-count insight rows for ghost assets (shared with count-only path below)
    for ghost_id in assets_ghost:
        await _write_count_only_insight(
            db, ghost_id, date_range_start, date_range_end, privacy_level
        )
    if assets_ghost:
        await db.commit()

    logger.info(
        f"Stage 2: {len(assets_needing_llm)} assets need LLM analysis, "
        f"{len(assets_skipped_unchanged)} unchanged, {len(assets_ghost)} ghost (no conversations)"
    )

    _set_state(
        assets_total=len(assets_needing_llm),
        assets_skipped=len(assets_skipped_unchanged),
    )

    # For privacy level 1: write count-only insights and finish
    if privacy_level == 1:
        for asset_id in assets_needing_llm:
            await _write_count_only_insight(
                db, asset_id, date_range_start, date_range_end, privacy_level
            )
        await db.commit()
        _set_state(stage="stage5_commit", progress=95)
        return await _commit_sync_log(
            db=db,
            sync_log=sync_log,
            assets_analyzed=len(assets_needing_llm) + len(assets_ghost),
            assets_skipped_unchanged=len(assets_skipped_unchanged),
            errors=errors,
            tokens_input=0,
            tokens_output=0,
            cost=0.0,
            status="completed",
        )

    # ── Budget pre-check ──────────────────────────────────────────────────────
    estimated_cost = _estimate_cost(
        assets_needing_llm, asset_threads, privacy_level, asset_event_counts
    )
    sync_log.estimated_cost_usd = estimated_cost
    await db.commit()

    if estimated_cost > token_budget_usd:
        logger.warning(
            f"Estimated cost ${estimated_cost:.4f} exceeds budget ${token_budget_usd:.4f}. "
            "Aborting pipeline."
        )
        return await _commit_sync_log(
            db=db,
            sync_log=sync_log,
            assets_analyzed=0,
            assets_skipped_unchanged=len(assets_skipped_unchanged) + len(assets_needing_llm),
            errors=errors
            + [
                {
                    "stage": "stage2",
                    "error": f"Budget exceeded: estimated ${estimated_cost:.4f} > budget ${token_budget_usd:.4f}",
                }
            ],
            tokens_input=0,
            tokens_output=0,
            cost=0.0,
            status="budget_exceeded",
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Stage 3: Anonymous topic analysis (Level 2+)
    # ─────────────────────────────────────────────────────────────────────────
    _set_state(stage="stage3_topics", progress=50)
    logger.info("Stage 3: Running anonymous topic analysis")

    from app.services.semantic_enricher import SemanticEnricher

    enricher = SemanticEnricher(openai_api_key)
    assets_analyzed = len(assets_ghost)  # Ghost assets already have insight rows written

    for idx, asset_id in enumerate(assets_needing_llm):
        pct = 50 + int(25 * (idx / max(len(assets_needing_llm), 1)))
        _set_state(progress=pct, assets_done=idx)

        threads = asset_threads.get(asset_id, {})
        if not threads:
            # No messages in memory (all conversations were in prior syncs)
            await _write_count_only_insight(
                db, asset_id, date_range_start, date_range_end, privacy_level
            )
            assets_analyzed += 1
            continue

        # Sample up to 500 user messages, strip identity
        all_user_messages = _collect_and_strip_messages(threads)
        if not all_user_messages:
            await _write_count_only_insight(
                db, asset_id, date_range_start, date_range_end, privacy_level
            )
            assets_analyzed += 1
            continue

        # Count aggregates
        conv_count_result = await db.execute(
            select(func.count(func.distinct(ConversationEvent.conversation_id)))
            .where(ConversationEvent.asset_id == asset_id)
            .where(ConversationEvent.created_at >= date_range_start)
        )
        conversation_count = conv_count_result.scalar_one()

        user_count_result = await db.execute(
            select(func.count(func.distinct(ConversationEvent.user_email)))
            .where(ConversationEvent.asset_id == asset_id)
            .where(ConversationEvent.created_at >= date_range_start)
            .where(ConversationEvent.user_email.isnot(None))
        )
        unique_user_count = user_count_result.scalar_one()

        event_count_result = await db.execute(
            select(func.count())
            .select_from(ConversationEvent)
            .where(ConversationEvent.asset_id == asset_id)
            .where(ConversationEvent.created_at >= date_range_start)
        )
        total_events = event_count_result.scalar_one()
        avg_msgs = (total_events / conversation_count) if conversation_count > 0 else 0.0

        # LLM topic analysis
        top_topics, t_in, t_out = await _analyze_topics(
            enricher, all_user_messages, asset_id
        )
        tokens_input_total += t_in
        tokens_output_total += t_out
        cost_total += (t_in * 0.15 + t_out * 0.60) / 1_000_000

        # Drift detection
        gpt_result = await db.execute(select(GPT).where(GPT.id == asset_id))
        gpt = gpt_result.scalar_one_or_none()
        drift_alert: str | None = None
        if gpt and top_topics and len(top_topics) >= 2:
            drift_alert = _detect_drift(gpt, top_topics)

        # Knowledge gap signals
        knowledge_gap_signals = _detect_knowledge_gaps(threads)

        insight = AssetUsageInsight(
            asset_id=asset_id,
            date_range_start=date_range_start,
            date_range_end=date_range_end,
            conversation_count=conversation_count,
            unique_user_count=unique_user_count,
            avg_messages_per_conversation=avg_msgs,
            top_topics=top_topics,
            drift_alert=drift_alert,
            knowledge_gap_signals=knowledge_gap_signals,
            tokens_used=t_in + t_out,
            cost_usd=(t_in * 0.15 + t_out * 0.60) / 1_000_000,
            privacy_level=privacy_level,
        )
        db.add(insight)
        assets_analyzed += 1

        try:
            await db.commit()
        except Exception as exc:
            logger.warning(f"FK constraint saving insight for {asset_id}: {exc}")
            await db.rollback()

    _set_state(assets_done=len(assets_needing_llm))

    # ─────────────────────────────────────────────────────────────────────────
    # Stage 4: Named user analysis (Level 3)
    # ─────────────────────────────────────────────────────────────────────────
    if privacy_level >= 3:
        _set_state(stage="stage4_users", progress=75)
        logger.info("Stage 4: Running named user analysis")

        for idx, asset_id in enumerate(assets_needing_llm):
            pct = 75 + int(15 * (idx / max(len(assets_needing_llm), 1)))
            _set_state(progress=pct)

            threads = asset_threads.get(asset_id, {})
            if not threads:
                continue

            # Get user→conversation_ids mapping
            user_convs_result = await db.execute(
                select(
                    ConversationEvent.user_email,
                    ConversationEvent.conversation_id,
                )
                .where(ConversationEvent.asset_id == asset_id)
                .where(ConversationEvent.created_at >= date_range_start)
                .where(ConversationEvent.user_email.isnot(None))
            )
            user_convs: dict[str, list[str]] = defaultdict(list)
            for email, conv_id in user_convs_result.fetchall():
                user_convs[email].append(conv_id)

            # Look up departments from workspace_users
            from app.models.models import WorkspaceUser

            emails = list(user_convs.keys())
            dept_result = await db.execute(
                select(WorkspaceUser.email, WorkspaceUser.role).where(
                    WorkspaceUser.email.in_(emails)
                )
            )
            email_to_dept: dict[str, str | None] = {
                row[0]: row[1] for row in dept_result.fetchall()
            }

            # Get asset insight for role_fit context
            insight_result = await db.execute(
                select(AssetUsageInsight)
                .where(AssetUsageInsight.asset_id == asset_id)
                .order_by(AssetUsageInsight.analyzed_at.desc())
                .limit(1)
            )
            insight = insight_result.scalar_one_or_none()
            asset_topics = (insight.top_topics or []) if insight else []

            for user_email, conv_ids in user_convs.items():
                user_threads = {
                    cid: threads.get(cid, []) for cid in conv_ids
                }
                user_messages = _collect_and_strip_messages(user_threads, max_msgs=100)

                # Compute prompting quality score from message patterns
                pq_score = _compute_prompting_quality(user_messages)

                # Role fit: if department known and asset has topics, score fit
                department = email_to_dept.get(user_email)
                role_fit: float | None = None
                if department and asset_topics:
                    role_fit = _compute_role_fit(department, asset_topics)

                # Primary use cases from top topics
                primary_use_cases = [
                    {"topic": t.get("topic"), "pct": t.get("pct")}
                    for t in asset_topics[:3]
                ]

                # last active
                last_active_result = await db.execute(
                    select(func.max(ConversationEvent.created_at))
                    .where(ConversationEvent.asset_id == asset_id)
                    .where(ConversationEvent.user_email == user_email)
                )
                last_active = last_active_result.scalar_one_or_none()

                avg_msgs_user = (
                    len(user_messages) / len(conv_ids) if conv_ids else 0.0
                )

                user_insight = UserUsageInsight(
                    asset_id=asset_id,
                    user_email=user_email,
                    user_department=department,
                    conversation_count=len(set(conv_ids)),
                    last_active_at=last_active,
                    avg_messages_per_conversation=avg_msgs_user,
                    prompting_quality_score=pq_score,
                    primary_use_cases=primary_use_cases,
                    role_fit_score=role_fit,
                )
                db.add(user_insight)

            try:
                await db.commit()
            except Exception as exc:
                logger.warning(
                    f"Error saving user insights for asset {asset_id}: {exc}"
                )
                await db.rollback()

    # ─────────────────────────────────────────────────────────────────────────
    # Stage 5: Cost commit + soft retention
    # ─────────────────────────────────────────────────────────────────────────
    _set_state(stage="stage5_commit", progress=95)
    result_id = await _commit_sync_log(
        db=db,
        sync_log=sync_log,
        assets_analyzed=assets_analyzed,
        assets_skipped_unchanged=len(assets_skipped_unchanged),
        errors=errors,
        tokens_input=tokens_input_total,
        tokens_output=tokens_output_total,
        cost=cost_total,
        status="completed",
    )

    # Trigger soft retention cleanup (non-blocking — failure does not abort pipeline)
    asyncio.ensure_future(
        _soft_retention_cleanup(db_url=None)  # will use same session factory
    )

    # Stage 6: Workflow Intelligence — LLM analysis of coverage + intent gaps
    _set_state(stage="workflow_intelligence", progress=97)
    try:
        from app.services.workflow_analyzer import WorkflowAnalyzer
        wf_analyzer = WorkflowAnalyzer(openai_api_key)
        wf_items, wf_t_in, wf_t_out = await wf_analyzer.analyze(
            db, conversation_sync_log_id=result_id
        )
        tokens_input_total += wf_t_in
        tokens_output_total += wf_t_out
        logger.info(f"Stage 6: Workflow analysis complete — {len(wf_items)} workflows")
    except Exception as exc:
        logger.warning(f"Workflow analysis failed (non-fatal): {exc}")

    _set_state(stage="done", progress=100)
    return result_id


# ── Helpers ──────────────────────────────────────────────────────────────────


async def _write_count_only_insight(
    db: AsyncSession,
    asset_id: str,
    date_range_start: datetime,
    date_range_end: datetime,
    privacy_level: int,
) -> None:
    count_result = await db.execute(
        select(func.count(func.distinct(ConversationEvent.conversation_id)))
        .where(ConversationEvent.asset_id == asset_id)
        .where(ConversationEvent.created_at >= date_range_start)
    )
    conversation_count = count_result.scalar_one()

    user_count_result = await db.execute(
        select(func.count(func.distinct(ConversationEvent.user_email)))
        .where(ConversationEvent.asset_id == asset_id)
        .where(ConversationEvent.created_at >= date_range_start)
        .where(ConversationEvent.user_email.isnot(None))
    )
    unique_user_count = user_count_result.scalar_one()

    db.add(
        AssetUsageInsight(
            asset_id=asset_id,
            date_range_start=date_range_start,
            date_range_end=date_range_end,
            conversation_count=conversation_count,
            unique_user_count=unique_user_count,
            privacy_level=privacy_level,
        )
    )


def _collect_and_strip_messages(
    threads: dict[str, list[str]], max_msgs: int = 500
) -> list[str]:
    """Collect all user messages from threads, strip identity, sample if needed."""
    all_msgs = [msg for msgs in threads.values() for msg in msgs]
    if len(all_msgs) > max_msgs:
        rng = random.Random(42)
        all_msgs = rng.sample(all_msgs, max_msgs)
    return [_EMAIL_PATTERN.sub("[redacted]", msg) for msg in all_msgs]


async def _analyze_topics(
    enricher: Any,
    messages: list[str],
    asset_id: str,
) -> tuple[list[dict], int, int]:
    """Call LLM to extract top 5 topics from sampled messages.

    Returns (top_topics, tokens_input, tokens_output).
    On LLM error: returns ([], 0, 0) with a warning log.
    """
    if not messages:
        return [], 0, 0

    # Chunk into batches of 50 and merge
    batch_size = 50
    batches = [messages[i : i + batch_size] for i in range(0, len(messages), batch_size)]

    merged_topics: dict[str, dict] = {}
    tokens_in = 0
    tokens_out = 0

    for batch in batches:
        messages_text = "\n---\n".join(batch[:50])
        prompt = f"""Analyze these user messages sent to an AI assistant and extract the top 5 topics.

Messages:
{messages_text}

Return ONLY valid JSON array with exactly this structure:
[
  {{"topic": "string", "pct": 0.0, "example_phrases": ["phrase1", "phrase2"]}}
]

Rules:
- pct values must sum to 100.0
- topic names must be concise (2-5 words)
- include only 5 topics maximum
- return ONLY the JSON array, no other text"""

        try:
            raw, t_in, t_out = await enricher._call_llm(
                prompt, model="gpt-4o-mini", expect_json=True
            )
            tokens_in += t_in
            tokens_out += t_out
            parsed = json.loads(raw) if isinstance(raw, str) else raw
            if isinstance(parsed, list):
                for item in parsed:
                    topic_name = item.get("topic", "")
                    if topic_name not in merged_topics:
                        merged_topics[topic_name] = item
                    else:
                        # Average pct across batches
                        merged_topics[topic_name]["pct"] = (
                            merged_topics[topic_name]["pct"] + item.get("pct", 0)
                        ) / 2
        except Exception as exc:
            logger.warning(
                f"LLM topic analysis failed for asset {asset_id}: {exc}. "
                "Writing null for top_topics."
            )
            return [], tokens_in, tokens_out

    # Normalize percentages and take top 5
    topics = list(merged_topics.values())
    total_pct = sum(t.get("pct", 0) for t in topics) or 1.0
    for t in topics:
        t["pct"] = round(t.get("pct", 0) / total_pct * 100, 1)
    topics = sorted(topics, key=lambda t: t.get("pct", 0), reverse=True)[:5]

    return topics, tokens_in, tokens_out


def _detect_drift(gpt: GPT, top_topics: list[dict]) -> str | None:
    """Drift alert when secondary topic >30% AND semantically different from business_process."""
    if len(top_topics) < 2:
        return None

    secondary = top_topics[1]
    secondary_pct = secondary.get("pct", 0)
    if secondary_pct <= 30:
        return None

    business_process = gpt.business_process or ""
    secondary_topic = secondary.get("topic", "")

    # Keyword overlap check: split both into lowercase words, check overlap
    bp_words = set(business_process.lower().split())
    st_words = set(secondary_topic.lower().split())
    overlap = len(bp_words & st_words)

    if overlap >= 2:
        return None  # Likely related to business_process

    return (
        f"Built for {business_process}, but {secondary_pct:.0f}% "
        f"of usage is about {secondary_topic}"
    )


def _detect_knowledge_gaps(threads: dict[str, list[str]]) -> list[dict]:
    """Identify short-response proxies — long user messages followed by nothing.

    In our data model, we only have user messages. We use message length as a proxy:
    very long user messages (>100 chars) that appear to be re-asks (repeated topic)
    are flagged as potential knowledge gaps.
    """
    # Simple heuristic: cluster long messages (>100 chars) by first 5 words
    long_msgs: dict[str, list[str]] = defaultdict(list)
    for msgs in threads.values():
        for msg in msgs:
            if len(msg) > 100:
                key = " ".join(msg.lower().split()[:5])
                long_msgs[key].append(msg)

    gaps = []
    for key, examples in long_msgs.items():
        if len(examples) >= 2:  # repeated long asks = gap signal
            gaps.append(
                {
                    "topic": key,
                    "frequency": len(examples),
                    "example_question": examples[0][:200],
                }
            )

    return sorted(gaps, key=lambda g: g["frequency"], reverse=True)[:3]


def _compute_prompting_quality(messages: list[str]) -> float:
    """Compute prompting quality score (0-10) from message patterns.

    Heuristics:
    - Longer messages with context = better (max 40 chars = 0, 500+ chars = 3 points)
    - Specific question words = better (what/how/why/when = +2 points)
    - No filler/vague messages ("help me" / "what is" with nothing else = -1 point)
    - Score clamped to 0-10
    """
    if not messages:
        return 0.0

    scores: list[float] = []
    for msg in messages:
        score = 0.0
        # Length score (0-3)
        score += min(3.0, len(msg) / 167)
        # Question words
        msg_lower = msg.lower()
        if any(w in msg_lower for w in ("how to", "what is", "why does", "how do")):
            score += 1.0
        if any(w in msg_lower for w in ("specifically", "example", "step by step")):
            score += 1.0
        # Context score: has commas or newlines (structured prompt)
        if "," in msg or "\n" in msg:
            score += 1.0
        scores.append(min(score, 5.0))

    return round(sum(scores) / len(scores) * 2, 1)  # scale 0-10


def _compute_role_fit(department: str, asset_topics: list[dict]) -> float:
    """Simple keyword-based role-fit score (0-10).

    Checks if the department name appears in the asset's top topic names.
    """
    if not department or not asset_topics:
        return 5.0  # neutral default

    dept_words = set(department.lower().split())
    topic_words = set()
    for t in asset_topics:
        topic_words.update(t.get("topic", "").lower().split())

    overlap = len(dept_words & topic_words)
    if overlap == 0:
        return 3.0
    elif overlap == 1:
        return 6.0
    else:
        return 8.5


def _estimate_cost(
    asset_ids: list[str],
    asset_threads: dict[str, dict[str, list[str]]],
    privacy_level: int,
    asset_event_counts: dict[str, int] | None = None,
) -> float:
    """Rough cost estimate before running LLM stages."""
    total_messages = sum(
        len(msgs)
        for asset_id in asset_ids
        for msgs in asset_threads.get(asset_id, {}).values()
    )
    # Fallback: when asset_threads is empty (no JSONL downloaded this run),
    # use DB event counts as a proxy for message volume (1 event ≈ 1 user message).
    if total_messages == 0 and asset_event_counts and asset_ids:
        total_messages = sum(
            asset_event_counts.get(a, 0) for a in asset_ids
        )
    # Absolute minimum floor: each asset needing analysis requires at least one
    # LLM call, which costs ~$0.0002.  Ensures budget check fires even for tiny datasets.
    if not total_messages and asset_ids and privacy_level >= 2:
        total_messages = len(asset_ids) * 5  # assume at least 5 messages per asset

    # Stage 3: ~500 msgs per asset sampled, 1 LLM call per 50 msgs
    # gpt-4o-mini: $0.15/1M input tokens, $0.60/1M output tokens
    # Estimate ~200 tokens input + 100 tokens output per message analyzed
    sampled_msgs = min(total_messages, len(asset_ids) * 500)
    batches = max(sampled_msgs / 50, len(asset_ids) * 0.2)  # min 0.2 batches per asset
    est_input_tokens = batches * 200 * 50
    est_output_tokens = batches * 200
    stage3_cost = (est_input_tokens * 0.15 + est_output_tokens * 0.60) / 1_000_000

    if privacy_level >= 3:
        # Stage 4 adds ~30% more LLM calls
        return stage3_cost * 1.3
    return stage3_cost


async def _commit_sync_log(
    db: AsyncSession,
    sync_log: ConversationSyncLog,
    assets_analyzed: int,
    assets_skipped_unchanged: int,
    errors: list[dict],
    tokens_input: int,
    tokens_output: int,
    cost: float,
    status: str,
) -> int:
    sync_log.status = status
    sync_log.finished_at = datetime.now(timezone.utc)
    sync_log.assets_analyzed = assets_analyzed
    sync_log.assets_skipped_unchanged = assets_skipped_unchanged
    sync_log.actual_cost_usd = cost
    sync_log.tokens_input = tokens_input
    sync_log.tokens_output = tokens_output
    sync_log.errors = errors or None
    await db.commit()
    return sync_log.id


async def _soft_retention_cleanup(db_url: str | None) -> None:
    """Null out user_email in conversation_events older than 90 days.

    Non-blocking — runs after sync log is committed.
    Failure is logged but does NOT affect pipeline status.
    """
    try:
        from app.database import async_session as AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                text(
                    "UPDATE conversation_events "
                    "SET user_email = NULL "
                    "WHERE created_at < NOW() - INTERVAL '90 days' "
                    "AND user_email IS NOT NULL"
                )
            )
            await db.commit()
            logger.info(f"Soft retention: nulled {result.rowcount} user_email fields")
    except Exception as exc:
        logger.warning(f"Soft retention cleanup failed (non-fatal): {exc}")
