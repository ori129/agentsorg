"""Workflow Intelligence Analyzer — Stage 6 of Conversation Pipeline.

Takes the workflow coverage data (covered/ghost/intent_gap) and runs a single
LLM call (P13) to generate reasoning + priority actions per workflow.
Stores results in workflow_analysis_cache.
"""

from __future__ import annotations

import difflib
import json
import logging
import re
from datetime import datetime, timezone

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import AssetUsageInsight, GPT, WorkflowAnalysisCache
from app.services.prompts import P13_workflow_intelligence

logger = logging.getLogger(__name__)

_GENERIC_TOPICS = {
    "general assistance",
    "summarization",
    "research",
    "documentation",
    "help",
    "analysis",
    "questions",
    "information",
}


def _fuzzy_match(
    topic: str, workflow_names: list[str], threshold: float = 0.52
) -> str | None:
    topic_lower = topic.lower()
    best_ratio = 0.0
    best_match = None
    for wf in workflow_names:
        ratio = difflib.SequenceMatcher(None, topic_lower, wf.lower()).ratio()
        topic_words = set(re.findall(r"\b\w{4,}\b", topic_lower))
        wf_words = set(re.findall(r"\b\w{4,}\b", wf.lower()))
        overlap = topic_words & wf_words
        combined = ratio + 0.15 * len(overlap)
        if combined > best_ratio:
            best_ratio = combined
            best_match = wf
    return best_match if best_ratio >= threshold else None


async def _build_coverage_data(db: AsyncSession) -> list[dict]:
    """Aggregate workflow coverage from DB — same logic as the router endpoint."""

    # All GPTs with a business_process
    gpt_result = await db.execute(select(GPT).where(GPT.business_process.is_not(None)))
    gpts_with_bp = gpt_result.scalars().all()

    bp_to_assets: dict[str, list[GPT]] = {}
    for g in gpts_with_bp:
        bp = (g.business_process or "").strip()
        if bp:
            bp_to_assets.setdefault(bp, []).append(g)

    # All conversation insights with topics
    insight_result = await db.execute(
        select(AssetUsageInsight).where(AssetUsageInsight.top_topics.is_not(None))
    )
    insights = insight_result.scalars().all()

    # Aggregate topics across all insights
    all_topics: dict[str, dict] = {}
    for insight in insights:
        for t in insight.top_topics or []:
            name = (t.get("topic") or "").strip()
            if not name:
                continue
            if name not in all_topics:
                all_topics[name] = {
                    "topic": name,
                    "pct_sum": 0.0,
                    "count": 0,
                    "example_phrases": list(t.get("example_phrases") or []),
                }
            all_topics[name]["pct_sum"] += t.get("pct", 0.0)
            all_topics[name]["count"] += 1
            for ph in t.get("example_phrases") or []:
                if ph not in all_topics[name]["example_phrases"]:
                    all_topics[name]["example_phrases"].append(ph)

    known_workflows = list(bp_to_assets.keys())
    workflow_intent_signals: dict[str, list[dict]] = {bp: [] for bp in known_workflows}
    gap_topics: dict[str, dict] = {}

    for topic_name, topic_data in all_topics.items():
        matched = _fuzzy_match(topic_name, known_workflows)
        if matched:
            workflow_intent_signals[matched].append(
                {
                    "topic": topic_name,
                    "pct": round(
                        topic_data["pct_sum"] / max(topic_data["count"], 1), 1
                    ),
                    "example_phrases": topic_data["example_phrases"][:3],
                }
            )
        else:
            gap_topics[topic_name] = topic_data

    items: list[dict] = []

    for bp, assets in sorted(bp_to_assets.items()):
        total_convs = sum(g.conversation_count or 0 for g in assets)
        items.append(
            {
                "name": bp,
                "status": "covered" if total_convs > 0 else "ghost",
                "asset_count": len(assets),
                "conversation_count": total_convs,
                "assets": [
                    {
                        "id": g.id,
                        "name": g.name,
                        "conversation_count": g.conversation_count or 0,
                        "quadrant_label": g.quadrant_label,
                    }
                    for g in sorted(
                        assets, key=lambda g: g.conversation_count or 0, reverse=True
                    )
                ],
                "intent_signals": workflow_intent_signals.get(bp, []),
                "example_phrases": [],
                "reasoning": None,
                "priority_action": None,
                "priority_level": None,
            }
        )

    for topic_name, topic_data in gap_topics.items():
        if topic_name.lower() in _GENERIC_TOPICS:
            continue
        avg_pct = round(topic_data["pct_sum"] / max(topic_data["count"], 1), 1)
        phrases = topic_data["example_phrases"][:4]
        items.append(
            {
                "name": topic_name,
                "status": "intent_gap",
                "asset_count": 0,
                "conversation_count": 0,
                "assets": [],
                "intent_signals": [
                    {"topic": topic_name, "pct": avg_pct, "example_phrases": phrases}
                ],
                "example_phrases": phrases,
                "reasoning": None,
                "priority_action": None,
                "priority_level": None,
            }
        )

    status_order = {"covered": 0, "ghost": 1, "intent_gap": 2}
    items.sort(key=lambda x: (status_order[x["status"]], -x["conversation_count"]))
    return items


class WorkflowAnalyzer:
    def __init__(self, openai_api_key: str, model: str = "gpt-4o-mini"):
        self._client = AsyncOpenAI(api_key=openai_api_key)
        self._model = model

    async def analyze(
        self, db: AsyncSession, conversation_sync_log_id: int | None = None
    ) -> tuple[list[dict], int, int]:
        """Run workflow coverage analysis + LLM reasoning. Returns (items, tokens_in, tokens_out)."""
        items = await _build_coverage_data(db)

        if not items:
            logger.info("Workflow analysis: no workflows found, skipping LLM call")
            return [], 0, 0

        workflow_block = P13_workflow_intelligence.build_workflow_block(items)
        prompt = P13_workflow_intelligence.USER.format(workflow_block=workflow_block)

        response = await self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": P13_workflow_intelligence.SYSTEM},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            response_format={"type": "json_object"},
        )

        tokens_in = response.usage.prompt_tokens if response.usage else 0
        tokens_out = response.usage.completion_tokens if response.usage else 0

        # Parse LLM response — expect list or wrapped object
        raw = response.choices[0].message.content or "[]"
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                # unwrap {workflows: [...]} or similar
                parsed = next((v for v in parsed.values() if isinstance(v, list)), [])
        except Exception:
            logger.warning("Workflow analysis: failed to parse LLM JSON")
            parsed = []

        # Build reasoning map by workflow name
        reasoning_map: dict[str, dict] = {}
        for entry in parsed:
            name = (entry.get("name") or "").strip()
            if name:
                reasoning_map[name] = entry

        # Inject reasoning into items
        for item in items:
            rec = reasoning_map.get(item["name"])
            if rec:
                item["reasoning"] = rec.get("reasoning")
                item["priority_action"] = rec.get("priority_action")
                item["priority_level"] = rec.get("priority_level")

        # Persist to DB
        cache_row = WorkflowAnalysisCache(
            generated_at=datetime.now(timezone.utc),
            conversation_sync_log_id=conversation_sync_log_id,
            workflow_items=items,
        )
        db.add(cache_row)
        await db.commit()

        logger.info(
            f"Workflow analysis: {len(items)} workflows analyzed, {tokens_in + tokens_out} tokens"
        )
        return items, tokens_in, tokens_out
