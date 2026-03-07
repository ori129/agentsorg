"""Clustering microservice — pgvector cosine similarity grouping.

User-activated: POST /run triggers async clustering, results available via GET /results.
"""

import asyncio
import logging

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app.database import async_session
from app.schemas.schemas import ClusterGroup, ClusteringStatus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/clustering", tags=["clustering"])

_clustering_status = {"status": "idle"}
_clustering_results: list[ClusterGroup] = []
_clustering_lock = asyncio.Lock()


async def _run_clustering_task():
    global _clustering_results
    async with async_session() as db:
        try:
            # Fetch all GPTs that have embeddings
            result = await db.execute(
                text("SELECT id, name, embedding FROM gpts WHERE embedding IS NOT NULL")
            )
            rows = result.fetchall()

            if not rows:
                _clustering_results = []
                _clustering_status["status"] = "completed"
                return

            # Build similarity matrix using pgvector cosine similarity.
            # Threshold 0.85: catches real-world same-purpose GPTs (0.85-0.92 range)
            # and demo mock vectors (0.97). Avoids false positives at <0.85.
            SIMILARITY_THRESHOLD = 0.85
            gpt_ids = [r[0] for r in rows]
            gpt_names = [r[1] for r in rows]

            clusters: list[set] = []
            assigned = set()

            for i, gid in enumerate(gpt_ids):
                if gid in assigned:
                    continue
                similar_result = await db.execute(
                    text("""
                        SELECT id, name,
                               1 - (embedding <=> (SELECT embedding FROM gpts WHERE id = :target_id)) AS similarity
                        FROM gpts
                        WHERE id != :target_id
                          AND embedding IS NOT NULL
                          AND 1 - (embedding <=> (SELECT embedding FROM gpts WHERE id = :target_id)) > :threshold
                    """),
                    {"target_id": gid, "threshold": SIMILARITY_THRESHOLD},
                )
                similar_rows = similar_result.fetchall()

                if similar_rows:
                    cluster_ids = {gid}
                    cluster_ids.update(r[0] for r in similar_rows)
                    # Merge with existing clusters that share members
                    merged = False
                    for c in clusters:
                        if c & cluster_ids:
                            c.update(cluster_ids)
                            merged = True
                            break
                    if not merged:
                        clusters.append(cluster_ids)
                    assigned.update(cluster_ids)

            # Convert to ClusterGroup objects
            id_to_name = dict(zip(gpt_ids, gpt_names))
            groups = []
            for cluster_set in clusters:
                if len(cluster_set) < 2:
                    continue
                c_ids = list(cluster_set)
                c_names = [id_to_name.get(cid, cid) for cid in c_ids]
                # Estimate wasted hours: (n-1) duplicates * 4h average build time
                wasted = (len(c_ids) - 1) * 4.0
                # Derive theme from names (simple heuristic)
                theme = _infer_theme(c_names)
                groups.append(ClusterGroup(
                    theme=theme,
                    gpt_ids=c_ids,
                    gpt_names=c_names,
                    estimated_wasted_hours=wasted,
                ))

            _clustering_results = groups
            _clustering_status["status"] = "completed"
            logger.info(f"Clustering complete: {len(groups)} duplicate clusters found")

        except Exception as e:
            logger.error(f"Clustering failed: {e}")
            _clustering_status["status"] = "idle"
            raise


def _infer_theme(names: list[str]) -> str:
    """Simple keyword-based theme inference from GPT names."""
    combined = " ".join(names).lower()
    theme_keywords = [
        ("meeting summarizer", ["meeting", "recap", "summary", "standup", "notes"]),
        ("email assistant", ["email", "mail", "draft", "outreach"]),
        ("code reviewer", ["code", "review", "pr", "pull request", "engineering"]),
        ("contract analyzer", ["contract", "legal", "agreement", "clause"]),
        ("sales assistant", ["sales", "deal", "crm", "salesforce", "opportunity"]),
        ("hr assistant", ["hr", "onboard", "employee", "people", "hiring"]),
        ("data analyzer", ["data", "analysis", "analytics", "report", "insight"]),
        ("content creator", ["content", "marketing", "copy", "blog", "social"]),
    ]
    for theme, keywords in theme_keywords:
        if sum(1 for kw in keywords if kw in combined) >= 2:
            return theme
    return "similar purpose GPTs"


@router.post("/run")
async def run_clustering():
    """Trigger async clustering. Returns immediately; poll /status for completion."""
    if _clustering_lock.locked():
        return {"message": "Clustering already running"}
    _clustering_status["status"] = "running"
    asyncio.create_task(_run_clustering_task())
    return {"message": "Clustering started"}


@router.get("/status")
async def get_clustering_status() -> ClusteringStatus:
    return ClusteringStatus(status=_clustering_status["status"])


@router.get("/results")
async def get_clustering_results() -> list[ClusterGroup]:
    if _clustering_status["status"] == "running":
        raise HTTPException(status_code=202, detail="Clustering still running")
    return _clustering_results
