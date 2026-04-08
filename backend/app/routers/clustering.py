"""Clustering microservice — centroid-based cosine similarity + Claude validation.

User-activated: POST /run triggers async clustering, results available via GET /results.
Algorithm:
  1. Centroid-based iterative clustering on purpose_fingerprint embeddings (or name embeddings)
  2. Claude haiku validates each candidate cluster and writes a plain-English explanation
Each cluster includes enrichment: business process, departments, confidence, best candidate,
recommended action, and cluster_explanation.
"""

import asyncio
import hashlib
import json
import logging
import os
from datetime import datetime, timezone

import numpy as np
from fastapi import APIRouter, HTTPException
from sqlalchemy import select, text

from app.database import async_session
from app.models.models import ClusterCache
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

SIMILARITY_THRESHOLD = 0.82  # Tuned for smaller portfolios; catches near-duplicates
OPENAI_VALIDATE_MODEL = "gpt-4o-mini"

_VALIDATE_SYSTEM = """You analyze groups of enterprise AI tools to determine if they are genuine duplicates.
Genuine duplicates = different employees independently built tools that solve the exact same workflow problem.
Not duplicates = tools that are in the same domain but serve different specific purposes."""

_VALIDATE_USER = """Are these {n} AI tools genuine duplicates (built by different people for the same exact purpose)?

{tools_block}

Return JSON:
{{
  "is_genuine_duplicate": true/false,
  "explanation": "One sentence explaining what workflow these tools share, or why they are not duplicates.",
  "confidence": 0.0-1.0
}}

Return ONLY JSON."""


async def _validate_cluster_with_openai(
    names: list[str],
    fingerprints: list[str | None],
    client,
) -> tuple[bool, str, float]:
    """Returns (is_genuine, explanation, confidence). Falls back gracefully on error."""
    tools_block = "\n".join(
        f"- {name}: {fp or '(no fingerprint)'}" for name, fp in zip(names, fingerprints)
    )
    try:
        response = await client.chat.completions.create(
            model=OPENAI_VALIDATE_MODEL,
            max_tokens=256,
            messages=[
                {"role": "system", "content": _VALIDATE_SYSTEM},
                {
                    "role": "user",
                    "content": _VALIDATE_USER.format(
                        n=len(names), tools_block=tools_block
                    ),
                },
            ],
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content.strip()
        data = json.loads(raw)
        return (
            bool(data.get("is_genuine_duplicate", True)),
            data.get("explanation", ""),
            float(data.get("confidence", 0.9)),
        )
    except Exception as e:
        logger.warning(f"OpenAI cluster validation failed: {e}")
        return True, "", 0.85


def _make_cluster_id(gpt_ids: list[str]) -> str:
    key = ",".join(sorted(gpt_ids))
    return hashlib.md5(key.encode()).hexdigest()[:16]


def _extract_domain(email: str | None) -> str | None:
    if not email or "@" not in email:
        return None
    domain = email.split("@")[1].lower()
    parts = domain.split(".")
    return parts[0] if len(parts) >= 2 else domain


def _majority(values: list[str]) -> str | None:
    return max(set(values), key=values.count) if values else None


def _centroid_clusters(
    embeddings: np.ndarray,
    threshold: float,
    seed_order: list[int],
) -> list[set[int]]:
    """
    Centroid-based iterative clustering.

    Unlike single-linkage, every member must be within `threshold` cosine
    similarity of the cluster centroid — not just one other member.
    This prevents chaining (A→B→C forming a cluster even if A and C are unrelated).

    Steps per seed:
      1. Find all unassigned assets within `threshold` of the seed.
      2. Compute centroid of that candidate set.
      3. Re-filter: keep only assets within `threshold` of the centroid.
      4. Repeat 2-3 until stable (convergence, max 10 iterations).
      5. If ≥2 members remain, emit cluster.
    """
    N = len(embeddings)
    # Precompute full pairwise similarity matrix (N×N, float32 ~1MB for 512 assets)
    sim_matrix = (
        embeddings @ embeddings.T
    )  # cosine sim since embeddings are L2-normalised

    assigned: set[int] = set()
    clusters: list[set[int]] = []

    for seed in seed_order:
        if seed in assigned:
            continue

        # Initial candidates: all unassigned assets similar to seed
        row = sim_matrix[seed]
        candidates: set[int] = {
            int(j)
            for j in np.where(row >= threshold)[0]
            if j != seed and j not in assigned
        }

        if not candidates:
            continue

        cluster = candidates | {seed}

        # Iterative centroid refinement
        for _ in range(10):
            c_list = list(cluster)
            centroid = embeddings[c_list].mean(axis=0)
            norm = np.linalg.norm(centroid)
            if norm > 1e-9:
                centroid /= norm

            sims = embeddings @ centroid
            new_cluster: set[int] = {
                int(j)
                for j in range(N)
                if (j == seed or j not in assigned) and sims[j] >= threshold
            }

            if new_cluster == cluster:
                break
            cluster = new_cluster

        if len(cluster) >= 2:
            clusters.append(cluster)
            assigned.update(cluster)

    return clusters


async def _run_clustering_task(openai_api_key: str | None = None):
    global _clustering_results
    async with async_session() as db:
        try:
            result = await db.execute(
                text("""
                    SELECT g.id, g.name, g.embedding, g.business_process,
                           g.sophistication_score, g.owner_email, c.name AS primary_category,
                           g.purpose_fingerprint
                    FROM gpts g
                    LEFT JOIN categories c ON c.id = g.primary_category_id
                    WHERE g.embedding IS NOT NULL
                """)
            )
            rows = result.fetchall()

            if not rows:
                _clustering_results = []
                _clustering_status["status"] = "completed"
                return

            ids = [r[0] for r in rows]
            names = [r[1] for r in rows]
            gpt_business_process = {r[0]: r[3] for r in rows}
            gpt_sophistication = {r[0]: (r[4] or 0) for r in rows}
            gpt_owner_email = {r[0]: r[5] for r in rows}
            gpt_primary_category = {r[0]: r[6] for r in rows}
            gpt_fingerprint = {r[0]: r[7] for r in rows}

            fingerprint_coverage = sum(1 for v in gpt_fingerprint.values() if v) / max(
                len(ids), 1
            )
            logger.info(f"Fingerprint coverage: {fingerprint_coverage:.0%}")

            # Parse embeddings (pgvector returns as JSON string "[0.1,0.2,...]")
            raw = []
            for r in rows:
                emb = r[2]
                raw.append(json.loads(emb) if isinstance(emb, str) else list(emb))

            embeddings = np.array(raw, dtype=np.float32)
            norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
            embeddings /= np.maximum(norms, 1e-9)

            # Group by primary_category, cluster within each bucket
            from collections import defaultdict

            category_buckets: dict[str, list[int]] = defaultdict(list)
            for i, asset_id in enumerate(ids):
                cat = gpt_primary_category.get(asset_id) or "Uncategorized"
                category_buckets[cat].append(i)

            all_clusters: list[set[int]] = []
            for cat, bucket_indices in category_buckets.items():
                if len(bucket_indices) < 2:
                    continue
                bucket_embeddings = embeddings[bucket_indices]
                local_to_global = {
                    local: global_ for local, global_ in enumerate(bucket_indices)
                }
                seed_order = sorted(
                    range(len(bucket_indices)),
                    key=lambda i: gpt_sophistication.get(ids[bucket_indices[i]], 0),
                    reverse=True,
                )
                local_clusters = _centroid_clusters(
                    bucket_embeddings, SIMILARITY_THRESHOLD, seed_order
                )
                for local_cluster in local_clusters:
                    all_clusters.append({local_to_global[i] for i in local_cluster})

            # Build candidate groups
            id_to_name = dict(zip(ids, names))
            candidate_groups = []
            for cluster_set in all_clusters:
                c_indices = list(cluster_set)
                c_ids = [ids[i] for i in c_indices]
                n = len(c_ids)
                candidate_id = max(
                    c_ids, key=lambda cid: gpt_sophistication.get(cid, 0)
                )
                c_ids.remove(candidate_id)
                c_ids.insert(0, candidate_id)
                c_indices = [ids.index(cid) for cid in c_ids]
                c_names = [id_to_name.get(cid, cid) for cid in c_ids]
                bp_values = [
                    gpt_business_process[cid]
                    for cid in c_ids
                    if gpt_business_process.get(cid)
                ]
                business_process = _majority(bp_values)
                theme = (
                    business_process
                    or _majority(
                        [
                            gpt_primary_category[cid]
                            for cid in c_ids
                            if gpt_primary_category.get(cid)
                        ]
                    )
                    or "similar purpose assets"
                )
                domains = list(
                    {
                        _extract_domain(gpt_owner_email.get(cid))
                        for cid in c_ids
                        if _extract_domain(gpt_owner_email.get(cid))
                    }
                )[:5]
                sub = embeddings[c_indices]
                pairwise = sub @ sub.T
                mask = np.triu(np.ones_like(pairwise, dtype=bool), k=1)
                avg_sim = (
                    float(pairwise[mask].mean()) if mask.any() else SIMILARITY_THRESHOLD
                )
                if n >= 5:
                    recommended_action = "certify as org standard"
                elif n >= 3:
                    recommended_action = "review and consolidate"
                else:
                    recommended_action = "assess and decide"
                candidate_groups.append(
                    {
                        "cluster_id": _make_cluster_id(c_ids),
                        "c_ids": c_ids,
                        "c_names": c_names,
                        "c_indices": c_indices,
                        "n": n,
                        "candidate_id": candidate_id,
                        "business_process": business_process,
                        "theme": theme,
                        "domains": domains,
                        "avg_sim": avg_sim,
                        "recommended_action": recommended_action,
                    }
                )

            # OpenAI validation — parallel calls per cluster
            key = openai_api_key or os.environ.get("OPENAI_API_KEY")
            openai_available = bool(key)
            openai_client = None
            if openai_available:
                try:
                    from openai import AsyncOpenAI

                    openai_client = AsyncOpenAI(api_key=key)
                except ImportError:
                    openai_available = False

            async def _validate(cg: dict) -> tuple[bool, str, float]:
                fps = [gpt_fingerprint.get(cid) for cid in cg["c_ids"]]
                if not openai_client:
                    # Fingerprint-based fallback: reject if assets have diverse fingerprints
                    non_null = [
                        fp for fp in fps if fp and "Experimental placeholder" not in fp
                    ]
                    if non_null:
                        unique_fps = len(set(non_null))
                        if unique_fps == 1:
                            fp_text = non_null[0].lower()
                            explanation = f"Multiple employees independently built tools that {fp_text}"
                            return True, explanation, round(min(0.99, cg["avg_sim"]), 2)
                        majority_fp = max(set(non_null), key=non_null.count)
                        majority_count = non_null.count(majority_fp)
                        if majority_count / len(non_null) >= 0.6:
                            fp_text = majority_fp.lower()
                            explanation = f"Multiple employees independently built tools that {fp_text}"
                            return (
                                True,
                                explanation,
                                round(majority_count / len(non_null) * 0.98, 2),
                            )
                        return False, "", round(min(0.99, cg["avg_sim"]), 2)
                    return True, "", round(min(0.99, cg["avg_sim"]), 2)
                return await _validate_cluster_with_openai(
                    cg["c_names"], fps, openai_client
                )

            validation_results = await asyncio.gather(
                *[_validate(cg) for cg in candidate_groups]
            )

            groups = []
            for cg, (is_genuine, explanation, openai_confidence) in zip(
                candidate_groups, validation_results
            ):
                if not is_genuine:
                    validator = (
                        "OpenAI" if openai_available else "fingerprint validator"
                    )
                    logger.info(
                        f"{validator} rejected cluster '{cg['theme']}' ({cg['n']} assets) as non-duplicate"
                    )
                    continue
                confidence = round(
                    openai_confidence if openai_available else min(0.99, cg["avg_sim"]),
                    2,
                )
                groups.append(
                    ClusterGroup(
                        cluster_id=cg["cluster_id"],
                        theme=cg["theme"],
                        gpt_ids=cg["c_ids"],
                        gpt_names=cg["c_names"],
                        estimated_wasted_hours=(cg["n"] - 1) * 4.0,
                        business_process=cg["business_process"],
                        departments=cg["domains"] if cg["domains"] else None,
                        confidence=confidence,
                        candidate_gpt_id=cg["candidate_id"],
                        recommended_action=cg["recommended_action"],
                        cluster_explanation=explanation or None,
                    )
                )

            groups.sort(key=lambda g: len(g.gpt_ids), reverse=True)
            _clustering_results = groups
            _clustering_status["status"] = "completed"
            validator = "OpenAI" if openai_available else "fingerprint validator"
            logger.info(
                f"Clustering complete: {len(groups)} opportunities ({len(candidate_groups) - len(groups)} rejected by {validator})"
            )

            # Persist to DB so results survive container restarts
            await _persist_cluster_results(groups)

        except Exception as e:
            logger.error(f"Clustering failed: {e}")
            _clustering_status["status"] = "idle"
            raise


async def _persist_cluster_results(groups: list[ClusterGroup]) -> None:
    """Write latest cluster results to cluster_cache table."""
    try:
        async with async_session() as db:
            row = ClusterCache(
                generated_at=datetime.now(timezone.utc),
                results=[g.model_dump() for g in groups],
                decisions=list(_cluster_decisions.values()),
            )
            db.add(row)
            await db.commit()
    except Exception as e:
        logger.warning(f"Failed to persist cluster results: {e}")


async def _load_cluster_results_from_db() -> None:
    """Load latest cluster results from DB into memory (called on first GET after restart)."""
    global _clustering_results, _cluster_decisions
    try:
        async with async_session() as db:
            result = await db.execute(
                select(ClusterCache).order_by(ClusterCache.generated_at.desc()).limit(1)
            )
            row = result.scalar_one_or_none()
            if row and row.results:
                _clustering_results = [ClusterGroup(**r) for r in row.results]
                if row.decisions:
                    for d in row.decisions:
                        if isinstance(d, dict) and "cluster_id" in d:
                            _cluster_decisions[d["cluster_id"]] = d
                logger.info(
                    f"Loaded {len(_clustering_results)} cluster results from DB"
                )
    except Exception as e:
        logger.warning(f"Failed to load cluster results from DB: {e}")


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
    # On first request after restart, restore from DB if memory is empty
    if not _clustering_results:
        await _load_cluster_results_from_db()
    return _clustering_results


@router.post("/{cluster_id}/action")
async def save_cluster_action(
    cluster_id: str, body: ClusterActionRequest
) -> ClusterActionResponse:
    """Save a leader decision for a cluster."""
    decision = {
        "cluster_id": cluster_id,
        "action": body.action,
        "owner_email": body.owner_email,
        "notes": body.notes,
        "saved_at": datetime.now(timezone.utc).isoformat(),
    }
    _cluster_decisions[cluster_id] = decision
    logger.info(f"Cluster decision saved: {cluster_id} -> {body.action}")
    # Persist updated decisions back to latest cache row
    await _persist_cluster_results(_clustering_results)
    return ClusterActionResponse(**decision)


@router.get("/decisions")
async def get_decisions() -> list[ClusterActionResponse]:
    """Return all saved cluster decisions."""
    return [ClusterActionResponse(**d) for d in _cluster_decisions.values()]
