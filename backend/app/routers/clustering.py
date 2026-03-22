"""Clustering microservice — pgvector cosine similarity grouping.

User-activated: POST /run triggers async clustering, results available via GET /results.
Each cluster includes enrichment: business process, departments, confidence, best candidate,
and recommended action. Leaders can save decisions via POST /{cluster_id}/action.
"""

import asyncio
import hashlib
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from sqlalchemy import text

from app.database import async_session
from app.schemas.schemas import (
    ClusterActionRequest,
    ClusterActionResponse,
    ClusterGroup,
    ClusteringStatus,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/clustering", tags=["clustering"])

_clustering_status = {"status": "idle"}
_clustering_results: list[ClusterGroup] = []
_clustering_lock = asyncio.Lock()
_cluster_decisions: dict[str, dict] = {}


def _make_cluster_id(gpt_ids: list[str]) -> str:
    key = ",".join(sorted(gpt_ids))
    return hashlib.md5(key.encode()).hexdigest()[:16]


def _extract_domain(email: str | None) -> str | None:
    if not email or "@" not in email:
        return None
    domain = email.split("@")[1].lower()
    parts = domain.split(".")
    return parts[0] if len(parts) >= 2 else domain


def _infer_theme(names: list[str]) -> str:
    """Simple keyword-based theme inference from asset names."""
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
    return "similar purpose assets"


async def _run_clustering_task():
    global _clustering_results
    async with async_session() as db:
        try:
            # Fetch all assets with embeddings + enrichment fields
            result = await db.execute(
                text("""
                    SELECT id, name, embedding, business_process,
                           sophistication_score, creator_email
                    FROM gpts
                    WHERE embedding IS NOT NULL
                """)
            )
            rows = result.fetchall()

            if not rows:
                _clustering_results = []
                _clustering_status["status"] = "completed"
                return

            SIMILARITY_THRESHOLD = 0.85
            gpt_ids = [r[0] for r in rows]
            gpt_names = [r[1] for r in rows]
            gpt_business_process = {r[0]: r[3] for r in rows}
            gpt_sophistication = {r[0]: (r[4] or 0) for r in rows}
            gpt_creator_email = {r[0]: r[5] for r in rows}

            clusters: list[set] = []
            assigned = set()

            for gid in gpt_ids:
                if gid in assigned:
                    continue
                similar_result = await db.execute(
                    text("""
                        SELECT id
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
                    merged = False
                    for c in clusters:
                        if c & cluster_ids:
                            c.update(cluster_ids)
                            merged = True
                            break
                    if not merged:
                        clusters.append(cluster_ids)
                    assigned.update(cluster_ids)

            id_to_name = dict(zip(gpt_ids, gpt_names))
            groups = []

            for cluster_set in clusters:
                if len(cluster_set) < 2:
                    continue

                c_ids = list(cluster_set)
                n = len(c_ids)

                # Best candidate: highest sophistication_score
                candidate_id = max(c_ids, key=lambda cid: gpt_sophistication.get(cid, 0))

                # Reorder: candidate first
                c_ids.remove(candidate_id)
                c_ids.insert(0, candidate_id)
                c_names = [id_to_name.get(cid, cid) for cid in c_ids]

                # Business process: most common non-null value across cluster
                bp_values = [gpt_business_process[cid] for cid in c_ids if gpt_business_process.get(cid)]
                business_process = max(set(bp_values), key=bp_values.count) if bp_values else None

                # Departments: distinct company domains from creator emails (max 5)
                domains = list({
                    _extract_domain(gpt_creator_email.get(cid))
                    for cid in c_ids
                    if _extract_domain(gpt_creator_email.get(cid))
                })[:5]

                # Confidence: proxy based on cluster size (larger = stronger signal)
                confidence = round(min(0.98, 0.85 + (n - 2) * 0.01), 2)

                # Recommended action based on cluster size
                if n >= 5:
                    recommended_action = "certify as org standard"
                elif n >= 3:
                    recommended_action = "review and consolidate"
                else:
                    recommended_action = "assess and decide"

                cluster_id = _make_cluster_id(c_ids)

                groups.append(
                    ClusterGroup(
                        cluster_id=cluster_id,
                        theme=_infer_theme(c_names),
                        gpt_ids=c_ids,
                        gpt_names=c_names,
                        estimated_wasted_hours=(n - 1) * 4.0,
                        business_process=business_process,
                        departments=domains if domains else None,
                        confidence=confidence,
                        candidate_gpt_id=candidate_id,
                        recommended_action=recommended_action,
                    )
                )

            _clustering_results = groups
            _clustering_status["status"] = "completed"
            logger.info(f"Clustering complete: {len(groups)} standardization opportunities found")

        except Exception as e:
            logger.error(f"Clustering failed: {e}")
            _clustering_status["status"] = "idle"
            raise


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


@router.post("/{cluster_id}/action")
async def save_cluster_action(
    cluster_id: str, body: ClusterActionRequest
) -> ClusterActionResponse:
    """Save a leader decision for a cluster. Stored in-memory (persisted to DB in a future release)."""
    decision = {
        "cluster_id": cluster_id,
        "action": body.action,
        "owner_email": body.owner_email,
        "notes": body.notes,
        "saved_at": datetime.now(timezone.utc).isoformat(),
    }
    _cluster_decisions[cluster_id] = decision
    logger.info(f"Cluster decision saved: {cluster_id} -> {body.action}")
    return ClusterActionResponse(**decision)


@router.get("/decisions")
async def get_decisions() -> list[ClusterActionResponse]:
    """Return all saved cluster decisions."""
    return [ClusterActionResponse(**d) for d in _cluster_decisions.values()]
