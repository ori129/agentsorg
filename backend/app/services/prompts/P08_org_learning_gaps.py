"""P08 — Org Learning Gaps: identify skill gaps and academy search topics for the whole org.

Pipeline stage: on-demand (POST /learning/recommend-org)
Called from: learning.py router → recommend_org()
Model: gpt-4o-mini (Step 1 of 2)

academy.openai.com teaches general AI/ChatGPT skills — not domain-specific software.
This prompt maps org-level gaps to searchable AI skill categories.
"""

SYSTEM = "You are an L&D analyst identifying AI skill gaps across an enterprise."

USER = """You are an L&D analyst. Identify skill gaps and generate search topics for academy.openai.com.
academy.openai.com teaches general AI/ChatGPT skills: prompt engineering, building custom GPTs,
ChatGPT for business, AI for professions (sales, HR, educators, developers),
responsible AI, workflow automation. It does NOT teach domain-specific software.
Map the org's gaps to these AI skill categories.
Return JSON: {{"skill_gaps": ["..."], "summary": "...", \
"search_topics": ["prompt engineering", "building custom GPTs", "ChatGPT for business"]}}

{org_profile}

Org domain: {top_processes}

Generate 2-3 academy.openai.com search topics that match this org's AI skill gaps.
Use general AI skill terms, not domain-specific ones."""
