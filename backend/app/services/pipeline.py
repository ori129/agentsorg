import asyncio
import hashlib
import json
import logging
import traceback
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.encryption import decrypt
from app.models.models import (
    Category,
    Configuration,
    GPT,
    PipelineLogEntry,
    SyncLog,
)
from app.services.classifier import Classifier
from app.services.compliance_api import ComplianceAPIClient
from app.services.demo_state import is_demo_mode
from app.services.embedder import Embedder
from app.services.filter_engine import filter_gpts
from app.services.mock_classifier import MockClassifier
from app.services.mock_embedder import MockEmbedder
from app.services.mock_fetcher import MockComplianceAPIClient
from app.services.mock_semantic_enricher import MockSemanticEnricher
from app.services.semantic_enricher import SemanticEnricher

logger = logging.getLogger(__name__)

# LLM cost per token (USD) by model — input/output rates per 1M tokens
# Source: OpenAI pricing as of 2026-03
_MODEL_COSTS: dict[str, tuple[float, float]] = {
    "gpt-4o-mini": (0.15 / 1_000_000, 0.60 / 1_000_000),
    "gpt-4o": (2.50 / 1_000_000, 10.00 / 1_000_000),
    "gpt-4-turbo": (10.00 / 1_000_000, 30.00 / 1_000_000),
    "gpt-4": (30.00 / 1_000_000, 60.00 / 1_000_000),
    "gpt-3.5-turbo": (0.50 / 1_000_000, 1.50 / 1_000_000),
}
_DEFAULT_COST = _MODEL_COSTS["gpt-4o-mini"]


def _calculate_cost(model: str, tokens_input: int, tokens_output: int) -> float:
    input_rate, output_rate = _MODEL_COSTS.get(model, _DEFAULT_COST)
    return tokens_input * input_rate + tokens_output * output_rate


def _content_hash(gpt_data: dict) -> str:
    """Hash the fields that affect classification output."""
    parts = [
        gpt_data.get("name") or "",
        gpt_data.get("description") or "",
        gpt_data.get("instructions") or "",
        json.dumps(gpt_data.get("tools") or [], sort_keys=True),
        json.dumps(gpt_data.get("builder_categories") or [], sort_keys=True),
    ]
    return hashlib.sha256("|".join(parts).encode()).hexdigest()


_lock = asyncio.Lock()
_current_status: dict = {
    "running": False,
    "sync_log_id": None,
    "progress": 0.0,
    "stage": "idle",
}


def get_pipeline_status() -> dict:
    return dict(_current_status)


async def _log(db: AsyncSession, sync_log_id: int, level: str, message: str):
    # Always print to stdout
    log_fn = (
        logger.error
        if level == "error"
        else logger.warning
        if level == "warn"
        else logger.info
    )
    log_fn(f"[pipeline:{sync_log_id}] {message}")
    try:
        entry = PipelineLogEntry(sync_log_id=sync_log_id, level=level, message=message)
        db.add(entry)
        await db.commit()
    except Exception as e:
        logger.error(f"Failed to write pipeline log entry to DB: {e}")
        try:
            await db.rollback()
        except Exception:
            pass


async def run_pipeline():
    if _lock.locked():
        raise RuntimeError("Pipeline is already running")

    async with _lock:
        _current_status["running"] = True
        _current_status["progress"] = 0.0
        _current_status["stage"] = "initializing"
        logger.info("Pipeline starting...")

        async with async_session() as db:
            try:
                await _execute_pipeline(db)
            except Exception as e:
                logger.error(f"Pipeline failed with exception: {e}")
                logger.error(traceback.format_exc())
                try:
                    await db.rollback()
                except Exception:
                    pass
                if _current_status.get("sync_log_id"):
                    try:
                        await _log(
                            db,
                            _current_status["sync_log_id"],
                            "error",
                            f"Pipeline failed: {e}",
                        )
                        result = await db.execute(
                            select(SyncLog).where(
                                SyncLog.id == _current_status["sync_log_id"]
                            )
                        )
                        sync_log = result.scalar_one_or_none()
                        if sync_log:
                            sync_log.status = "failed"
                            sync_log.finished_at = datetime.now(timezone.utc)
                            sync_log.errors = [str(e)]
                            await db.commit()
                    except Exception as e2:
                        logger.error(f"Failed to update sync_log on error: {e2}")
            finally:
                _current_status["running"] = False
                _current_status["stage"] = "idle"
                logger.info("Pipeline finished.")


async def _execute_pipeline(db: AsyncSession):
    demo = is_demo_mode()

    # Load configuration
    result = await db.execute(select(Configuration).where(Configuration.id == 1))
    config = result.scalar_one_or_none()
    if not demo:
        if not config or not config.compliance_api_key:
            raise ValueError("Configuration not found or API key not set")

    # Create sync log
    sync_log = SyncLog(
        configuration_snapshot={
            "workspace_id": config.workspace_id if config else None,
            "include_all": config.include_all if config else True,
            "classification_enabled": config.classification_enabled
            if config
            else False,
            "demo_mode": demo,
        }
    )
    db.add(sync_log)
    await db.commit()
    await db.refresh(sync_log)
    _current_status["sync_log_id"] = sync_log.id

    await _log(db, sync_log.id, "info", "Pipeline started")

    # Step 1: Fetch GPTs
    _current_status["stage"] = "fetching"
    _current_status["progress"] = 5.0
    if demo:
        await _log(db, sync_log.id, "info", "[DEMO] Using mock data generator")
        client = MockComplianceAPIClient()
    else:
        await _log(db, sync_log.id, "info", "Fetching GPTs from Compliance API...")
        api_key = decrypt(config.compliance_api_key)
        client = ComplianceAPIClient(api_key, config.base_url)

    page_count = 0

    async def on_page(assets: list[dict], page: int):
        nonlocal page_count
        page_count = page
        await _log(
            db, sync_log.id, "info", f"Fetched page {page} ({len(assets)} assets)"
        )
        _current_status["progress"] = min(5.0 + page * 5, 30.0)

    workspace_id = (config.workspace_id or "") if config else ""
    try:
        # Fetch GPTs and Projects in parallel; continue if Projects fail (non-fatal)
        async def _fetch_projects_safe() -> list[dict]:
            if hasattr(client, "fetch_all_projects"):
                return await client.fetch_all_projects(workspace_id)
            return []

        gpt_results, project_results = await asyncio.gather(
            client.fetch_all_gpts(workspace_id, on_page),
            _fetch_projects_safe(),
            return_exceptions=True,
        )

        if isinstance(gpt_results, Exception):
            raise gpt_results  # GPTs are required — propagate

        all_gpts: list[dict] = gpt_results
        if isinstance(project_results, Exception):
            await _log(
                db,
                sync_log.id,
                "warn",
                f"Projects fetch failed (non-fatal, continuing with GPTs only): {project_results}",
            )
        else:
            all_gpts = all_gpts + list(project_results)
    finally:
        await client.close()

    gpt_count = sum(1 for a in all_gpts if a.get("asset_type", "gpt") == "gpt")
    project_count = sum(1 for a in all_gpts if a.get("asset_type") == "project")

    sync_log.total_gpts_found = len(all_gpts)
    await db.commit()
    await _log(
        db,
        sync_log.id,
        "info",
        f"Total assets found: {len(all_gpts)} ({gpt_count} GPTs, {project_count} Projects)",
    )

    # Log first asset for debugging
    if all_gpts:
        first = all_gpts[0]
        await _log(
            db,
            sync_log.id,
            "info",
            f"Sample asset: name={first.get('name')}, type={first.get('asset_type', 'gpt')}, "
            f"visibility={first.get('visibility')}, owner={first.get('owner_email')}, "
            f"shared_users={first.get('shared_user_count')}",
        )

    # Step 2: Filter
    _current_status["stage"] = "filtering"
    _current_status["progress"] = 35.0
    filtered_gpts = filter_gpts(all_gpts, config)
    sync_log.gpts_after_filter = len(filtered_gpts)
    await db.commit()
    await _log(
        db,
        sync_log.id,
        "info",
        f"GPTs after filtering: {len(filtered_gpts)} (excluded {len(all_gpts) - len(filtered_gpts)})",
    )

    # Snapshot existing GPTs for change detection
    from sqlalchemy.orm import selectinload

    existing_result = await db.execute(
        select(GPT).options(
            selectinload(GPT.primary_category),
            selectinload(GPT.secondary_category),
        )
    )
    prev_gpts = {g.id: g for g in existing_result.scalars().all()}

    # Compute content hashes and detect changes
    changed_indices = []
    unchanged_indices = []
    for i, gpt_data in enumerate(filtered_gpts):
        h = _content_hash(gpt_data)
        gpt_data["_content_hash"] = h
        prev = prev_gpts.get(gpt_data["id"])
        if prev and prev.content_hash == h and prev.primary_category_id is not None and prev.purpose_fingerprint is not None:
            unchanged_indices.append(i)
        else:
            changed_indices.append(i)

    await _log(
        db,
        sync_log.id,
        "info",
        f"Change detection: {len(changed_indices)} new/changed, "
        f"{len(unchanged_indices)} unchanged (will reuse cached results)",
    )

    # Step 3: Classify (if enabled)
    classification_enabled = demo or (
        config.classification_enabled if config else False
    )
    has_openai_key = demo or (config and config.openai_api_key)

    classifications: list[dict | None] = [None] * len(filtered_gpts)

    # Carry forward classifications for unchanged GPTs
    for idx in unchanged_indices:
        prev = prev_gpts[filtered_gpts[idx]["id"]]
        classifications[idx] = {
            "primary_category": prev.primary_category.name
            if prev.primary_category
            else None,
            "secondary_category": prev.secondary_category.name
            if prev.secondary_category
            else None,
            "confidence": prev.classification_confidence,
            "summary": prev.llm_summary,
            "use_case_description": prev.use_case_description,
        }

    if classification_enabled and has_openai_key and changed_indices:
        _current_status["stage"] = "classifying"
        _current_status["progress"] = 40.0
        await _log(
            db,
            sync_log.id,
            "info",
            "[DEMO] Using keyword-based classifier"
            if demo
            else f"Classifying {len(changed_indices)} GPTs...",
        )

        result_cats = await db.execute(
            select(Category).where(Category.enabled.is_(True))
        )
        categories = list(result_cats.scalars().all())

        if categories:
            if demo:
                classifier = MockClassifier()
            else:
                openai_key = decrypt(config.openai_api_key)
                classifier = Classifier(openai_key, config.classification_model)

            max_cats = config.max_categories_per_gpt if config else 2
            changed_gpts = [filtered_gpts[i] for i in changed_indices]
            results = await classifier.classify_batch(
                changed_gpts, categories, max_cats
            )

            classified_count = 0
            errors = []
            for ci, r in enumerate(results):
                idx = changed_indices[ci]
                if isinstance(r, Exception):
                    errors.append(
                        f"Classification error for {filtered_gpts[idx].get('name', 'unknown')}: {r}"
                    )
                    await _log(db, sync_log.id, "warn", errors[-1])
                else:
                    classifications[idx] = r
                    classified_count += 1

            sync_log.gpts_classified = classified_count + len(unchanged_indices)
            await db.commit()
            await _log(
                db,
                sync_log.id,
                "info",
                f"Classified {classified_count} GPTs ({len(unchanged_indices)} reused from cache)",
            )
            _current_status["progress"] = 65.0
        else:
            await _log(
                db,
                sync_log.id,
                "warn",
                "No enabled categories, skipping classification",
            )
    elif classification_enabled and has_openai_key and not changed_indices:
        sync_log.gpts_classified = len(unchanged_indices)
        await db.commit()
        await _log(
            db,
            sync_log.id,
            "info",
            f"All {len(unchanged_indices)} GPTs unchanged, reusing cached classifications",
        )
        _current_status["progress"] = 65.0
    else:
        await _log(db, sync_log.id, "info", "Classification disabled, skipping")

    # Step 3.5: Semantic Enrichment (if classification enabled and API key available)
    enrichments: list[dict | None] = [None] * len(filtered_gpts)

    # Carry forward enrichment for unchanged GPTs
    for idx in unchanged_indices:
        prev = prev_gpts[filtered_gpts[idx]["id"]]
        if prev.semantic_enriched_at:
            enrichments[idx] = {
                "business_process": prev.business_process,
                "risk_flags": prev.risk_flags,
                "risk_level": prev.risk_level,
                "sophistication_score": prev.sophistication_score,
                "sophistication_rationale": prev.sophistication_rationale,
                "prompting_quality_score": prev.prompting_quality_score,
                "prompting_quality_rationale": prev.prompting_quality_rationale,
                "prompting_quality_flags": prev.prompting_quality_flags,
                "roi_potential_score": prev.roi_potential_score,
                "roi_rationale": prev.roi_rationale,
                "intended_audience": prev.intended_audience,
                "integration_flags": prev.integration_flags,
                "output_type": prev.output_type,
                "adoption_friction_score": prev.adoption_friction_score,
                "adoption_friction_rationale": prev.adoption_friction_rationale,
                "semantic_enriched_at": prev.semantic_enriched_at.isoformat()
                if prev.semantic_enriched_at
                else None,
                "purpose_fingerprint": prev.purpose_fingerprint,
            }

    tokens_input = 0
    tokens_output = 0

    if classification_enabled and has_openai_key and changed_indices:
        _current_status["stage"] = "enriching"
        _current_status["progress"] = 65.0
        await _log(
            db,
            sync_log.id,
            "info",
            "[DEMO] Running mock semantic enrichment"
            if demo
            else f"Enriching {len(changed_indices)} changed GPTs...",
        )
        try:
            if demo:
                enricher = MockSemanticEnricher()
            else:
                openai_key = decrypt(config.openai_api_key)
                enricher = SemanticEnricher(openai_key, config.classification_model)
            changed_gpts_for_enrich = [filtered_gpts[i] for i in changed_indices]
            changed_cls_for_enrich = [classifications[i] for i in changed_indices]
            (
                changed_enrichments,
                batch_tokens_in,
                batch_tokens_out,
            ) = await enricher.enrich_batch(
                changed_gpts_for_enrich, changed_cls_for_enrich
            )
            tokens_input += batch_tokens_in
            tokens_output += batch_tokens_out
            for ci, enr in enumerate(changed_enrichments):
                enrichments[changed_indices[ci]] = enr
            enriched_count = sum(1 for e in enrichments if e is not None)
            await _log(
                db,
                sync_log.id,
                "info",
                f"Enriched {len(changed_indices)} GPTs ({len(unchanged_indices)} reused from cache, {enriched_count} total)",
            )
        except Exception as e:
            await _log(
                db, sync_log.id, "warn", f"Semantic enrichment failed (non-fatal): {e}"
            )
        _current_status["progress"] = 72.0
    elif classification_enabled and has_openai_key:
        _current_status["progress"] = 72.0
        await _log(
            db,
            sync_log.id,
            "info",
            "All GPTs unchanged, reusing cached enrichment data",
        )

    # Step 3.6: Normalize business process names (real mode only — demo strings are already consistent)
    if not demo and any(e and e.get("business_process") for e in enrichments):
        raw_processes = [
            e["business_process"]
            for e in enrichments
            if e and e.get("business_process")
        ]
        unique_count = len(set(p.strip().lower() for p in raw_processes))
        if unique_count > 1:
            await _log(
                db,
                sync_log.id,
                "info",
                f"Normalizing {unique_count} distinct business process names into canonical labels...",
            )
            try:
                openai_key = decrypt(config.openai_api_key)
                normalizer = SemanticEnricher(openai_key, config.classification_model)
                bp_mapping = await normalizer.normalize_business_processes(
                    raw_processes
                )
                canonical_count = len(set(bp_mapping.values()))
                for enr in enrichments:
                    if enr and enr.get("business_process"):
                        enr["business_process"] = bp_mapping.get(
                            enr["business_process"].strip(),
                            enr["business_process"].strip().title(),
                        )
                await _log(
                    db,
                    sync_log.id,
                    "info",
                    f"Normalized to {canonical_count} canonical process name(s)",
                )
            except Exception as e:
                await _log(
                    db,
                    sync_log.id,
                    "warn",
                    f"Business process normalization failed (non-fatal): {e}",
                )

    # Step 4: Embed (if classification enabled and API key available)
    embeddings: list[list[float] | None] = [None] * len(filtered_gpts)

    # Carry forward embeddings for unchanged GPTs
    for idx in unchanged_indices:
        prev = prev_gpts[filtered_gpts[idx]["id"]]
        if prev.embedding is not None:
            embeddings[idx] = list(prev.embedding)

    if classification_enabled and has_openai_key and changed_indices:
        _current_status["stage"] = "embedding"
        _current_status["progress"] = 75.0
        await _log(
            db,
            sync_log.id,
            "info",
            "[DEMO] Using deterministic embeddings"
            if demo
            else f"Generating embeddings for {len(changed_indices)} changed GPTs...",
        )

        if demo:
            embedder = MockEmbedder()
        else:
            openai_key = decrypt(config.openai_api_key)
            embedder = Embedder(openai_key)

        try:
            changed_gpts_for_embed = [filtered_gpts[i] for i in changed_indices]
            changed_cls_for_embed = [classifications[i] for i in changed_indices]
            embedding_results = await embedder.embed_batch(
                changed_gpts_for_embed, changed_cls_for_embed
            )
            for ci, emb in enumerate(embedding_results):
                embeddings[changed_indices[ci]] = emb
            total_embedded = sum(1 for e in embeddings if e is not None)
            sync_log.gpts_embedded = total_embedded
            await db.commit()
            await _log(
                db,
                sync_log.id,
                "info",
                f"Generated {len(embedding_results)} embeddings ({len(unchanged_indices)} reused from cache)",
            )
        except Exception as e:
            await _log(db, sync_log.id, "warn", f"Embedding failed: {e}")
        _current_status["progress"] = 85.0
    elif classification_enabled and has_openai_key:
        sync_log.gpts_embedded = sum(1 for e in embeddings if e is not None)
        await db.commit()
        _current_status["progress"] = 85.0
        await _log(
            db,
            sync_log.id,
            "info",
            "All GPTs unchanged, reusing cached embeddings",
        )

    # Step 5: Store GPTs
    _current_status["stage"] = "storing"
    _current_status["progress"] = 90.0
    await _log(
        db, sync_log.id, "info", f"Storing {len(filtered_gpts)} GPTs in database..."
    )

    # Clear existing GPTs
    await db.execute(delete(GPT))
    await db.commit()

    # Build category lookup
    cat_result = await db.execute(select(Category))
    cat_lookup = {c.name: c.id for c in cat_result.scalars().all()}

    now = datetime.now(timezone.utc)
    for i, gpt_data in enumerate(filtered_gpts):
        cls = classifications[i]
        emb = embeddings[i] if i < len(embeddings) else None
        enr = enrichments[i] if i < len(enrichments) else None

        primary_cat_id = None
        secondary_cat_id = None
        if cls and not isinstance(cls, Exception):
            primary_cat_id = cat_lookup.get(cls.get("primary_category", ""))
            secondary_cat_id = cat_lookup.get(cls.get("secondary_category", ""))

        # Parse semantic_enriched_at from string if present
        sem_at = None
        if enr and enr.get("semantic_enriched_at"):
            from datetime import datetime as _dt

            try:
                sem_at = _dt.fromisoformat(enr["semantic_enriched_at"])
            except Exception:
                sem_at = now

        gpt = GPT(
            id=gpt_data["id"],
            name=gpt_data.get("name") or "Untitled",
            description=gpt_data.get("description"),
            instructions=gpt_data.get("instructions"),
            owner_email=gpt_data.get("owner_email"),
            builder_name=gpt_data.get("builder_name"),
            created_at=gpt_data.get("created_at"),
            visibility=gpt_data.get("visibility"),
            recipients=gpt_data.get("recipients"),
            shared_user_count=gpt_data.get("shared_user_count", 0),
            tools=gpt_data.get("tools"),
            files=gpt_data.get("files"),
            builder_categories=gpt_data.get("builder_categories"),
            conversation_starters=gpt_data.get("conversation_starters"),
            asset_type=gpt_data.get("asset_type", "gpt"),
            primary_category_id=primary_cat_id,
            secondary_category_id=secondary_cat_id,
            classification_confidence=cls.get("confidence") if cls else None,
            llm_summary=cls.get("summary") if cls else None,
            use_case_description=cls.get("use_case_description") if cls else None,
            embedding=emb,
            content_hash=gpt_data.get("_content_hash"),
            sync_log_id=sync_log.id,
            indexed_at=now,
            # Semantic enrichment
            business_process=enr.get("business_process") if enr else None,
            risk_flags=enr.get("risk_flags") if enr else None,
            risk_level=enr.get("risk_level") if enr else None,
            sophistication_score=enr.get("sophistication_score") if enr else None,
            sophistication_rationale=enr.get("sophistication_rationale")
            if enr
            else None,
            prompting_quality_score=enr.get("prompting_quality_score") if enr else None,
            prompting_quality_rationale=enr.get("prompting_quality_rationale")
            if enr
            else None,
            prompting_quality_flags=enr.get("prompting_quality_flags") if enr else None,
            roi_potential_score=enr.get("roi_potential_score") if enr else None,
            roi_rationale=enr.get("roi_rationale") if enr else None,
            intended_audience=enr.get("intended_audience") if enr else None,
            integration_flags=enr.get("integration_flags") if enr else None,
            output_type=enr.get("output_type") if enr else None,
            adoption_friction_score=enr.get("adoption_friction_score") if enr else None,
            adoption_friction_rationale=enr.get("adoption_friction_rationale")
            if enr
            else None,
            semantic_enriched_at=sem_at,
            purpose_fingerprint=enr.get("purpose_fingerprint") if enr else None,
        )
        db.add(gpt)

    await db.commit()
    await _log(db, sync_log.id, "info", f"Stored {len(filtered_gpts)} GPTs in database")

    # Finalize — write token consumption and cost
    sync_log.status = "completed"
    sync_log.finished_at = datetime.now(timezone.utc)
    sync_log.tokens_input = tokens_input
    sync_log.tokens_output = tokens_output
    sync_log.estimated_cost_usd = _calculate_cost(
        config.classification_model, tokens_input, tokens_output
    )
    await db.commit()

    _current_status["progress"] = 100.0
    _current_status["stage"] = "completed"
    await _log(db, sync_log.id, "info", "Pipeline completed successfully")
