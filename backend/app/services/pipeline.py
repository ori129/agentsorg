import asyncio
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

logger = logging.getLogger(__name__)

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
    log_fn = logger.error if level == "error" else logger.warning if level == "warn" else logger.info
    log_fn(f"[pipeline:{sync_log_id}] {message}")
    try:
        entry = PipelineLogEntry(
            sync_log_id=sync_log_id, level=level, message=message
        )
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
                            db, _current_status["sync_log_id"], "error", f"Pipeline failed: {e}"
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
            "classification_enabled": config.classification_enabled if config else False,
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

    async def on_page(gpts: list[dict], page: int):
        nonlocal page_count
        page_count = page
        await _log(db, sync_log.id, "info", f"Fetched page {page} ({len(gpts)} GPTs)")
        _current_status["progress"] = min(5.0 + page * 5, 30.0)

    try:
        all_gpts = await client.fetch_all_gpts(config.workspace_id or "", on_page)
    finally:
        await client.close()

    sync_log.total_gpts_found = len(all_gpts)
    await db.commit()
    await _log(db, sync_log.id, "info", f"Total GPTs found: {len(all_gpts)}")

    # Log first GPT for debugging
    if all_gpts:
        first = all_gpts[0]
        await _log(db, sync_log.id, "info",
            f"Sample GPT: name={first.get('name')}, visibility={first.get('visibility')}, "
            f"owner={first.get('owner_email')}, shared_users={first.get('shared_user_count')}")

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

    # Step 3: Classify (if enabled)
    classification_enabled = config.classification_enabled if config else False
    has_openai_key = demo or (config and config.openai_api_key)

    classifications: list[dict | None] = [None] * len(filtered_gpts)
    if classification_enabled and has_openai_key:
        _current_status["stage"] = "classifying"
        _current_status["progress"] = 40.0
        await _log(db, sync_log.id, "info",
                    "[DEMO] Using keyword-based classifier" if demo else "Starting classification...")

        result_cats = await db.execute(
            select(Category).where(Category.enabled == True)
        )
        categories = list(result_cats.scalars().all())

        if categories:
            if demo:
                classifier = MockClassifier()
            else:
                openai_key = decrypt(config.openai_api_key)
                classifier = Classifier(openai_key, config.classification_model)

            max_cats = config.max_categories_per_gpt if config else 2
            results = await classifier.classify_batch(
                filtered_gpts, categories, max_cats
            )

            classified_count = 0
            errors = []
            for i, r in enumerate(results):
                if isinstance(r, Exception):
                    errors.append(
                        f"Classification error for {filtered_gpts[i].get('name', 'unknown')}: {r}"
                    )
                    await _log(db, sync_log.id, "warn", errors[-1])
                else:
                    classifications[i] = r
                    classified_count += 1

            sync_log.gpts_classified = classified_count
            await db.commit()
            await _log(
                db, sync_log.id, "info", f"Classified {classified_count} GPTs"
            )
            _current_status["progress"] = 65.0
        else:
            await _log(db, sync_log.id, "warn", "No enabled categories, skipping classification")
    else:
        await _log(db, sync_log.id, "info", "Classification disabled, skipping")

    # Step 4: Embed (if classification enabled and API key available)
    embeddings: list[list[float] | None] = [None] * len(filtered_gpts)
    if classification_enabled and has_openai_key:
        _current_status["stage"] = "embedding"
        _current_status["progress"] = 70.0
        await _log(db, sync_log.id, "info",
                    "[DEMO] Using deterministic embeddings" if demo else "Generating embeddings...")

        if demo:
            embedder = MockEmbedder()
        else:
            openai_key = decrypt(config.openai_api_key)
            embedder = Embedder(openai_key)

        try:
            embedding_results = await embedder.embed_batch(filtered_gpts, classifications)
            embeddings = embedding_results  # type: ignore[assignment]
            sync_log.gpts_embedded = len(embedding_results)
            await db.commit()
            await _log(
                db, sync_log.id, "info", f"Generated {len(embedding_results)} embeddings"
            )
        except Exception as e:
            await _log(db, sync_log.id, "warn", f"Embedding failed: {e}")
        _current_status["progress"] = 85.0

    # Step 5: Store GPTs
    _current_status["stage"] = "storing"
    _current_status["progress"] = 90.0
    await _log(db, sync_log.id, "info", f"Storing {len(filtered_gpts)} GPTs in database...")

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

        primary_cat_id = None
        secondary_cat_id = None
        if cls and not isinstance(cls, Exception):
            primary_cat_id = cat_lookup.get(cls.get("primary_category", ""))
            secondary_cat_id = cat_lookup.get(cls.get("secondary_category", ""))

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
            primary_category_id=primary_cat_id,
            secondary_category_id=secondary_cat_id,
            classification_confidence=cls.get("confidence") if cls else None,
            llm_summary=cls.get("summary") if cls else None,
            use_case_description=cls.get("use_case_description") if cls else None,
            embedding=emb,
            sync_log_id=sync_log.id,
            indexed_at=now,
        )
        db.add(gpt)

    await db.commit()
    await _log(
        db, sync_log.id, "info", f"Stored {len(filtered_gpts)} GPTs in database"
    )

    # Finalize
    sync_log.status = "completed"
    sync_log.finished_at = datetime.now(timezone.utc)
    await db.commit()

    _current_status["progress"] = 100.0
    _current_status["stage"] = "completed"
    await _log(db, sync_log.id, "info", "Pipeline completed successfully")
