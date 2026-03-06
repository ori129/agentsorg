"""Deterministic fake embedder for demo mode.

Same-purpose GPTs produce vectors with cosine similarity ~0.97 (well above
the 0.92 clustering threshold). Different-purpose GPTs produce uncorrelated
vectors (similarity ~0), preventing false positives.
"""

import asyncio
import hashlib
import math
import struct

# ---------------------------------------------------------------------------
# Semantic bucket definitions
# GPTs whose name+use_case contain ≥1 matching keyword map to the same bucket.
# All GPTs in the same bucket share a base vector → cosine similarity ~0.97.
# ---------------------------------------------------------------------------
_SEMANTIC_BUCKETS = [
    ("meeting-notes",    ["meeting", "recap", "notes", "standup", "minute", "summariz"]),
    ("email-assistant",  ["email", "outreach", "inbox", "compose", "draft email"]),
    ("code-review",      ["code review", "pull request", "pr review", "code quality"]),
    ("legal-contract",   ["contract", "legal", "clause", "agreement", "litigation"]),
    ("sales-assistant",  ["sales", "deal", "crm", "salesforce", "opportunity", "pipeline"]),
    ("hr-assistant",     ["onboard", "employee", "hiring", "recruit", "people ops", "talent", " hr "]),
    ("data-analytics",   ["analytics", "dashboard", "insight", "kpi", "data report"]),
    ("marketing-content",["campaign", "brand voice", "seo", "marketing copy", "content strategy"]),
    ("finance",          ["finance", "budget", "forecast", "expense", "revenue", "p&l"]),
    ("customer-support", ["customer support", "ticket", "zendesk", "help desk", "customer service"]),
]


def _semantic_bucket(name: str, use_case: str = "") -> str | None:
    """Return the best matching semantic bucket, or None for generic/unknown GPTs."""
    combined = f" {(name + ' ' + use_case).lower()} "
    best_bucket, best_score = None, 0
    for bucket_name, keywords in _SEMANTIC_BUCKETS:
        score = sum(1 for kw in keywords if kw in combined)
        if score > best_score:
            best_score, best_bucket = score, bucket_name
    return best_bucket if best_score >= 1 else None


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

    Bucket-matched GPTs: 95% shared base vector + 5% unique noise.
    Cosine similarity within bucket ≈ 0.97 → guaranteed above 0.92 threshold.
    Generic GPTs (no bucket match): fully unique vector → will not cluster.
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
            use_case = (cls or {}).get("use_case_description", "") if isinstance(cls, dict) else ""
            vec = self._deterministic_vector(gpt.get("id", ""), gpt.get("name", ""), use_case)
            results.append(vec)

        await asyncio.sleep(0.3 * len(gpts) / 20)
        return results

    @staticmethod
    def _deterministic_vector(gpt_id: str, name: str, use_case: str = "") -> list[float]:
        DIM = 1536
        bucket = _semantic_bucket(name, use_case)

        if bucket:
            # 95% shared bucket base + 5% unique noise → cosine sim ~0.97 within bucket
            base = _normalize(_raw_vector(hashlib.sha256(f"bucket:{bucket}".encode()).digest(), DIM))
            noise = _normalize(_raw_vector(hashlib.sha256(f"noise:{gpt_id}:{name}".encode()).digest(), DIM))
            return _normalize([0.95 * b + 0.05 * n for b, n in zip(base, noise)])
        else:
            # No semantic match → fully unique (won't cluster)
            return _normalize(_raw_vector(hashlib.sha256(f"unique:{gpt_id}:{name}:{use_case}".encode()).digest(), DIM))
