"""Deterministic mock semantic enricher for demo mode.

Derives scores from actual GPT content (instruction length, tool count, name/category keywords).
Reflects real enterprise GPT distribution:
  ~60% experimental/forgotten (scores 1-2)
  ~25% functional/basic (scores 3)
  ~15% genuine production GPTs (scores 4-5)
"""

import hashlib
from datetime import datetime, timezone


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
    Tier based on CONTENT, not just hash:
      1 = abandoned/experimental
      2 = functional but basic
      3 = production-quality
    """
    seed = _seed(gpt)
    instr_len = _instruction_len(gpt)
    tool_count = _tool_count(gpt)

    if _is_abandoned(gpt, seed):
        return 1
    if instr_len >= 1500 and tool_count >= 1:
        return 3
    if instr_len >= 3000:
        return 3
    if instr_len >= 800 or tool_count >= 1:
        # Functional — but some are still basically experimental
        return 2 if (seed % 100) < 40 else 2  # all functional go to tier 2 here
    # Medium length with no tools
    if instr_len >= 400:
        return 2
    # Short, no tools, not obviously abandoned by name
    return 1 if (seed % 100) < 60 else 2


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


def _enrich_single(gpt: dict) -> dict:
    seed = _seed(gpt)
    tier = _tier(gpt)
    instr_len = _instruction_len(gpt)
    tool_count = _tool_count(gpt)
    cat = _category(gpt)
    name = _name_lower(gpt)
    desc = (gpt.get("description") or "").lower()
    instr = (gpt.get("instructions") or "").lower()

    # ── Sophistication ──────────────────────────────────────────────────────
    # Strictly anchored to instruction length (mirrors real LLM prompt rules)
    if instr_len < 150:
        soph = 1
        soph_rationale = (
            "Minimal system prompt — 1-2 sentences with no structure or constraints."
        )
    elif instr_len < 500:
        soph = 2
        soph_rationale = "Short paragraph with some context but no output format or behavioral constraints."
    elif instr_len < 1200:
        if tool_count >= 1:
            soph = 3
            soph_rationale = "Clear purpose with tool usage; missing explicit output format or examples."
        else:
            soph = 2 if seed % 3 == 0 else 3
            soph_rationale = (
                "Some structure but lacks output format specification and examples."
                if soph == 2
                else "Clear purpose and basic structure; missing output format or edge case handling."
            )
    elif instr_len < 2500:
        soph = 3 if seed % 3 == 0 else 4
        soph_rationale = (
            "Multi-paragraph prompt with clear role; missing explicit format spec or examples."
            if soph == 3
            else "Well-structured with role definition, format guidance, and constraints."
        )
    else:
        soph = 4 if seed % 3 != 0 else 5
        soph_rationale = (
            "Well-structured with role, format, and constraints; could benefit from few-shot examples."
            if soph == 4
            else "Production-grade: detailed role, constraints, format examples, and error handling."
        )

    # ── Prompting Quality ───────────────────────────────────────────────────
    # Also strictly anchored to length + technique signals
    if instr_len < 150:
        pq = 1
        pq_rationale = (
            "Single sentence or placeholder — no prompting technique applied."
        )
        pq_flags = ["no_output_format", "no_constraints", "no_persona"]
    elif instr_len < 500:
        pq = 2
        pq_rationale = "Basic role assignment with minimal instructions; no format spec or constraints defined."
        pq_flags = ["no_output_format", "no_constraints", "no_examples"]
    elif instr_len < 1200:
        has_format_signal = any(
            kw in instr
            for kw in ["format", "output", "respond with", "return", "structure"]
        )
        if has_format_signal:
            pq = 3
            pq_rationale = "Has role definition and some format guidance; lacks examples or explicit constraint rules."
            pq_flags = ["no_examples"]
        else:
            pq = 2
            pq_rationale = "Has context and role but no output format specification or behavioral constraints."
            pq_flags = ["no_output_format", "no_examples"]
    elif instr_len < 2500:
        pq = 3 if seed % 2 == 0 else 4
        pq_rationale = (
            "Multi-paragraph with role and constraints; missing explicit output format or examples."
            if pq == 3
            else "Multiple techniques applied: role, format spec, and constraints present."
        )
        pq_flags = ["no_examples"] if pq == 3 else []
    else:
        pq = 4 if seed % 3 != 0 else 5
        pq_rationale = (
            "Strong structure with role, format, and constraints; few-shot examples would elevate further."
            if pq == 4
            else "Expert-level: chain-of-thought, explicit I/O spec, constraint rules, and examples present."
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
    }


class MockSemanticEnricher:
    async def enrich_gpt(self, gpt: dict, _classification: dict | None = None) -> dict:
        return _enrich_single(gpt)

    async def enrich_batch(
        self, gpts: list[dict], classifications: list[dict | None]
    ) -> list[dict | None]:
        return [_enrich_single(gpt) for gpt in gpts]
