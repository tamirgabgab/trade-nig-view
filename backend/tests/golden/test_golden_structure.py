"""Golden models vs the R5 market-structure code (previous period H/L/C, pivots, gaps) on every
bar of every golden data set; the NVDA gap list is also pinned in ``nvda_gaps.json``."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from app.analysis.gaps import Gap, find_gaps
from app.indicators.catalog import CATALOG
from app.models.bars import BarFrame, ts_to_iso_dates
from tests.golden.conftest import Row
from tests.golden.harness import REPO_ROOT, compare, golden_frames, read_daily_csv
from tests.golden.models import GoldenGap, golden_gaps, golden_pivots, golden_prev_hlc
from tests.golden.test_golden_bands_oscillators import HOURLY, hourly_frame

FRAMES = golden_frames()
DATA = sorted(FRAMES)
NVDA_GAPS: dict[str, Any] = json.loads(
    Path(__file__).with_name("nvda_gaps.json").read_text(encoding="utf-8")
)


def _row(scoreboard: list[Row], indicator: str, params: str, data: str, compared: int) -> None:
    scoreboard.append(
        {
            "check": "golden",
            "indicator": indicator,
            "params": params,
            "data": data,
            "bars_compared": compared,
            "max_abs_err": 0.0,
            "max_rel_err": 0.0,
        }
    )


def _all_frames() -> dict[str, BarFrame]:
    return {**FRAMES, **{f"1h/{name}": hourly_frame(path) for name, path in HOURLY.items()}}


ALL = _all_frames()


@pytest.mark.parametrize("period", ["day", "week", "month"])
@pytest.mark.parametrize("data", sorted(ALL))
def test_prev_hlc_matches_golden_model(period: str, data: str, scoreboard: list[Row]) -> None:
    frame = ALL[data]
    out = CATALOG["prev_hlc"].run(frame, {"period": period})
    want = golden_prev_hlc(
        frame.time.tolist(), frame.high.tolist(), frame.low.tolist(), frame.close.tolist(), period
    )
    stats = [compare(out[name], w) for name, w in zip(("high", "low", "close"), want, strict=True)]
    assert all(s.max_abs == 0.0 for s in stats)  # selections, not arithmetic: exact
    _row(scoreboard, "prev_hlc", f"period={period}", data, stats[0].compared)


@pytest.mark.parametrize(("left", "right"), [(5, 5), (1, 1), (2, 10), (50, 3)])
@pytest.mark.parametrize("data", sorted(ALL))
def test_pivots_match_golden_model(left: int, right: int, data: str, scoreboard: list[Row]) -> None:
    frame = ALL[data]
    out = CATALOG["pivots"].run(frame, {"left": left, "right": right})
    want_high, want_low = golden_pivots(frame.high.tolist(), frame.low.tolist(), left, right)
    highs = compare(out["high"], want_high)
    lows = compare(out["low"], want_low)
    assert highs.max_abs == lows.max_abs == 0.0
    _row(scoreboard, "pivots", f"left={left},right={right}", data, highs.compared + lows.compared)


def as_golden(gap: Gap) -> GoldenGap:
    return GoldenGap(
        gap.index,
        gap.direction,
        gap.kind,
        gap.top,
        gap.bottom,
        gap.size_pct,
        gap.filled_index,
        gap.fill_price,
    )


def golden_of(frame: BarFrame, min_pct: float, partial: bool) -> list[GoldenGap]:
    return golden_gaps(
        frame.open.tolist(),
        frame.high.tolist(),
        frame.low.tolist(),
        frame.close.tolist(),
        min_pct,
        partial,
    )


@pytest.mark.parametrize(("min_pct", "partial"), [(0.0, False), (1.0, False), (0.5, True)])
@pytest.mark.parametrize("data", sorted(ALL))
def test_gaps_match_golden_model(min_pct: float, partial: bool, data: str) -> None:
    frame = ALL[data]
    gaps = find_gaps(frame, min_pct, partial)
    assert [as_golden(g) for g in gaps] == golden_of(frame, min_pct, partial)
    assert all(g.time == int(frame.time[g.index]) for g in gaps)


def test_nvda_gaps_match_the_pinned_golden_file() -> None:
    doc = NVDA_GAPS
    frame = read_daily_csv(REPO_ROOT / doc["source"])
    days = ts_to_iso_dates(frame.time)
    assert (days[0], days[-1]) == (doc["first_bar"], doc["last_bar"])
    gaps = find_gaps(frame, doc["min_pct"], doc["partial"])
    actual = [
        {
            "time": days[g.index],
            "filled_time": None if g.filled_index is None else days[g.filled_index],
            "direction": g.direction,
            "kind": g.kind,
            "top": g.top,
            "bottom": g.bottom,
            "size_pct": g.size_pct,
            "fill_price": g.fill_price,
        }
        for g in gaps
    ]
    assert actual == doc["gaps"]
    assert len(actual) > 10
