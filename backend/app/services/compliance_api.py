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

    async def _fetch_paginated(
        self,
        endpoint: str,
        normalize_fn: Callable[[dict], dict],
        on_page: Callable[[list[dict], int], Coroutine[Any, Any, None]] | None = None,
    ) -> list[dict]:
        """Fetch all pages from a cursor-paginated endpoint and normalize each item.

        endpoint:     full URL, e.g. .../workspaces/{id}/gpts
        normalize_fn: called on each raw item to produce a uniform dict
        on_page:      optional progress callback(batch, page_number)
        """
        all_items: list[dict] = []
        after: str | None = None
        page = 0

        while True:
            await self._rate_limiter.acquire()

            params: dict[str, Any] = {"limit": self._page_size}
            if after:
                params["after"] = after

            logger.info(f"Requesting: GET {endpoint} params={params}")
            response = await self._request_with_retries("GET", endpoint, params=params)
            logger.info(
                f"Response: status={response.status_code} length={len(response.text)}"
            )

            data = response.json()
            items = data.get("data", [])
            all_items.extend(items)
            page += 1

            logger.info(
                f"Page {page}: got {len(items)} items, has_more={data.get('has_more')}"
            )

            if on_page:
                await on_page(items, page)

            if not data.get("has_more", False) or not items:
                break

            after = data.get("last_id") or items[-1].get("id")

        logger.info(f"Fetch complete: {len(all_items)} total raw items from {endpoint}")
        return [normalize_fn(item) for item in all_items]

    async def fetch_all_gpts(
        self,
        workspace_id: str,
        on_page: Callable[[list[dict], int], Coroutine[Any, Any, None]] | None = None,
    ) -> list[dict]:
        url = f"{self._base_url}/compliance/workspaces/{workspace_id}/gpts"
        return await self._fetch_paginated(url, self._normalize_gpt, on_page)

    async def fetch_all_projects(
        self,
        workspace_id: str,
        on_page: Callable[[list[dict], int], Coroutine[Any, Any, None]] | None = None,
    ) -> list[dict]:
        url = f"{self._base_url}/compliance/workspaces/{workspace_id}/projects"
        return await self._fetch_paginated(url, self._normalize_project, on_page)

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

    @staticmethod
    def _normalize_project(raw: dict) -> dict:
        """Flatten the Projects API response into the same uniform dict as _normalize_gpt.

        Projects share the same latest_config / sharing envelope as GPTs; the
        main structural difference is that the id prefix is 'g-p-...' and the
        tool set may include project-only types (deep_research, web_browsing, canvas).
        """
        from datetime import datetime, timezone

        sharing = raw.get("sharing") or {}
        config = raw.get("latest_config") or {}
        # Projects use flat latest_config (not a nested data list like GPTs)
        if isinstance(config.get("data"), list):
            config_list = config.get("data") or []
            config = config_list[0] if config_list else {}

        recipients_obj = sharing.get("recipients") or {}
        recipients = (
            recipients_obj.get("data", []) if isinstance(recipients_obj, dict) else []
        )

        tools_obj = config.get("tools") or {}
        tools = (
            tools_obj.get("data", [])
            if isinstance(tools_obj, dict)
            else (tools_obj if isinstance(tools_obj, list) else [])
        )
        files_obj = config.get("files") or {}
        files = (
            files_obj.get("data", [])
            if isinstance(files_obj, dict)
            else (files_obj if isinstance(files_obj, list) else [])
        )

        created_at_raw = raw.get("created_at")
        created_at = None
        if isinstance(created_at_raw, (int, float)):
            created_at = datetime.fromtimestamp(created_at_raw, tz=timezone.utc)
        elif isinstance(created_at_raw, str):
            created_at = created_at_raw

        return {
            "id": raw.get("id"),
            "name": config.get("name") or raw.get("name"),
            "description": config.get("description"),
            "instructions": config.get("instructions") or "",
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
            "asset_type": "project",
        }

    async def fetch_conversation_log_files(
        self,
        workspace_id: str,
        since_timestamp: float | None = None,
        on_page: Callable[[list[dict], int], Coroutine[Any, Any, None]] | None = None,
    ) -> list[dict]:
        """Fetch conversation log file metadata from the Compliance Logs Platform.

        Returns a list of file dicts: { id, url, created_at, event_count, size_bytes }
        The caller is responsible for downloading and streaming each file's JSONL content.

        since_timestamp: Unix timestamp — the `after` datetime filter sent to the API.
        The API requires `after` as a datetime string; passing it filters to recent logs.
        """
        from datetime import datetime, timedelta, timezone

        url = f"{self._base_url}/compliance/workspaces/{workspace_id}/logs"

        # `after` is a required datetime query param on the /logs endpoint.
        if since_timestamp is not None:
            dt = datetime.fromtimestamp(since_timestamp, tz=timezone.utc)
        else:
            dt = datetime.now(timezone.utc) - timedelta(days=30)
        after_dt: str = dt.strftime("%Y-%m-%dT%H:%M:%SZ")

        all_items: list[dict] = []
        # current_after tracks the datetime cursor for pagination —
        # use the last item's created_at timestamp to advance to the next page.
        current_after: str = after_dt
        page = 0

        while True:
            await self._rate_limiter.acquire()
            params: dict[str, Any] = {
                "limit": self._page_size,
                "event_type": "CONVERSATION_MESSAGE",
                "after": current_after,
            }

            logger.info(f"Requesting: GET {url} params={params}")
            response = await self._request_with_retries("GET", url, params=params)
            logger.info(
                f"Response: status={response.status_code} length={len(response.text)}"
            )

            data = response.json()
            items = data.get("data", [])
            all_items.extend(items)
            page += 1

            logger.info(
                f"Log files page {page}: got {len(items)}, has_more={data.get('has_more')}"
            )
            if items and page == 1:
                logger.info(f"Log file item sample keys: {list(items[0].keys())}")
                logger.info(f"Log file item[0]: {items[0]}")

            if on_page:
                await on_page(items, page)

            if not data.get("has_more", False) or not items:
                break

            # Advance the datetime cursor: use the last item's end_time (or created_at)
            last_item = items[-1]
            last_ts = (
                last_item.get("end_time")
                or last_item.get("created_at")
                or last_item.get("timestamp", "")
            )
            if not last_ts:
                logger.warning(
                    f"Log file item has no timestamp for pagination: {last_item}"
                )
                break
            # Trim to seconds precision and ensure Z suffix for ISO 8601
            current_after = last_ts[:19] + "Z" if len(last_ts) >= 19 else last_ts

        logger.info(
            f"Fetch complete: {len(all_items)} conversation log files from {url}"
        )
        return all_items

    def get_log_file_download_url(self, workspace_id: str, log_id: str) -> str:
        """Return the URL that serves the JSONL file (307 redirect to signed URL)."""
        return f"{self._base_url}/compliance/workspaces/{workspace_id}/logs/{log_id}"

    async def download_jsonl_lines(self, file_url: str) -> list[dict]:
        """Stream-download a JSONL file and return parsed lines.

        Skips malformed lines (JSON parse errors) with a warning log.
        Files are up to 15MB — streamed line-by-line to avoid loading all into memory.
        """
        import json

        lines: list[dict] = []
        skipped = 0

        await self._rate_limiter.acquire()
        logger.info(f"Downloading JSONL: {file_url}")

        # The /logs/{id} endpoint returns a 307 redirect to a signed URL (e.g. S3).
        # Resolve the redirect first with a HEAD/GET, then stream from the final URL
        # without the Authorization header (signed URLs don't accept Bearer tokens).
        download_url = file_url
        head_resp = await self._client.get(file_url, follow_redirects=False)
        if head_resp.status_code in (301, 302, 307, 308):
            download_url = head_resp.headers.get("location", file_url)
            logger.info(f"Following redirect to: {download_url[:80]}...")
            # Use a temporary client without auth headers for signed URLs
            async with httpx.AsyncClient(timeout=60) as tmp_client:
                async with tmp_client.stream("GET", download_url) as response:
                    response.raise_for_status()
                    async for raw_line in response.aiter_lines():
                        raw_line = raw_line.strip()
                        if not raw_line:
                            continue
                        try:
                            lines.append(json.loads(raw_line))
                        except json.JSONDecodeError as exc:
                            skipped += 1
                            logger.warning(
                                f"Skipping malformed JSONL line in {file_url}: {exc} "
                            )
            logger.info(
                f"Downloaded {len(lines)} lines from {file_url} ({skipped} skipped)"
            )
            return lines

        async with self._client.stream(
            "GET", file_url, follow_redirects=True
        ) as response:
            response.raise_for_status()
            async for raw_line in response.aiter_lines():
                raw_line = raw_line.strip()
                if not raw_line:
                    continue
                try:
                    lines.append(json.loads(raw_line))
                except json.JSONDecodeError as exc:
                    skipped += 1
                    logger.warning(
                        f"Skipping malformed JSONL line in {file_url}: {exc} "
                        f"(line preview: {raw_line[:120]})"
                    )

        logger.info(
            f"JSONL download complete: {len(lines)} valid lines, {skipped} skipped"
        )
        return lines

    async def fetch_all_users(self, workspace_id: str) -> list[dict]:
        all_users: list[dict] = []
        after: str | None = None

        while True:
            await self._rate_limiter.acquire()

            params: dict[str, Any] = {"limit": 200}
            if after:
                params["after"] = after

            url = f"{self._base_url}/compliance/workspaces/{workspace_id}/users"
            logger.info(f"Requesting: GET {url} params={params}")

            response = await self._request_with_retries("GET", url, params=params)
            data = response.json()
            users = data.get("data", [])

            for u in users:
                created_at_raw = u.get("created_at")
                created_at = None
                if isinstance(created_at_raw, (int, float)):
                    from datetime import datetime, timezone

                    created_at = datetime.fromtimestamp(created_at_raw, tz=timezone.utc)
                u["created_at"] = created_at

            all_users.extend(users)
            logger.info(
                f"Users page: got {len(users)}, has_more={data.get('has_more')}"
            )

            if not data.get("has_more", False) or not users:
                break

            after = data.get("last_id") or users[-1].get("id")

        logger.info(f"Fetch complete: {len(all_users)} total users")
        return all_users

    async def _request_with_retries(
        self, method: str, url: str, max_retries: int = 3, **kwargs
    ) -> httpx.Response:
        last_exc: Exception | None = None
        for attempt in range(max_retries):
            try:
                logger.info(
                    f"HTTP {method} {url} (attempt {attempt + 1}/{max_retries})"
                )
                resp = await self._client.request(method, url, **kwargs)
                if resp.status_code < 500:
                    if not resp.is_success:
                        logger.warning(
                            f"HTTP {resp.status_code} response body: {resp.text[:1000]}"
                        )
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
