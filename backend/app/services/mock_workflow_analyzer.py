"""Mock Workflow Analyzer — deterministic, no LLM calls.

Used in demo mode. Produces realistic-looking workflow intelligence
with fixed reasoning and priority actions based on workflow status.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import WorkflowAnalysisCache
from app.services.workflow_analyzer import _build_coverage_data

logger = logging.getLogger(__name__)

# Deterministic reasoning templates per status
_COVERED_REASONING = {
    "Sales Pipeline Management": (
        "Three assets cover this workflow with strong usage — 340 conversations in the last 30 days signal real adoption. "
        "This is one of the organization's best-covered workflows; quality maintenance is the main priority."
    ),
    "HR Policy & Compliance": (
        "Multiple HR assets are actively used, but conversation data shows a significant portion of queries about "
        "offboarding and IT access that fall outside these assets' design scope — indicating adjacent gaps."
    ),
    "Meeting Documentation": (
        "The highest-volume workflow in the portfolio with assets across five departments. "
        "High fragmentation risk: five separate assets for the same purpose wastes build effort and confuses users."
    ),
    "Customer Communication": (
        "Three assets handle outbound customer emails with solid adoption signals. "
        "Tone inconsistency across department-owned assets creates a brand risk worth addressing."
    ),
    "Data Analysis": (
        "Two SQL helper assets show healthy usage from Engineering and Finance teams. "
        "Expanding the shared schema context would meaningfully improve output quality for both audiences."
    ),
}

_COVERED_ACTIONS = {
    "Sales Pipeline Management": ("Monitor quality and refresh quarterly", "low"),
    "HR Policy & Compliance": (
        "Expand scope to cover offboarding and IT access",
        "medium",
    ),
    "Meeting Documentation": (
        "Consolidate five assets into one org-wide standard",
        "high",
    ),
    "Customer Communication": (
        "Unify tone guidelines across department variants",
        "medium",
    ),
    "Data Analysis": ("Merge and add schema context files", "medium"),
}

_GHOST_REASONING_TEMPLATE = (
    "{name} has a dedicated AI asset that has received zero conversations since deployment. "
    "This represents wasted build effort — either the asset was never promoted to potential users, "
    "the use case doesn't have sufficient demand, or the asset design makes it hard to discover."
)
_GHOST_ACTION_TEMPLATE = ("Promote or archive after user research", "medium")

_GAP_REASONING = {
    "HR Policy Questions": (
        "HR Policy queries are appearing in 32% of Finance Bot conversations — users need HR guidance "
        "but are routing through the wrong channel. A dedicated HR Q&A asset would immediately absorb this demand."
    ),
    "Onboarding Assistance": (
        "New hire onboarding questions appear consistently across multiple assets not designed for this purpose. "
        "This is a high-frequency, high-value workflow with no dedicated coverage."
    ),
    "Policy Queries": (
        "Policy-related queries are surfacing in assets across HR, Finance, and Legal categories. "
        "The volume and cross-department spread indicate a significant unmet need for centralized policy access."
    ),
    "Performance Review Prep": (
        "Performance review preparation is a recurring, high-anxiety workflow for employees. "
        "Conversation signals show demand peaks around review cycles with no dedicated support asset."
    ),
    "Vendor Contract Review": (
        "Users are asking contract-related questions inside assets designed for other purposes. "
        "Legal and Procurement teams especially show this pattern — a dedicated contract review GPT would reduce risk."
    ),
    "IT Access Provisioning": (
        "IT access requests appear in HR and Ops asset conversations without a structured answer. "
        "This is a high-frequency operational workflow that would benefit from an automated intake GPT."
    ),
    "Employee Offboarding Process": (
        "Offboarding-related questions appear sporadically across multiple assets. "
        "With no dedicated asset, departing employees get inconsistent guidance — a compliance and experience risk."
    ),
}

_GAP_ACTIONS = {
    "HR Policy Questions": ("Build a dedicated HR Policy Q&A GPT", "high"),
    "Onboarding Assistance": ("Build a New Hire Onboarding GPT", "high"),
    "Policy Queries": ("Centralize policy access in a single policy GPT", "high"),
    "Performance Review Prep": ("Build a Performance Review Prep GPT", "medium"),
    "Vendor Contract Review": ("Build a Vendor Contract Review GPT", "high"),
    "IT Access Provisioning": ("Build an IT Access Request intake GPT", "medium"),
    "Employee Offboarding Process": (
        "Build an Employee Offboarding checklist GPT",
        "medium",
    ),
}

_DEFAULT_GAP_REASONING = (
    "Conversation signals show users asking about {name} without a dedicated AI asset to help them. "
    "The demand appears across multiple assets, suggesting this is a real workflow gap worth addressing."
)
_DEFAULT_GAP_ACTION = ("Build a dedicated asset for this workflow", "medium")


class MockWorkflowAnalyzer:
    """Deterministic workflow analyzer for demo mode."""

    async def analyze(
        self, db: AsyncSession, conversation_sync_log_id: int | None = None
    ) -> tuple[list[dict], int, int]:
        """Run mock workflow analysis. Returns (items, 0, 0) — no LLM calls."""
        items = await _build_coverage_data(db)

        for item in items:
            name = item["name"]
            status = item["status"]

            if status == "covered":
                if name in _COVERED_REASONING:
                    item["reasoning"] = _COVERED_REASONING[name]
                    action, level = _COVERED_ACTIONS[name]
                else:
                    convs = item["conversation_count"]
                    item["reasoning"] = (
                        f"{name} is actively covered by {item['asset_count']} asset(s) with {convs} conversations. "
                        f"Adoption is healthy — focus on maintaining quality and gathering user feedback."
                    )
                    action, level = "Monitor adoption and review quarterly", "low"
                item["priority_action"] = action
                item["priority_level"] = level

            elif status == "ghost":
                item["reasoning"] = _GHOST_REASONING_TEMPLATE.format(name=name)
                item["priority_action"], item["priority_level"] = _GHOST_ACTION_TEMPLATE

            else:  # intent_gap
                if name in _GAP_REASONING:
                    item["reasoning"] = _GAP_REASONING[name]
                    item["priority_action"], item["priority_level"] = _GAP_ACTIONS[name]
                else:
                    item["reasoning"] = _DEFAULT_GAP_REASONING.format(name=name)
                    item["priority_action"], item["priority_level"] = (
                        _DEFAULT_GAP_ACTION
                    )

        # Persist mock analysis
        cache_row = WorkflowAnalysisCache(
            generated_at=datetime.now(timezone.utc),
            conversation_sync_log_id=conversation_sync_log_id,
            workflow_items=items,
        )
        db.add(cache_row)
        await db.commit()

        logger.info(f"Mock workflow analysis: {len(items)} workflows processed")
        return items, 0, 0
