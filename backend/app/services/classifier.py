import asyncio
import json

from openai import AsyncOpenAI

from app.models.models import Category


class Classifier:
    def __init__(self, api_key: str, model: str = "gpt-4o-mini", max_concurrent: int = 5):
        self._client = AsyncOpenAI(api_key=api_key)
        self._model = model
        self._semaphore = asyncio.Semaphore(max_concurrent)

    async def classify_gpt(
        self, gpt: dict, categories: list[Category], max_categories: int = 2
    ) -> dict:
        async with self._semaphore:
            cat_names = [c.name for c in categories if c.enabled]
            instructions_text = (gpt.get("instructions") or "")[:4000]
            tools = gpt.get("tools") or []
            builder_cats = gpt.get("builder_categories") or []

            prompt = f"""Classify this Custom GPT into the most appropriate categories.

Available categories: {', '.join(cat_names)}

GPT Details:
- Name: {gpt.get('name', 'Unknown')}
- Description: {gpt.get('description', 'N/A')}
- Instructions (truncated): {instructions_text}
- Tools: {json.dumps(tools)}
- Builder Categories: {json.dumps(builder_cats)}

Return a JSON object with:
- "primary_category": the best-fitting category name from the list
- "secondary_category": the second-best category name (or null if none fits)
- "confidence": a float between 0 and 1 indicating classification confidence
- "summary": a one-sentence summary of what this GPT does

Only use category names from the provided list."""

            response = await self._client.chat.completions.create(
                model=self._model,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.2,
            )

            return json.loads(response.choices[0].message.content)  # type: ignore[arg-type]

    async def classify_batch(
        self, gpts: list[dict], categories: list[Category], max_categories: int = 2
    ) -> list[dict]:
        tasks = [self.classify_gpt(gpt, categories, max_categories) for gpt in gpts]
        return await asyncio.gather(*tasks, return_exceptions=True)
