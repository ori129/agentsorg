"""Score Assessor — LLM-assessed composite scores for every AI asset.

Pipeline Stage 6 (score_assess):
  For each asset needing reassessment, calls P04_asset_scores once and stores:
    quality_score, quality_score_rationale, quality_main_strength, quality_main_weakness
    adoption_score, adoption_score_rationale, adoption_signal, adoption_barrier
    risk_score, risk_score_rationale, risk_primary_driver, risk_urgency
    quadrant_label, top_action, score_confidence, scores_assessed_at

Pipeline Stage 8 (workspace_analysis):
  Generates priority action cards (P06) and executive summary (P07) stored in
  workspace_recommendations table.

Design:
  - All per-asset assessments run in parallel via asyncio.gather (semaphore-limited)
  - needs_reassessment() skips assets where scores are already fresh
  - Demo mode: uses MockScoreAssessor (deterministic, no LLM calls)
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from openai import AsyncOpenAI
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import GPT, WorkspaceRecommendation
from app.services.prompts import P01_asset_profile, P04_asset_scores, P06_priority_actions, P07_executive_summary

logger = logging.getLogger(__name__)

_SEMAPHORE_LIMIT = 15  # concurrent LLM calls per pipeline run


def needs_reassessment(g: GPT) -> bool:
    """Return True if this asset's scores should be (re)computed.

    Skip when:
    - scores_assessed_at is set AND
    - semantic_enriched_at is not newer than scores_assessed_at AND
    - conversation_count hasn't changed meaningfully (proxy: last_conversation_at ≤ scores_assessed_at)
    """
    if g.scores_assessed_at is None:
        return True
    if g.semantic_enriched_at and g.semantic_enriched_at > g.scores_assessed_at:
        return True
    if g.last_conversation_at and g.last_conversation_at > g.scores_assessed_at:
        return True
    return False


class ScoreAssessor:
    def __init__(self, openai_api_key: str, model: str = "gpt-4o-mini"):
        self._client = AsyncOpenAI(api_key=openai_api_key)
        self._model = model
        self._semaphore = asyncio.Semaphore(_SEMAPHORE_LIMIT)

    # ─────────────────────────────────────────────────────────────────────────
    # Stage 6: per-asset score assessment
    # ─────────────────────────────────────────────────────────────────────────

    async def assess_asset(self, g: GPT) -> tuple[dict, int, int]:
        """Score a single asset. Returns (score_dict, prompt_tokens, completion_tokens)."""
        gpt_data = {
            "name": g.name,
            "description": g.description or "",
            "instructions": g.instructions or "",
            "tools": g.tools or [],
            "files": g.files or [],
            "conversation_starters": g.conversation_starters or [],
            "builder_categories": g.builder_categories or [],
            "shared_user_count": g.shared_user_count or 0,
        }
        gpt_context = _build_gpt_context(gpt_data)

        # Resolve usage stats from DB-populated fields
        conversation_count = g.conversation_count or 0
        unique_user_count = 0  # usage insights not joined here; fall back to 0

        prompt = P04_asset_scores.USER.format(
            gpt_context=gpt_context,
            conversation_count=conversation_count,
            unique_user_count=unique_user_count,
            shared_user_count=g.shared_user_count or 0,
        )

        async with self._semaphore:
            try:
                response = await self._client.chat.completions.create(
                    model=self._model,
                    messages=[
                        {"role": "system", "content": P04_asset_scores.SYSTEM},
                        {"role": "user", "content": prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1,
                    max_tokens=800,
                )
                text = response.choices[0].message.content or "{}"
                result = json.loads(text)
                pt = response.usage.prompt_tokens if response.usage else 0
                ct = response.usage.completion_tokens if response.usage else 0
                result["scores_assessed_at"] = datetime.now(timezone.utc).isoformat()
                return result, pt, ct
            except Exception as exc:
                logger.warning(f"Score assessment failed for '{g.name}': {exc}")
                return {}, 0, 0

    async def assess_batch(
        self, gpts: list[GPT]
    ) -> tuple[list[dict], int, int]:
        """Assess all assets concurrently. Returns (results_list, total_pt, total_ct)."""
        tasks = [self.assess_asset(g) for g in gpts]
        raw = await asyncio.gather(*tasks, return_exceptions=True)

        results = []
        total_pt = 0
        total_ct = 0
        for i, r in enumerate(raw):
            if isinstance(r, Exception):
                logger.warning(f"Score assessment exception for '{gpts[i].name}': {r}")
                results.append({})
            else:
                scores, pt, ct = r
                results.append(scores)
                total_pt += pt
                total_ct += ct
        return results, total_pt, total_ct

    # ─────────────────────────────────────────────────────────────────────────
    # Stage 8: workspace priority actions + executive summary
    # ─────────────────────────────────────────────────────────────────────────

    async def generate_workspace_recommendations(
        self,
        db: AsyncSession,
        sync_log_id: int | None = None,
    ) -> tuple[list[dict], str, int, int]:
        """Generate priority action cards + executive summary.

        Returns (recommendations, executive_summary, prompt_tokens, completion_tokens).
        Persists result to workspace_recommendations table.
        """
        # Aggregate portfolio stats
        result = await db.execute(select(GPT))
        all_gpts = result.scalars().all()
        if not all_gpts:
            return [], "", 0, 0

        scored = [g for g in all_gpts if g.quality_score is not None]
        total = len(all_gpts)

        champions = sum(
            1 for g in scored
            if (g.quality_score or 0) >= 60 and (g.adoption_score or 0) >= 60
        )
        hidden_gems = sum(
            1 for g in scored
            if (g.quality_score or 0) >= 60 and (g.adoption_score or 0) < 60
        )
        scaled_risk = sum(
            1 for g in scored
            if (g.quality_score or 0) < 60 and (g.adoption_score or 0) >= 60
        )
        retirement = sum(
            1 for g in scored
            if (g.quality_score or 0) < 60 and (g.adoption_score or 0) < 60
        )
        ghost = sum(
            1 for g in all_gpts
            if g.conversation_count == 0 and (g.shared_user_count or 0) >= 5
        )
        high_risk = sum(
            1 for g in scored if (g.risk_score or 0) >= 60
        )
        no_guardrails = sum(
            1 for g in all_gpts
            if g.risk_flags and "no_guardrails" in (g.risk_flags or [])
        )

        avg_quality = (
            sum(g.quality_score for g in scored if g.quality_score) / len(scored)
            if scored else 0.0
        )
        avg_adoption = (
            sum(g.adoption_score for g in scored if g.adoption_score) / len(scored)
            if scored else 0.0
        )
        avg_risk = (
            sum(g.risk_score for g in scored if g.risk_score) / len(scored)
            if scored else 0.0
        )

        portfolio_summary = (
            f"Total assets: {total} ({sum(1 for g in all_gpts if g.asset_type != 'project')} GPTs, "
            f"{sum(1 for g in all_gpts if g.asset_type == 'project')} Projects)\n"
            f"Scored: {len(scored)} of {total}\n"
            f"Avg quality: {avg_quality:.1f}/100 | Avg adoption: {avg_adoption:.1f}/100 | "
            f"Avg risk: {avg_risk:.1f}/100\n"
            f"Total conversations (30d): {sum(g.conversation_count or 0 for g in all_gpts)}"
        )

        # Top 10 assets needing attention (scaled_risk + high_risk first)
        attention_assets = sorted(
            scored,
            key=lambda g: (
                -(g.adoption_score or 0) * (100 - (g.quality_score or 0)) / 100,
                -(g.risk_score or 0),
            ),
        )[:10]
        top_assets_block = "\n".join(
            f'  - "{g.name}" [{g.quadrant_label or "?"}] '
            f'Q={g.quality_score:.0f} A={g.adoption_score:.0f} R={g.risk_score:.0f} '
            f'convos={g.conversation_count} shared={g.shared_user_count}'
            f'{" | " + g.top_action if g.top_action else ""}'
            for g in attention_assets
            if g.quality_score is not None
        ) or "  (no scored assets yet)"

        learning_signals = "(No conversation data available)"
        # Could be extended with AssetUsageInsight data in future

        # P06 — Priority actions
        p06_prompt = P06_priority_actions.USER.format(
            total_assets=total,
            portfolio_summary=portfolio_summary,
            champions=champions,
            hidden_gems=hidden_gems,
            scaled_risk=scaled_risk,
            retirement_candidates=retirement,
            top_assets_block=top_assets_block,
            high_risk_count=high_risk,
            no_guardrails_count=no_guardrails,
            ghost_count=ghost,
            learning_signals=learning_signals,
        )

        total_pt = 0
        total_ct = 0
        recommendations: list[dict] = []

        try:
            async with self._semaphore:
                resp = await self._client.chat.completions.create(
                    model=self._model,
                    messages=[
                        {"role": "system", "content": P06_priority_actions.SYSTEM},
                        {"role": "user", "content": p06_prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.2,
                    max_tokens=1200,
                )
            raw_p06 = json.loads(resp.choices[0].message.content or "{}")
            if isinstance(raw_p06, list):
                recommendations = raw_p06
            elif isinstance(raw_p06, dict):
                # P06 prompt asks for {"actions": [...]}, but try any list value as fallback
                for key in ("actions", "recommendations", "priority_actions", "items"):
                    if isinstance(raw_p06.get(key), list):
                        recommendations = raw_p06[key]
                        break
                else:
                    # Last resort: find the first list value in the response dict
                    for v in raw_p06.values():
                        if isinstance(v, list):
                            recommendations = v
                            break
            if resp.usage:
                total_pt += resp.usage.prompt_tokens
                total_ct += resp.usage.completion_tokens
        except Exception as exc:
            logger.warning(f"Priority actions generation failed: {exc}")

        # P07 — Executive summary
        top_actions_summary = "; ".join(
            r.get("title", "") for r in recommendations[:3]
        ) or "No actions generated"

        pcts = {
            "champions_pct": round(champions / max(len(scored), 1) * 100),
            "hidden_gems_pct": round(hidden_gems / max(len(scored), 1) * 100),
            "scaled_risk_pct": round(scaled_risk / max(len(scored), 1) * 100),
            "retirement_candidates_pct": round(retirement / max(len(scored), 1) * 100),
        }

        p07_prompt = P07_executive_summary.USER.format(
            portfolio_summary=portfolio_summary,
            champions=champions,
            hidden_gems=hidden_gems,
            scaled_risk=scaled_risk,
            retirement_candidates=retirement,
            avg_quality=round(avg_quality, 1),
            avg_adoption=round(avg_adoption, 1),
            avg_risk=round(avg_risk, 1),
            total_conversations=sum(g.conversation_count or 0 for g in all_gpts),
            ghost_count=ghost,
            top_actions_summary=top_actions_summary,
            **pcts,
        )

        executive_summary = ""
        try:
            async with self._semaphore:
                resp7 = await self._client.chat.completions.create(
                    model=self._model,
                    messages=[
                        {"role": "system", "content": P07_executive_summary.SYSTEM},
                        {"role": "user", "content": p07_prompt},
                    ],
                    temperature=0.2,
                    max_tokens=400,
                )
            executive_summary = (resp7.choices[0].message.content or "").strip()
            if resp7.usage:
                total_pt += resp7.usage.prompt_tokens
                total_ct += resp7.usage.completion_tokens
        except Exception as exc:
            logger.warning(f"Executive summary generation failed: {exc}")

        # Persist
        row = WorkspaceRecommendation(
            sync_log_id=sync_log_id,
            recommendations=recommendations,
            executive_summary=executive_summary or None,
        )
        db.add(row)
        await db.flush()

        return recommendations, executive_summary, total_pt, total_ct


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────


def _build_gpt_context(gpt: dict) -> str:
    """Build the GPT context block used in P04 prompt."""
    instructions = gpt.get("instructions") or ""
    excerpt = instructions[:800] if len(instructions) > 800 else instructions
    tools = gpt.get("tools") or []
    tool_names = [
        t.get("type", str(t)) if isinstance(t, dict) else str(t) for t in tools
    ]
    files = gpt.get("files") or []
    starters = gpt.get("conversation_starters") or []
    starters_preview = ""
    if starters:
        preview = [f'"{s}"' for s in starters[:3]]
        starters_preview = f": {', '.join(preview)}"
    return P01_asset_profile.GPT_CONTEXT_TEMPLATE.format(
        name=gpt.get("name", "Untitled"),
        description=gpt.get("description") or "(none)",
        instructions_excerpt=excerpt or "(none)",
        tools=", ".join(tool_names) if tool_names else "none",
        files_count=len(files),
        starters_count=len(starters),
        starters_preview=starters_preview,
        builder_categories=", ".join(gpt.get("builder_categories") or []) or "none",
        shared_user_count=gpt.get("shared_user_count") or 0,
    )
