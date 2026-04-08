"""Prompt library — all LLM prompts in one place.

Naming convention:
  P01  Asset profile (9-KPI semantic enrichment)
  P02  Classifier (category + use-case description)
  P03  Fingerprint (purpose fingerprint via Claude)
  P04  Asset scores (quality + adoption + risk composite scores)
  P05  Topic analysis (conversation Stage 3, anonymous)
  P06  Priority actions (workspace-level action cards)
  P07  Executive summary (board-ready narrative)
  P08  Org learning gaps (L&D skill gap analysis)
  P09  Org course selection (course recommendations for org)
  P10  Employee learning gaps (per-builder gap analysis)
  P11  Employee course selection (per-builder course recommendations)
  P12  Business process normalization (canonical BP names)
  P13  Workflow intelligence (coverage analysis + reasoning)
"""

from . import (  # noqa: F401
    P01_asset_profile,
    P02_classifier,
    P03_fingerprint,
    P04_asset_scores,
    P05_topic_analysis,
    P06_priority_actions,
    P07_executive_summary,
    P08_org_learning_gaps,
    P09_org_course_selection,
    P10_employee_learning_gaps,
    P11_employee_course_selection,
    P12_business_process_normalization,
    P13_workflow_intelligence,
)
