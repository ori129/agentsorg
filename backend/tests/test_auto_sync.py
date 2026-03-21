"""Auto-sync scheduler unit tests — T_AS1 through T_AS5.

Tests the _should_run_auto_sync() pure function extracted from _auto_sync_loop.

  T_AS1: auto_sync_enabled=False → returns False
  T_AS2: enabled=True, last sync 2h ago with 24h interval → returns False (too soon)
  T_AS3: enabled=True, last sync 25h ago with 24h interval → returns True (overdue)
  T_AS4: enabled=True, never synced before (last_sync=None) → returns True
  T_AS5: enabled=True, overdue, but pipeline already running → returns False

Pure unit tests — no DB, no async, no mocking needed.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

from app.main import _should_run_auto_sync


def _config(enabled: bool = True, interval_hours: int = 24) -> MagicMock:
    cfg = MagicMock()
    cfg.auto_sync_enabled = enabled
    cfg.auto_sync_interval_hours = interval_hours
    return cfg


def _last_sync(finished_hours_ago: float) -> MagicMock:
    log = MagicMock()
    log.finished_at = datetime.now(timezone.utc) - timedelta(hours=finished_hours_ago)
    return log


# ── T_AS1 ─────────────────────────────────────────────────────────────────────


def test_TAS1_disabled_does_not_trigger():
    """auto_sync_enabled=False → never fires, regardless of last sync time."""
    assert _should_run_auto_sync(
        config=_config(enabled=False),
        last_sync=_last_sync(48),  # overdue, but doesn't matter
        pipeline_running=False,
    ) is False


# ── T_AS2 ─────────────────────────────────────────────────────────────────────


def test_TAS2_too_soon_does_not_trigger():
    """Last sync was 2h ago with 24h interval → not yet due."""
    assert _should_run_auto_sync(
        config=_config(enabled=True, interval_hours=24),
        last_sync=_last_sync(2),
        pipeline_running=False,
    ) is False


# ── T_AS3 ─────────────────────────────────────────────────────────────────────


def test_TAS3_overdue_triggers():
    """Last sync was 25h ago with 24h interval → due, should fire."""
    assert _should_run_auto_sync(
        config=_config(enabled=True, interval_hours=24),
        last_sync=_last_sync(25),
        pipeline_running=False,
    ) is True


# ── T_AS4 ─────────────────────────────────────────────────────────────────────


def test_TAS4_no_prior_sync_triggers():
    """No prior completed sync → always due, should fire."""
    assert _should_run_auto_sync(
        config=_config(enabled=True),
        last_sync=None,
        pipeline_running=False,
    ) is True


# ── T_AS5 ─────────────────────────────────────────────────────────────────────


def test_TAS5_pipeline_running_does_not_trigger():
    """Overdue but pipeline already running → skip to avoid double-run."""
    assert _should_run_auto_sync(
        config=_config(enabled=True, interval_hours=24),
        last_sync=_last_sync(25),
        pipeline_running=True,
    ) is False


# ── Edge: config=None ─────────────────────────────────────────────────────────


def test_TAS6_no_config_does_not_trigger():
    """No configuration row in DB → does not trigger."""
    assert _should_run_auto_sync(
        config=None,
        last_sync=None,
        pipeline_running=False,
    ) is False
