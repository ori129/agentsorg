"""P04 — Asset Scores: LLM-assessed quality, adoption, and risk composite scores.

Pipeline stage: Stage 6 (score_assess)
Called from: ScoreAssessor.assess_asset()
Model: gpt-4o-mini

Each asset gets ONE call returning all three scores + rationale + quadrant + action.
Results are stored in the gpts table (quality_score, adoption_score, risk_score, etc.)
and surfaced in the UI with full visible reasoning.
"""

SYSTEM = "You are an AI portfolio analyst assessing enterprise AI assets for a transformation dashboard. Return ONLY a flat JSON object with the exact field names specified — no nested objects, no section keys."

USER = """Assess this AI asset deployed in a company's ChatGPT Enterprise workspace.

{gpt_context}

Usage data:
- Conversations (last 30 days): {conversation_count}
- Unique users: {unique_user_count}
- Shared with: {shared_user_count} users

Return a single FLAT JSON object with EXACTLY these field names (snake_case, no nesting):

  "quality_score": float 0.0–100.0
    Composite measure of how well-built this AI asset is.
    Weights: instruction depth 40%, prompt engineering technique 30%, ROI potential 20%, completeness 10%.
    Guide: 0-20=placeholder, 21-40=minimal, 41-60=functional, 61-80=solid, 81-100=production-grade.

  "quality_score_rationale": string
    2-3 sentences explaining quality_score with specific evidence from the instructions.

  "quality_main_strength": string
    One sentence naming the single strongest quality signal.

  "quality_main_weakness": string or null
    One sentence naming the most impactful quality gap, or null if quality_score >= 80.

  "adoption_score": float 0.0–100.0
    Composite measure of actual usage momentum.
    Weights: conversation volume 40%, user reach 30%, adoption ease 20%, recency 10%.
    Guide: 0-20=ghost, 21-40=early, 41-60=growing, 61-80=well-adopted, 81-100=highly adopted.
    RULE: If conversation_count=0 AND shared_user_count>5, adoption_score MUST be ≤ 20.

  "adoption_score_rationale": string
    2-3 sentences referencing actual conversation_count and user numbers.

  "adoption_signal": string
    One sentence on the strongest adoption signal or why adoption is stalled.

  "adoption_barrier": string or null
    One sentence on the primary adoption friction, or null if adoption is strong.

  "risk_score": float 0.0–100.0
    Composite measure of governance risk.
    Weights: data sensitivity 50%, external exposure 30%, guardrail absence 20%.
    Guide: 0-20=minimal, 21-40=low, 41-60=medium, 61-80=high, 81-100=critical.

  "risk_score_rationale": string
    2-3 sentences naming specific risk flags present.

  "risk_primary_driver": string
    One sentence on the biggest risk factor, or "No significant risk factors identified" if risk_score < 25.

  "risk_urgency": string
    One of: "low" | "medium" | "high" | "critical"
    low=risk<25, medium=risk 25-50, high=risk 50-75, critical=risk>75.

  "quadrant_label": string
    One of: "champion" | "hidden_gem" | "scaled_risk" | "retirement_candidate"
    champion = quality>=60 AND adoption>=60
    hidden_gem = quality>=60 AND adoption<60
    scaled_risk = quality<60 AND adoption>=60
    retirement_candidate = quality<60 AND adoption<60

  "top_action": string
    The single highest-priority action in ≤15 words. Be specific to this asset.

  "score_confidence": string
    One of: "low" | "medium" | "high"
    high=rich instructions+conversation data, medium=some signal, low=minimal instructions+no data.

CRITICAL: Return a flat JSON object. Do NOT use section headers as keys. Do NOT nest fields.
Example structure: {{"quality_score": 72.5, "quality_score_rationale": "...", "adoption_score": 45.0, ...}}

Respond with JSON only."""
