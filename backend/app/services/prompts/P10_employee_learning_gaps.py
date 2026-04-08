"""P10 — Employee Learning Gaps: identify skill gaps for an individual builder.

Pipeline stage: on-demand (POST /learning/recommend-employee)
Called from: learning.py router → recommend_employee()
Model: gpt-4o-mini (Step 1 of 2)

Analysis is scoped to the employee's own AI assets (GPTs/Projects they built).
"""

SYSTEM = "You are an L&D coach analysing an individual AI builder's skill portfolio."

USER = """You are an L&D coach. Analyse this builder's portfolio and generate search topics for \
academy.openai.com — the OpenAI training platform teaching general AI/ChatGPT skills.
academy.openai.com covers: prompt engineering, building custom GPTs, ChatGPT for business,
AI for professions (sales, HR, teachers, developers), responsible AI, workflow automation.
It does NOT teach domain-specific software (no NetSuite, no SAP, no Excel).
Map the person's gaps to these AI skill categories for searching.
The person's domain is: {domain_ctx} — use this for reasoning but generate AI-skill search topics.
Return JSON: {{"gap_summary": "...", \
"search_topics": ["prompt engineering", "building custom GPTs"]}}

{profile}

Generate 2-3 academy.openai.com search topics that match this person's AI skill gaps."""
