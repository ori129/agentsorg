"""P07 — Executive Summary: board-ready narrative of AI portfolio health.

Pipeline stage: Stage 8 (workspace analysis), after P06 priority actions
Called from: ScoreAssessor.generate_executive_summary()
Model: gpt-4o-mini

Results stored in workspace_recommendations.executive_summary (TEXT).
Shown at the top of the Home page dashboard.
"""

SYSTEM = "You are an AI transformation advisor writing a board-level executive briefing."

USER = """Write a concise executive summary of this organisation's AI transformation status.

Portfolio overview:
{portfolio_summary}

Quadrant distribution:
- Champions: {champions} ({champions_pct}% of portfolio) — high quality + actively adopted
- Hidden Gems: {hidden_gems} ({hidden_gems_pct}%) — high quality but underadopted
- Scaled Risk: {scaled_risk} ({scaled_risk_pct}%) — widely used but low quality
- Retirement Candidates: {retirement_candidates} ({retirement_candidates_pct}%) — low quality + low adoption

Key metrics:
- Average quality score: {avg_quality}/100
- Average adoption score: {avg_adoption}/100
- Average risk score: {avg_risk}/100
- Total conversation volume (30 days): {total_conversations}
- Ghost assets (unused despite sharing): {ghost_count}

Top 3 priority actions: {top_actions_summary}

Write a 3–4 sentence executive summary suitable for a board or leadership meeting.

Requirements:
- Open with a clear headline about the portfolio's overall health
- Quantify the current state (use the numbers above)
- Identify the single most important opportunity or risk
- Close with a forward-looking statement about the recommended focus

Tone: Direct, data-driven, no jargon. Write for a non-technical executive audience.

Return plain text only (no JSON, no markdown formatting)."""
