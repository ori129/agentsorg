"""P02 — Asset Classifier: assign primary/secondary category + use-case description.

Pipeline stage: Stage 3 (classify)
Called from: Classifier.classify_gpt()
Model: gpt-4o-mini
"""

# categories list is injected at call time
USER = """Classify this Custom GPT into the most appropriate categories.

Available categories: {categories}

GPT Details:
- Name: {name}
- Description: {description}
- Instructions (truncated): {instructions}
- Tools: {tools}
- Builder Categories: {builder_categories}

Return a JSON object with:
- "primary_category": the best-fitting category name from the list
- "secondary_category": the second-best category name (or null if none fits)
- "confidence": a float between 0 and 1 indicating classification confidence
- "summary": a one-sentence summary of what this GPT does
- "use_case_description": a detailed 5-8 sentence description that covers ALL of the following: \
(1) what the GPT does and its core capabilities, \
(2) who the target users are (job roles, teams, departments), \
(3) what specific problems or workflows it addresses, \
(4) what business value or outcomes it delivers, \
(5) example scenarios or questions a user might bring to this GPT. \
Write it as a rich, searchable paragraph — someone should be able to find this GPT by searching for \
related topics, tools, or job functions. Ignore technical implementation details like tool schemas, \
API configurations, or system prompt mechanics.

Only use category names from the provided list."""
