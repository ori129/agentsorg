"""Learning & Development router.

Endpoints:
  GET  /api/v1/learning/recognition
  POST /api/v1/learning/recommend-org
  POST /api/v1/learning/recommend-employee
  GET  /api/v1/learning/workshops
  POST /api/v1/learning/workshops
  PUT  /api/v1/learning/workshops/{id}
  DELETE /api/v1/learning/workshops/{id}
  POST /api/v1/learning/workshops/{id}/participants
  DELETE /api/v1/learning/workshops/{id}/participants/{email}
  POST /api/v1/learning/workshops/{id}/tag-gpt
  DELETE /api/v1/learning/workshops/{id}/tag-gpt/{gpt_id}
  GET  /api/v1/learning/workshops/{id}/impact
"""

import json
import logging
import math
import random
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import csv
import io

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.encryption import decrypt
from app.models.models import (
    AssetUsageInsight,
    Category,
    Configuration,
    CustomCourse,
    GPT,
    Workshop,
    WorkshopGPTTag,
    WorkshopParticipant,
)
from app.schemas.schemas import (
    BuilderRecognition,
    CourseRecommendation,
    CustomCourseRead,
    CustomCourseUploadResult,
    EmployeeLearningReport,
    OrgLearningReport,
    TaggedAssetDetail,
    WorkshopCreate,
    WorkshopImpact,
    WorkshopImpactAuto,
    WorkshopRead,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/learning", tags=["learning"])

# ---------------------------------------------------------------------------
# Academy catalog — direct HTTP scrape of academy.openai.com/__NEXT_DATA__
# ---------------------------------------------------------------------------

_ACADEMY_BASE = "https://academy.openai.com"

# Pages to scrape.  Each SSR render returns ~10 records; fetching multiple
# pages (main feed + individual collection pages) gives us the full reachable set.
_ACADEMY_PAGES = [
    f"{_ACADEMY_BASE}/home/content?category=video",
    # Known collection slugs — each returns a different set of videos
    f"{_ACADEMY_BASE}/public/collections/professors-teaching-with-openai-2025-08-18",
    f"{_ACADEMY_BASE}/public/collections/government",
    f"{_ACADEMY_BASE}/public/collections/non-profit",
    f"{_ACADEMY_BASE}/public/collections/small-business",
    f"{_ACADEMY_BASE}/public/collections/education-ai",
    f"{_ACADEMY_BASE}/public/collections/science-ai",
    f"{_ACADEMY_BASE}/public/collections/whats-new",
]

# Tags whose videos are professor/faculty personal showcases — deprioritised
_SHOWCASE_TAGS = {"higher education", "chatgpt on campus"}

_academy_catalog_cache: dict = {"videos": [], "ts": 0.0}
_CATALOG_TTL = 600  # 10 minutes


def _walk_videos(obj: Any, seen: dict | None = None) -> dict:
    """Recursively find every LVTenantVideo record in a JSON tree."""
    if seen is None:
        seen = {}
    if isinstance(obj, dict):
        if (
            obj.get("__typename") == "LVTenantVideo"
            and "slug" in obj
            and "title" in obj
        ):
            seen[obj["slug"]] = obj
        else:
            for v in obj.values():
                _walk_videos(v, seen)
    elif isinstance(obj, list):
        for item in obj:
            _walk_videos(item, seen)
    return seen


async def _fetch_academy_catalog() -> list[dict]:
    """
    Scrape academy.openai.com catalog pages to build a video pool.
    Parses __NEXT_DATA__ from each page — no auth required.
    Results cached for 10 minutes so parallel calls share one fetch.

    Returns list of {title, url, tags, summary, duration_min, view_count} dicts,
    sorted by view_count descending (most popular first).
    """
    import time
    import httpx

    now = time.monotonic()
    if (
        _academy_catalog_cache["videos"]
        and (now - _academy_catalog_cache["ts"]) < _CATALOG_TTL
    ):
        logger.info(
            "Using cached academy catalog (%d videos)",
            len(_academy_catalog_cache["videos"]),
        )
        return _academy_catalog_cache["videos"]

    all_videos: dict[str, Any] = {}
    next_data_re = re.compile(
        r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>',
        re.DOTALL,
    )

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as http:
        for page_url in _ACADEMY_PAGES:
            try:
                r = await http.get(page_url, headers={"Accept": "text/html"})
                m = next_data_re.search(r.text)
                if not m:
                    continue
                page_data = json.loads(m.group(1))
                found = _walk_videos(page_data["props"]["pageProps"])
                new = {k: v for k, v in found.items() if k not in all_videos}
                all_videos.update(new)
                logger.info(
                    "Scraped %s → %d videos (%d new)", page_url, len(found), len(new)
                )
            except Exception as e:
                logger.warning("Failed to scrape %s: %s", page_url, e)

    # Normalise into clean dicts
    result = []
    for slug, v in all_videos.items():
        tag_names = [t["name"] for t in v.get("tags", [])]
        tag_lower = {t.lower() for t in tag_names}
        is_showcase = bool(tag_lower & _SHOWCASE_TAGS)
        url = f"{_ACADEMY_BASE}/public/videos/{slug}"
        result.append(
            {
                "title": v["title"],
                "url": url,
                "slug": slug,
                "tags": tag_names,
                "summary": (v.get("summary") or "").strip()[:300],
                "duration_min": (v.get("duration") or 0) // 60,
                "view_count": v.get("viewCount", 0),
                "is_showcase": is_showcase,
            }
        )

    # Sort: non-showcase first, then by view count
    result.sort(key=lambda x: (x["is_showcase"], -x["view_count"]))

    logger.info(
        "Academy catalog built: %d total videos (%d instructional, %d showcases)",
        len(result),
        sum(1 for v in result if not v["is_showcase"]),
        sum(1 for v in result if v["is_showcase"]),
    )

    _academy_catalog_cache["videos"] = result
    _academy_catalog_cache["ts"] = now
    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _is_valid_academy_url(url: str) -> bool:
    """Accept only real academy.openai.com content URLs (not homepage)."""
    try:
        p = urlparse(url)
        return p.netloc == "academy.openai.com" and len(p.path) > 5
    except Exception:
        return False


def _norm(value: float, max_val: float) -> float:
    """Normalize value to 0-100, capped at max_val."""
    if max_val == 0:
        return 0.0
    return min(100.0, (value / max_val) * 100.0)


async def _get_openai_client(db: AsyncSession):
    """Return an openai AsyncOpenAI client using the stored key, or raise 400."""
    from openai import AsyncOpenAI

    result = await db.execute(select(Configuration).where(Configuration.id == 1))
    cfg: Configuration | None = result.scalar_one_or_none()
    if not cfg or not cfg.openai_api_key:
        raise HTTPException(
            status_code=400,
            detail="OpenAI API key not configured. Add it in Settings.",
        )
    key = decrypt(cfg.openai_api_key)
    return AsyncOpenAI(api_key=key)


async def _llm_json(client, system: str, user: str, model: str = "gpt-4o-mini") -> Any:
    """Single LLM call returning parsed JSON."""
    resp = await client.chat.completions.create(
        model=model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.2,
    )
    return json.loads(resp.choices[0].message.content)


def _builder_scores(gpts: list[GPT]) -> BuilderRecognition:
    """Compute recognition scores for a single builder's GPT list."""
    email = gpts[0].owner_email or "unknown"
    name = gpts[0].builder_name

    # Volume: log-normalize, 20 GPTs = 100
    vol_raw = len(gpts)
    volume_score = _norm(math.log1p(vol_raw), math.log1p(20)) * 100 / 100
    volume_score = min(100.0, (math.log1p(vol_raw) / math.log1p(20)) * 100)

    # Quality: avg (sophistication + quality) / 2 scaled to 0-100
    soph_vals = [
        g.sophistication_score for g in gpts if g.sophistication_score is not None
    ]
    qual_vals = [
        g.prompting_quality_score for g in gpts if g.prompting_quality_score is not None
    ]
    avg_soph = (sum(soph_vals) / len(soph_vals)) if soph_vals else None
    avg_qual = (sum(qual_vals) / len(qual_vals)) if qual_vals else None
    combined = [v for v in [avg_soph, avg_qual] if v is not None]
    quality_score = (
        (sum(combined) / len(combined)) if combined else 0.0
    )  # already 1-10 scale
    quality_score = min(100.0, quality_score * 10)  # convert 0-10 → 0-100

    # Adoption: log-normalize total shared_user_count, 500 = 100
    total_users = sum(g.shared_user_count for g in gpts)
    adoption_score = min(100.0, (math.log1p(total_users) / math.log1p(500)) * 100)

    # Risk hygiene: % of GPTs with risk_level in ("low", None)
    safe = sum(1 for g in gpts if g.risk_level in (None, "low"))
    risk_hygiene_score = (safe / len(gpts)) * 100 if gpts else 100.0

    composite = (
        quality_score * 0.35
        + adoption_score * 0.25
        + risk_hygiene_score * 0.25
        + volume_score * 0.15
    )

    return BuilderRecognition(
        email=email,
        name=name,
        composite_score=round(composite, 1),
        volume_score=round(volume_score, 1),
        quality_score=round(quality_score, 1),
        adoption_score=round(adoption_score, 1),
        risk_hygiene_score=round(risk_hygiene_score, 1),
        gpt_count=vol_raw,
        avg_sophistication=round(avg_soph, 1) if avg_soph is not None else None,
        avg_quality=round(avg_qual, 1) if avg_qual is not None else None,
    )


# ---------------------------------------------------------------------------
# Recognition
# ---------------------------------------------------------------------------


@router.get("/recognition", response_model=list[BuilderRecognition])
async def get_recognition(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GPT).where(GPT.owner_email.isnot(None)))
    gpts = result.scalars().all()

    by_owner: dict[str, list[GPT]] = {}
    for g in gpts:
        by_owner.setdefault(g.owner_email, []).append(g)

    rankings = [_builder_scores(g_list) for g_list in by_owner.values()]
    rankings.sort(key=lambda r: r.composite_score, reverse=True)
    return rankings


# ---------------------------------------------------------------------------
# LLM Recommendations — Org-wide
# ---------------------------------------------------------------------------


_DEMO_ORG_REPORT = OrgLearningReport(
    skill_gaps=[
        "Low prompting quality across 38% of assets — employees are using vague, single-sentence prompts",
        "Minimal system-prompt sophistication: 51% of assets have <100-char instructions with no persona or constraints",
        "High adoption friction on 22 assets — no onboarding context or example prompts provided",
        "47 assets with zero conversations in 30 days despite being shared with 10+ users (ghost assets)",
        "Finance GPT receiving 32% HR-related queries — knowledge gap or missing HR-specific assistant",
    ],
    recommended_courses=[
        CourseRecommendation(
            course_name="Prompt Engineering for Business",
            url="https://academy.openai.com/",
            category="Prompt Engineering",
            reasoning="38% of assets score ≤4/10 on prompting quality. This course directly addresses the org-wide pattern of vague, one-line prompts that limit asset effectiveness.",
            priority=1,
        ),
        CourseRecommendation(
            course_name="Building Custom GPTs",
            url="https://academy.openai.com/",
            category="GPT Development",
            reasoning="51% of assets have minimal instructions (<100 chars). Builders need hands-on guidance on writing effective system prompts, personas, and constraints.",
            priority=2,
        ),
        CourseRecommendation(
            course_name="ChatGPT for Business Workflows",
            url="https://academy.openai.com/",
            category="Business Productivity",
            reasoning="22 high-friction assets indicate employees struggle to integrate AI into daily work. This course builds practical workflow habits that increase adoption.",
            priority=3,
        ),
    ],
    summary=(
        "Your organisation has 500+ AI assets but adoption is uneven — ghost assets and low prompting quality "
        "suggest the tools exist but employees lack the skills to use them effectively. "
        "The highest-leverage intervention is upskilling on prompt engineering and custom GPT design, "
        "which would directly lift quality scores across 38% of the portfolio."
    ),
)


@router.post("/recommend-org", response_model=OrgLearningReport)
async def recommend_org(db: AsyncSession = Depends(get_db)):
    from app.services.demo_state import get_demo_state

    if get_demo_state()["enabled"]:
        return _DEMO_ORG_REPORT

    client = await _get_openai_client(db)

    result = await db.execute(select(GPT))
    gpts = result.scalars().all()

    if not gpts:
        return OrgLearningReport(
            skill_gaps=["No GPTs found — run a sync first"],
            recommended_courses=[],
            summary="No data available yet.",
        )

    # Aggregate org stats
    total = len(gpts)
    enriched = [g for g in gpts if g.semantic_enriched_at]
    soph_vals = [
        g.sophistication_score for g in enriched if g.sophistication_score is not None
    ]
    qual_vals = [
        g.prompting_quality_score
        for g in enriched
        if g.prompting_quality_score is not None
    ]
    risk_vals = [g for g in enriched if g.risk_level in ("high", "critical")]
    integration_vals = [g for g in enriched if g.integration_flags]
    low_quality = [
        g
        for g in enriched
        if g.prompting_quality_score is not None and g.prompting_quality_score <= 4
    ]
    low_soph = [
        g
        for g in enriched
        if g.sophistication_score is not None and g.sophistication_score <= 3
    ]
    high_friction = [
        g
        for g in enriched
        if g.adoption_friction_score is not None and g.adoption_friction_score >= 7
    ]

    bp_counts: dict[str, int] = {}
    for g in enriched:
        if g.business_process:
            bp_counts[g.business_process] = bp_counts.get(g.business_process, 0) + 1
    top_processes = sorted(bp_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    avg_soph = round(sum(soph_vals) / len(soph_vals), 1) if soph_vals else None
    avg_qual = round(sum(qual_vals) / len(qual_vals), 1) if qual_vals else None

    gpt_count = sum(1 for g in gpts if g.asset_type != "project")
    project_count = sum(1 for g in gpts if g.asset_type == "project")
    asset_breakdown = (
        f"{gpt_count} Custom GPTs + {project_count} Projects"
        if project_count
        else f"{gpt_count} Custom GPTs"
    )

    # Inject knowledge gap signals from conversation analysis (gracefully degrades if not run)
    gap_signals_section = ""
    try:
        gaps_result = await db.execute(
            select(
                AssetUsageInsight.asset_id,
                AssetUsageInsight.knowledge_gap_signals,
                GPT.name,
            )
            .join(GPT, AssetUsageInsight.asset_id == GPT.id)
            .where(AssetUsageInsight.knowledge_gap_signals.isnot(None))
            .order_by(AssetUsageInsight.analyzed_at.desc())
            .limit(10)
        )
        gap_rows = gaps_result.fetchall()
        if gap_rows:
            lines = []
            for _, signals, asset_name in gap_rows:
                if isinstance(signals, list):
                    for sig in signals[:2]:
                        topic = sig.get("topic", "")
                        example = sig.get("example_question", "")
                        lines.append(
                            f'  - {asset_name}: employees frequently ask about "{topic}"'
                            + (f'\n    Example: "{example}"' if example else "")
                        )
            if lines:
                gap_signals_section = (
                    "\nAdditional signals from employee conversation analysis:\n"
                    + "\n".join(lines)
                    + "\n"
                )
    except Exception:
        pass  # Table may not exist if migration hasn't run — skip gracefully

    org_profile = f"""
Organisation AgentsOrg — Snapshot ({total} AI assets total [{asset_breakdown}], {len(enriched)} semantically enriched):

Prompting quality:
  - Average score: {avg_qual}/10 ({len(low_quality)} assets scored ≤4/10 — "poor quality")
  - {len(low_quality)} poor-quality assets out of {len(enriched)} enriched ({round(len(low_quality) / max(len(enriched), 1) * 100)}%)

Sophistication:
  - Average score: {avg_soph}/10 ({len(low_soph)} assets scored ≤3/10 — "minimal instructions")
  - {len(low_soph)} low-sophistication assets ({round(len(low_soph) / max(len(enriched), 1) * 100)}%)

Integrations:
  - {len(integration_vals)} of {len(enriched)} assets have integrations ({round(len(integration_vals) / max(len(enriched), 1) * 100)}%)

Risk:
  - {len(risk_vals)} assets rated high/critical risk ({round(len(risk_vals) / max(len(enriched), 1) * 100)}%)

Adoption friction:
  - {len(high_friction)} assets with high adoption friction score (≥7/10)

Top business processes: {", ".join(f"{bp} ({cnt})" for bp, cnt in top_processes) or "none mapped yet"}
{gap_signals_section}"""

    # Step 1: identify skill gaps and search topics via chat.completions
    # Topics must map to what academy.openai.com actually offers (general AI skills)
    top_processes_str = ", ".join(f"{bp}" for bp, _ in top_processes) or "general"
    analysis = await _llm_json(
        client,
        "You are an L&D analyst. Identify skill gaps and generate search topics for academy.openai.com. "
        "academy.openai.com teaches general AI/ChatGPT skills: prompt engineering, building custom GPTs, "
        "ChatGPT for business, AI for professions (sales, HR, educators, developers), "
        "responsible AI, workflow automation. It does NOT teach domain-specific software. "
        "Map the org's gaps to these AI skill categories. "
        'Return JSON: {"skill_gaps": ["..."], "summary": "...", '
        '"search_topics": ["prompt engineering", "building custom GPTs", "ChatGPT for business"]}',
        f"{org_profile}\n\nOrg domain: {top_processes_str}\n\n"
        "Generate 2-3 academy.openai.com search topics that match this org's AI skill gaps. "
        "Use general AI skill terms, not domain-specific ones.",
    )

    # Step 2: fetch academy.openai.com video catalog via direct HTTP scrape
    found_courses: list[dict] = []
    try:
        all_videos = await _fetch_academy_catalog()
        # Include all videos (instructional + showcase) so the LLM has maximum variety.
        # Showcase videos are labelled so the LLM can still deprioritise them if not relevant.
        found_courses = list(all_videos)
    except Exception:
        logger.exception("Academy catalog fetch failed for org")

    # Merge custom courses from DB into pool
    custom_result = await db.execute(select(CustomCourse))
    for c in custom_result.scalars().all():
        found_courses.append(
            {
                "title": c.description,
                "url": c.url,
                "tags": ["Custom"],
                "summary": "",
                "duration_min": 0,
                "view_count": 0,
                "is_showcase": False,
                "is_custom": True,
            }
        )

    # Shuffle so view-count ordering doesn't anchor the LLM to the same top items every call
    random.shuffle(found_courses)

    # Step 3: if we found courses, ask LLM to select best matches with reasoning
    courses: list[CourseRecommendation] = []
    if found_courses:
        valid_urls = {c["url"] for c in found_courses}
        catalog_text = "\n".join(
            f"{i + 1}. {'[Custom] ' if c.get('is_custom') else '[Showcase] ' if c.get('is_showcase') else ''}{c['title']} | tags: {', '.join(c['tags'][:4])} | {c['duration_min']}min | {c['url']}"
            + (f"\n   {c['summary']}" if c["summary"] else "")
            for i, c in enumerate(found_courses)
        )
        skill_gaps_str = ", ".join(analysis.get("skill_gaps", []))
        selection = await _llm_json(
            client,
            "You are an L&D analyst. Select the most relevant courses for this org. "
            "The list includes OpenAI Academy videos and [Custom] courses uploaded by the organisation. "
            'Return JSON: {"recommended_courses": [{"course_name": "exact title from list", '
            '"url": "exact url from list", "category": "tag from list", '
            '"reasoning": "evidence-backed reason tied to org stats", "priority": 1}]}',
            f"{org_profile}\n\nIdentified skill gaps: {skill_gaps_str}\n\n"
            f"Available courses:\n{catalog_text}\n\n"
            "Select the best 3 courses. Use ONLY the exact titles and URLs from the list above.",
        )
        for rec in selection.get("recommended_courses", []):
            url = rec.get("url", "")
            if url not in valid_urls:
                continue
            courses.append(
                CourseRecommendation(
                    course_name=rec.get("course_name", ""),
                    url=url,
                    category=rec.get("category", ""),
                    reasoning=rec.get("reasoning", ""),
                    priority=rec.get("priority", 99),
                )
            )
        courses.sort(key=lambda c: c.priority)

    return OrgLearningReport(
        skill_gaps=analysis.get("skill_gaps", []),
        recommended_courses=courses,
        summary=analysis.get("summary", ""),
    )


# ---------------------------------------------------------------------------
# LLM Recommendations — Per employee
# ---------------------------------------------------------------------------


@router.post("/recommend-employee", response_model=EmployeeLearningReport)
async def recommend_employee(body: dict, db: AsyncSession = Depends(get_db)):
    email = body.get("email", "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="email is required")

    client = await _get_openai_client(db)

    result = await db.execute(select(GPT).where(GPT.owner_email == email))
    gpts = result.scalars().all()

    if not gpts:
        return EmployeeLearningReport(
            employee_email=email,
            recommended_courses=[],
            gap_summary=f"No GPTs found for {email}. They may not have built any GPTs yet.",
        )

    scores = _builder_scores(gpts)
    enriched = [g for g in gpts if g.semantic_enriched_at]
    has_integrations = any(g.integration_flags for g in gpts)
    risk_flags_present = any(g.risk_flags for g in gpts)
    high_friction = [
        g
        for g in enriched
        if g.adoption_friction_score is not None and g.adoption_friction_score >= 7
    ]

    # Derive domain context from the actual GPT data
    business_processes = list({g.business_process for g in gpts if g.business_process})
    intended_audiences = list(
        {g.intended_audience for g in gpts if g.intended_audience}
    )
    output_types = list({g.output_type for g in gpts if g.output_type})

    # Per-asset detail — this is what differentiates people with similar aggregate scores
    gpt_lines = []
    for g in gpts:
        asset_label = "Project" if g.asset_type == "project" else "GPT"
        parts = [f'  • [{asset_label}] "{g.name}"']
        if g.business_process:
            parts.append(f"process={g.business_process}")
        if g.prompting_quality_score is not None:
            parts.append(f"quality={g.prompting_quality_score}/10")
        if g.sophistication_score is not None:
            parts.append(f"soph={g.sophistication_score}/10")
        if g.prompting_quality_flags:
            parts.append(f"quality_issues={g.prompting_quality_flags}")
        if g.risk_level and g.risk_level not in ("low", None):
            parts.append(f"risk={g.risk_level}")
        if g.risk_flags:
            parts.append(f"risk_flags={g.risk_flags}")
        if g.integration_flags:
            parts.append(f"integrations={g.integration_flags}")
        if g.output_type:
            parts.append(f"output={g.output_type}")
        if g.adoption_friction_score is not None:
            parts.append(f"friction={g.adoption_friction_score}/10")
        gpt_lines.append(", ".join(parts))

    domain_summary = (
        f"Business processes: {', '.join(business_processes)}\n"
        f"Intended audiences: {', '.join(intended_audiences)}\n"
        f"Output types: {', '.join(output_types)}"
        if (business_processes or intended_audiences or output_types)
        else "Domain context: not yet enriched"
    )

    safe_email = email.replace("\n", " ").replace("\r", " ")
    safe_name = (scores.name or "unknown").replace("\n", " ").replace("\r", " ")
    profile = f"""
Builder: {safe_email} (display name: {safe_name})
AI assets built: {scores.gpt_count} ({sum(1 for g in gpts if g.asset_type != "project")} GPTs, {sum(1 for g in gpts if g.asset_type == "project")} Projects)

Domain context (what this person actually builds):
{domain_summary}

Aggregate scores (0-100 scale):
  Prompting quality: {scores.quality_score} (raw avg {scores.avg_quality}/10)
  Sophistication:    (raw avg {scores.avg_sophistication}/10)
  Adoption:          {scores.adoption_score}
  Risk hygiene:      {scores.risk_hygiene_score}

Individual assets:
{chr(10).join(gpt_lines) if gpt_lines else "  (no data)"}

Has any integrations: {"yes" if has_integrations else "no"}
Has risk flags on any GPT: {"yes" if risk_flags_present else "no"}
GPTs with high adoption friction (≥7): {len(high_friction)} of {len(enriched)} enriched
"""

    domain_ctx = (
        ", ".join(business_processes) if business_processes else "general/unknown"
    )

    # Step 1: identify gaps and search topics via chat.completions
    # Topics must map to what academy.openai.com actually offers (general AI skills, not domain-specific)
    analysis = await _llm_json(
        client,
        "You are an L&D coach. Analyse this builder's portfolio and generate search topics for "
        "academy.openai.com — the OpenAI training platform teaching general AI/ChatGPT skills. "
        "academy.openai.com covers: prompt engineering, building custom GPTs, ChatGPT for business, "
        "AI for professions (sales, HR, teachers, developers), responsible AI, workflow automation. "
        "It does NOT teach domain-specific software (no NetSuite, no SAP, no Excel). "
        "Map the person's gaps to these AI skill categories for searching. "
        f"The person's domain is: {domain_ctx} — use this for reasoning but generate AI-skill search topics. "
        'Return JSON: {"gap_summary": "...", '
        '"search_topics": ["prompt engineering", "building custom GPTs"]}',
        f"{profile}\n\nGenerate 2-3 academy.openai.com search topics that match this person's AI skill gaps.",
    )

    # Step 2: fetch academy.openai.com video catalog via direct HTTP scrape
    found_courses: list[dict] = []
    try:
        all_videos = await _fetch_academy_catalog()
        # Include all videos; showcase videos are labelled so LLM can weigh relevance
        found_courses = list(all_videos)
    except Exception:
        logger.exception("Academy catalog fetch failed for %s", email)

    # Merge custom courses from DB into pool
    custom_result = await db.execute(select(CustomCourse))
    for c in custom_result.scalars().all():
        found_courses.append(
            {
                "title": c.description,
                "url": c.url,
                "tags": ["Custom"],
                "summary": "",
                "duration_min": 0,
                "view_count": 0,
                "is_showcase": False,
                "is_custom": True,
            }
        )

    # Shuffle so view-count ordering doesn't anchor the LLM to the same top items every call
    random.shuffle(found_courses)

    # Step 3: select best matches with specific reasoning
    courses: list[CourseRecommendation] = []
    if found_courses:
        valid_urls = {c["url"] for c in found_courses}
        catalog_text = "\n".join(
            f"{i + 1}. {'[Custom] ' if c.get('is_custom') else '[Showcase] ' if c.get('is_showcase') else ''}{c['title']} | tags: {', '.join(c['tags'][:4])} | {c['duration_min']}min | {c['url']}"
            + (f"\n   {c['summary']}" if c["summary"] else "")
            for i, c in enumerate(found_courses)
        )
        gap_summary = analysis.get("gap_summary", "")
        selection = await _llm_json(
            client,
            f"You are an L&D coach. Select the most relevant courses for this builder. "
            f"Domain: {domain_ctx}. Reasoning must reference specific GPT names and scores. "
            "The list includes OpenAI Academy videos and [Custom] courses uploaded by the organisation. "
            'Return JSON: {"recommended_courses": [{"course_name": "exact title from list", '
            '"url": "exact url from list", "category": "tag from list", '
            '"reasoning": "specific reason with GPT metrics", "priority": 1}]}',
            f"{profile}\n\nGap summary: {gap_summary}\n\n"
            f"Available courses:\n{catalog_text}\n\n"
            "Select 3 courses. Use ONLY the exact titles and URLs from the list above.",
        )
        for rec in selection.get("recommended_courses", []):
            url = rec.get("url", "")
            if url not in valid_urls:
                continue
            courses.append(
                CourseRecommendation(
                    course_name=rec.get("course_name", ""),
                    url=url,
                    category=rec.get("category", ""),
                    reasoning=rec.get("reasoning", ""),
                    priority=rec.get("priority", 99),
                )
            )
        courses.sort(key=lambda c: c.priority)

    return EmployeeLearningReport(
        employee_email=email,
        recommended_courses=courses,
        gap_summary=analysis.get("gap_summary", ""),
    )


# ---------------------------------------------------------------------------
# Custom Courses
# ---------------------------------------------------------------------------


@router.get("/custom-courses", response_model=list[CustomCourseRead])
async def list_custom_courses(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CustomCourse).order_by(CustomCourse.uploaded_at.desc())
    )
    return result.scalars().all()


@router.post("/custom-courses/upload", response_model=CustomCourseUploadResult)
async def upload_custom_courses(
    file: UploadFile = File(...), db: AsyncSession = Depends(get_db)
):
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    content = (await file.read()).decode("utf-8", errors="replace")
    reader = csv.DictReader(io.StringIO(content))

    added = 0
    updated = 0
    errors: list[str] = []

    for row_num, row in enumerate(reader, start=2):  # row 1 is header
        url = (row.get("url") or "").strip()
        description = (row.get("description") or "").strip()
        if not url or not description:
            errors.append(f"Row {row_num}: missing url or description — skipped")
            continue

        # Check existence before upsert to distinguish added vs updated
        existing = await db.execute(select(CustomCourse).where(CustomCourse.url == url))
        exists = existing.scalar_one_or_none() is not None

        stmt = (
            pg_insert(CustomCourse)
            .values(url=url, description=description)
            .on_conflict_do_update(
                index_elements=["url"],
                set_={"description": description},
            )
        )
        await db.execute(stmt)

        if exists:
            updated += 1
        else:
            added += 1

    await db.commit()
    return CustomCourseUploadResult(added=added, updated=updated, errors=errors)


@router.delete("/custom-courses/{course_id}", status_code=204)
async def delete_custom_course(course_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CustomCourse).where(CustomCourse.id == course_id))
    course = result.scalar_one_or_none()
    if not course:
        raise HTTPException(status_code=404, detail="Custom course not found")
    await db.delete(course)
    await db.commit()


# ---------------------------------------------------------------------------
# Workshop CRUD
# ---------------------------------------------------------------------------


def _workshop_to_read(w: Workshop) -> WorkshopRead:
    return WorkshopRead(
        id=w.id,
        title=w.title,
        description=w.description,
        event_date=w.event_date,
        duration_hours=w.duration_hours,
        facilitator=w.facilitator,
        created_at=w.created_at,
        participant_count=len(w.participants),
        participant_emails=[p.employee_email for p in w.participants],
        tagged_gpt_count=len(w.gpt_tags),
    )


def _with_rels():
    return select(Workshop).options(
        selectinload(Workshop.participants), selectinload(Workshop.gpt_tags)
    )


@router.get("/workshops", response_model=list[WorkshopRead])
async def list_workshops(db: AsyncSession = Depends(get_db)):
    result = await db.execute(_with_rels().order_by(Workshop.event_date.desc()))
    workshops = result.scalars().all()
    return [_workshop_to_read(w) for w in workshops]


@router.post("/workshops", response_model=WorkshopRead, status_code=201)
async def create_workshop(body: WorkshopCreate, db: AsyncSession = Depends(get_db)):
    w = Workshop(**body.model_dump())
    db.add(w)
    await db.commit()
    result = await db.execute(_with_rels().where(Workshop.id == w.id))
    w = result.scalar_one()
    return _workshop_to_read(w)


@router.put("/workshops/{workshop_id}", response_model=WorkshopRead)
async def update_workshop(
    workshop_id: int, body: WorkshopCreate, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(_with_rels().where(Workshop.id == workshop_id))
    w = result.scalar_one_or_none()
    if not w:
        raise HTTPException(status_code=404, detail="Workshop not found")
    for k, v in body.model_dump().items():
        setattr(w, k, v)
    await db.commit()
    result = await db.execute(_with_rels().where(Workshop.id == workshop_id))
    w = result.scalar_one()
    return _workshop_to_read(w)


@router.delete("/workshops/{workshop_id}", status_code=204)
async def delete_workshop(workshop_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Workshop).where(Workshop.id == workshop_id))
    w = result.scalar_one_or_none()
    if not w:
        raise HTTPException(status_code=404, detail="Workshop not found")
    await db.delete(w)
    await db.commit()


# ---------------------------------------------------------------------------
# Participants
# ---------------------------------------------------------------------------


@router.post("/workshops/{workshop_id}/participants", status_code=201)
async def add_participant(
    workshop_id: int, body: dict, db: AsyncSession = Depends(get_db)
):
    email = body.get("email", "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="email is required")
    result = await db.execute(select(Workshop).where(Workshop.id == workshop_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Workshop not found")
    p = WorkshopParticipant(workshop_id=workshop_id, employee_email=email)
    db.add(p)
    try:
        await db.commit()
    except Exception:
        await db.rollback()  # duplicate key — already a participant
    return {"workshop_id": workshop_id, "employee_email": email}


@router.delete("/workshops/{workshop_id}/participants/{email}", status_code=204)
async def remove_participant(
    workshop_id: int, email: str, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(WorkshopParticipant).where(
            WorkshopParticipant.workshop_id == workshop_id,
            WorkshopParticipant.employee_email == email,
        )
    )
    p = result.scalar_one_or_none()
    if p:
        await db.delete(p)
        await db.commit()


# ---------------------------------------------------------------------------
# GPT Tags
# ---------------------------------------------------------------------------


@router.post("/workshops/{workshop_id}/tag-gpt", status_code=201)
async def tag_gpt(workshop_id: int, body: dict, db: AsyncSession = Depends(get_db)):
    gpt_id = body.get("gpt_id", "").strip()
    if not gpt_id:
        raise HTTPException(status_code=400, detail="gpt_id is required")
    result = await db.execute(select(Workshop).where(Workshop.id == workshop_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Workshop not found")
    tag = WorkshopGPTTag(workshop_id=workshop_id, gpt_id=gpt_id)
    db.add(tag)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
    return {"workshop_id": workshop_id, "gpt_id": gpt_id}


@router.delete("/workshops/{workshop_id}/tag-gpt/{gpt_id}", status_code=204)
async def untag_gpt(workshop_id: int, gpt_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(WorkshopGPTTag).where(
            WorkshopGPTTag.workshop_id == workshop_id,
            WorkshopGPTTag.gpt_id == gpt_id,
        )
    )
    tag = result.scalar_one_or_none()
    if tag:
        await db.delete(tag)
        await db.commit()


# ---------------------------------------------------------------------------
# Workshop Impact
# ---------------------------------------------------------------------------


def _demo_workshop_impact(
    w: Workshop, tagged_asset_details: list[TaggedAssetDetail]
) -> WorkshopImpact:
    """Return synthetic impact stats for demo workshops."""
    import random as _random

    rng = _random.Random(w.id * 17)  # deterministic per workshop
    participants = [p.employee_email for p in w.participants]
    auto_stats: list[WorkshopImpactAuto] = []
    delta_qualities: list[float] = []
    delta_sophs: list[float] = []
    for email in participants:
        q_before = round(rng.uniform(3.5, 5.5), 1)
        q_after = round(q_before + rng.uniform(1.2, 2.8), 1)
        s_before = round(rng.uniform(3.0, 5.0), 1)
        s_after = round(s_before + rng.uniform(1.0, 2.5), 1)
        n_before = rng.randint(1, 4)
        n_after = rng.randint(1, 5)
        auto_stats.append(
            WorkshopImpactAuto(
                participant_email=email,
                gpts_before=n_before,
                gpts_after=n_after,
                avg_quality_before=q_before,
                avg_quality_after=min(q_after, 10.0),
                avg_sophistication_before=s_before,
                avg_sophistication_after=min(s_after, 10.0),
            )
        )
        delta_qualities.append(min(q_after, 10.0) - q_before)
        delta_sophs.append(min(s_after, 10.0) - s_before)
    return WorkshopImpact(
        workshop_id=w.id,
        auto_stats=auto_stats,
        tagged_gpts=[t.gpt_id for t in w.gpt_tags],
        tagged_asset_details=tagged_asset_details,
        summary_delta_quality=round(sum(delta_qualities) / len(delta_qualities), 2)
        if delta_qualities
        else None,
        summary_delta_sophistication=round(sum(delta_sophs) / len(delta_sophs), 2)
        if delta_sophs
        else None,
    )


@router.get("/workshops/{workshop_id}/impact", response_model=WorkshopImpact)
async def get_workshop_impact(workshop_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(_with_rels().where(Workshop.id == workshop_id))
    w = result.scalar_one_or_none()
    if not w:
        raise HTTPException(status_code=404, detail="Workshop not found")

    event_dt = datetime(
        w.event_date.year, w.event_date.month, w.event_date.day, tzinfo=timezone.utc
    )
    participant_emails = [p.employee_email for p in w.participants]

    auto_stats: list[WorkshopImpactAuto] = []
    delta_qualities: list[float] = []
    delta_sophs: list[float] = []

    for email in participant_emails:
        gpt_result = await db.execute(
            select(GPT).where(GPT.owner_email == email, GPT.indexed_at.isnot(None))
        )
        all_gpts = gpt_result.scalars().all()

        before = [g for g in all_gpts if g.indexed_at and g.indexed_at < event_dt]
        after = [g for g in all_gpts if g.indexed_at and g.indexed_at >= event_dt]

        def _avg(lst: list[GPT], attr: str) -> float | None:
            vals = [getattr(g, attr) for g in lst if getattr(g, attr) is not None]
            return round(sum(vals) / len(vals), 1) if vals else None

        aq_before = _avg(before, "prompting_quality_score")
        aq_after = _avg(after, "prompting_quality_score")
        as_before = _avg(before, "sophistication_score")
        as_after = _avg(after, "sophistication_score")

        auto_stats.append(
            WorkshopImpactAuto(
                participant_email=email,
                gpts_before=len(before),
                gpts_after=len(after),
                avg_quality_before=aq_before,
                avg_quality_after=aq_after,
                avg_sophistication_before=as_before,
                avg_sophistication_after=as_after,
            )
        )

        if aq_before is not None and aq_after is not None:
            delta_qualities.append(aq_after - aq_before)
        if as_before is not None and as_after is not None:
            delta_sophs.append(as_after - as_before)

    summary_delta_quality = (
        round(sum(delta_qualities) / len(delta_qualities), 2)
        if delta_qualities
        else None
    )
    summary_delta_soph = (
        round(sum(delta_sophs) / len(delta_sophs), 2) if delta_sophs else None
    )

    # Fetch full details for tagged assets
    tagged_gpt_ids = [t.gpt_id for t in w.gpt_tags]
    tagged_asset_details: list[TaggedAssetDetail] = []
    if tagged_gpt_ids:
        cat_result = await db.execute(select(Category))
        cat_lookup: dict[int, str] = {c.id: c.name for c in cat_result.scalars().all()}
        gpt_result = await db.execute(select(GPT).where(GPT.id.in_(tagged_gpt_ids)))
        for g in gpt_result.scalars().all():
            tagged_asset_details.append(
                TaggedAssetDetail(
                    gpt_id=g.id,
                    name=g.name,
                    asset_type=g.asset_type or "gpt",
                    owner_email=g.owner_email,
                    quality_score=g.prompting_quality_score,
                    sophistication_score=g.sophistication_score,
                    roi_potential_score=g.roi_potential_score,
                    risk_level=g.risk_level,
                    primary_category=cat_lookup.get(g.primary_category_id)
                    if g.primary_category_id
                    else None,
                )
            )

    from app.services.demo_state import get_demo_state

    if get_demo_state()["enabled"]:
        return _demo_workshop_impact(w, tagged_asset_details)

    return WorkshopImpact(
        workshop_id=workshop_id,
        auto_stats=auto_stats,
        tagged_gpts=tagged_gpt_ids,
        tagged_asset_details=tagged_asset_details,
        summary_delta_quality=summary_delta_quality,
        summary_delta_sophistication=summary_delta_soph,
    )
