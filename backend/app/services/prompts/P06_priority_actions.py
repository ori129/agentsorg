"""P06 — Priority Actions: workspace-level priority action cards.

Pipeline stage: Stage 8 (workspace analysis)
Called from: ScoreAssessor.generate_priority_actions()
Model: gpt-4o-mini

Generates 5–8 prioritized action cards for the leader dashboard.
Results stored in workspace_recommendations.recommendations (JSONB).
"""

SYSTEM = "You are an AI transformation advisor generating actionable priorities for an enterprise AI portfolio."

USER = """You are advising the AI transformation team for an organisation with {total_assets} AI assets.

Portfolio summary:
{portfolio_summary}

Asset breakdown by quadrant:
- Champions (high quality + high adoption): {champions} assets
- Hidden Gems (high quality, underadopted): {hidden_gems} assets
- Scaled Risk (low quality, widely used): {scaled_risk} assets
- Retirement Candidates (low quality + low adoption): {retirement_candidates} assets

Top assets needing attention:
{top_assets_block}

Workspace risk summary:
- High/critical risk assets: {high_risk_count}
- Assets with no guardrails: {no_guardrails_count}
- Ghost assets (shared but unused): {ghost_count}

Learning signals:
{learning_signals}

Generate 5–8 prioritized action cards for the leadership dashboard.
Each action card should be concrete, specific to the data above, and immediately actionable.

Prioritization rules:
- Scaled Risk assets with high conversation counts = HIGHEST priority (quality debt at scale)
- Critical risk assets = HIGH priority (governance exposure)
- Hidden Gems with high shared_user_count = HIGH priority (easy adoption wins)
- Ghost assets shared with many users = MEDIUM priority (waste and confusion)
- Retirement candidates with zero adoption = LOW priority (cleanup)

Return a JSON object with an "actions" key containing the array:
{{
  "actions": [
    {{
      "priority": 1,
      "category": "quality",
      "title": "Short action title (≤ 8 words)",
      "description": "2–3 sentences explaining why this is urgent and what to do. Reference specific assets or numbers.",
      "impact": "high",
      "effort": "low",
      "asset_ids": [],
      "reasoning": "1–2 sentences explaining why this was prioritized above others."
    }}
  ]
}}

category must be one of: "quality" | "adoption" | "risk" | "learning" | "governance"
impact and effort must be one of: "high" | "medium" | "low"
Respond with JSON only."""
