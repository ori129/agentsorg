"""Keyword-based mock classifier. No LLM calls — assigns categories by matching keywords in GPT name/description."""

import asyncio

from app.models.models import Category

# Bucket labels used in the keyword map.
# These don't need to match DB category names exactly —
# _resolve_bucket() maps each bucket to the best-matching enabled category.
KEYWORD_MAP: dict[str, str] = {
    # Marketing / Content
    "brand": "Marketing",
    "seo": "Marketing",
    "campaign": "Marketing",
    "content": "Writing",
    "social media": "Marketing",
    "email copy": "Writing",
    "marketing": "Marketing",
    "copywriting": "Writing",
    "writing": "Writing",
    "newsletter": "Writing",
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
    # Customer Support
    "churn": "Customer",
    "customer": "Customer",
    "onboarding": "Customer",
    "ticket": "Customer",
    "health score": "Customer",
    "renewal": "Customer",
    "feedback": "Customer",
    "support": "Customer",
    # Finance
    "budget": "Finance",
    "expense": "Finance",
    "revenue": "Finance",
    "audit": "Finance",
    "invoice": "Finance",
    "financial": "Finance",
    "procurement": "Finance",
    "accounting": "Finance",
    # HR
    "hr": "HR",
    "hiring": "HR",
    "job description": "HR",
    "performance review": "HR",
    "benefits": "HR",
    "interview": "HR",
    "compensation": "HR",
    "recruitment": "HR",
    "diversity": "HR",
    "learning": "HR",
    "training": "HR",
    # Engineering
    "code": "Engineering",
    "code review": "Engineering",
    "api documentation": "Engineering",
    "architecture": "Engineering",
    "incident": "Engineering",
    "tech debt": "Engineering",
    "devops": "Engineering",
    "deployment": "Engineering",
    "github": "Engineering",
    "debugging": "Engineering",
    # Product / Design
    "prd": "Product",
    "feature": "Product",
    "user research": "Product",
    "roadmap": "Product",
    "release notes": "Product",
    "ux": "Product",
    "design": "Product",
    "product": "Product",
    "wireframe": "Product",
    # Legal
    "contract": "Legal",
    "nda": "Legal",
    "compliance": "Legal",
    "terms": "Legal",
    "legal": "Legal",
    "regulation": "Legal",
    # Data / Analytics
    "sql": "Data",
    "dashboard": "Data",
    "data quality": "Data",
    "report": "Data",
    "metrics": "Data",
    "etl": "Data",
    "analytics": "Data",
    "statistics": "Data",
    # Operations / IT
    "process": "Operations",
    "workflow": "Operations",
    "ops": "Operations",
    "security": "Operations",
    "access": "Operations",
    "vendor": "Operations",
    "cloud": "Operations",
    "infrastructure": "Operations",
}

# Maps bucket label fragments → ordered list of keywords to look for in category names
_BUCKET_HINTS: dict[str, list[str]] = {
    "Marketing": ["marketing", "sales", "content", "writing"],
    "Writing": ["writing", "content", "marketing"],
    "Sales": ["sales", "marketing", "revenue"],
    "Customer": ["customer", "support", "success", "service"],
    "Finance": ["finance", "financial", "accounting"],
    "HR": ["hr", "people", "human"],
    "Engineering": ["engineering", "tech", "developer", "software"],
    "Product": ["product", "design", "ux"],
    "Legal": ["legal", "compliance", "law"],
    "Data": ["data", "analytics", "insight", "intelligence"],
    "Operations": ["operations", "ops", "it", "security", "infrastructure"],
}


def _resolve_bucket(bucket: str, enabled_names: set[str]) -> str | None:
    """Find the best-matching enabled category for a short bucket label."""
    hints = _BUCKET_HINTS.get(bucket, [bucket.lower()])
    for hint in hints:
        for name in enabled_names:
            if hint in name.lower():
                return name
    # Substring match the bucket itself
    bucket_lower = bucket.lower()
    for name in enabled_names:
        if bucket_lower in name.lower() or name.lower() in bucket_lower:
            return name
    return None


class MockClassifier:
    """Drop-in replacement for Classifier in demo mode."""

    async def classify_batch(
        self,
        gpts: list[dict],
        categories: list[Category],
        max_categories: int = 2,
    ) -> list[dict]:
        enabled_names = {c.name for c in categories if c.enabled}
        enabled_list = sorted(enabled_names)  # stable order for fallback

        # Pre-build bucket → resolved category name cache
        bucket_cache: dict[str, str | None] = {}
        for bucket in set(KEYWORD_MAP.values()):
            bucket_cache[bucket] = _resolve_bucket(bucket, enabled_names)

        results = []
        for i, gpt in enumerate(gpts):
            results.append(self._classify_single(gpt, enabled_names, enabled_list, bucket_cache, i))

        # Simulate delay: ~0.5s per batch of 20
        await asyncio.sleep(0.5 * len(gpts) / 20)
        return results

    def _classify_single(
        self,
        gpt: dict,
        enabled_names: set[str],
        enabled_list: list[str],
        bucket_cache: dict[str, str | None],
        index: int,
    ) -> dict:
        text = f"{gpt.get('name', '')} {gpt.get('description', '')}".lower()

        scores: dict[str, int] = {}
        for keyword, bucket in KEYWORD_MAP.items():
            resolved = bucket_cache.get(bucket)
            if resolved and resolved in enabled_names and keyword in text:
                scores[resolved] = scores.get(resolved, 0) + 1

        sorted_cats = sorted(scores.items(), key=lambda x: -x[1])

        if sorted_cats:
            primary = sorted_cats[0][0]
        elif enabled_list:
            # Distribute unmatched GPTs evenly across categories
            primary = enabled_list[index % len(enabled_list)]
        else:
            primary = "General"

        secondary = sorted_cats[1][0] if len(sorted_cats) > 1 else None

        confidence = min(0.95, 0.6 + 0.1 * len(scores)) if scores else 0.5

        desc = gpt.get("description") or "a custom assistant"
        name = gpt.get("name", "Unnamed GPT")

        return {
            "primary_category": primary,
            "secondary_category": secondary,
            "confidence": confidence,
            "summary": (gpt.get("description") or "A custom GPT assistant.")[:200],
            "use_case_description": (
                f"{name} is a specialized GPT designed for {primary.lower()} tasks. "
                f"It helps teams by providing {desc.lower().rstrip('.')}. "
                f"This tool is ideal for professionals who need quick, AI-powered "
                f"assistance in their {primary.lower()} workflows."
            ),
        }
