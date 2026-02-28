"""Keyword-based mock classifier. No LLM calls — assigns categories by matching keywords in GPT name/description."""

import asyncio

from app.models.models import Category

KEYWORD_MAP: dict[str, str] = {
    # Marketing
    "brand": "Marketing",
    "seo": "Marketing",
    "campaign": "Marketing",
    "content": "Marketing",
    "social media": "Marketing",
    "email copy": "Marketing",
    "marketing": "Marketing",
    "event marketing": "Marketing",
    # Sales
    "sales": "Sales",
    "deal": "Sales",
    "pitch": "Sales",
    "lead": "Sales",
    "crm": "Sales",
    "proposal": "Sales",
    "objection": "Sales",
    "forecast": "Sales",
    "territory": "Sales",
    # Customer Success
    "churn": "Customer Success",
    "customer": "Customer Success",
    "onboarding": "Customer Success",
    "ticket": "Customer Success",
    "health score": "Customer Success",
    "qbr": "Customer Success",
    "renewal": "Customer Success",
    "feedback": "Customer Success",
    # Finance
    "budget": "Finance",
    "expense": "Finance",
    "revenue": "Finance",
    "audit": "Finance",
    "invoice": "Finance",
    "financial": "Finance",
    "procurement": "Finance",
    # HR/People
    "hr": "HR/People",
    "hiring": "HR/People",
    "policy q&a": "HR/People",
    "job description": "HR/People",
    "performance review": "HR/People",
    "benefits": "HR/People",
    "interview": "HR/People",
    "engagement survey": "HR/People",
    "diversity": "HR/People",
    "learning path": "HR/People",
    # Engineering
    "code review": "Engineering",
    "api documentation": "Engineering",
    "architecture": "Engineering",
    "incident": "Engineering",
    "tech debt": "Engineering",
    "test strategy": "Engineering",
    "migration": "Engineering",
    "devops": "Engineering",
    "pipeline optimizer": "Engineering",
    # Product
    "prd": "Product",
    "feature priorit": "Product",
    "user research": "Product",
    "roadmap": "Product",
    "release notes": "Product",
    "a/b test": "Product",
    "competitive feature": "Product",
    "product analytics": "Product",
    # Legal
    "contract": "Legal",
    "nda": "Legal",
    "compliance": "Legal",
    "ip assessment": "Legal",
    "terms": "Legal",
    "legal": "Legal",
    # Data/Analytics
    "sql": "Data/Analytics",
    "dashboard": "Data/Analytics",
    "data quality": "Data/Analytics",
    "report generator": "Data/Analytics",
    "metrics": "Data/Analytics",
    "etl": "Data/Analytics",
    "statistical": "Data/Analytics",
    # IT/Security
    "access review": "IT/Security",
    "phishing": "IT/Security",
    "security policy": "IT/Security",
    "asset inventory": "IT/Security",
    "vendor risk": "IT/Security",
    "cloud cost": "IT/Security",
    "vulnerability": "IT/Security",
    "sso": "IT/Security",
}


class MockClassifier:
    """Drop-in replacement for Classifier in demo mode."""

    async def classify_batch(
        self,
        gpts: list[dict],
        categories: list[Category],
        max_categories: int = 2,
    ) -> list[dict]:
        enabled_names = {c.name for c in categories if c.enabled}
        results = []
        for gpt in gpts:
            results.append(self._classify_single(gpt, enabled_names))

        # Simulate delay: ~0.5s per batch of 20
        delay = 0.5 * len(gpts) / 20
        await asyncio.sleep(delay)
        return results

    def _classify_single(self, gpt: dict, enabled_names: set[str]) -> dict:
        text = f"{gpt.get('name', '')} {gpt.get('description', '')}".lower()

        scores: dict[str, int] = {}
        for keyword, category in KEYWORD_MAP.items():
            if category in enabled_names and keyword in text:
                scores[category] = scores.get(category, 0) + 1

        sorted_cats = sorted(scores.items(), key=lambda x: -x[1])

        if sorted_cats:
            primary = sorted_cats[0][0]
        elif enabled_names:
            primary = next(iter(enabled_names))
        else:
            primary = "Uncategorized"

        secondary = sorted_cats[1][0] if len(sorted_cats) > 1 else None

        confidence = min(0.95, 0.6 + 0.1 * len(scores))

        return {
            "primary_category": primary,
            "secondary_category": secondary,
            "confidence": confidence,
            "summary": (gpt.get("description") or "A custom GPT assistant.")[:200],
        }
