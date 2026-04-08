"""Deterministic fake embedder for demo mode.

Architecture: two-level semantic hierarchy.
  Broad bucket   → category (e.g. "meeting-notes")
  Sub-bucket     → specific use case (e.g. "standup-summary" vs "executive-briefing")

Within a sub-bucket: cosine similarity ≈ 0.97 (clusters together at 0.92 threshold).
Between sub-buckets in the same broad bucket: cosine similarity ≈ 0 (independent vectors).
Between different broad buckets: cosine similarity ≈ 0.

This produces realistic 2-8 asset clusters that mirror real enterprise standardization
opportunities, rather than one giant cluster per category.
"""

import asyncio
import hashlib
import math
import struct


def _is_abandoned_asset(name: str, instructions: str, tools: list) -> bool:
    """Mirror of mock_semantic_enricher._is_abandoned — gives abandoned assets unique vectors."""
    name_lower = name.lower()
    instr_len = len(instructions or "")
    tool_count = len(tools or [])
    abandoned_signals = [
        "my gpt",
        "test",
        "draft",
        "ignore",
        "helper",
        "final",
        "temp",
        "v2",
        "v3",
    ]
    if any(s in name_lower for s in abandoned_signals) and instr_len < 500:
        return True
    if instr_len < 200 and tool_count == 0:
        return True
    return False


# ---------------------------------------------------------------------------
# Two-level semantic hierarchy
# Each broad bucket has several sub-buckets with specific keywords.
# A tool's name+use_case is matched against sub-bucket keywords first;
# if no specific match, it falls back to a hash-assigned generic sub-bucket.
# ---------------------------------------------------------------------------

_HIERARCHY: dict[str, list[tuple[str, list[str]]]] = {
    "meeting-notes": [
        ("standup-summary", ["standup", "daily standup", "scrum", "sprint recap"]),
        (
            "executive-briefing",
            ["executive", "leadership", "board", "quarterly review"],
        ),
        (
            "client-call-notes",
            ["client call", "discovery call", "sales call", "customer call"],
        ),
        ("general-recap", ["meeting", "recap", "notes", "minute", "summariz"]),
    ],
    "email-assistant": [
        (
            "cold-outreach",
            ["cold email", "outreach email", "prospecting", "cold outreach"],
        ),
        ("follow-up", ["follow-up", "follow up", "nurture", "sequence"]),
        (
            "internal-comms",
            ["internal email", "team announcement", "stakeholder update"],
        ),
        (
            "general-email",
            ["email", "draft email", "compose", "inbox", "mail", "outreach"],
        ),
    ],
    "code-review": [
        ("pr-review", ["pull request", "pr review", "code review", "diff review"]),
        (
            "security-review",
            ["security review", "vulnerability", "sast", "secure code"],
        ),
        ("documentation", ["code documentation", "docstring", "api doc", "readme"]),
        ("general-code", ["code", "review", "engineering", "technical"]),
    ],
    "legal-contract": [
        ("contract-review", ["contract review", "agreement review", "clause analysis"]),
        ("nda", ["nda", "non-disclosure", "confidentiality agreement"]),
        ("compliance", ["compliance", "gdpr", "privacy", "regulatory"]),
        ("general-legal", ["legal", "contract", "clause", "agreement", "litigation"]),
    ],
    "sales-assistant": [
        ("prospecting", ["prospect", "lead qualification", "icp", "target account"]),
        ("deal-management", ["deal", "opportunity", "pipeline", "crm", "salesforce"]),
        ("proposal", ["proposal", "rfp", "pricing", "quote", "battlecard"]),
        ("general-sales", ["sales", "revenue", "win", "loss", "close"]),
    ],
    "hr-assistant": [
        ("onboarding", ["onboard", "new hire", "day one", "orientation"]),
        ("recruiting", ["recruit", "hiring", "interview", "candidate", "talent"]),
        ("performance", ["performance review", "feedback", "goal setting", "okr"]),
        ("general-hr", ["hr", "human resources", "employee", "people ops", " hr "]),
    ],
    "data-analytics": [
        ("dashboards", ["dashboard", "kpi", "metric", "scorecard"]),
        ("sql-analysis", ["sql", "query", "database", "data warehouse"]),
        ("reporting", ["report", "insight", "analytics", "data report"]),
        ("general-data", ["data", "analysis", "analytics", "insight"]),
    ],
    "marketing-content": [
        (
            "social-media",
            [
                "social media",
                "instagram",
                "linkedin post",
                "twitter",
                "content calendar",
            ],
        ),
        ("seo-content", ["seo", "blog post", "content strategy", "organic"]),
        (
            "brand-voice",
            ["brand voice", "brand guidelines", "tone of voice", "brand compliance"],
        ),
        ("general-content", ["campaign", "marketing", "copy", "content", "brand"]),
    ],
    "finance": [
        ("budgeting", ["budget", "forecast", "expense", "cost center"]),
        ("reporting", ["financial report", "p&l", "income statement", "balance sheet"]),
        ("analysis", ["financial analysis", "variance", "revenue analysis", "roi"]),
        ("general-finance", ["finance", "revenue", "fiscal", "accounting"]),
    ],
    "customer-support": [
        (
            "ticket-triage",
            ["ticket", "zendesk", "triage", "support queue", "help desk"],
        ),
        ("escalation", ["escalation", "churn", "at-risk", "renewal"]),
        ("self-service", ["self-service", "knowledge base", "faq", "chatbot"]),
        (
            "general-support",
            ["customer support", "customer service", "support", "customer"],
        ),
    ],
}

# Broad bucket → flat keyword list for initial bucket detection
_BUCKET_KEYWORDS: dict[str, list[str]] = {
    "meeting-notes": ["meeting", "recap", "notes", "standup", "minute", "summariz"],
    "email-assistant": ["email", "outreach", "inbox", "compose", "draft email"],
    "code-review": ["code review", "pull request", "pr review", "code quality"],
    "legal-contract": ["contract", "legal", "clause", "agreement", "litigation"],
    "sales-assistant": [
        "sales",
        "deal",
        "crm",
        "salesforce",
        "opportunity",
        "pipeline",
    ],
    "hr-assistant": [
        "onboard",
        "employee",
        "hiring",
        "recruit",
        "people ops",
        "talent",
        " hr ",
    ],
    "data-analytics": ["analytics", "dashboard", "insight", "kpi", "data report"],
    "marketing-content": [
        "campaign",
        "brand voice",
        "seo",
        "marketing copy",
        "content strategy",
    ],
    "finance": ["finance", "budget", "forecast", "expense", "revenue", "p&l"],
    "customer-support": [
        "customer support",
        "ticket",
        "zendesk",
        "help desk",
        "customer service",
    ],
}


def _detect_bucket(name: str, use_case: str = "") -> str | None:
    """Return the best matching broad bucket, or None for generic/unknown tools."""
    combined = f" {(name + ' ' + use_case).lower()} "
    best_bucket, best_score = None, 0
    for bucket_name, keywords in _BUCKET_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in combined)
        if score > best_score:
            best_score, best_bucket = score, bucket_name
    return best_bucket if best_score >= 1 else None


def _detect_sub_bucket(bucket: str, name: str, use_case: str, gpt_id: str) -> str:
    """Return the best matching sub-bucket within a broad bucket.

    Priority:
    1. Keyword match against sub-bucket keyword lists (most specific wins)
    2. Hash-based deterministic assignment to the last (generic) sub-bucket
    """
    combined = f" {(name + ' ' + use_case).lower()} "
    sub_buckets = _HIERARCHY.get(bucket, [])

    best_sub, best_score = None, 0
    # Skip the last (generic) sub-bucket in keyword matching — it's the fallback
    for sub_name, keywords in sub_buckets[:-1]:
        score = sum(1 for kw in keywords if kw in combined)
        if score > best_score:
            best_score, best_sub = score, sub_name

    if best_sub and best_score >= 1:
        return best_sub

    # No keyword match → use the generic sub-bucket so unmatched assets cluster together
    # (not scattered across specific sub-buckets where they don't belong)
    return sub_buckets[-1][0] if sub_buckets else "generic"


def _raw_vector(seed: bytes, dim: int = 1536) -> list[float]:
    """Generate a raw unnormalized vector from a byte seed."""
    vec: list[float] = []
    for i in range(dim // 2):
        chunk = hashlib.md5(seed + i.to_bytes(4, "little")).digest()
        a, b = struct.unpack("II", chunk[:8])
        vec.append(a / 0xFFFFFFFF * 2.0 - 1.0)
        vec.append(b / 0xFFFFFFFF * 2.0 - 1.0)
    return vec[:dim]


def _normalize(vec: list[float]) -> list[float]:
    mag = math.sqrt(sum(x * x for x in vec))
    return [x / mag for x in vec] if mag else vec


class MockEmbedder:
    """Drop-in replacement for Embedder in demo mode.

    Sub-bucket-matched tools: 95% shared sub-bucket base + 5% unique noise.
    Cosine similarity within sub-bucket ≈ 0.97 → clusters at 0.92 threshold.
    Different sub-buckets (even same broad category) → ≈0 similarity → no cross-cluster.
    Unmatched tools → fully unique vector → will not cluster.
    """

    async def embed_batch(
        self,
        gpts: list[dict],
        classifications: list[dict | None] | None = None,
        batch_size: int = 100,
    ) -> list[list[float]]:
        if classifications is None:
            classifications = [None] * len(gpts)
        results = []
        for gpt, cls in zip(gpts, classifications):
            vec = self._deterministic_vector(
                gpt.get("id", ""),
                gpt.get("name", ""),
                gpt.get("description", "") or "",
                gpt.get("instructions", "") or "",
                gpt.get("tools") or [],
            )
            results.append(vec)

        await asyncio.sleep(0.3 * len(gpts) / 20)
        return results

    @staticmethod
    def _deterministic_vector(
        gpt_id: str,
        name: str,
        description: str = "",
        instructions: str = "",
        tools: list | None = None,
    ) -> list[float]:
        DIM = 1536

        # Abandoned/experimental assets always get unique vectors — never cluster
        if _is_abandoned_asset(name, instructions, tools or []):
            return _normalize(
                _raw_vector(
                    hashlib.sha256(f"abandoned:{gpt_id}:{name}".encode()).digest(),
                    DIM,
                )
            )

        # Use name+description for bucket detection (not classifier use_case — unreliable)
        search_text = name + " " + (description or "")
        bucket = _detect_bucket(search_text)

        if not bucket:
            # No semantic match → fully unique (will not cluster)
            return _normalize(
                _raw_vector(
                    hashlib.sha256(
                        f"unique:{gpt_id}:{name}:{description}".encode()
                    ).digest(),
                    DIM,
                )
            )

        sub_bucket = _detect_sub_bucket(bucket, search_text, "", gpt_id)
        sub_key = f"sub:{bucket}:{sub_bucket}"

        # 95% shared sub-bucket base + 5% unique noise
        # → within sub-bucket sim ≈ 0.97, between sub-buckets sim ≈ 0
        base = _normalize(_raw_vector(hashlib.sha256(sub_key.encode()).digest(), DIM))
        noise = _normalize(
            _raw_vector(hashlib.sha256(f"noise:{gpt_id}:{name}".encode()).digest(), DIM)
        )
        return _normalize([0.95 * b + 0.05 * n for b, n in zip(base, noise)])
