"""Deterministic mock semantic enricher for demo mode.

Derives scores from actual GPT content (instruction length, tool count, name/category keywords).
Reflects real enterprise GPT distribution:
  ~60% experimental/forgotten (scores 1-2)
  ~25% functional/basic (scores 3)
  ~15% genuine production GPTs (scores 4-5)
"""

import hashlib
from datetime import datetime, timezone

from app.services.mock_embedder import _detect_bucket, _detect_sub_bucket


def _seed(gpt: dict) -> int:
    """Deterministic seed from GPT id/name."""
    key = (gpt.get("id") or "") + (gpt.get("name") or "")
    return int(hashlib.md5(key.encode()).hexdigest()[:8], 16)


def _instruction_len(gpt: dict) -> int:
    return len(gpt.get("instructions") or "")


def _tool_count(gpt: dict) -> int:
    return len(gpt.get("tools") or [])


def _category(gpt: dict) -> str:
    cats = gpt.get("builder_categories") or []
    return (cats[0] if cats else "").lower()


def _name_lower(gpt: dict) -> str:
    return (gpt.get("name") or "").lower()


def _is_abandoned(gpt: dict, seed: int) -> bool:
    """Abandoned = short instructions AND no tools AND hash falls in bottom 60%."""
    instr_len = _instruction_len(gpt)
    tool_count = _tool_count(gpt)
    name = _name_lower(gpt)
    # Explicit abandoned signals in name
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
    name_is_throwaway = any(s in name for s in abandoned_signals)
    if name_is_throwaway and instr_len < 500:
        return True
    if instr_len < 200 and tool_count == 0:
        return True
    if instr_len < 500 and tool_count == 0 and (seed % 100) < 40:
        return True
    return False


def _tier(gpt: dict) -> int:
    """
    Use the template's _tier tag when set (production templates are pre-labelled).
    Fall back to seed-based distribution for abandoned/untagged GPTs.
      ~60% tier 1 — abandoned/experimental
      ~25% tier 2 — functional
      ~15% tier 3 — production
    """
    seed = _seed(gpt)

    if _is_abandoned(gpt, seed):
        return 1

    # Respect explicit tier from template
    explicit = gpt.get("_tier")
    if explicit in (1, 2, 3):
        return explicit

    # Seed-based fallback
    r = seed % 100
    if r < 15:
        return 3
    if r < 40:
        return 2
    return 1


# Business process mapping by category/name keywords
_PROCESS_BY_KEYWORD = {
    "sales": "lead qualification and proposal generation",
    "marketing": "content creation and campaign management",
    "hr": "employee onboarding and HR operations",
    "legal": "contract review and legal document analysis",
    "finance": "financial reporting and budget analysis",
    "engineering": "code review and technical documentation",
    "support": "customer support triage",
    "operations": "operational process optimization",
    "data": "data analysis and reporting",
    "security": "security policy enforcement",
    "compliance": "regulatory compliance monitoring",
    "product": "product requirements documentation",
}

_OUTPUT_TYPES_BY_CATEGORY = {
    "sales": "document",
    "marketing": "content",
    "hr": "document",
    "legal": "document",
    "finance": "analysis",
    "engineering": "code",
    "support": "conversation",
    "operations": "workflow",
    "data": "data",
    "security": "analysis",
    "compliance": "document",
    "product": "document",
}

_AUDIENCES_BY_CATEGORY = {
    "sales": "Sales team generating proposals and qualifying leads",
    "marketing": "Marketing team creating content and campaigns",
    "hr": "HR team managing employee lifecycle",
    "legal": "Legal team reviewing contracts and documents",
    "finance": "Finance team producing reports and analysis",
    "engineering": "Engineering team writing and reviewing code",
    "support": "Customer support agents handling inquiries",
    "operations": "Operations team managing workflows",
    "data": "Data analysts and business intelligence team",
    "security": "Security team monitoring and enforcing policies",
    "compliance": "Compliance team tracking regulatory requirements",
    "product": "Product managers defining requirements",
}

_INTEGRATIONS_BY_CATEGORY = {
    "sales": ["Salesforce", "HubSpot"],
    "hr": ["Workday", "BambooHR"],
    "legal": ["DocuSign", "Ironclad"],
    "finance": ["NetSuite", "QuickBooks"],
    "engineering": ["GitHub", "Jira"],
    "support": ["Zendesk", "ServiceNow"],
    "data": ["Snowflake", "Tableau"],
}

# ---------------------------------------------------------------------------
# Purpose fingerprint map — one sentence per sub-bucket (mirrors mock_embedder hierarchy)
# ---------------------------------------------------------------------------

_FINGERPRINT_MAP: dict[str, str] = {
    # meeting-notes
    "meeting-notes:standup-summary": "Summarizes daily standup meetings into action items with owners",
    "meeting-notes:executive-briefing": "Converts executive meetings into structured briefing documents for leadership",
    "meeting-notes:client-call-notes": "Transcribes client calls into organized notes with follow-up actions",
    "meeting-notes:general-recap": "Summarizes meeting transcripts into key decisions and next steps",
    # email-assistant
    "email-assistant:cold-outreach": "Drafts personalized cold outreach emails for sales prospects",
    "email-assistant:follow-up": "Writes follow-up email sequences for sales and customer nurture campaigns",
    "email-assistant:internal-comms": "Drafts internal announcements and stakeholder update emails",
    "email-assistant:general-email": "Drafts and improves professional emails for any business context",
    # code-review
    "code-review:pr-review": "Reviews pull requests for code quality, bugs, and best practices",
    "code-review:security-review": "Analyzes source code for security vulnerabilities and compliance issues",
    "code-review:documentation": "Generates code documentation, docstrings, and API reference from source code",
    "code-review:general-code": "Reviews and improves code quality across languages and frameworks",
    # legal-contract
    "legal-contract:contract-review": "Reviews contracts to identify risky clauses and missing standard protections",
    "legal-contract:nda": "Analyzes NDAs and confidentiality agreements for missing or unusual terms",
    "legal-contract:compliance": "Checks documents and processes against regulatory compliance requirements",
    "legal-contract:general-legal": "Reviews legal documents for standard terms and potential issues",
    # sales-assistant
    "sales-assistant:prospecting": "Qualifies leads against ICP criteria and researches target accounts",
    "sales-assistant:deal-management": "Tracks deal status and suggests next actions for open opportunities",
    "sales-assistant:proposal": "Drafts customized sales proposals and RFP responses for prospects",
    "sales-assistant:general-sales": "Supports sales workflows including outreach, qualification, and closing",
    # hr-assistant
    "hr-assistant:onboarding": "Guides new hires through onboarding checklist and day-one orientation steps",
    "hr-assistant:recruiting": "Screens candidates and generates interview questions from job descriptions",
    "hr-assistant:performance": "Structures performance reviews with goal alignment and feedback templates",
    "hr-assistant:general-hr": "Handles HR operations including employee queries and policy lookups",
    # data-analytics
    "data-analytics:dashboards": "Designs KPI dashboards and scorecard frameworks from business requirements",
    "data-analytics:sql-analysis": "Writes and optimizes SQL queries for data warehouse analysis tasks",
    "data-analytics:reporting": "Generates data analytics reports with insights from business metrics",
    "data-analytics:general-data": "Analyzes datasets and produces insights and recommendations on demand",
    # marketing-content
    "marketing-content:social-media": "Creates social media posts and content calendars for marketing campaigns",
    "marketing-content:seo-content": "Writes SEO-optimized blog posts and content strategies for organic growth",
    "marketing-content:brand-voice": "Ensures marketing copy adheres to brand voice and tone guidelines",
    "marketing-content:general-content": "Creates marketing copy and campaign content across channels",
    # finance
    "finance:budgeting": "Builds budget forecasts and expense tracking templates for cost centers",
    "finance:reporting": "Produces financial reports including P&L statements and budget variance analysis",
    "finance:analysis": "Analyzes financial data to identify revenue trends and ROI opportunities",
    "finance:general-finance": "Supports finance operations including reporting, budgeting, and analysis",
    # customer-support
    "customer-support:ticket-triage": "Triages and categorizes incoming support tickets for routing and prioritization",
    "customer-support:escalation": "Identifies at-risk accounts and drafts escalation responses for churn prevention",
    "customer-support:self-service": "Powers customer self-service FAQs and knowledge base article generation",
    "customer-support:general-support": "Handles customer support inquiries with resolution guidance and templates",
}


def _assign_fingerprint(gpt: dict, tier: int, use_case: str = "") -> str:
    """Assign a deterministic purpose fingerprint using the same bucket hierarchy as MockEmbedder.

    Uses name+description only (not the classifier use_case) for reliable keyword matching.
    """
    if tier == 1:
        return "Experimental placeholder with no defined purpose"

    name = gpt.get("name", "")
    desc = (gpt.get("description") or "").lower()
    gpt_id = gpt.get("id", "")

    # Use name+description for bucket detection, NOT the classifier use_case
    # (classifier use_case reflects the assigned category domain, not the tool's actual workflow)
    search_text = name + " " + desc
    bucket = _detect_bucket(search_text)
    if not bucket:
        return "General-purpose assistant for internal productivity tasks"

    sub_bucket = _detect_sub_bucket(bucket, search_text, "", gpt_id)
    key = f"{bucket}:{sub_bucket}"
    return _FINGERPRINT_MAP.get(
        key, f"Supports {bucket.replace('-', ' ')} workflows for the organization"
    )


# Niche technical keywords that drive adoption friction up
_NICHE_TECH_KEYWORDS = [
    "suitescript",
    "netsuite",
    "salesforce apex",
    "workday studio",
    "sql",
    "python",
    "javascript",
    "api",
    "regex",
    "xpath",
    "powershell",
    "bash",
    "kubernetes",
    "terraform",
    "snowflake",
    "dbt",
    "tableau",
    "looker",
    "jira automation",
    "servicenow",
    "sap",
    "oracle",
    "azure devops",
]


def _enrich_single(gpt: dict, classification: dict | None = None) -> dict:
    seed = _seed(gpt)
    tier = _tier(gpt)
    tool_count = _tool_count(gpt)
    cat = _category(gpt)
    name = _name_lower(gpt)
    desc = (gpt.get("description") or "").lower()
    instr = (gpt.get("instructions") or "").lower()
    use_case = (
        (classification or {}).get("use_case_description") or ""
        if classification
        else ""
    )

    # ── Sophistication ──────────────────────────────────────────────────────
    if tier == 1:
        soph = 1 if seed % 3 != 0 else 2
        soph_rationale = (
            "Minimal system prompt — 1-2 sentences with no structure or constraints."
            if soph == 1
            else "Short paragraph with some context but no output format or behavioral constraints."
        )
    elif tier == 2:
        soph = 2 if seed % 4 == 0 else 3
        soph_rationale = (
            "Has role and purpose but lacks explicit output format or behavioral constraints."
            if soph == 2
            else "Clear role with behavioral guidelines and basic format direction."
        )
    else:
        soph = 4 if seed % 3 != 0 else 5
        soph_rationale = (
            "Well-structured with detailed role, numbered instructions, output format, and constraints."
            if soph == 4
            else "Production-grade: comprehensive role, step-by-step instructions, explicit I/O format, guardrails, and edge-case handling."
        )

    # ── Prompting Quality ───────────────────────────────────────────────────
    if tier == 1:
        pq = 1 if seed % 3 != 0 else 2
        pq_rationale = (
            "Single sentence or placeholder — no prompting technique applied."
            if pq == 1
            else "Basic role assignment; no format spec or constraints defined."
        )
        pq_flags = (
            ["no_output_format", "no_constraints", "no_persona"]
            if pq == 1
            else ["no_output_format", "no_constraints", "no_examples"]
        )
    elif tier == 2:
        pq = 2 if seed % 4 == 0 else 3
        pq_rationale = (
            "Has role and context but no output format specification or behavioral constraints."
            if pq == 2
            else "Has role definition and format guidance; lacks examples or explicit constraint rules."
        )
        pq_flags = ["no_output_format", "no_examples"] if pq == 2 else ["no_examples"]
    else:
        pq = 4 if seed % 3 != 0 else 5
        pq_rationale = (
            "Strong structure with role, numbered steps, output format, and constraints; few-shot examples would elevate further."
            if pq == 4
            else "Expert-level: detailed role, chain-of-thought steps, explicit I/O spec, guardrails, and edge-case handling."
        )
        pq_flags = [] if pq == 5 else ["no_examples"]

    # ── ROI Potential ────────────────────────────────────────────────────────
    if tier == 1:
        roi = 1
        roi_rationale = "No identifiable business process; purely experimental with no measurable value."
    elif tier == 2:
        roi = 2 if seed % 2 == 0 else 3
        roi_rationale = (
            "Minor convenience — saves minutes per week for a single user."
            if roi == 2
            else "Moderate value — saves hours per week or benefits a small team."
        )
    else:
        roi = 4 if seed % 3 != 0 else 5
        roi_rationale = (
            "High value — automates a significant recurring workflow, saving hours per week for a team."
            if roi == 4
            else "Transformative — core to a business process with measurable days-per-week impact."
        )

    # ── Business Process ─────────────────────────────────────────────────────
    bp = None
    if tier >= 2:
        for kw, process in _PROCESS_BY_KEYWORD.items():
            if kw in cat or kw in name:
                bp = process
                break
        if bp is None and tier == 3:
            bp = "general business operations"
    if tier == 2 and seed % 3 == 0:
        bp = None

    # ── Risk ─────────────────────────────────────────────────────────────────
    risk_flags = []
    if tier == 3:
        if "hr" in cat or "hr" in name or "onboard" in name:
            risk_flags.append("accesses_hr_data")
        if "legal" in cat or "contract" in name or "legal" in name:
            risk_flags.append("accesses_legal_data")
        if "finance" in cat or "budget" in name or "revenue" in name:
            risk_flags.append("accesses_financial_data")
        if "customer" in name or "client" in name or "support" in cat:
            risk_flags.append("customer_data_exposure")
        if not risk_flags and seed % 3 == 0:
            risk_flags.append("no_guardrails")

    r = seed % 100
    if risk_flags and any(
        f in risk_flags
        for f in ["accesses_hr_data", "accesses_legal_data", "accesses_financial_data"]
    ):
        risk_level = "high" if len(risk_flags) >= 2 else "medium"
    elif risk_flags:
        risk_level = "medium"
    elif r < 70:
        risk_level = "low"
    elif r < 90:
        risk_level = "medium"
    else:
        risk_level = "high"

    # ── Intended Audience ────────────────────────────────────────────────────
    intended_audience = _AUDIENCES_BY_CATEGORY.get(cat)
    if intended_audience is None:
        if tier == 1:
            intended_audience = "Individual user (personal productivity)"
        elif tier == 2:
            intended_audience = "Small team or department"
        else:
            intended_audience = "Cross-functional team or department"

    # ── Integrations ─────────────────────────────────────────────────────────
    integration_flags: list = []
    if tier == 3:
        integration_flags = _INTEGRATIONS_BY_CATEGORY.get(cat, [])
        if not tool_count:
            integration_flags = []
    if tier < 3:
        integration_flags = []

    # ── Output Type ──────────────────────────────────────────────────────────
    output_type = _OUTPUT_TYPES_BY_CATEGORY.get(cat)
    if output_type is None:
        output_type = "conversation" if tier == 1 else "analysis"

    # ── Adoption Ease (5=easiest, 1=hardest) ──────────────────────────────────
    # Check if GPT requires niche technical skills
    full_text = name + " " + desc + " " + instr
    requires_niche_tech = any(kw in full_text for kw in _NICHE_TECH_KEYWORDS)

    if tier == 1:
        af = 5
        af_rationale = "Simple general-purpose task with no setup required — anyone can use immediately."
    elif requires_niche_tech:
        af = 2
        af_rationale = "Requires specialized technical knowledge that most employees don't have; high barrier to entry."
    elif tier == 2:
        af = 4 if seed % 2 == 0 else 3
        af_rationale = (
            "Requires brief orientation to understand scope, but value is clear to the target team."
            if af == 4
            else "Requires adopting a new workflow step; team coordination needed before regular use."
        )
    else:
        af = 3 if seed % 3 == 0 else 2
        af_rationale = (
            "Requires team coordination and process change to integrate into existing workflows."
            if af == 3
            else "Requires training and possibly data access setup before the team can use it effectively."
        )

    if integration_flags:
        af = max(af - 1, 1)
        af_rationale += (
            " System integration dependencies add additional setup overhead."
        )

    return {
        "business_process": bp,
        "risk_flags": risk_flags,
        "risk_level": risk_level,
        "sophistication_score": soph,
        "sophistication_rationale": soph_rationale,
        "prompting_quality_score": pq,
        "prompting_quality_rationale": pq_rationale,
        "prompting_quality_flags": pq_flags,
        "roi_potential_score": roi,
        "roi_rationale": roi_rationale,
        "intended_audience": intended_audience,
        "integration_flags": integration_flags,
        "output_type": output_type,
        "adoption_friction_score": af,
        "adoption_friction_rationale": af_rationale,
        "semantic_enriched_at": datetime.now(timezone.utc).isoformat(),
        "purpose_fingerprint": _assign_fingerprint(gpt, tier, use_case),
    }


class MockSemanticEnricher:
    async def enrich_gpt(
        self, gpt: dict, _classification: dict | None = None
    ) -> tuple[dict, int, int]:
        """Returns (enrichment_dict, prompt_tokens=0, completion_tokens=0) — mock uses no LLM."""
        return _enrich_single(gpt, _classification), 0, 0

    async def enrich_batch(
        self, gpts: list[dict], classifications: list[dict | None]
    ) -> tuple[list[dict | None], int, int]:
        """Returns (enrichments, total_prompt_tokens=0, total_completion_tokens=0)."""
        return (
            [
                _enrich_single(
                    gpt, classifications[i] if i < len(classifications) else None
                )
                for i, gpt in enumerate(gpts)
            ],
            0,
            0,
        )
