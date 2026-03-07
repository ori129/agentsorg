from openai import AsyncOpenAI


class Embedder:
    def __init__(self, api_key: str, model: str = "text-embedding-3-small"):
        self._client = AsyncOpenAI(api_key=api_key)
        self._model = model

    def _build_text(self, gpt: dict, classification: dict | None = None) -> str:
        parts = [gpt.get("name", "")]
        if classification:
            use_case = classification.get("use_case_description", "")
            if use_case:
                parts.append(use_case)
            else:
                parts.append(classification.get("summary", ""))
            if classification.get("primary_category"):
                parts.append(classification["primary_category"])
            if classification.get("secondary_category"):
                parts.append(classification["secondary_category"])
        else:
            parts.append(gpt.get("description", "") or "")
        return "\n".join(p for p in parts if p)

    async def embed_batch(
        self,
        gpts: list[dict],
        classifications: list[dict | None] | None = None,
        batch_size: int = 100,
    ) -> list[list[float]]:
        if classifications is None:
            classifications = [None] * len(gpts)

        texts = [self._build_text(gpt, cls) for gpt, cls in zip(gpts, classifications)]

        all_embeddings: list[list[float]] = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            response = await self._client.embeddings.create(
                model=self._model, input=batch
            )
            batch_embeddings = [item.embedding for item in response.data]
            all_embeddings.extend(batch_embeddings)

        return all_embeddings
