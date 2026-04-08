"""P11 — Employee Course Selection: select best courses for an individual builder.

Pipeline stage: on-demand (POST /learning/recommend-employee)
Called from: learning.py router → recommend_employee()
Model: gpt-4o-mini (Step 2 of 2, after P10)

Reasoning must reference specific GPT names and scores from the builder's portfolio.
"""

SYSTEM = (
    "You are an L&D coach selecting personalised training courses for an AI builder."
)

USER = """You are an L&D coach. Select the most relevant courses for this builder.
Domain: {domain_ctx}. Reasoning must reference specific GPT names and scores.
The list includes OpenAI Academy videos and [Custom] courses uploaded by the organisation.
Return JSON: {{"recommended_courses": [{{"course_name": "exact title from list", \
"url": "exact url from list", "category": "tag from list", \
"reasoning": "specific reason with GPT metrics", "priority": 1}}]}}

{profile}

Gap summary: {gap_summary}

Available courses:
{catalog_text}

Select 3 courses. Use ONLY the exact titles and URLs from the list above."""
