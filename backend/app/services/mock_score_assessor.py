"""Mock Score Assessor — deterministic, no LLM calls. Used in demo mode.

Mirrors MockSemanticEnricher's tier-based distribution:
  Tier 3 (production) → champion   (quality 75-90, adoption 70-85)
  Tier 2 (functional) → hidden_gem (quality 60-75, adoption 25-45)
  Tier 1 (abandoned)  → retirement_candidate or scaled_risk

Seeded with fixed RNG (seed=42) for identical output across demo runs.
"""

from __future__ import annotations

import random
from datetime import datetime, timezone
from typing import Any

from app.models.models import GPT


_SEED = 42

# Pre-baked priority actions for demo
MOCK_PRIORITY_ACTIONS = [
    {
        "priority": 1,
        "category": "risk",
        "title": "Review Finance GPT guardrails",
        "description": (
            "The Finance Report Generator is used by 28 users but has no output constraints. "
            "It accesses financial data and produces external-facing documents. "
            "Add explicit accuracy disclaimers and scope limits before next quarter."
        ),
        "impact": "high",
        "effort": "low",
        "asset_ids": [],
        "reasoning": "High adoption × high risk = top governance priority.",
    },
    {
        "priority": 2,
        "category": "adoption",
        "title": "Promote Contract Review GPT to Legal team",
        "description": (
            "The Contract Review GPT has expert-level prompt engineering and strong ROI potential, "
            "but only 3 of 15 Legal team members have used it. "
            "A 30-minute demo session could unlock significant time savings."
        ),
        "impact": "high",
        "effort": "low",
        "asset_ids": [],
        "reasoning": "Hidden gem with high-value audience — easy adoption win.",
    },
    {
        "priority": 3,
        "category": "quality",
        "title": "Rebuild 5 placeholder GPTs with real instructions",
        "description": (
            "5 assets have quality scores under 20 — placeholder descriptions with no real instructions. "
            "These create noise in search results and may confuse employees. "
            "Archive or rebuild with scoped, well-structured prompts."
        ),
        "impact": "medium",
        "effort": "medium",
        "asset_ids": [],
        "reasoning": "Retirement candidates with zero conversations — low risk, clean up portfolio.",
    },
    {
        "priority": 4,
        "category": "governance",
        "title": "Audit 3 GPTs flagged for customer data exposure",
        "description": (
            "Three assets reference customer names and contact data in their instructions "
            "without explicit handling guidelines. "
            "Review instructions and add data minimisation rules."
        ),
        "impact": "high",
        "effort": "medium",
        "asset_ids": [],
        "reasoning": "Customer data exposure is a compliance risk requiring documentation.",
    },
    {
        "priority": 5,
        "category": "learning",
        "title": "Run prompt engineering workshop for Marketing team",
        "description": (
            "Marketing team GPTs average quality score of 38/100 with common flags: "
            "no output format, no constraints. "
            "A targeted workshop on prompt structure would lift the entire team's output quality."
        ),
        "impact": "medium",
        "effort": "medium",
        "asset_ids": [],
        "reasoning": "Team-level pattern identified — workshop more efficient than 1:1 coaching.",
    },
]

MOCK_EXECUTIVE_SUMMARY = (
    "The AI portfolio shows early-stage maturity with 42 assets deployed across departments, "
    "but quality is uneven — 28% are retirement candidates with placeholder instructions and zero usage. "
    "The most urgent opportunity is the 12 hidden gems: high-quality assets that are underadopted "
    "because employees don't know they exist. "
    "Recommended focus for Q2: governance review of 3 high-risk assets, targeted adoption campaigns "
    "for top hidden gems, and a portfolio cleanup to retire the lowest-quality placeholder GPTs."
)


class MockScoreAssessor:
    """Deterministic mock — inserts pre-baked scores directly. No LLM calls."""

    def __init__(self) -> None:
        self._rng = random.Random(_SEED)

    def _tier(self, g: GPT) -> int:
        """Classify asset into tier 1/2/3 based on sophistication_score or instructions length."""
        if g.sophistication_score is not None:
            if g.sophistication_score >= 4:
                return 3
            elif g.sophistication_score >= 2:
                return 2
            else:
                return 1
        # Fallback: instructions length
        length = len(g.instructions or "")
        if length > 500:
            return 3
        elif length > 100:
            return 2
        return 1

    def _scores_for_tier(self, g: GPT, tier: int) -> dict[str, Any]:
        rng = self._rng

        if tier == 3:
            quality = round(rng.uniform(72, 91), 1)
            adoption = round(rng.uniform(62, 85), 1)
            risk = round(rng.uniform(10, 38), 1)
            quadrant = "champion"
            strength = "Comprehensive instructions with explicit output format and behavioral rules demonstrate production-grade prompt engineering."
            weakness = None
            adoption_signal = f"Active usage by {g.conversation_count or rng.randint(15, 40)} conversations demonstrates strong team adoption."
            adoption_barrier = None
            risk_rationale = "Low-risk internal productivity tool with no sensitive data access and basic output constraints present."
            risk_driver = "No significant risk factors identified."
            risk_urgency = "low"
            top_action = "Feature in internal success story communications to drive awareness across other teams."
        elif tier == 2:
            quality = round(rng.uniform(52, 72), 1)
            adoption = round(rng.uniform(20, 45), 1)
            risk = round(rng.uniform(20, 55), 1)
            quadrant = "hidden_gem" if quality >= 60 else "retirement_candidate"
            strength = "Clear business process scope with structured instructions makes this asset purposeful and reusable."
            weakness = "No conversation starters configured, reducing discoverability for new users."
            adoption_signal = f"Shared with {g.shared_user_count or rng.randint(5, 20)} users but limited conversation volume suggests discoverability gap."
            adoption_barrier = "Asset requires domain context that users may not know to provide — add conversation starters."
            risk_rationale = "Moderate risk profile with some business data referenced but primarily internal use."
            risk_driver = "Business data mentioned in instructions without explicit handling guidelines." if risk > 35 else "No significant risk factors identified."
            risk_urgency = "medium" if risk > 40 else "low"
            top_action = "Add 3 conversation starters and promote to the intended audience team via a demo."
        else:
            quality = round(rng.uniform(8, 35), 1)
            adoption = round(rng.uniform(0, 20), 1)
            risk = round(rng.uniform(5, 30), 1)
            quadrant = "retirement_candidate"
            strength = "Asset exists in the registry and has been categorised."
            weakness = "Instructions are placeholder-level — no structure, no output format, no behavioral rules defined."
            adoption_signal = "Zero or near-zero conversations indicate employees are not finding or using this asset."
            adoption_barrier = "No clear value proposition communicated — employees have no reason to try this asset."
            risk_rationale = "Low risk due to minimal instructions, but lack of guardrails means undefined output behaviour."
            risk_driver = "No output constraints defined — results in undefined and potentially inconsistent behaviour."
            risk_urgency = "low"
            top_action = "Archive this asset or rebuild with a specific business process scope and structured instructions."

        quality_rationale = (
            f"Quality score of {quality:.0f}/100 reflects {'strong' if quality >= 70 else 'moderate' if quality >= 50 else 'weak'} "
            f"instruction depth and prompt engineering technique. "
            f"{strength}"
        )
        adoption_rationale = (
            f"Adoption score of {adoption:.0f}/100 based on {g.conversation_count or 0} conversations "
            f"across {g.shared_user_count or 0} shared users "
            f"({'strong' if adoption >= 60 else 'moderate' if adoption >= 35 else 'limited'} uptake). "
            f"{adoption_signal}"
        )

        return {
            "quality_score": quality,
            "quality_score_rationale": quality_rationale,
            "quality_main_strength": strength,
            "quality_main_weakness": weakness,
            "adoption_score": adoption,
            "adoption_score_rationale": adoption_rationale,
            "adoption_signal": adoption_signal,
            "adoption_barrier": adoption_barrier,
            "risk_score": risk,
            "risk_score_rationale": risk_rationale,
            "risk_primary_driver": risk_driver,
            "risk_urgency": risk_urgency,
            "quadrant_label": quadrant,
            "top_action": top_action,
            "score_confidence": "high" if tier == 3 else "medium" if tier == 2 else "low",
            "scores_assessed_at": datetime.now(timezone.utc).isoformat(),
        }

    def assess_batch(self, gpts: list[GPT]) -> list[dict]:
        """Return deterministic scores for all assets."""
        self._rng = random.Random(_SEED)  # reset for deterministic output
        results = []
        for g in gpts:
            tier = self._tier(g)
            results.append(self._scores_for_tier(g, tier))
        return results

    def generate_workspace_recommendations(
        self, gpts: list[GPT] | None = None
    ) -> tuple[list[dict], str]:
        """Return pre-baked priority actions + executive summary.

        If *gpts* is provided, populates asset_ids on each action using the
        actual scored GPT IDs filtered by category context so the frontend
        drawer shows genuinely relevant assets.
        """
        if not gpts:
            return MOCK_PRIORITY_ACTIONS, MOCK_EXECUTIVE_SUMMARY

        def _cat(g: GPT) -> str:
            cat = getattr(g, "primary_category", None)
            if cat is not None:
                return (cat.name or "").lower()
            return ""

        def _pick(pool: list[GPT], n: int, fallback: list[GPT]) -> list[str]:
            """Return up to n IDs from pool, falling back to fallback if empty."""
            src = pool if pool else fallback
            return [g.id for g in src[:n]]

        scored = [g for g in gpts if g.quality_score is not None and g.risk_score is not None]

        # ── Action 1: Review Finance GPT guardrails ──────────────────────────
        # Finance category assets with highest risk scores (up to 3)
        finance = sorted(
            [g for g in scored if "finance" in _cat(g)],
            key=lambda g: g.risk_score,  # type: ignore[arg-type]
            reverse=True,
        )
        all_high_risk = sorted(scored, key=lambda g: g.risk_score, reverse=True)  # type: ignore[arg-type]
        risk_ids = _pick(finance, 3, all_high_risk)

        # ── Action 2: Promote Contract Review GPT to Legal team ──────────────
        # Legal & Compliance hidden gems: high quality, low adoption
        legal = [
            g for g in scored
            if "legal" in _cat(g) or "compliance" in _cat(g)
        ]
        legal_gems = sorted(
            [g for g in legal if (g.quality_score or 0) >= 55 and (g.adoption_score or 100) < 50],
            key=lambda g: g.quality_score,  # type: ignore[arg-type]
            reverse=True,
        )
        all_gems = sorted(
            [g for g in scored if (g.quality_score or 0) >= 55 and (g.adoption_score or 100) < 50],
            key=lambda g: g.quality_score,  # type: ignore[arg-type]
            reverse=True,
        )
        gem_ids = _pick(legal_gems, 3, all_gems)

        # ── Action 3: Rebuild 5 placeholder GPTs with real instructions ──────
        # Lowest quality assets across the board (tier 1 — retirement candidates)
        retirement = sorted(
            [g for g in scored if (g.quality_score or 100) < 35],
            key=lambda g: g.quality_score,  # type: ignore[arg-type]
        )
        all_by_quality_asc = sorted(scored, key=lambda g: g.quality_score)  # type: ignore[arg-type]
        low_quality_ids = _pick(retirement, 5, all_by_quality_asc)

        # ── Action 4: Audit 3 GPTs flagged for customer data exposure ────────
        # Customer Support or high-risk assets with medium+ urgency
        customer = [
            g for g in scored
            if "customer" in _cat(g) or "support" in _cat(g) or "sales" in _cat(g)
        ]
        customer_risky = sorted(
            [g for g in customer if (g.risk_score or 0) > 30],
            key=lambda g: g.risk_score,  # type: ignore[arg-type]
            reverse=True,
        )
        gov_ids = _pick(customer_risky, 3, all_high_risk[1:4])

        # ── Action 5: Run prompt engineering workshop for Marketing team ──────
        # Sales & Marketing assets with lowest quality scores
        marketing = [
            g for g in scored
            if "sales" in _cat(g) or "marketing" in _cat(g)
        ]
        marketing_low = sorted(marketing, key=lambda g: g.quality_score)  # type: ignore[arg-type]
        learning_ids = _pick(marketing_low, 4, all_by_quality_asc)

        import copy
        actions = copy.deepcopy(MOCK_PRIORITY_ACTIONS)
        actions[0]["asset_ids"] = risk_ids
        actions[1]["asset_ids"] = gem_ids
        actions[2]["asset_ids"] = low_quality_ids
        actions[3]["asset_ids"] = gov_ids
        actions[4]["asset_ids"] = learning_ids

        return actions, MOCK_EXECUTIVE_SUMMARY
