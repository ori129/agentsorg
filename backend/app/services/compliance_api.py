import asyncio
import time
from collections.abc import Callable, Coroutine
from typing import Any

import httpx


class RateLimiter:
    def __init__(self, max_requests: int = 50, window_seconds: int = 60):
        self._max = max_requests
        self._window = window_seconds
        self._timestamps: list[float] = []

    async def acquire(self):
        now = time.monotonic()
        self._timestamps = [t for t in self._timestamps if now - t < self._window]
        if len(self._timestamps) >= self._max:
            sleep_time = self._window - (now - self._timestamps[0])
            if sleep_time > 0:
                await asyncio.sleep(sleep_time)
        self._timestamps.append(time.monotonic())


class ComplianceAPIClient:
    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.openai.com/v1",
        page_size: int = 20,
    ):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._page_size = page_size
        self._rate_limiter = RateLimiter()
        self._client = httpx.AsyncClient(
            timeout=30,
            headers={"Authorization": f"Bearer {api_key}"},
        )

    async def close(self):
        await self._client.aclose()

    async def fetch_all_gpts(
        self,
        workspace_id: str,
        on_page: Callable[[list[dict], int], Coroutine[Any, Any, None]] | None = None,
    ) -> list[dict]:
        all_gpts: list[dict] = []
        after: str | None = None
        page = 0

        while True:
            await self._rate_limiter.acquire()

            params: dict[str, Any] = {"limit": self._page_size}
            if after:
                params["after"] = after

            response = await self._request_with_retries(
                "GET",
                f"{self._base_url}/organization/projects/{workspace_id}/custom_gpts",
                params=params,
            )

            data = response.json()
            gpts = data.get("data", [])
            all_gpts.extend(gpts)
            page += 1

            if on_page:
                await on_page(gpts, page)

            if not data.get("has_more", False) or not gpts:
                break

            after = data.get("last_id") or gpts[-1].get("id")

        return all_gpts

    async def _request_with_retries(
        self, method: str, url: str, max_retries: int = 3, **kwargs
    ) -> httpx.Response:
        last_exc: Exception | None = None
        for attempt in range(max_retries):
            try:
                resp = await self._client.request(method, url, **kwargs)
                if resp.status_code < 500:
                    resp.raise_for_status()
                    return resp
                # 5xx: retry
                last_exc = httpx.HTTPStatusError(
                    f"Server error {resp.status_code}",
                    request=resp.request,
                    response=resp,
                )
            except (httpx.TimeoutException, httpx.HTTPStatusError) as e:
                last_exc = e

            backoff = 2**attempt
            await asyncio.sleep(backoff)

        raise last_exc  # type: ignore[misc]
