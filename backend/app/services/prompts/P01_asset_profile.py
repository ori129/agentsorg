"""P01 — Asset Profile: full 9-KPI semantic enrichment (1 LLM call per asset).

Pipeline stage: Stage 5 (enrich)
Called from: SemanticEnricher.enrich_gpt()
Model: gpt-4o-mini
"""

# ---------------------------------------------------------------------------
# GPT context block — injected into every enrichment prompt
# ---------------------------------------------------------------------------

GPT_CONTEXT_TEMPLATE = """GPT Name: {name}
Description: {description}
Instructions (excerpt): {instructions_excerpt}
Tools enabled: {tools}
Knowledge files: {files_count}
Conversation starters: {starters_count}{starters_preview}
Builder categories: {builder_categories}
Shared with: {shared_user_count} users
"""

# ---------------------------------------------------------------------------
# P01 — All 9 KPIs in one call
# ---------------------------------------------------------------------------

SYSTEM = "You are an AI portfolio analyst reviewing Custom GPTs built inside a company's ChatGPT Enterprise workspace."

USER = """You are an AI portfolio analyst reviewing a Custom GPT built inside a company's ChatGPT Enterprise workspace.

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

purpose_fingerprint (string)
  Single sentence (max 15 words) capturing exactly what this tool does at the workflow level.
  Start with a verb: "Summarizes", "Drafts", "Reviews", "Generates", "Analyzes", "Classifies", etc.
  Be specific enough that two tools with identical fingerprints are genuine duplicates.
  Name the input and output: "Summarizes meeting transcripts into structured action items with owners".
  Do NOT use the tool name. Do NOT add qualifiers like "enterprise" or "AI-powered".
  If purely experimental or placeholder: "Experimental placeholder with no defined purpose".

Respond with JSON only. No commentary outside the JSON object."""
