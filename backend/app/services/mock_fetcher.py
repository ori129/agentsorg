"""Mock replacement for ComplianceAPIClient. Returns generated GPT data with simulated pagination delays."""

import asyncio
from collections.abc import Callable, Coroutine
from typing import Any

from app.services.mock_data import generate_mock_gpts

PAGE_SIZE = 20
DELAY_PER_PAGE = 0.5  # seconds


class MockComplianceAPIClient:
    """Drop-in replacement for ComplianceAPIClient in demo mode."""

    async def fetch_all_gpts(
        self,
        workspace_id: str,
        on_page: Callable[[list[dict], int], Coroutine[Any, Any, None]] | None = None,
    ) -> list[dict]:
        all_gpts = generate_mock_gpts()

        result: list[dict] = []
        page = 0
        for i in range(0, len(all_gpts), PAGE_SIZE):
            batch = all_gpts[i : i + PAGE_SIZE]
            result.extend(batch)
            page += 1
            await asyncio.sleep(DELAY_PER_PAGE)
            if on_page:
                await on_page(batch, page)

        return result

    async def close(self):
        pass
