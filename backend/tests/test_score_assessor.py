"""Score assessor tests — T_S1 through T_S8.

Tests for the Phase 1 (Monday Command Center) score assessment:
  - MockScoreAssessor determinism and tier distribution
  - needs_reassessment() freshness logic
  - Pipeline Stage 6: scores persisted via UPDATE after run
  - Pipeline Stage 8: workspace recommendations generated
  - GET /pipeline/gpts returns score fields
  - GET /pipeline/summary returns quadrant counts
  - GET /pipeline/recommendations returns actions + summary
  - Score fields absent before pipeline run
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from httpx import AsyncClient

from app.models.models import GPT, Configuration
from app.services.mock_score_assessor import MockScoreAssessor
from app.services.score_assessor import needs_reassessment


# ── Helpers ────────────────────────────────────────────────────────────────────


def _make_gpt(**overrides) -> GPT:
    """Minimal GPT object for testing."""
    defaults = dict(
        id="g-test01",
        name="Test GPT",
        instructions="You are a helpful assistant.",
        shared_user_count=5,
        conversation_count=0,
        asset_type="gpt",
        scores_assessed_at=None,
        semantic_enriched_at=None,
        last_conversation_at=None,
        quality_score=None,
        adoption_score=None,
        risk_score=None,
        sophistication_score=None,
    )
    defaults.update(overrides)
    return GPT(**defaults)


def _make_config(db_session) -> Configuration:
    config = Configuration(
        openai_api_key="enc:test-key",
        base_url="https://api.openai.com",
        workspace_id="ws-test",
        classification_enabled=True,
        classification_model="gpt-4o-mini",
    )
    db_session.add(config)
    return config


# ── T_S1: MockScoreAssessor is deterministic ──────────────────────────────────


def test_TS1_mock_assessor_deterministic():
    """MockScoreAssessor returns identical results on repeated calls (seed=42)."""
    gpt = _make_gpt(
        instructions="You are a detailed financial reporting assistant. " * 10
    )

    assessor = MockScoreAssessor()
    results_a = assessor.assess_batch([gpt])

    assessor2 = MockScoreAssessor()
    results_b = assessor2.assess_batch([gpt])

    assert results_a[0]["quality_score"] == results_b[0]["quality_score"]
    assert results_a[0]["adoption_score"] == results_b[0]["adoption_score"]
    assert results_a[0]["quadrant_label"] == results_b[0]["quadrant_label"]


# ── T_S2: MockScoreAssessor tier distribution ─────────────────────────────────


def test_TS2_mock_assessor_tier3_champion():
    """Tier-3 GPT (rich instructions) gets champion-range scores."""
    gpt = _make_gpt(
        sophistication_score=4,
        instructions="You are an expert financial analyst. " * 20,
    )
    assessor = MockScoreAssessor()
    scores = assessor.assess_batch([gpt])[0]

    assert scores["quality_score"] >= 60, "Tier 3 should have quality >= 60"
    assert scores["adoption_score"] >= 60, "Tier 3 should have adoption >= 60"
    assert scores["quadrant_label"] == "champion"
    assert scores["score_confidence"] == "high"


def test_TS2b_mock_assessor_tier1_retirement():
    """Tier-1 GPT (minimal instructions) gets retirement_candidate scores."""
    gpt = _make_gpt(sophistication_score=1, instructions="Help me.")
    assessor = MockScoreAssessor()
    scores = assessor.assess_batch([gpt])[0]

    assert scores["quality_score"] < 40, "Tier 1 should have quality < 40"
    assert scores["quadrant_label"] == "retirement_candidate"
    assert scores["score_confidence"] == "low"


# ── T_S3: needs_reassessment() freshness logic ────────────────────────────────


def test_TS3_needs_reassessment_no_timestamp():
    """Asset with no scores_assessed_at always needs reassessment."""
    gpt = _make_gpt(scores_assessed_at=None)
    assert needs_reassessment(gpt) is True


def test_TS3b_needs_reassessment_fresh():
    """Asset scored after last enrichment is considered fresh."""
    now = datetime.now(timezone.utc)
    gpt = _make_gpt(
        scores_assessed_at=now,
        semantic_enriched_at=None,
        last_conversation_at=None,
    )
    assert needs_reassessment(gpt) is False


def test_TS3c_needs_reassessment_stale_enrichment():
    """Asset re-enriched after scoring needs reassessment."""
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    gpt = _make_gpt(
        scores_assessed_at=now - timedelta(hours=1),
        semantic_enriched_at=now,  # enriched AFTER scoring
    )
    assert needs_reassessment(gpt) is True


def test_TS3d_needs_reassessment_new_conversation():
    """Asset with new conversation after scoring needs reassessment."""
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    gpt = _make_gpt(
        scores_assessed_at=now - timedelta(hours=1),
        semantic_enriched_at=None,
        last_conversation_at=now,  # conversation after scoring
    )
    assert needs_reassessment(gpt) is True


# ── T_S4: MockScoreAssessor score dict completeness ──────────────────────────


def test_TS4_score_dict_has_all_required_keys():
    """MockScoreAssessor returns all required score fields."""
    required = {
        "quality_score",
        "quality_score_rationale",
        "quality_main_strength",
        "adoption_score",
        "adoption_score_rationale",
        "adoption_signal",
        "risk_score",
        "risk_score_rationale",
        "risk_primary_driver",
        "risk_urgency",
        "quadrant_label",
        "top_action",
        "score_confidence",
        "scores_assessed_at",
    }
    gpt = _make_gpt(sophistication_score=2, instructions="Medium instructions. " * 5)
    assessor = MockScoreAssessor()
    scores = assessor.assess_batch([gpt])[0]

    missing = required - scores.keys()
    assert not missing, f"Missing required keys: {missing}"


def test_TS4b_quadrant_label_consistent_with_scores():
    """quadrant_label must match the quality/adoption score thresholds."""
    assessor = MockScoreAssessor()
    gpts = [
        _make_gpt(id=f"g-test{i}", sophistication_score=s, instructions="x " * 50)
        for i, s in enumerate([1, 2, 4])
    ]
    for gpt in gpts:
        scores = assessor.assess_batch([gpt])[0]
        q = scores["quality_score"]
        a = scores["adoption_score"]
        label = scores["quadrant_label"]
        if q >= 60 and a >= 60:
            assert label == "champion", f"Should be champion: q={q}, a={a}"
        elif q >= 60 and a < 60:
            assert label == "hidden_gem", f"Should be hidden_gem: q={q}, a={a}"
        elif q < 60 and a >= 60:
            assert label == "scaled_risk", f"Should be scaled_risk: q={q}, a={a}"
        else:
            assert label == "retirement_candidate", (
                f"Should be retirement_candidate: q={q}, a={a}"
            )


# ── T_S5: /pipeline/gpts returns score fields ─────────────────────────────────


@pytest.mark.asyncio
async def test_TS5_pipeline_gpts_returns_score_fields(client: AsyncClient, db_session):
    """GET /pipeline/gpts includes score fields for scored assets."""
    from sqlalchemy import insert
    from app.models.models import Category

    # Insert a category
    await db_session.execute(
        insert(Category).values(id=1, name="Test", color="#000000")
    )
    # Insert a scored GPT
    gpt = GPT(
        id="g-scored01",
        name="Scored GPT",
        quality_score=72.5,
        adoption_score=45.0,
        risk_score=20.0,
        quadrant_label="hidden_gem",
        top_action="Promote to the team",
        score_confidence="medium",
        scores_assessed_at=datetime.now(timezone.utc),
        asset_type="gpt",
        shared_user_count=10,
        conversation_count=5,
    )
    db_session.add(gpt)
    await db_session.commit()

    resp = await client.get("/api/v1/pipeline/gpts")
    assert resp.status_code == 200
    gpts = resp.json()
    scored = [g for g in gpts if g["id"] == "g-scored01"]
    assert len(scored) == 1
    g = scored[0]
    assert g["quality_score"] == 72.5
    assert g["adoption_score"] == 45.0
    assert g["quadrant_label"] == "hidden_gem"
    assert g["top_action"] == "Promote to the team"
    assert g["score_confidence"] == "medium"


# ── T_S6: /pipeline/summary returns quadrant counts ──────────────────────────


@pytest.mark.asyncio
async def test_TS6_pipeline_summary_quadrant_counts(client: AsyncClient, db_session):
    """GET /pipeline/summary includes scores_assessed, champions, hidden_gems, etc."""
    gpts = [
        GPT(
            id="g-c1",
            name="Champion",
            quality_score=75.0,
            adoption_score=70.0,
            quadrant_label="champion",
            asset_type="gpt",
            shared_user_count=0,
            conversation_count=0,
            scores_assessed_at=datetime.now(timezone.utc),
        ),
        GPT(
            id="g-h1",
            name="Hidden Gem",
            quality_score=65.0,
            adoption_score=30.0,
            quadrant_label="hidden_gem",
            asset_type="gpt",
            shared_user_count=0,
            conversation_count=0,
            scores_assessed_at=datetime.now(timezone.utc),
        ),
        GPT(
            id="g-r1",
            name="Retirement",
            quality_score=20.0,
            adoption_score=5.0,
            quadrant_label="retirement_candidate",
            asset_type="gpt",
            shared_user_count=0,
            conversation_count=0,
            scores_assessed_at=datetime.now(timezone.utc),
        ),
        # Ghost: shared but 0 conversations
        GPT(
            id="g-ghost",
            name="Ghost",
            quality_score=None,
            asset_type="gpt",
            shared_user_count=10,
            conversation_count=0,
        ),
    ]
    for g in gpts:
        db_session.add(g)
    await db_session.commit()

    resp = await client.get("/api/v1/pipeline/summary")
    assert resp.status_code == 200
    data = resp.json()

    assert data["scores_assessed"] == 3
    assert data["champions"] == 1
    assert data["hidden_gems"] == 1
    assert data["retirement_candidates"] == 1
    assert data["ghost_assets"] == 1
    assert data["scaled_risk"] == 0


# ── T_S7: /pipeline/recommendations returns 404 when empty ───────────────────


@pytest.mark.asyncio
async def test_TS7_recommendations_404_when_empty(client: AsyncClient, db_session):
    """GET /pipeline/recommendations returns 404 when no recommendations exist."""
    resp = await client.get("/api/v1/pipeline/recommendations")
    assert resp.status_code == 404


# ── T_S8: /pipeline/recommendations returns data when populated ───────────────


@pytest.mark.asyncio
async def test_TS8_recommendations_returns_data(client: AsyncClient, db_session):
    """GET /pipeline/recommendations returns most recent WorkspaceRecommendation."""
    from app.models.models import WorkspaceRecommendation

    actions = [
        {
            "priority": 1,
            "category": "risk",
            "title": "Fix risk",
            "description": "Address top risk assets immediately.",
            "impact": "high",
            "effort": "low",
            "asset_ids": [],
            "reasoning": "top risk",
        },
    ]
    rec = WorkspaceRecommendation(
        sync_log_id=None,
        recommendations=actions,
        executive_summary="Portfolio needs attention.",
        generated_at=datetime.now(timezone.utc),
    )
    db_session.add(rec)
    await db_session.commit()

    resp = await client.get("/api/v1/pipeline/recommendations")
    assert resp.status_code == 200
    data = resp.json()
    assert data["executive_summary"] == "Portfolio needs attention."
    assert len(data["recommendations"]) == 1
    assert data["recommendations"][0]["category"] == "risk"
