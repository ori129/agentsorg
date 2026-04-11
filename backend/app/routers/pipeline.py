import asyncio
import difflib
import json
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from openai import AsyncOpenAI
from sqlalchemy import func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth_deps import require_auth, require_leader, require_system_admin
from app.database import get_db
from app.encryption import decrypt
from app.models.models import (
    AssetUsageInsight,
    Category,
    Configuration,
    GPT,
    GptScoreHistory,
    PipelineLogEntry,
    SyncLog,
    WorkflowAnalysisCache,
    WorkspaceRecommendation,
    WorkspaceUser,
)
from app.schemas.schemas import (
    CategoryCount,
    GPTRead,
    GPTSearchResult,
    GptScoreHistoryPoint,
    PipelineLogEntryRead,
    PipelineStatus,
    PipelineSummary,
    PortfolioTrendPoint,
    SyncConfigPatch,
    SyncConfigRead,
    SyncLogRead,
    WorkflowAssetRef,
    WorkflowCoverageItem,
    WorkspaceRecommendationRead,
)
from app.services.pipeline import get_pipeline_status, run_pipeline

_STOP_WORDS = {
    "i",
    "im",
    "i'm",
    "a",
    "an",
    "the",
    "and",
    "or",
    "to",
    "for",
    "looking",
    "find",
    "help",
    "me",
    "my",
    "want",
    "need",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "have",
    "has",
    "do",
    "does",
    "will",
    "would",
    "could",
    "should",
    "can",
    "that",
    "this",
    "with",
    "by",
    "at",
    "of",
    "in",
    "on",
    "from",
    "as",
    "it",
    "who",
    "how",
    "what",
    "when",
    "where",
    "which",
    "agent",
    "gpt",
    "tool",
    "assistant",
    "something",
    "some",
    "any",
    "use",
    "used",
    "using",
    "get",
    "give",
    "make",
    "create",
    "define",
    "like",
    "just",
    "also",
    "very",
    "really",
    "about",
}


def _extract_keywords(query: str) -> list[str]:
    words = re.findall(r"[a-z]+", query.lower())
    return [w for w in words if w not in _STOP_WORDS and len(w) >= 3]


router = APIRouter(tags=["pipeline"])


@router.post("/pipeline/run")
async def start_pipeline(
    _: WorkspaceUser = Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
):
    from app.services.demo_state import is_demo_mode

    status = get_pipeline_status()
    if status["running"]:
        raise HTTPException(status_code=409, detail="Pipeline is already running")
    if not is_demo_mode():
        config = await db.get(Configuration, 1)
        if not config or not config.workspace_id:
            raise HTTPException(
                status_code=400,
                detail="Workspace ID not configured. Go to Step 1 (API Configuration) and enter your OpenAI Workspace ID before running the pipeline.",
            )
        if not config.compliance_api_key:
            raise HTTPException(
                status_code=400,
                detail="No Compliance API key configured. Go to Step 1 (API Configuration) and add your OpenAI Compliance API key before running the pipeline.",
            )
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
async def get_status(
    _: WorkspaceUser = Depends(require_leader),
    db: AsyncSession = Depends(get_db),
):
    return get_pipeline_status()


@router.get("/pipeline/logs/{sync_log_id}", response_model=list[PipelineLogEntryRead])
async def get_logs(
    sync_log_id: int,
    _: WorkspaceUser = Depends(require_leader),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PipelineLogEntry)
        .where(PipelineLogEntry.sync_log_id == sync_log_id)
        .order_by(PipelineLogEntry.id)
    )
    return result.scalars().all()


@router.get("/pipeline/summary", response_model=PipelineSummary)
async def get_summary(
    _: WorkspaceUser = Depends(require_leader),
    db: AsyncSession = Depends(get_db),
):
    # Get last completed sync
    result = await db.execute(
        select(SyncLog)
        .where(SyncLog.status.in_(["completed", "failed"]))
        .order_by(SyncLog.finished_at.desc())
        .limit(1)
    )
    last_sync = result.scalar_one_or_none()

    # Count all assets and split by type
    total_result = await db.execute(select(func.count(GPT.id)))
    total = total_result.scalar() or 0
    gpt_count_result = await db.execute(
        select(func.count(GPT.id)).where(GPT.asset_type != "project")
    )
    gpt_count = gpt_count_result.scalar() or 0
    project_count_result = await db.execute(
        select(func.count(GPT.id)).where(GPT.asset_type == "project")
    )
    project_count = project_count_result.scalar() or 0

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

    # Score stats — assets that have been assessed
    scored_result = await db.execute(select(GPT).where(GPT.quality_score.is_not(None)))
    scored = scored_result.scalars().all()
    scores_assessed = len(scored)

    avg_quality = (
        sum(g.quality_score for g in scored) / scores_assessed
        if scores_assessed
        else None
    )
    avg_adoption = (
        sum(g.adoption_score for g in scored if g.adoption_score is not None)
        / scores_assessed
        if scores_assessed
        else None
    )
    avg_risk = (
        sum(g.risk_score for g in scored if g.risk_score is not None) / scores_assessed
        if scores_assessed
        else None
    )

    champions = sum(
        1
        for g in scored
        if (g.quality_score or 0) >= 60 and (g.adoption_score or 0) >= 60
    )
    hidden_gems = sum(
        1
        for g in scored
        if (g.quality_score or 0) >= 60 and (g.adoption_score or 0) < 60
    )
    scaled_risk = sum(
        1
        for g in scored
        if (g.quality_score or 0) < 60 and (g.adoption_score or 0) >= 60
    )
    retirement_candidates = sum(
        1
        for g in scored
        if (g.quality_score or 0) < 60 and (g.adoption_score or 0) < 60
    )

    # Ghost assets: shared with ≥5 users but zero conversations
    ghost_result = await db.execute(
        select(func.count(GPT.id)).where(
            GPT.conversation_count == 0,
            GPT.shared_user_count >= 5,
        )
    )
    ghost_assets = ghost_result.scalar() or 0

    # Workflow coverage counts from latest cache
    wf_cache_result = await db.execute(
        select(WorkflowAnalysisCache)
        .order_by(WorkflowAnalysisCache.generated_at.desc())
        .limit(1)
    )
    wf_cache = wf_cache_result.scalar_one_or_none()
    workflows_covered = 0
    workflow_gaps = 0
    if wf_cache and wf_cache.workflow_items:
        for wf in wf_cache.workflow_items:
            if isinstance(wf, dict):
                if wf.get("status") == "covered":
                    workflows_covered += 1
                elif wf.get("status") == "intent_gap":
                    workflow_gaps += 1

    return PipelineSummary(
        total_gpts=last_sync.total_gpts_found if last_sync else 0,
        filtered_gpts=total,
        classified_gpts=last_sync.gpts_classified if last_sync else 0,
        embedded_gpts=last_sync.gpts_embedded if last_sync else 0,
        gpt_count=gpt_count,
        project_count=project_count,
        categories_used=categories_used,
        last_sync=SyncLogRead.model_validate(last_sync) if last_sync else None,
        scores_assessed=scores_assessed,
        avg_quality_score=round(avg_quality, 1) if avg_quality is not None else None,
        avg_adoption_score=round(avg_adoption, 1) if avg_adoption is not None else None,
        avg_risk_score=round(avg_risk, 1) if avg_risk is not None else None,
        champions=champions,
        hidden_gems=hidden_gems,
        scaled_risk=scaled_risk,
        retirement_candidates=retirement_candidates,
        ghost_assets=ghost_assets,
        workflows_covered=workflows_covered,
        workflow_gaps=workflow_gaps,
    )


@router.get("/pipeline/recommendations", response_model=WorkspaceRecommendationRead)
async def get_recommendations(
    _: WorkspaceUser = Depends(require_leader),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkspaceRecommendation)
        .order_by(WorkspaceRecommendation.generated_at.desc())
        .limit(1)
    )
    rec = result.scalar_one_or_none()
    if not rec:
        raise HTTPException(
            status_code=404,
            detail="No recommendations generated yet. Run the pipeline first.",
        )
    return rec


@router.get("/pipeline/gpts", response_model=list[GPTRead])
async def list_gpts(
    _: WorkspaceUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(GPT).order_by(GPT.created_at.desc()))
    gpts = result.scalars().all()

    cat_result = await db.execute(select(Category))
    cat_lookup = {c.id: c.name for c in cat_result.scalars().all()}

    return [_gpt_to_read(g, cat_lookup) for g in gpts]


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
        asset_type=g.asset_type,
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
        purpose_fingerprint=g.purpose_fingerprint,
        # Conversation stats
        conversation_count=g.conversation_count,
        last_conversation_at=g.last_conversation_at,
        # LLM-assessed composite scores
        quality_score=g.quality_score,
        quality_score_rationale=g.quality_score_rationale,
        quality_main_strength=g.quality_main_strength,
        quality_main_weakness=g.quality_main_weakness,
        adoption_score=g.adoption_score,
        adoption_score_rationale=g.adoption_score_rationale,
        adoption_signal=g.adoption_signal,
        adoption_barrier=g.adoption_barrier,
        risk_score=g.risk_score,
        risk_score_rationale=g.risk_score_rationale,
        risk_primary_driver=g.risk_primary_driver,
        risk_urgency=g.risk_urgency,
        quadrant_label=g.quadrant_label,
        top_action=g.top_action,
        score_confidence=g.score_confidence,
        scores_assessed_at=g.scores_assessed_at,
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
        fields = " ".join(
            filter(
                None,
                [
                    g.name,
                    g.description,
                    g.use_case_description,
                    g.llm_summary,
                    g.business_process,
                    g.intended_audience,
                ],
            )
        ).lower()
        return sum(1 for kw in keywords if kw in fields)

    # Only return GPTs that actually matched at least one keyword
    scored = [(g, _score(g)) for g in raw]
    matched = [(g, s) for g, s in scored if s > 0]
    matched.sort(key=lambda x: x[1], reverse=True)
    return [g for g, _ in matched[:40]]


@router.get("/pipeline/search", response_model=list[GPTSearchResult])
async def search_gpts(
    q: str = Query(..., min_length=1),
    _: WorkspaceUser = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
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
                    "ORDER BY embedding <=> :vec::vector "
                    "LIMIT 20"
                ).bindparams(vec=vec_str)
            )
            top_ids = [row[0] for row in vec_result.fetchall()]
            if top_ids:
                gpt_result = await db.execute(select(GPT).where(GPT.id.in_(top_ids)))
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
            f'An employee described their need: "{q}"\n\n'
            f"Here are {len(candidates)} GPTs available in the company:\n\n"
            + "\n".join(gpt_summaries)
            + "\n\nReturn a JSON array of the best matching GPTs for this employee's need. "
            "Include only GPTs that are genuinely relevant (match_score >= 40). Omit irrelevant ones. "
            "For each match, return:\n"
            "  index: the [N] index from above\n"
            "  reasoning: 1-2 sentences explaining exactly why this GPT fits their need\n"
            '  confidence: "high" | "medium" | "low"\n'
            "  match_score: integer 0-100 (how precisely it matches the employee's stated need)\n\n"
            'Return JSON only: [{"index": 0, "reasoning": "...", "confidence": "high", "match_score": 92}, ...]'
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
                out.append(
                    GPTSearchResult(
                        **base.model_dump(),
                        reasoning=item.get("reasoning"),
                        confidence=item.get("confidence"),
                        match_score=score,
                    )
                )
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
        fields = " ".join(
            filter(
                None,
                [
                    g.name,
                    g.description,
                    g.use_case_description,
                    g.llm_summary,
                    g.business_process,
                    g.intended_audience,
                ],
            )
        ).lower()
        hits = sum(1 for kw in keywords_for_score if kw in fields)
        return int(round(hits / n_kw * 75))  # cap at 75 — keyword match, not semantic

    scored_fallback = [(g, _kw_match_score(g)) for g in candidates[:20]]
    return [
        GPTSearchResult(**_gpt_to_read(g, cat_lookup).model_dump(), match_score=s)
        for g, s in scored_fallback
        if s > 0
    ]


@router.get("/pipeline/history", response_model=list[SyncLogRead])
async def get_history(
    _: WorkspaceUser = Depends(require_leader),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SyncLog).order_by(SyncLog.started_at.desc()).limit(20)
    )
    return result.scalars().all()


@router.get("/pipeline/sync-config", response_model=SyncConfigRead)
async def get_sync_config(
    _: WorkspaceUser = Depends(require_leader),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Configuration).where(Configuration.id == 1))
    config = result.scalar_one_or_none()
    if not config:
        return SyncConfigRead(auto_sync_enabled=False, auto_sync_interval_hours=24)
    return config


@router.patch("/pipeline/sync-config", response_model=SyncConfigRead)
async def patch_sync_config(
    body: SyncConfigPatch,
    _: WorkspaceUser = Depends(require_system_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Configuration).where(Configuration.id == 1))
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=404, detail="Pipeline not configured yet")
    if body.auto_sync_enabled is not None:
        config.auto_sync_enabled = body.auto_sync_enabled
    if body.auto_sync_interval_hours is not None:
        config.auto_sync_interval_hours = body.auto_sync_interval_hours
    await db.commit()
    await db.refresh(config)
    return config


@router.get("/pipeline/trend", response_model=list[PortfolioTrendPoint])
async def get_portfolio_trend(
    _: WorkspaceUser = Depends(require_leader),
    db: AsyncSession = Depends(get_db),
):
    """Returns one data point per completed pipeline run with KPI snapshots.
    Powers the Portfolio Health timeline chart.
    """
    result = await db.execute(
        select(SyncLog)
        .where(SyncLog.status == "completed")
        .order_by(SyncLog.finished_at.asc())
        .limit(50)
    )
    logs = result.scalars().all()
    return [
        PortfolioTrendPoint(
            sync_log_id=sl.id,
            synced_at=sl.finished_at,
            avg_quality_score=sl.avg_quality_score,
            avg_adoption_score=sl.avg_adoption_score,
            avg_risk_score=sl.avg_risk_score,
            champion_count=sl.champion_count or 0,
            hidden_gem_count=sl.hidden_gem_count or 0,
            scaled_risk_count=sl.scaled_risk_count or 0,
            retirement_count=sl.retirement_count or 0,
            ghost_asset_count=sl.ghost_asset_count or 0,
            high_risk_count=sl.high_risk_count or 0,
            total_asset_count=sl.total_asset_count or 0,
        )
        for sl in logs
    ]


def _fuzzy_match_workflow(
    topic: str, workflow_names: list[str], threshold: float = 0.52
) -> str | None:
    """Return the best-matching workflow name for a topic string, or None if no match."""
    topic_lower = topic.lower()
    best_ratio = 0.0
    best_match = None
    for wf in workflow_names:
        # Bidirectional SequenceMatcher ratio
        ratio = difflib.SequenceMatcher(None, topic_lower, wf.lower()).ratio()
        # Keyword overlap fallback: count shared meaningful words
        topic_words = set(re.findall(r"\b\w{4,}\b", topic_lower))
        wf_words = set(re.findall(r"\b\w{4,}\b", wf.lower()))
        overlap = topic_words & wf_words
        keyword_boost = 0.15 * len(overlap) if overlap else 0.0
        combined = ratio + keyword_boost
        if combined > best_ratio:
            best_ratio = combined
            best_match = wf
    return best_match if best_ratio >= threshold else None


@router.get("/pipeline/workflows", response_model=list[WorkflowCoverageItem])
async def get_workflow_coverage(
    _: WorkspaceUser = Depends(require_leader),
    db: AsyncSession = Depends(get_db),
):
    """Returns workflow coverage analysis: covered, ghost, and intent-gap workflows.

    Three states per workflow:
    - covered: asset(s) exist with this business_process + conversation activity
    - ghost: asset(s) exist but zero conversation uptake
    - intent_gap: conversation topics signal demand with no matching asset
    """
    # Load all GPTs with a business_process
    gpt_result = await db.execute(select(GPT).where(GPT.business_process.is_not(None)))
    gpts_with_bp = gpt_result.scalars().all()

    # Group GPTs by canonical business_process
    bp_to_assets: dict[str, list[GPT]] = {}
    for g in gpts_with_bp:
        bp = (g.business_process or "").strip()
        if bp:
            bp_to_assets.setdefault(bp, []).append(g)

    # Load all AssetUsageInsight with top_topics
    insight_result = await db.execute(
        select(AssetUsageInsight).where(AssetUsageInsight.top_topics.is_not(None))
    )
    insights = insight_result.scalars().all()

    # Aggregate all topics across all insights (deduplicated by topic name)
    all_topics: dict[
        str, dict
    ] = {}  # topic_name -> {topic, pct_sum, count, example_phrases}
    for insight in insights:
        for t in insight.top_topics or []:
            name = (t.get("topic") or "").strip()
            if not name:
                continue
            if name not in all_topics:
                all_topics[name] = {
                    "topic": name,
                    "pct_sum": 0.0,
                    "count": 0,
                    "example_phrases": t.get("example_phrases") or [],
                }
            all_topics[name]["pct_sum"] += t.get("pct", 0.0)
            all_topics[name]["count"] += 1
            # Collect unique example phrases
            for ph in t.get("example_phrases") or []:
                if ph not in all_topics[name]["example_phrases"]:
                    all_topics[name]["example_phrases"].append(ph)

    known_workflows = list(bp_to_assets.keys())

    # Map each topic to a known workflow (or flag as gap)
    workflow_intent_signals: dict[str, list[dict]] = {bp: [] for bp in known_workflows}
    gap_topics: dict[str, dict] = {}  # gap workflow name → aggregated topic data

    for topic_name, topic_data in all_topics.items():
        matched_wf = _fuzzy_match_workflow(topic_name, known_workflows)
        if matched_wf:
            workflow_intent_signals[matched_wf].append(
                {
                    "topic": topic_name,
                    "pct": round(
                        topic_data["pct_sum"] / max(topic_data["count"], 1), 1
                    ),
                    "example_phrases": topic_data["example_phrases"][:3],
                }
            )
        else:
            # This topic has no matching workflow asset — potential gap
            gap_topics[topic_name] = topic_data

    # Build result list: covered/ghost workflows first, then intent gaps
    items: list[WorkflowCoverageItem] = []

    for bp, assets in sorted(bp_to_assets.items()):
        total_convs = sum(g.conversation_count or 0 for g in assets)
        status = "covered" if total_convs > 0 else "ghost"
        asset_refs = [
            WorkflowAssetRef(
                id=g.id,
                name=g.name,
                conversation_count=g.conversation_count or 0,
                quadrant_label=g.quadrant_label,
            )
            for g in sorted(
                assets, key=lambda g: g.conversation_count or 0, reverse=True
            )
        ]
        signals = workflow_intent_signals.get(bp, [])
        items.append(
            WorkflowCoverageItem(
                name=bp,
                status=status,
                asset_count=len(assets),
                conversation_count=total_convs,
                assets=asset_refs,
                intent_signals=signals,
                example_phrases=[],
            )
        )

    # Deduplicate gap topics: skip if they weakly match a known workflow (lower threshold)
    for topic_name, topic_data in gap_topics.items():
        # Skip very generic topics
        if topic_name.lower() in {
            "general assistance",
            "summarization",
            "research",
            "documentation",
        }:
            continue
        all_phrases = topic_data["example_phrases"][:4]
        items.append(
            WorkflowCoverageItem(
                name=topic_name,
                status="intent_gap",
                asset_count=0,
                conversation_count=0,
                assets=[],
                intent_signals=[
                    {
                        "topic": topic_name,
                        "pct": round(
                            topic_data["pct_sum"] / max(topic_data["count"], 1), 1
                        ),
                        "example_phrases": all_phrases,
                    }
                ],
                example_phrases=all_phrases,
            )
        )

    # Pull latest cached LLM reasoning and inject into items
    cache_result = await db.execute(
        select(WorkflowAnalysisCache)
        .order_by(WorkflowAnalysisCache.generated_at.desc())
        .limit(1)
    )
    cache = cache_result.scalar_one_or_none()
    if cache and cache.workflow_items:
        reasoning_map = {
            entry["name"]: entry
            for entry in cache.workflow_items
            if isinstance(entry, dict) and "name" in entry
        }
        for item in items:
            rec = reasoning_map.get(item.name)
            if rec:
                item.reasoning = rec.get("reasoning")
                item.priority_action = rec.get("priority_action")
                item.priority_level = rec.get("priority_level")

    # Sort: covered → ghost → intent_gap, then by conversation_count desc within each
    status_order = {"covered": 0, "ghost": 1, "intent_gap": 2}
    items.sort(key=lambda x: (status_order[x.status], -x.conversation_count))
    return items


@router.get("/pipeline/gpt/{gpt_id}/history", response_model=list[GptScoreHistoryPoint])
async def get_gpt_score_history(
    gpt_id: str,
    _: WorkspaceUser = Depends(require_leader),
    db: AsyncSession = Depends(get_db),
):
    """Returns per-asset score history for the longitudinal asset journey view."""
    result = await db.execute(
        select(GptScoreHistory)
        .where(GptScoreHistory.gpt_id == gpt_id)
        .order_by(GptScoreHistory.synced_at.asc())
    )
    return result.scalars().all()
