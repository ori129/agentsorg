import asyncio
import json
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from openai import AsyncOpenAI
from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.encryption import decrypt
from app.models.models import Category, Configuration, GPT, PipelineLogEntry, SyncLog
from app.schemas.schemas import (
    CategoryCount,
    GPTRead,
    GPTSearchResult,
    PipelineLogEntryRead,
    PipelineStatus,
    PipelineSummary,
    SyncLogRead,
)
from app.services.pipeline import get_pipeline_status, run_pipeline

_STOP_WORDS = {
    "i", "im", "i'm", "a", "an", "the", "and", "or", "to", "for", "looking",
    "find", "help", "me", "my", "want", "need", "is", "are", "was", "were",
    "be", "been", "have", "has", "do", "does", "will", "would", "could",
    "should", "can", "that", "this", "with", "by", "at", "of", "in", "on",
    "from", "as", "it", "who", "how", "what", "when", "where", "which",
    "agent", "gpt", "tool", "assistant", "something", "some", "any",
    "use", "used", "using", "get", "give", "make", "create", "define",
    "like", "just", "also", "very", "really", "about",
}

def _extract_keywords(query: str) -> list[str]:
    words = re.findall(r"[a-z]+", query.lower())
    return [w for w in words if w not in _STOP_WORDS and len(w) >= 3]

router = APIRouter(tags=["pipeline"])


@router.post("/pipeline/run")
async def start_pipeline():
    status = get_pipeline_status()
    if status["running"]:
        raise HTTPException(status_code=409, detail="Pipeline is already running")
    # Start pipeline as a concurrent task (not BackgroundTasks which runs after response)
    asyncio.create_task(run_pipeline())
    # Wait for the pipeline to initialize and create sync_log
    for _ in range(20):
        await asyncio.sleep(0.1)
        status = get_pipeline_status()
        if status["sync_log_id"] is not None and status["running"]:
            break
    return get_pipeline_status()


@router.get("/pipeline/status", response_model=PipelineStatus)
async def get_status():
    return get_pipeline_status()


@router.get("/pipeline/logs/{sync_log_id}", response_model=list[PipelineLogEntryRead])
async def get_logs(sync_log_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PipelineLogEntry)
        .where(PipelineLogEntry.sync_log_id == sync_log_id)
        .order_by(PipelineLogEntry.id)
    )
    return result.scalars().all()


@router.get("/pipeline/summary", response_model=PipelineSummary)
async def get_summary(db: AsyncSession = Depends(get_db)):
    # Get last completed sync
    result = await db.execute(
        select(SyncLog)
        .where(SyncLog.status.in_(["completed", "failed"]))
        .order_by(SyncLog.finished_at.desc())
        .limit(1)
    )
    last_sync = result.scalar_one_or_none()

    # Count GPTs
    total_result = await db.execute(select(func.count(GPT.id)))
    total = total_result.scalar() or 0

    # Category distribution
    categories_used: list[CategoryCount] = []
    if total > 0:
        cat_result = await db.execute(
            select(Category.name, Category.color, func.count(GPT.id))
            .join(GPT, GPT.primary_category_id == Category.id)
            .group_by(Category.name, Category.color)
            .order_by(func.count(GPT.id).desc())
        )
        for name, color, count in cat_result.all():
            categories_used.append(CategoryCount(name=name, count=count, color=color))

    return PipelineSummary(
        total_gpts=last_sync.total_gpts_found if last_sync else 0,
        filtered_gpts=total,
        classified_gpts=last_sync.gpts_classified if last_sync else 0,
        embedded_gpts=last_sync.gpts_embedded if last_sync else 0,
        categories_used=categories_used,
        last_sync=SyncLogRead.model_validate(last_sync) if last_sync else None,
    )


@router.get("/pipeline/gpts", response_model=list[GPTRead])
async def list_gpts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(GPT).order_by(GPT.created_at.desc())
    )
    gpts = result.scalars().all()

    # Build category lookup for names
    cat_result = await db.execute(select(Category))
    cat_lookup = {c.id: c.name for c in cat_result.scalars().all()}

    out = []
    for g in gpts:
        out.append(GPTRead(
            id=g.id,
            name=g.name,
            description=g.description,
            owner_email=g.owner_email,
            builder_name=g.builder_name,
            created_at=g.created_at,
            visibility=g.visibility,
            shared_user_count=g.shared_user_count,
            tools=g.tools,
            builder_categories=g.builder_categories,
            conversation_starters=g.conversation_starters,
            primary_category=cat_lookup.get(g.primary_category_id),
            secondary_category=cat_lookup.get(g.secondary_category_id),
            classification_confidence=g.classification_confidence,
            llm_summary=g.llm_summary,
            use_case_description=g.use_case_description,
            instructions=g.instructions,
            # Semantic enrichment
            business_process=g.business_process,
            risk_flags=g.risk_flags,
            risk_level=g.risk_level,
            sophistication_score=g.sophistication_score,
            sophistication_rationale=g.sophistication_rationale,
            prompting_quality_score=g.prompting_quality_score,
            prompting_quality_rationale=g.prompting_quality_rationale,
            prompting_quality_flags=g.prompting_quality_flags,
            roi_potential_score=g.roi_potential_score,
            roi_rationale=g.roi_rationale,
            intended_audience=g.intended_audience,
            integration_flags=g.integration_flags,
            output_type=g.output_type,
            adoption_friction_score=g.adoption_friction_score,
            adoption_friction_rationale=g.adoption_friction_rationale,
            semantic_enriched_at=g.semantic_enriched_at,
        ))
    return out


def _gpt_to_read(g: GPT, cat_lookup: dict) -> GPTRead:
    return GPTRead(
        id=g.id,
        name=g.name,
        description=g.description,
        owner_email=g.owner_email,
        builder_name=g.builder_name,
        created_at=g.created_at,
        visibility=g.visibility,
        shared_user_count=g.shared_user_count,
        tools=g.tools,
        builder_categories=g.builder_categories,
        conversation_starters=g.conversation_starters,
        primary_category=cat_lookup.get(g.primary_category_id),
        secondary_category=cat_lookup.get(g.secondary_category_id),
        classification_confidence=g.classification_confidence,
        llm_summary=g.llm_summary,
        use_case_description=g.use_case_description,
        instructions=g.instructions,
        business_process=g.business_process,
        risk_flags=g.risk_flags,
        risk_level=g.risk_level,
        sophistication_score=g.sophistication_score,
        sophistication_rationale=g.sophistication_rationale,
        prompting_quality_score=g.prompting_quality_score,
        prompting_quality_rationale=g.prompting_quality_rationale,
        prompting_quality_flags=g.prompting_quality_flags,
        roi_potential_score=g.roi_potential_score,
        roi_rationale=g.roi_rationale,
        intended_audience=g.intended_audience,
        integration_flags=g.integration_flags,
        output_type=g.output_type,
        adoption_friction_score=g.adoption_friction_score,
        adoption_friction_rationale=g.adoption_friction_rationale,
        semantic_enriched_at=g.semantic_enriched_at,
    )


async def _keyword_candidates(q: str, db: AsyncSession) -> list[GPT]:
    """Keyword match — returns only GPTs where at least one keyword matches."""
    keywords = _extract_keywords(q)
    if not keywords:
        return []  # No recognisable keywords → no guessing

    conditions = [
        or_(
            GPT.name.ilike(f"%{kw}%"),
            GPT.description.ilike(f"%{kw}%"),
            GPT.use_case_description.ilike(f"%{kw}%"),
            GPT.llm_summary.ilike(f"%{kw}%"),
            GPT.business_process.ilike(f"%{kw}%"),
            GPT.intended_audience.ilike(f"%{kw}%"),
        )
        for kw in keywords
    ]
    result = await db.execute(
        select(GPT)
        .where(GPT.visibility != "just_me", or_(*conditions))
        .order_by(GPT.shared_user_count.desc())
        .limit(100)
    )
    raw = list(result.scalars().all())

    def _score(g: GPT) -> int:
        fields = " ".join(filter(None, [
            g.name, g.description, g.use_case_description,
            g.llm_summary, g.business_process, g.intended_audience,
        ])).lower()
        return sum(1 for kw in keywords if kw in fields)

    # Only return GPTs that actually matched at least one keyword
    scored = [(g, _score(g)) for g in raw]
    matched = [(g, s) for g, s in scored if s > 0]
    matched.sort(key=lambda x: x[1], reverse=True)
    return [g for g, _ in matched[:40]]


@router.get("/pipeline/search", response_model=list[GPTSearchResult])
async def search_gpts(q: str = Query(..., min_length=1), db: AsyncSession = Depends(get_db)):
    # Load config for OpenAI key
    cfg_result = await db.execute(select(Configuration))
    config = cfg_result.scalar_one_or_none()
    openai_key: str | None = None
    if config and config.openai_api_key:
        openai_key = decrypt(config.openai_api_key)

    cat_result = await db.execute(select(Category))
    cat_lookup = {c.id: c.name for c in cat_result.scalars().all()}

    # ── Step 1: candidate retrieval ─────────────────────────────────────────
    candidates: list[GPT] = []

    if openai_key:
        # Check how many GPTs have embeddings
        emb_count_result = await db.execute(
            select(func.count(GPT.id)).where(GPT.embedding.is_not(None))
        )
        emb_count = emb_count_result.scalar() or 0

        if emb_count > 0:
            # Embed the query and do pgvector cosine similarity search
            client = AsyncOpenAI(api_key=openai_key)
            emb_resp = await client.embeddings.create(
                input=q, model="text-embedding-3-small"
            )
            query_vec = emb_resp.data[0].embedding
            vec_str = "[" + ",".join(str(v) for v in query_vec) + "]"

            vec_result = await db.execute(
                text(
                    "SELECT id FROM gpts "
                    "WHERE visibility != 'just_me' AND embedding IS NOT NULL "
                    f"ORDER BY embedding <=> '{vec_str}'::vector "
                    "LIMIT 20"
                )
            )
            top_ids = [row[0] for row in vec_result.fetchall()]
            if top_ids:
                gpt_result = await db.execute(
                    select(GPT).where(GPT.id.in_(top_ids))
                )
                id_to_gpt = {g.id: g for g in gpt_result.scalars().all()}
                # Preserve similarity order
                candidates = [id_to_gpt[gid] for gid in top_ids if gid in id_to_gpt]

    if not candidates:
        candidates = await _keyword_candidates(q, db)

    if not candidates:
        return []

    # ── Step 2: LLM ranking + reasoning ────────────────────────────────────
    if openai_key and candidates:
        gpt_summaries = []
        for i, g in enumerate(candidates):
            summary_parts = [f"[{i}] {g.name}"]
            if g.intended_audience:
                summary_parts.append(f"Audience: {g.intended_audience}")
            if g.business_process:
                summary_parts.append(f"Process: {g.business_process}")
            if g.use_case_description:
                summary_parts.append(f"Use case: {g.use_case_description[:200]}")
            elif g.description:
                summary_parts.append(f"Description: {g.description[:200]}")
            if g.llm_summary:
                summary_parts.append(f"Summary: {g.llm_summary[:150]}")
            gpt_summaries.append(" | ".join(summary_parts))

        prompt = (
            f"An employee described their need: \"{q}\"\n\n"
            f"Here are {len(candidates)} GPTs available in the company:\n\n"
            + "\n".join(gpt_summaries)
            + "\n\nReturn a JSON array of the best matching GPTs for this employee's need. "
            "Include only GPTs that are genuinely relevant (match_score >= 40). Omit irrelevant ones. "
            "For each match, return:\n"
            "  index: the [N] index from above\n"
            "  reasoning: 1-2 sentences explaining exactly why this GPT fits their need\n"
            "  confidence: \"high\" | \"medium\" | \"low\"\n"
            "  match_score: integer 0-100 (how precisely it matches the employee's stated need)\n\n"
            "Return JSON only: [{\"index\": 0, \"reasoning\": \"...\", \"confidence\": \"high\", \"match_score\": 92}, ...]"
        )

        try:
            client = AsyncOpenAI(api_key=openai_key)
            resp = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.1,
                max_tokens=800,
            )
            raw = json.loads(resp.choices[0].message.content or "{}")
            # json_object always returns a dict. Handle all shapes:
            # {"results": [...]}  — wrapped list under any key
            # {"index": 0, ...}   — single match returned as flat object
            if isinstance(raw, list):
                ranked = raw
            elif "index" in raw:
                ranked = [raw]  # single match returned as flat dict
            else:
                ranked = next((v for v in raw.values() if isinstance(v, list)), [])

            out: list[GPTSearchResult] = []
            for item in ranked:
                idx = item.get("index")
                if idx is None or idx >= len(candidates):
                    continue
                score = item.get("match_score")
                if score is not None and score < 40:
                    continue  # LLM itself rated it irrelevant
                g = candidates[idx]
                base = _gpt_to_read(g, cat_lookup)
                out.append(GPTSearchResult(
                    **base.model_dump(),
                    reasoning=item.get("reasoning"),
                    confidence=item.get("confidence"),
                    match_score=score,
                ))
            if out:
                return out
            # LLM found no relevant matches — return nothing rather than a dump
            return []
        except Exception:
            pass  # fall through to keyword scoring below

    # No LLM available: compute a keyword relevance score and only return
    # GPTs that actually matched. Never return 0-score results.
    keywords_for_score = _extract_keywords(q)
    n_kw = len(keywords_for_score) or 1

    def _kw_match_score(g: GPT) -> int:
        fields = " ".join(filter(None, [
            g.name, g.description, g.use_case_description,
            g.llm_summary, g.business_process, g.intended_audience,
        ])).lower()
        hits = sum(1 for kw in keywords_for_score if kw in fields)
        return int(round(hits / n_kw * 75))  # cap at 75 — keyword match, not semantic

    scored_fallback = [
        (g, _kw_match_score(g)) for g in candidates[:20]
    ]
    return [
        GPTSearchResult(**_gpt_to_read(g, cat_lookup).model_dump(), match_score=s)
        for g, s in scored_fallback
        if s > 0
    ]


@router.get("/pipeline/history", response_model=list[SyncLogRead])
async def get_history(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SyncLog).order_by(SyncLog.started_at.desc()).limit(20)
    )
    return result.scalars().all()
