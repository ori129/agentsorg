"""P13 — Workflow Intelligence: LLM analysis of business process coverage.

Pipeline stage: Stage 6 of Conversation Pipeline (workflow_intelligence)
Called from: WorkflowAnalyzer.analyze()
Model: gpt-4o-mini

Single call after all conversation insights are aggregated — analyzes coverage status
for each workflow and returns reasoning + priority actions.
"""

SYSTEM = (
    "You are an AI transformation advisor helping a company understand how well their "
    "AI portfolio covers their business workflows. Be direct, specific, and actionable."
)

USER = """Analyze the workflow coverage for this organization's AI portfolio.

{workflow_block}

For each workflow, analyze the situation and return exactly one JSON object per workflow.

STATUS DEFINITIONS:
- covered: AI assets exist AND people are actively using them for this workflow
- ghost: AI assets exist but nobody is using them (zero conversations)
- intent_gap: Users are asking about this workflow via existing AI tools, but no dedicated asset exists for it

For each workflow, produce:
  reasoning: 2 sentences. Sentence 1: what the data shows. Sentence 2: what this means for the organization.
  priority_action: A specific 4-8 word action (e.g., "Archive and rebuild with better instructions", "Build a dedicated Vendor Onboarding GPT", "Monitor adoption and promote internally")
  priority_level: one of low | medium | high | critical
    low = doing well or minor gap
    medium = improvement needed but not urgent
    high = real business gap or wasted investment
    critical = significant risk or high-value unmet demand

Return ONLY a valid JSON array, no other text:
[
  {{"name": "Workflow Name", "reasoning": "...", "priority_action": "...", "priority_level": "low|medium|high|critical"}},
  ...
]"""


def build_workflow_block(workflows: list[dict]) -> str:
    """Build the workflow section injected into the USER prompt."""
    lines: list[str] = []

    covered = [w for w in workflows if w["status"] == "covered"]
    ghost = [w for w in workflows if w["status"] == "ghost"]
    gaps = [w for w in workflows if w["status"] == "intent_gap"]

    if covered:
        lines.append("COVERED WORKFLOWS (active assets + conversation usage):")
        for w in covered:
            asset_names = ", ".join(a["name"] for a in w.get("assets", [])[:3])
            signals = ", ".join(
                f"{s['topic']} ({s['pct']:.0f}%)"
                for s in w.get("intent_signals", [])[:3]
            )
            lines.append(
                f"  - {w['name']}: {w['asset_count']} asset(s), {w['conversation_count']} conversations"
            )
            if asset_names:
                lines.append(f"    Assets: {asset_names}")
            if signals:
                lines.append(f"    Top usage topics: {signals}")

    if ghost:
        lines.append("\nGHOST COVERAGE (assets exist, zero conversation uptake):")
        for w in ghost:
            asset_names = ", ".join(a["name"] for a in w.get("assets", [])[:3])
            lines.append(
                f"  - {w['name']}: {w['asset_count']} asset(s), 0 conversations"
            )
            if asset_names:
                lines.append(f"    Assets: {asset_names}")

    if gaps:
        lines.append("\nINTENT GAPS (user demand with no dedicated asset):")
        for w in gaps:
            phrases = w.get("example_phrases", [])[:3]
            pct = w["intent_signals"][0]["pct"] if w.get("intent_signals") else 0
            lines.append(
                f"  - {w['name']}: {pct:.0f}% of relevant conversations touch this topic"
            )
            if phrases:
                lines.append(
                    f"    Example phrases: {', '.join(f'"{p}"' for p in phrases)}"
                )

    return "\n".join(lines)
