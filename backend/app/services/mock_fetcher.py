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

    async def fetch_all_users(self, workspace_id: str) -> list[dict]:
        from datetime import datetime, timezone

        mock_users = [
            {
                "id": "user-001",
                "email": "admin@acme.com",
                "name": "Sarah Connor",
                "role": "account-owner",
                "status": "active",
            },
            {
                "id": "user-002",
                "email": "john.smith@acme.com",
                "name": "John Smith",
                "role": "account-admin",
                "status": "active",
            },
            {
                "id": "user-003",
                "email": "lisa.chen@acme.com",
                "name": "Lisa Chen",
                "role": "standard-user",
                "status": "active",
            },
            {
                "id": "user-004",
                "email": "marco.b@acme.com",
                "name": "Marco Bianchi",
                "role": "standard-user",
                "status": "active",
            },
            {
                "id": "user-005",
                "email": "sophie.m@acme.com",
                "name": "Sophie Muller",
                "role": "standard-user",
                "status": "active",
            },
            {
                "id": "user-006",
                "email": "raj.patel@acme.com",
                "name": "Raj Patel",
                "role": "standard-user",
                "status": "active",
            },
            {
                "id": "user-007",
                "email": "emma.w@acme.com",
                "name": "Emma Wilson",
                "role": "account-admin",
                "status": "active",
            },
            {
                "id": "user-008",
                "email": "james.lee@acme.com",
                "name": "James Lee",
                "role": "standard-user",
                "status": "inactive",
            },
            {
                "id": "user-009",
                "email": "ana.garcia@acme.com",
                "name": "Ana Garcia",
                "role": "standard-user",
                "status": "active",
            },
            {
                "id": "user-010",
                "email": "tom.brown@acme.com",
                "name": "Tom Brown",
                "role": "standard-user",
                "status": "inactive",
            },
            {
                "id": "user-011",
                "email": "yuki.tanaka@acme.com",
                "name": "Yuki Tanaka",
                "role": "standard-user",
                "status": "active",
            },
            {
                "id": "user-012",
                "email": "david.kim@acme.com",
                "name": "David Kim",
                "role": "standard-user",
                "status": "active",
            },
            {
                "id": "user-013",
                "email": "former.emp@acme.com",
                "name": "Alex Former",
                "role": "standard-user",
                "status": "inactive",
            },
            {
                "id": "user-014",
                "email": "nina.jones@acme.com",
                "name": "Nina Jones",
                "role": "standard-user",
                "status": "active",
            },
            {
                "id": "user-015",
                "email": "ops.admin@acme.com",
                "name": "Chris Ops",
                "role": "account-admin",
                "status": "active",
            },
        ]
        now = datetime.now(tz=timezone.utc)
        for u in mock_users:
            u["created_at"] = now
        await asyncio.sleep(0.3)
        return mock_users

    async def close(self):
        pass
