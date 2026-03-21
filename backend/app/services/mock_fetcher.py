"""Mock replacement for ComplianceAPIClient. Returns generated GPT and Project data."""

import asyncio
from collections.abc import Callable, Coroutine
from datetime import datetime, timezone
from typing import Any

from app.services.mock_data import generate_mock_gpts

PAGE_SIZE = 20
DELAY_PER_PAGE = 0.5  # seconds

# ── Mock Projects ─────────────────────────────────────────────────────────────
# 12 enterprise OpenAI Projects spanning tier 1/2/3 distribution.
# Format mirrors _normalize_project() output (already flattened).

_BASE_DATE = datetime(2025, 8, 1, tzinfo=timezone.utc)


def _pdate(days_offset: int) -> datetime:
    from datetime import timedelta

    return _BASE_DATE + timedelta(days=days_offset)


MOCK_PROJECTS: list[dict] = [
    # ── Tier 3: Production projects ────────────────────────────────────────
    {
        "id": "g-p-PROJ001acmesalesops",
        "name": "Sales Operations Hub",
        "description": "Centralised AI workspace for the entire Sales org — pipeline review, forecast summaries, and deal-coaching prompts.",
        "instructions": (
            "You are the Sales Operations AI assistant for Acme Corp. Your role is to help the sales team "
            "prepare deal reviews, generate forecast summaries, coach on objection handling, and synthesise CRM data.\n\n"
            "ALWAYS:\n"
            "1. Use the MEDDIC framework for deal qualification.\n"
            "2. Format forecast summaries with columns: Deal | Stage | ARR | Close Date | Risk.\n"
            "3. Ask for deal stage and ARR before coaching.\n"
            "4. Reference Salesforce opportunities by ID when provided.\n\n"
            "NEVER speculate on competitor pricing or share confidential pipeline data outside the workspace."
        ),
        "owner_email": "sarah.connor@acme.com",
        "builder_name": "Sarah Connor",
        "created_at": _pdate(0),
        "visibility": "workspace",
        "recipients": [],
        "shared_user_count": 48,
        "tools": [{"type": "web_browsing"}, {"type": "canvas"}],
        "files": [],
        "builder_categories": ["sales"],
        "conversation_starters": [
            "Review my deal",
            "Generate forecast summary",
            "Coach me on objection",
        ],
        "asset_type": "project",
        "_tier": 3,
    },
    {
        "id": "g-p-PROJ002acmelegalreview",
        "name": "Contract Review Project",
        "description": "Legal team workspace for NDA, MSA, and vendor contract first-pass review.",
        "instructions": (
            "You are a legal AI assistant specialising in commercial contract review for Acme Corp.\n\n"
            "WORKFLOW:\n"
            "1. Accept the contract as an uploaded PDF or pasted text.\n"
            "2. Identify and flag: (a) non-standard indemnification clauses, (b) uncapped liability, "
            "(c) auto-renewal terms, (d) IP ownership language that assigns rights to the vendor.\n"
            "3. Output a structured risk report with: Section | Issue | Severity (High/Medium/Low) | Suggested Redline.\n"
            "4. Always note: 'This is not legal advice. Route flagged items to counsel.'\n\n"
            "SCOPE: NDA, MSA, SaaS agreements, vendor contracts. Decline to analyse employment or litigation documents."
        ),
        "owner_email": "emma.w@acme.com",
        "builder_name": "Emma Wilson",
        "created_at": _pdate(15),
        "visibility": "workspace",
        "recipients": [],
        "shared_user_count": 12,
        "tools": [{"type": "myfiles_browser"}],
        "files": [],
        "builder_categories": ["legal"],
        "conversation_starters": [
            "Review this NDA",
            "Flag indemnification clauses",
            "Generate redline summary",
        ],
        "asset_type": "project",
        "_tier": 3,
    },
    {
        "id": "g-p-PROJ003acmeengsupport",
        "name": "Engineering Support Assistant",
        "description": "Production incident triage, runbook lookup, and post-mortem drafting for the engineering org.",
        "instructions": (
            "You are an engineering support AI for Acme Corp's platform team.\n\n"
            "CAPABILITIES:\n"
            "- Parse PagerDuty alert payloads and suggest triage steps.\n"
            "- Generate incident timelines from Slack thread exports.\n"
            "- Draft post-mortems in the blameless SRE format.\n"
            "- Look up runbooks from uploaded docs.\n\n"
            "SEVERITY DEFINITIONS (always use these):\n"
            "SEV1: Customer-facing data loss or complete outage.\n"
            "SEV2: Significant degradation affecting >10% of customers.\n"
            "SEV3: Partial or internal-only degradation.\n\n"
            "OUTPUT FORMAT: For incident timelines use ISO 8601 timestamps. For post-mortems use "
            "sections: Summary | Impact | Root Cause | Timeline | Action Items."
        ),
        "owner_email": "raj.patel@acme.com",
        "builder_name": "Raj Patel",
        "created_at": _pdate(30),
        "visibility": "workspace",
        "recipients": [],
        "shared_user_count": 22,
        "tools": [{"type": "myfiles_browser"}, {"type": "canvas"}],
        "files": [],
        "builder_categories": ["engineering"],
        "conversation_starters": [
            "Triage this alert",
            "Draft post-mortem",
            "Find runbook for X",
        ],
        "asset_type": "project",
        "_tier": 3,
    },
    # ── Tier 2: Functional projects ────────────────────────────────────────
    {
        "id": "g-p-PROJ004acmehrops",
        "name": "HR Operations Assistant",
        "description": "Helps HR team draft job descriptions, screen questions, and onboarding checklists.",
        "instructions": (
            "You are an HR assistant for Acme Corp. Help the HR team with:\n"
            "- Writing inclusive job descriptions.\n"
            "- Generating structured interview question sets.\n"
            "- Creating onboarding checklists by department.\n\n"
            "Always follow inclusive language guidelines. Flag any requirement that could create adverse impact."
        ),
        "owner_email": "nina.jones@acme.com",
        "builder_name": "Nina Jones",
        "created_at": _pdate(45),
        "visibility": "workspace",
        "recipients": [],
        "shared_user_count": 8,
        "tools": [],
        "files": [],
        "builder_categories": ["hr"],
        "conversation_starters": [
            "Write a job description",
            "Create interview questions",
        ],
        "asset_type": "project",
        "_tier": 2,
    },
    {
        "id": "g-p-PROJ005acmefinancerep",
        "name": "Finance Reporting Workspace",
        "description": "Monthly close support — variance analysis, board deck narrative, and budget templates.",
        "instructions": (
            "You assist the Finance team at Acme Corp with:\n"
            "- Budget variance analysis (provide actuals vs budget table).\n"
            "- Board deck narrative for monthly financials.\n"
            "- Template generation for quarterly budget submissions.\n\n"
            "Always express variances as both absolute ($) and percentage (%). Flag variances >10% as 'Material'."
        ),
        "owner_email": "lisa.chen@acme.com",
        "builder_name": "Lisa Chen",
        "created_at": _pdate(60),
        "visibility": "workspace",
        "recipients": [],
        "shared_user_count": 6,
        "tools": [{"type": "canvas"}],
        "files": [],
        "builder_categories": ["finance"],
        "conversation_starters": [
            "Analyse this budget variance",
            "Draft board narrative",
        ],
        "asset_type": "project",
        "_tier": 2,
    },
    {
        "id": "g-p-PROJ006acmemktcontent",
        "name": "Marketing Content Studio",
        "description": "Blog posts, social copy, and campaign briefs aligned to brand voice.",
        "instructions": (
            "You are a content assistant for Acme Corp's marketing team.\n"
            "Brand voice: professional, concise, customer-first. Avoid jargon.\n\n"
            "Deliverables you can produce:\n"
            "- Blog post drafts (specify target keyword and word count).\n"
            "- LinkedIn / Twitter copy variants.\n"
            "- Campaign brief outlines.\n\n"
            "Always ask for the target audience and goal before writing."
        ),
        "owner_email": "marco.b@acme.com",
        "builder_name": "Marco Bianchi",
        "created_at": _pdate(75),
        "visibility": "workspace",
        "recipients": [],
        "shared_user_count": 15,
        "tools": [{"type": "web_browsing"}],
        "files": [],
        "builder_categories": ["marketing"],
        "conversation_starters": [
            "Write a blog post",
            "Draft social copy",
            "Create campaign brief",
        ],
        "asset_type": "project",
        "_tier": 2,
    },
    {
        "id": "g-p-PROJ007acmedatasupport",
        "name": "Data Analytics Support",
        "description": "SQL query generation, dashboard spec writing, and data dictionary lookup.",
        "instructions": (
            "You help the data team at Acme Corp with SQL query drafting and data documentation.\n"
            "When writing SQL:\n"
            "- Default to BigQuery syntax unless told otherwise.\n"
            "- Always add comments explaining non-obvious CTEs.\n"
            "- Include a 'LIMIT 1000' on exploratory queries.\n\n"
            "For data dictionary requests, output: Field | Type | Description | Example Value."
        ),
        "owner_email": "david.kim@acme.com",
        "builder_name": "David Kim",
        "created_at": _pdate(90),
        "visibility": "workspace",
        "recipients": [],
        "shared_user_count": 9,
        "tools": [{"type": "deep_research"}],
        "files": [],
        "builder_categories": ["data"],
        "conversation_starters": ["Write a SQL query", "Generate data dictionary"],
        "asset_type": "project",
        "_tier": 2,
    },
    # ── Tier 1: Experimental / abandoned projects ──────────────────────────
    {
        "id": "g-p-PROJ008acmetest",
        "name": "Test Project",
        "description": "Testing the new Projects feature.",
        "instructions": "Just testing this out.",
        "owner_email": "john.smith@acme.com",
        "builder_name": "John Smith",
        "created_at": _pdate(100),
        "visibility": "private",
        "recipients": [],
        "shared_user_count": 0,
        "tools": [],
        "files": [],
        "builder_categories": [],
        "conversation_starters": [],
        "asset_type": "project",
        "_tier": 1,
    },
    {
        "id": "g-p-PROJ009acmedraft",
        "name": "Draft - Procurement AI",
        "description": "",
        "instructions": "Help with procurement stuff.",
        "owner_email": "ops.admin@acme.com",
        "builder_name": "Chris Ops",
        "created_at": _pdate(110),
        "visibility": "private",
        "recipients": [],
        "shared_user_count": 0,
        "tools": [],
        "files": [],
        "builder_categories": ["operations"],
        "conversation_starters": [],
        "asset_type": "project",
        "_tier": 1,
    },
    {
        "id": "g-p-PROJ010acmemygpt",
        "name": "My Project v2",
        "description": "",
        "instructions": "General assistant for me.",
        "owner_email": "sophie.m@acme.com",
        "builder_name": "Sophie Muller",
        "created_at": _pdate(120),
        "visibility": "private",
        "recipients": [],
        "shared_user_count": 0,
        "tools": [],
        "files": [],
        "builder_categories": [],
        "conversation_starters": [],
        "asset_type": "project",
        "_tier": 1,
    },
    {
        "id": "g-p-PROJ011acmeignore",
        "name": "ignore - old experiment",
        "description": "Ignore this.",
        "instructions": "ignore",
        "owner_email": "yuki.tanaka@acme.com",
        "builder_name": "Yuki Tanaka",
        "created_at": _pdate(130),
        "visibility": "private",
        "recipients": [],
        "shared_user_count": 0,
        "tools": [],
        "files": [],
        "builder_categories": [],
        "conversation_starters": [],
        "asset_type": "project",
        "_tier": 1,
    },
    {
        "id": "g-p-PROJ012acmefinal",
        "name": "Final Test",
        "description": "Final version of my test project.",
        "instructions": "A test.",
        "owner_email": "ana.garcia@acme.com",
        "builder_name": "Ana Garcia",
        "created_at": _pdate(140),
        "visibility": "private",
        "recipients": [],
        "shared_user_count": 0,
        "tools": [],
        "files": [],
        "builder_categories": [],
        "conversation_starters": [],
        "asset_type": "project",
        "_tier": 1,
    },
]


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

    async def fetch_all_projects(
        self,
        workspace_id: str,
        on_page: Callable[[list[dict], int], Coroutine[Any, Any, None]] | None = None,
    ) -> list[dict]:
        result: list[dict] = []
        page = 0
        for i in range(0, len(MOCK_PROJECTS), PAGE_SIZE):
            batch = MOCK_PROJECTS[i : i + PAGE_SIZE]
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
