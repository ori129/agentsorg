"""P12 — Business Process Normalization: merge variant BP names into canonical forms.

Pipeline stage: Stage 5 post-enrichment normalization
Called from: SemanticEnricher.normalize_business_processes()
Model: gpt-4o-mini

Single call after all assets are enriched — normalizes all extracted business_process
strings into consistent Title Case canonical names.
"""

USER = """You are normalizing business process names extracted by an AI from analyzing company GPTs.

The following {n} process names were extracted. Many may refer to the same underlying process \
with slightly different wording, capitalization, or level of detail.

Extracted names:
{values_block}

Task: Return a JSON object mapping each original name (exactly as shown) to its canonical name.

Rules:
- Merge names that describe the same process into one canonical name
- Use Title Case (e.g. "Lead Qualification", "Contract Review")
- Keep canonical names short and clear: 2–4 words preferred
- Do NOT merge genuinely different processes
- Every input key must appear in the output

Return JSON only: {{"original name": "Canonical Name", ...}}"""
