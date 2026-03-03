"""Deterministic fake embedder. Generates stable 1536-dim vectors from GPT id+name — no API calls."""

import asyncio
import hashlib
import struct


class MockEmbedder:
    """Drop-in replacement for Embedder in demo mode."""

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
            use_case = ""
            if cls and isinstance(cls, dict):
                use_case = cls.get("use_case_description", "")
            vec = self._deterministic_vector(gpt.get("id", ""), gpt.get("name", ""), use_case)
            results.append(vec)

        # Simulate delay: ~0.3s per batch of 20
        delay = 0.3 * len(gpts) / 20
        await asyncio.sleep(delay)
        return results

    @staticmethod
    def _deterministic_vector(gpt_id: str, name: str, use_case: str = "") -> list[float]:
        """Generate a deterministic 1536-dim vector from GPT id+name+use_case."""
        seed_bytes = hashlib.sha256(f"{gpt_id}:{name}:{use_case}".encode()).digest()
        vector: list[float] = []
        for i in range(768):
            chunk = hashlib.md5(seed_bytes + i.to_bytes(4, "little")).digest()
            # Unpack as unsigned ints and map to [-1, 1] — avoids NaN/Inf from IEEE 754
            a, b = struct.unpack("II", chunk[:8])
            vector.append(a / 0xFFFFFFFF * 2.0 - 1.0)
            vector.append(b / 0xFFFFFFFF * 2.0 - 1.0)
        return vector[:1536]
