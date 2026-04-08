"""One-time Claude-powered purpose fingerprint generation.

POST /fingerprint/generate
  Reads all gpts, calls claude-haiku in batches of 50,
  writes purpose_fingerprint back to DB.
  Safe to re-run (skips assets that already have a fingerprint).

POST /fingerprint/generate?force=true
  Regenerates all fingerprints regardless.
"""

import asyncio
import json
import logging
import os

from fastapi import APIRouter, Query
from sqlalchemy import text

from app.database import async_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/fingerprint", tags=["fingerprint"])

MODEL = "claude-haiku-4-5-20251001"
BATCH_SIZE = 50

_SYSTEM = """You generate short, precise "purpose fingerprints" for enterprise AI tools.

A purpose fingerprint is a single sentence (max 15 words) that captures exactly what the tool does
at the workflow level — specific enough that two tools with the same fingerprint are genuine duplicates.

Rules:
- Start with a verb: "Summarizes", "Drafts", "Reviews", "Generates", "Analyzes", "Classifies", etc.
- Name the input and output: "Summarizes meeting transcripts into structured action items with owners"
- Be specific to the use case, not the domain: "Drafts cold outreach emails for sales prospects" not "Sales assistant"
- Do NOT include the tool name
- Do NOT add qualifiers like "enterprise", "professional", "AI-powered"
- If the tool is clearly experimental/placeholder (e.g. "test - ignore", "My GPT"), return: "Experimental placeholder with no defined purpose"
"""

_USER_TMPL = """Generate purpose fingerprints for these {n} AI tools. Return a JSON array with one object per tool in the same order.

Tools:
{tools_block}

Return format:
[
  {{"id": "...", "fingerprint": "..."}},
  ...
]

Return ONLY the JSON array, no explanation."""


async def _call_claude(assets: list[dict]) -> list[dict]:
    """Call Claude to generate fingerprints for a batch of assets."""
    try:
        import anthropic
    except ImportError:
        raise RuntimeError("anthropic package not installed")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY environment variable not set")

    client = anthropic.AsyncAnthropic(api_key=api_key)

    tools_block = "\n\n".join(
        f"ID: {a['id']}\nName: {a['name']}\nDescription: {a.get('description') or '—'}\nInstructions (first 300 chars): {(a.get('instructions') or '')[:300]}"
        for a in assets
    )
    prompt = _USER_TMPL.format(n=len(assets), tools_block=tools_block)

    message = await client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()
    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw)


_generation_status: dict = {"running": False, "done": 0, "total": 0, "error": None}


async def _run_generation(force: bool):
    global _generation_status
    _generation_status = {"running": True, "done": 0, "total": 0, "error": None}

    try:
        async with async_session() as db:
            if force:
                result = await db.execute(
                    text("SELECT id, name, description, instructions FROM gpts")
                )
            else:
                result = await db.execute(
                    text(
                        "SELECT id, name, description, instructions FROM gpts WHERE purpose_fingerprint IS NULL"
                    )
                )
            rows = result.fetchall()

        assets = [
            {"id": r[0], "name": r[1], "description": r[2], "instructions": r[3]}
            for r in rows
        ]
        _generation_status["total"] = len(assets)

        if not assets:
            _generation_status["running"] = False
            return

        # Process in batches
        for i in range(0, len(assets), BATCH_SIZE):
            batch = assets[i : i + BATCH_SIZE]
            try:
                results = await _call_claude(batch)
                fingerprint_map = {r["id"]: r["fingerprint"] for r in results}
            except Exception as e:
                logger.error(f"Claude batch {i // BATCH_SIZE + 1} failed: {e}")
                # Fall back: mark with placeholder so we can retry later
                fingerprint_map = {a["id"]: None for a in batch}

            async with async_session() as db:
                for asset in batch:
                    fp = fingerprint_map.get(asset["id"])
                    if fp:
                        await db.execute(
                            text(
                                "UPDATE gpts SET purpose_fingerprint = :fp WHERE id = :id"
                            ),
                            {"fp": fp, "id": asset["id"]},
                        )
                await db.commit()

            _generation_status["done"] += len(batch)
            logger.info(
                f"Fingerprints: {_generation_status['done']}/{_generation_status['total']}"
            )

    except Exception as e:
        _generation_status["error"] = str(e)
        logger.error(f"Fingerprint generation failed: {e}")
    finally:
        _generation_status["running"] = False


@router.post("/generate")
async def generate_fingerprints(force: bool = Query(default=False)):
    """Generate purpose fingerprints for all assets using Claude haiku."""
    if _generation_status["running"]:
        return {"message": "Already running", **_generation_status}
    asyncio.create_task(_run_generation(force))
    return {"message": "Fingerprint generation started"}


@router.get("/status")
async def fingerprint_status():
    return _generation_status


@router.get("/coverage")
async def fingerprint_coverage():
    async with async_session() as db:
        result = await db.execute(
            text("SELECT COUNT(*) total, COUNT(purpose_fingerprint) has_fp FROM gpts")
        )
        row = result.fetchone()
        return {
            "total": row[0],
            "has_fingerprint": row[1],
            "pct": round(row[1] / max(row[0], 1) * 100, 1),
        }
