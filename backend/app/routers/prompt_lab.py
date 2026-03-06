"""Prompt Lab router — dev tool for testing KPI prompts against sample GPTs."""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.database import async_session
from app.encryption import decrypt
from app.models.models import Configuration
from app.services.prompt_lab_samples import PROMPT_LAB_SAMPLES
from app.services.semantic_enricher import KPI_PROMPTS, SemanticEnricher

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/prompt-lab", tags=["prompt-lab"])


# ── Schemas ────────────────────────────────────────────────────────────────

class KPIInfo(BaseModel):
    name: str
    prompt: str


class EnrichRequest(BaseModel):
    gpt_sample: dict
    kpi_name: str
    prompt_override: str | None = None


class EnrichResult(BaseModel):
    result: dict
    tokens_used: int
    latency_ms: float


class EnrichAllRequest(BaseModel):
    gpt_sample: dict
    prompt_overrides: dict[str, str] | None = None


class EnrichAllResult(BaseModel):
    results: dict[str, Any]
    total_tokens: int
    total_latency_ms: float


# ── Helper ─────────────────────────────────────────────────────────────────

async def _get_enricher() -> SemanticEnricher:
    async with async_session() as db:
        result = await db.execute(select(Configuration).where(Configuration.id == 1))
        config = result.scalar_one_or_none()
    if not config or not config.openai_api_key:
        raise HTTPException(status_code=400, detail="No OpenAI API key configured. Set it in Step 1.")
    openai_key = decrypt(config.openai_api_key)
    model = config.classification_model or "gpt-4o-mini"
    return SemanticEnricher(openai_key, model)


# ── Routes ─────────────────────────────────────────────────────────────────

@router.get("/samples")
async def get_samples() -> list[dict]:
    """Return the list of sample GPTs available for testing."""
    return [
        {
            "id": s["id"],
            "name": s["name"],
            "description": s["description"],
            "tools": s.get("tools", []),
            "builder_categories": s.get("builder_categories", []),
            "owner_email": s.get("owner_email"),
        }
        for s in PROMPT_LAB_SAMPLES
    ]


@router.get("/samples/{sample_id}")
async def get_sample(sample_id: str) -> dict:
    """Return a single sample GPT including full instructions."""
    for s in PROMPT_LAB_SAMPLES:
        if s["id"] == sample_id:
            return s
    raise HTTPException(status_code=404, detail=f"Sample '{sample_id}' not found")


@router.get("/kpis")
async def get_kpis() -> list[KPIInfo]:
    """Return all KPI names and their current prompt text."""
    return [KPIInfo(name=name, prompt=prompt) for name, prompt in KPI_PROMPTS.items()]


@router.post("/enrich")
async def enrich_single(req: EnrichRequest) -> EnrichResult:
    """Run a single KPI against a GPT sample. Supports prompt override."""
    if req.kpi_name not in KPI_PROMPTS:
        raise HTTPException(status_code=400, detail=f"Unknown KPI: {req.kpi_name}")

    enricher = await _get_enricher()
    try:
        result, tokens, latency_ms = await enricher.run_single_kpi(
            req.kpi_name,
            req.gpt_sample,
            req.prompt_override,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return EnrichResult(result=result, tokens_used=tokens, latency_ms=latency_ms)


@router.post("/enrich-all")
async def enrich_all(req: EnrichAllRequest) -> EnrichAllResult:
    """Run all KPIs against a GPT sample. Supports per-KPI prompt overrides."""
    enricher = await _get_enricher()
    overrides = req.prompt_overrides or {}

    import asyncio
    import time

    async def _run_one(kpi_name: str) -> tuple[str, dict, int, float]:
        prompt_override = overrides.get(kpi_name)
        try:
            result, tokens, latency = await enricher.run_single_kpi(
                kpi_name, req.gpt_sample, prompt_override
            )
        except Exception as e:
            result = {"error": str(e)}
            tokens = 0
            latency = 0.0
        return kpi_name, result, tokens, latency

    tasks = [_run_one(name) for name in KPI_PROMPTS]
    raw = await asyncio.gather(*tasks)

    results: dict[str, Any] = {}
    total_tokens = 0
    total_latency = 0.0
    for kpi_name, result, tokens, latency in raw:
        results[kpi_name] = {
            "result": result,
            "tokens_used": tokens,
            "latency_ms": round(latency, 1),
        }
        total_tokens += tokens
        total_latency += latency

    return EnrichAllResult(
        results=results,
        total_tokens=total_tokens,
        total_latency_ms=round(total_latency, 1),
    )
