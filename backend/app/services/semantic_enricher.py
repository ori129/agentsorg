"""Semantic enrichment: 1 LLM call per GPT returning all 9 KPIs."""

import asyncio
import json
import logging
import time
from datetime import datetime, timezone

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# GPT context block — injected into every prompt
# ---------------------------------------------------------------------------

_GPT_CONTEXT_TEMPLATE = """GPT Name: {name}
Description: {description}
Instructions (excerpt): {instructions_excerpt}
Tools enabled: {tools}
Knowledge files: {files_count}
Conversation starters: {starters_count}{starters_preview}
Builder categories: {builder_categories}
Shared with: {shared_user_count} users
"""

# ---------------------------------------------------------------------------
# Single consolidated prompt — 1 call per GPT, all 9 KPIs in one response
# ---------------------------------------------------------------------------

PROMPT_ALL_KPIS = """You are an AI portfolio analyst reviewing a Custom GPT built inside a company's ChatGPT Enterprise workspace.

{gpt_context}

Analyze this GPT and return ALL of the following fields in a single JSON object.

FIELDS:

business_process (string | null)
  The primary organizational process this GPT supports.
  Examples: "contract review", "lead qualification", "employee onboarding", "code review".
  Return null if purely experimental or no identifiable process.

risk_flags (array of strings)
  Any of these that apply:
  "accesses_hr_data" — compensation, performance reviews, disciplinary, PII
  "accesses_financial_data" — revenue, P&L, budgets, pricing
  "accesses_legal_data" — contracts, litigation, privileged communications
  "customer_data_exposure" — customer names, contact info, account data
  "ip_exposure" — trade secrets, proprietary formulas, source code
  "output_used_externally" — outputs sent to clients or posted publicly
  "impersonation_risk" — GPT acts as a named person or official role
  "no_guardrails" — instructions show no safety or accuracy constraints

risk_level (string)
  One of: "low" | "medium" | "high" | "critical"
  low = no sensitive data, internal productivity only
  medium = some business data, limited exposure
  high = HR/financial/legal data or external-facing outputs
  critical = multiple high-risk factors combined

sophistication_score (integer 1-5)
  Measures OVERALL GPT DESIGN QUALITY. Instructions depth is the primary signal; tools/files/starters are secondary.

  STEP 1 — HARD CAPS based on instructions content (apply before anything else):
  A. Instructions say "follow the file" / "follow the instructions in the file" / "see the attached" / similar delegation:
     - AND files_count = 0  → score = 1 (broken setup — the file doesn't exist)
     - AND files_count > 0  → score = 2 MAX (builder outsourced all content, no real instructions written)
  B. Instructions are 1 sentence (not "follow the file"): score = 2 MAX
  C. Instructions are 2–3 sentences: score = 3 MAX
  D. Instructions are 4+ structured sentences: no automatic cap — evaluate normally

  STEP 2 — Apply the score scale (only after Step 1 caps):
  1 = Placeholder: "follow the file" with files_count = 0, OR pure "You are a helpful X. Be professional." No design.
  2 = Minimal: 1-sentence delegation, OR 2-3 sentences with no structure. Tools may be present but instructions are trivial.
  3 = Functional: 4+ structured sentences with clear scope/rules, OR 2-3 sentences + tools + files/starters. Purpose is evident.
  4 = Solid: 5+ structured sentences covering rules, scope, or format PLUS at least 2 secondary signals (tools, files, starters, or description). Intentional design evident.
  5 = Production-grade: Comprehensive instructions (10+ sentences with rules, format, edge cases) + tools + files + starters + proven usage (shared_user_count > 5).

  NOTE: Tools, description, and shared_user_count are secondary signals only. They cannot compensate for absent or delegated instructions.

sophistication_rationale (string)
  One sentence naming the specific signals present (and what is missing) across instructions, tools, files, and starters.

prompting_quality_score (integer 1-5)
  Measures TECHNIQUE APPLICATION — how skillfully prompt engineering methods were applied in the instructions.
  This is DIFFERENT from sophistication. A long prose dump can be sophisticated but still score low here.
  Ask: "Does the text use deliberate prompting techniques — explicit I/O format, behavioral rules, few-shot, CoT?"
  CRITICAL: Score only the "Instructions (excerpt)" text. Ignore Description and domain knowledge.
  If instructions say "follow the file" / reference an external file → score 1.

  1 = No technique: plain natural language, just "be helpful / be professional". No deliberate structure.
  2 = Minimal technique: role assignment exists ("You are a [role]") but nothing else — no format, no rules, no examples.
  3 = Basic technique: has role + at least one of: explicit behavioral rule ("never do X"), output format hint, or scope constraint. Missing concrete format spec or examples.
  4 = Solid technique: explicitly specifies output format OR uses concrete do/don't rules AND defines scope. May lack examples or CoT.
  5 = Expert technique: combines format specification + explicit behavioral rules + at least one of: few-shot examples, step-by-step reasoning instruction, or explicit failure handling.

  NOTE: sophistication and quality CAN differ — a verbose plain-prose prompt scores higher on sophistication but may still score 2 on quality if no techniques are applied. A short but well-structured prompt with explicit rules may score 3 on quality despite being short.
  HARD CAPS: Under 4 sentences → max 2. Score 4+ requires explicit output format directive in the text.

prompting_quality_rationale (string)
  One sentence naming specific techniques present (or absent) in the instructions text. Must differ from sophistication_rationale.

prompting_quality_flags (array of strings)
  Any of these that apply:
  "no_output_format", "no_constraints", "ambiguous_scope",
  "no_persona", "no_examples", "overloaded"

roi_potential_score (integer 1-5)
  1 = Trivial, already done better by standard tools (e.g. basic spell-check)
  2 = Minor convenience, saves minutes/week for one person
  3 = Moderate — saves hours/week or benefits a small team
  4 = High — automates a significant recurring workflow for a team
  5 = Transformative — core to a business process, saves days/week or enables new capability

roi_rationale (string)
  One sentence explaining the ROI score with a concrete estimate of time/value saved.

intended_audience (string)
  Who would use this GPT. Be specific about role or department.
  Example: "Sales reps generating proposals", "Legal team reviewing contracts"

integration_flags (array of strings)
  Named systems or integrations referenced in the instructions.
  Examples: "Salesforce", "Workday", "Jira", "GitHub", "Zendesk"
  Return empty array if none mentioned.

output_type (string)
  The single best fit from:
  "document" | "analysis" | "code" | "data" | "conversation" |
  "decision_support" | "content" | "workflow" | "search" | "other"

adoption_friction_score (integer 1-5)
  Measures how EASY it is for THE AVERAGE EMPLOYEE IN THE ORG to start using this GPT regularly. Higher = easier.
  Consider: (a) specialized skill or domain knowledge required, (b) process change needed, (c) data/access setup.
  5 = Zero friction — anyone in the company can use it immediately with no prior knowledge. Obvious value.
  4 = Low barrier — requires brief orientation; the audience is a well-defined team with the right background.
  3 = Medium barrier — requires domain-specific knowledge (e.g., a specific department workflow) OR a process change.
  2 = High barrier — requires specialized technical skills (e.g., SuiteScript, SQL, specific tool expertise), training, or data access setup.
  1 = Very high barrier — requires IT integration, organizational change, or deep expert knowledge to get any value.
  RULE: A GPT targeting a technical niche (specific framework, proprietary system, expert domain) scores at most 3.
  A GPT requiring specialized technical skills most employees don't have scores 2 or lower.

adoption_friction_rationale (string)
  One sentence explaining the adoption ease score, naming any specific barrier (required skill, process change, or access) or why it's easy.

Respond with JSON only. No commentary outside the JSON object."""

# ---------------------------------------------------------------------------
# Individual KPI prompts — kept for Prompt Lab per-KPI testing only
# NOT used in the pipeline (pipeline uses PROMPT_ALL_KPIS)
# ---------------------------------------------------------------------------

PROMPT_BUSINESS_PROCESS = """You are analyzing a Custom GPT built inside a company's ChatGPT Enterprise workspace.

{gpt_context}

Identify the primary organizational business process this GPT supports.
Examples: "contract review", "employee onboarding", "lead qualification", "financial reporting", "customer support triage", "RFP response generation", "code review".

If the GPT is purely experimental, a toy, or has no identifiable business process, return null.

Respond with JSON only:
{{"business_process": "<process name or null>"}}"""

PROMPT_RISK = """You are a security and compliance analyst reviewing a Custom GPT inside a company's ChatGPT Enterprise workspace.

{gpt_context}

Identify risk flags and assign an overall risk level.

Risk flags to look for (return any that apply):
- "accesses_hr_data" — mentions compensation, performance reviews, disciplinary, PII
- "accesses_financial_data" — revenue figures, P&L, budgets, pricing
- "accesses_legal_data" — contracts, litigation, privileged communications
- "customer_data_exposure" — customer names, contact info, account data
- "ip_exposure" — trade secrets, proprietary formulas, source code
- "output_used_externally" — outputs sent to clients, posted publicly
- "impersonation_risk" — GPT acts as a person or official role
- "no_guardrails" — instructions show no safety or accuracy constraints

Risk levels:
- "low" — no sensitive data, internal productivity only
- "medium" — some business data, limited exposure
- "high" — HR/financial/legal data or external-facing outputs
- "critical" — multiple high-risk factors combined

Respond with JSON only:
{{"risk_flags": ["flag1", "flag2"], "risk_level": "low|medium|high|critical"}}"""

PROMPT_SOPHISTICATION = """You are evaluating the engineering quality of a Custom GPT's system prompt.

{gpt_context}

Score the sophistication of how this GPT was designed (1-5 scale).

CRITICAL: Base your score ONLY on the "Instructions (excerpt)" text above. Do NOT use the Description or your domain knowledge.
If instructions say "follow the file", "use the provided document", or reference an external file — treat instructions as empty and score 1.

1 — 1-3 sentences. "You are a helpful assistant." or "Follow the file." No real instructions.
2 — Short paragraph (4-10 sentences). Some context but vague, no structure, no format spec.
3 — Multiple paragraphs with clear structure. Missing: output format, edge cases, or examples.
4 — Well-structured multi-section prompt. Role + output format + constraints + handles ambiguity.
5 — Production-grade. Role + constraints + output format + examples + error handling. Typically 30+ lines.

RULE: Under 5 sentences = max score 2. Under 15 sentences = max score 3.

Respond with JSON only:
{{"sophistication_score": 3, "sophistication_rationale": "one sentence citing specific evidence from the instructions text"}}"""

PROMPT_PROMPTING_QUALITY = """You are a prompt engineering expert evaluating a Custom GPT's system prompt quality.

{gpt_context}

Evaluate the quality of prompting techniques in the "Instructions (excerpt)" text (1-5 scale).

CRITICAL: Base your score ONLY on the Instructions text. Do NOT use the Description or your domain knowledge.
If instructions say "follow the file", "use the provided document", or reference an external file — treat as empty and score 1.

1 — No technique. 1-3 sentences. No structure.
2 — Basic role assignment only. Under 10 sentences.
3 — Has role + some constraints. Missing output format or examples.
4 — Uses multiple techniques: role, format spec, constraints, possibly few-shot.
5 — Expert level: chain-of-thought, few-shot examples, clear I/O spec, handles failure modes.

RULE: Under 5 sentences = max score 2. Score 4+ requires explicit output format AND constraints present in the text.

Also flag specific issues found (return any that apply):
- "no_output_format" — no output format specified
- "no_constraints" — no behavioral constraints defined
- "ambiguous_scope" — scope is unclear or too broad
- "no_persona" — no clear role or persona established
- "no_examples" — no examples or few-shot patterns
- "overloaded" — prompt tries to do too many unrelated things

Respond with JSON only:
{{"prompting_quality_score": 2, "prompting_quality_rationale": "one sentence citing specific evidence from the instructions", "prompting_quality_flags": ["no_output_format", "no_constraints"]}}"""

PROMPT_ROI = """You are a business analyst assessing the ROI potential of a Custom GPT deployed inside a company.

{gpt_context}

Score the ROI potential (1-5 scale):

1 — Trivial task, already done better by standard tools. No measurable time savings.
2 — Minor convenience. Saves minutes per week for one person.
3 — Moderate value. Saves hours per week or benefits a small team.
4 — High value. Automates a significant chunk of a recurring workflow. Measurable hours saved.
5 — Transformative. Core to a business process. Could save days/week or enable new capabilities.

Respond with JSON only:
{{"roi_potential_score": 3, "roi_rationale": "one sentence explaining the business value"}}"""

PROMPT_AUDIENCE = """You are analyzing who would use a Custom GPT inside a company's ChatGPT Enterprise workspace.

{gpt_context}

Identify the intended audience for this GPT. Be specific about role or department.
Examples: "Sales reps generating proposals", "HR team processing onboarding documents", "Legal team reviewing contracts", "All employees - general productivity", "Engineering team doing code review", "Marketing team creating content".

If unclear, make your best inference from the instructions and name.

Respond with JSON only:
{{"intended_audience": "<audience description>"}}"""

PROMPT_INTEGRATIONS = """You are analyzing a Custom GPT's dependencies and integration requirements.

{gpt_context}

Identify any named integrations, systems, or data sources referenced in this GPT.

Look for mentions of: CRM systems (Salesforce, HubSpot), HR systems (Workday, BambooHR), project management (Jira, Asana, Linear), communication (Slack, Teams), finance (NetSuite, QuickBooks, SAP), code (GitHub, GitLab), ticketing (Zendesk, ServiceNow), data (Snowflake, BigQuery), or any other named software.

Return empty list if no specific integrations are mentioned.

Respond with JSON only:
{{"integration_flags": ["Salesforce", "Jira"]}}"""

PROMPT_OUTPUT_TYPE = """You are classifying what kind of output a Custom GPT primarily produces.

{gpt_context}

Choose the single best output type from this list:
- "document" — drafts documents, reports, letters, proposals
- "analysis" — provides analysis, insights, summaries, evaluations
- "code" — writes, reviews, or debugs code
- "data" — processes, transforms, or extracts structured data
- "conversation" — conversational assistant, Q&A, coaching
- "decision_support" — helps make decisions, recommendations
- "content" — creates marketing content, social posts, emails
- "workflow" — guides through a process, checklist, step-by-step
- "search" — finds information, researches topics
- "other" — doesn't fit above categories

Respond with JSON only:
{{"output_type": "document"}}"""

PROMPT_ADOPTION_FRICTION = """You are assessing how easy it would be to get employees to adopt and regularly use a Custom GPT.

{gpt_context}

Score adoption ease (1-5, where 5=very easy, 1=very hard). Higher score = easier to adopt.

5 — Zero friction. Does one obvious thing, anyone can use it immediately, clear value, no setup.
4 — Low barrier. Requires brief onboarding; value is clear to the target team.
3 — Medium barrier. Requires domain knowledge, process change, or department coordination.
2 — High barrier. Requires specialized technical skills, training, or data access setup.
1 — Very high barrier. Requires technical integration, organizational change, or deep expert knowledge.

Respond with JSON only:
{{"adoption_friction_score": 4, "adoption_friction_rationale": "one sentence explaining the adoption ease"}}"""

# ---------------------------------------------------------------------------
# Registry — used by Prompt Lab for per-KPI testing
# ---------------------------------------------------------------------------

KPI_PROMPTS: dict[str, str] = {
    "business_process": PROMPT_BUSINESS_PROCESS,
    "risk": PROMPT_RISK,
    "sophistication": PROMPT_SOPHISTICATION,
    "prompting_quality": PROMPT_PROMPTING_QUALITY,
    "roi": PROMPT_ROI,
    "audience": PROMPT_AUDIENCE,
    "integrations": PROMPT_INTEGRATIONS,
    "output_type": PROMPT_OUTPUT_TYPE,
    "adoption_friction": PROMPT_ADOPTION_FRICTION,
}

# Also expose the consolidated prompt for Prompt Lab "run all" mode
KPI_PROMPTS["_all"] = PROMPT_ALL_KPIS


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_gpt_context(gpt: dict) -> str:
    instructions = gpt.get("instructions") or ""
    excerpt = instructions[:800] if len(instructions) > 800 else instructions
    tools = gpt.get("tools") or []
    tool_names = [t.get("type", str(t)) if isinstance(t, dict) else str(t) for t in tools]
    files = gpt.get("files") or []
    starters = gpt.get("conversation_starters") or []
    starters_preview = ""
    if starters:
        preview = [f'"{s}"' for s in starters[:3]]
        starters_preview = f": {', '.join(preview)}"
    return _GPT_CONTEXT_TEMPLATE.format(
        name=gpt.get("name", "Untitled"),
        description=gpt.get("description") or "(none)",
        instructions_excerpt=excerpt or "(none)",
        tools=", ".join(tool_names) if tool_names else "none",
        files_count=len(files) if files else 0,
        starters_count=len(starters),
        starters_preview=starters_preview,
        builder_categories=", ".join(gpt.get("builder_categories") or []) or "none",
        shared_user_count=gpt.get("shared_user_count") or 0,
    )


# ---------------------------------------------------------------------------
# SemanticEnricher — 1 call per GPT, all GPTs concurrent
# ---------------------------------------------------------------------------

class SemanticEnricher:
    def __init__(self, openai_api_key: str, model: str = "gpt-4o-mini"):
        self._client = AsyncOpenAI(api_key=openai_api_key)
        self._model = model
        self._semaphore = asyncio.Semaphore(20)  # 1 call/GPT → can be much more aggressive

    async def _call(self, prompt: str) -> tuple[dict, int]:
        """Single LLM call. Returns (parsed_json, total_tokens)."""
        async with self._semaphore:
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.1,
                max_tokens=600,  # all 9 KPIs need more room than a single KPI
            )
        text = response.choices[0].message.content or "{}"
        tokens = response.usage.total_tokens if response.usage else 0
        return json.loads(text), tokens

    async def enrich_gpt(self, gpt: dict, _classification: dict | None = None) -> dict:
        gpt_context = _build_gpt_context(gpt)
        prompt = PROMPT_ALL_KPIS.format(gpt_context=gpt_context)
        try:
            result, _ = await self._call(prompt)
        except Exception as e:
            logger.warning(f"Enrichment failed for '{gpt.get('name')}': {e}")
            return {}
        result["semantic_enriched_at"] = datetime.now(timezone.utc).isoformat()
        return result

    async def enrich_batch(self, gpts: list[dict], classifications: list[dict | None]) -> list[dict | None]:
        tasks = [
            self.enrich_gpt(gpt, classifications[i] if i < len(classifications) else None)
            for i, gpt in enumerate(gpts)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        output = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.warning(f"Enrichment failed for GPT '{gpts[i].get('name')}': {result}")
                output.append(None)
            else:
                output.append(result)
        return output

    async def run_single_kpi(
        self,
        kpi_name: str,
        gpt: dict,
        prompt_override: str | None = None,
    ) -> tuple[dict, int, float]:
        """Prompt Lab: test one KPI (or _all) against a sample. Returns (result, tokens, latency_ms)."""
        prompt_template = prompt_override or KPI_PROMPTS.get(kpi_name, "")
        gpt_context = _build_gpt_context(gpt)
        prompt = prompt_template.format(gpt_context=gpt_context)
        start = time.time()
        result, tokens = await self._call(prompt)
        latency_ms = (time.time() - start) * 1000
        return result, tokens, latency_ms
