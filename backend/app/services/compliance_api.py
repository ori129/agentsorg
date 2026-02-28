import asyncio
import logging
import time
from collections.abc import Callable, Coroutine
from typing import Any

import httpx

logger = logging.getLogger(__name__)


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
        base_url: str = "https://api.chatgpt.com/v1",
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

            url = f"{self._base_url}/compliance/workspaces/{workspace_id}/gpts"
            logger.info(f"Requesting: GET {url} params={params}")

            response = await self._request_with_retries(
                "GET",
                url,
                params=params,
            )

            logger.info(f"Response: status={response.status_code} length={len(response.text)}")

            data = response.json()
            gpts = data.get("data", [])
            all_gpts.extend(gpts)
            page += 1

            logger.info(f"Page {page}: got {len(gpts)} GPTs, has_more={data.get('has_more')}")

            if on_page:
                await on_page(gpts, page)

            if not data.get("has_more", False) or not gpts:
                break

            after = data.get("last_id") or gpts[-1].get("id")

        logger.info(f"Fetch complete: {len(all_gpts)} total raw GPTs")
        return [self._normalize_gpt(g) for g in all_gpts]

    @staticmethod
    def _normalize_gpt(raw: dict) -> dict:
        """Flatten the nested compliance API response into a uniform dict."""
        from datetime import datetime, timezone

        sharing = raw.get("sharing") or {}
        config_list = (raw.get("latest_config") or {}).get("data") or []
        config = config_list[0] if config_list else {}
        recipients_obj = sharing.get("recipients") or {}
        recipients = recipients_obj.get("data", [])

        # Extract nested list objects for tools/files
        tools_obj = config.get("tools") or {}
        tools = tools_obj.get("data", []) if isinstance(tools_obj, dict) else tools_obj
        files_obj = config.get("files") or {}
        files = files_obj.get("data", []) if isinstance(files_obj, dict) else files_obj

        # Convert Unix timestamp to datetime
        created_at_raw = raw.get("created_at")
        created_at = None
        if isinstance(created_at_raw, (int, float)):
            created_at = datetime.fromtimestamp(created_at_raw, tz=timezone.utc)
        elif isinstance(created_at_raw, str):
            created_at = created_at_raw

        return {
            "id": raw.get("id"),
            "name": config.get("name"),
            "description": config.get("description"),
            "instructions": config.get("instructions"),
            "owner_email": raw.get("owner_email"),
            "builder_name": raw.get("builder_name"),
            "created_at": created_at,
            "visibility": sharing.get("visibility"),
            "recipients": recipients,
            "shared_user_count": len(recipients),
            "tools": tools,
            "files": files,
            "builder_categories": config.get("categories"),
            "conversation_starters": config.get("conversation_starters"),
        }

    async def _request_with_retries(
        self, method: str, url: str, max_retries: int = 3, **kwargs
    ) -> httpx.Response:
        last_exc: Exception | None = None
        for attempt in range(max_retries):
            try:
                logger.info(f"HTTP {method} {url} (attempt {attempt + 1}/{max_retries})")
                resp = await self._client.request(method, url, **kwargs)
                if resp.status_code < 500:
                    resp.raise_for_status()
                    return resp
                # 5xx: retry
                logger.warning(f"Server error {resp.status_code}: {resp.text[:500]}")
                last_exc = httpx.HTTPStatusError(
                    f"Server error {resp.status_code}",
                    request=resp.request,
                    response=resp,
                )
            except (httpx.TimeoutException, httpx.HTTPStatusError) as e:
                logger.warning(f"Request failed (attempt {attempt + 1}): {e}")
                last_exc = e

            backoff = 2**attempt
            await asyncio.sleep(backoff)

        logger.error(f"All {max_retries} retries failed for {method} {url}: {last_exc}")
        raise last_exc  # type: ignore[misc]
