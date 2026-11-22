from __future__ import annotations

from datetime import date
from pathlib import Path

from app.data.cache.bar_cache import BarCache
from app.models.bars import date_to_ts
from tests.unit.data.factories import bars

DAYS = [date(2026, 1, 5), date(2026, 1, 6), date(2026, 1, 7)]


def test_store_and_read_roundtrip(tmp_path: Path) -> None:
    cache = BarCache(tmp_path / "bars.db")
    frame = bars(DAYS, [1.0, 2.0, 3.0], adj=[0.9, 1.9, 3.0])
    cache.store(
        "AAA",
        "1D",
        frame,
        covered_start_ts=date_to_ts(date(2026, 1, 1)),
        covered_end_ts=date_to_ts(DAYS[-1]),
        fetched_at=123.0,
        source="fixtures",
    )
    assert cache.read("AAA", "1D").equals(frame)
    coverage = cache.coverage("AAA", "1D")
    assert coverage is not None
    assert (coverage.start_ts, coverage.end_ts) == (
        date_to_ts(date(2026, 1, 1)),
        date_to_ts(DAYS[-1]),
    )
    assert (coverage.fetched_at, coverage.source) == (123.0, "fixtures")


def test_unknown_symbol_is_empty(tmp_path: Path) -> None:
    cache = BarCache(tmp_path / "bars.db")
    assert len(cache.read("NOPE", "1D")) == 0
    assert cache.coverage("NOPE", "1D") is None


def test_upsert_overwrites_and_coverage_grows(tmp_path: Path) -> None:
    cache = BarCache(tmp_path / "bars.db")
    first, refreshed = bars(DAYS[:2], [1.0, 2.0]), bars(DAYS[1:], [2.5, 3.0])
    cache.store(
        "AAA",
        "1D",
        first,
        covered_start_ts=date_to_ts(DAYS[0]),
        covered_end_ts=date_to_ts(DAYS[1]),
        fetched_at=1.0,
        source="a",
    )
    cache.store(
        "AAA",
        "1D",
        refreshed,
        covered_start_ts=date_to_ts(DAYS[1]),
        covered_end_ts=date_to_ts(DAYS[2]),
        fetched_at=2.0,
        source="b",
    )
    assert cache.read("AAA", "1D").close.tolist() == [1.0, 2.5, 3.0]
    coverage = cache.coverage("AAA", "1D")
    assert coverage is not None
    assert (coverage.start_ts, coverage.end_ts) == (date_to_ts(DAYS[0]), date_to_ts(DAYS[2]))


def test_replace_all_drops_old_history(tmp_path: Path) -> None:
    cache = BarCache(tmp_path / "bars.db")
    cache.store(
        "AAA",
        "1D",
        bars(DAYS, [1.0, 2.0, 3.0]),
        covered_start_ts=0,
        covered_end_ts=date_to_ts(DAYS[2]),
        fetched_at=1.0,
        source="a",
    )
    cache.store(
        "AAA",
        "1D",
        bars(DAYS[2:], [9.0]),
        covered_start_ts=date_to_ts(DAYS[2]),
        covered_end_ts=date_to_ts(DAYS[2]),
        fetched_at=2.0,
        source="a",
        replace_all=True,
    )
    assert cache.read("AAA", "1D").close.tolist() == [9.0]
    coverage = cache.coverage("AAA", "1D")
    assert coverage is not None
    assert coverage.start_ts == date_to_ts(DAYS[2])


def test_symbols_are_isolated(tmp_path: Path) -> None:
    cache = BarCache(tmp_path / "bars.db")
    cache.store(
        "AAA",
        "1D",
        bars(DAYS, [1.0, 2.0, 3.0]),
        covered_start_ts=0,
        covered_end_ts=1,
        fetched_at=1.0,
        source="a",
    )
    assert len(cache.read("BBB", "1D")) == 0
