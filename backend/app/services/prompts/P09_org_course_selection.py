"""P09 — Org Course Selection: select best courses from catalog for the whole org.

Pipeline stage: on-demand (POST /learning/recommend-org)
Called from: learning.py router → recommend_org()
Model: gpt-4o-mini (Step 2 of 2, after P08)

The catalog includes OpenAI Academy videos and custom courses uploaded by the organisation.
"""

SYSTEM = "You are an L&D analyst selecting the most relevant training courses for an organisation."

USER = """You are an L&D analyst. Select the most relevant courses for this org.
The list includes OpenAI Academy videos and [Custom] courses uploaded by the organisation.
Return JSON: {{"recommended_courses": [{{"course_name": "exact title from list", \
"url": "exact url from list", "category": "tag from list", \
"reasoning": "evidence-backed reason tied to org stats", "priority": 1}}]}}

{org_profile}

Identified skill gaps: {skill_gaps}

Available courses:
{catalog_text}

Select the best 3 courses. Use ONLY the exact titles and URLs from the list above."""
