"""P05 — Conversation Topic Analysis: extract top topics from user messages (anonymous).

Pipeline stage: Stage 3 of Conversation Pipeline (topic analysis, privacy level ≥ 2)
Called from: conversation_pipeline._analyze_topics_for_asset()
Model: gpt-4o-mini

Identity is stripped from messages before this call — no PII reaches the LLM.
"""

USER = """Analyze these user messages sent to an AI assistant and extract the top 5 topics.

Messages:
{messages_text}

Return ONLY valid JSON array with exactly this structure:
[
  {{"topic": "string", "pct": 0.0, "example_phrases": ["phrase1", "phrase2"]}}
]

Rules:
- pct values must sum to 100.0
- topic names must be concise (2-5 words)
- include only 5 topics maximum
- return ONLY the JSON array, no other text"""
