"""Directed tests (hand-computed) and property tests for adjustment and resampling."""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
from hypothesis import given, settings
from hypothesis import strategies as st

from app.data.adjust import dividend_adjust
from app.data.resample import resample
from app.models.bars import BarFrame, Interval, ts_to_iso_dates
from tests.unit.data.factories import bars

# 2025-12-29 (Mon) .. 2026-01-09 (Fri), New Year's Day 2026-01-01 is a holiday.
DAYS = [
    date(2025, 12, 29), date(2025, 12, 30), date(2025, 12, 31), date(2026, 1, 2),
    date(2026, 1, 5), date(2026, 1, 6), date(2026, 1, 7), date(2026, 1, 8), date(2026, 1, 9),
]  # fmt: skip
CLOSES = [10.0, 11, 12, 13, 14, 15, 16, 17, 18]


def test_dividend_adjust_scales_ohl_by_factor() -> None:
    frame = bars(DAYS[:2], [100.0, 100.0], adj=[98.0, 100.0])
    adjusted = dividend_adjust(frame)
    assert adjusted.open.tolist() == [99.5 * 0.98, 99.5]
    assert adjusted.high.tolist() == [101.0 * 0.98, 101.0]
    assert adjusted.close.tolist() == [98.0, 100.0]
    assert adjusted.volume.tolist() == frame.volume.tolist()


def test_daily_is_identity() -> None:
    frame = bars(DAYS, CLOSES)
    assert resample(frame, Interval.D1) is frame


def test_weekly_crosses_year_boundary_and_skips_holiday() -> None:
    weekly = resample(bars(DAYS, CLOSES, volume=[1.0] * 9), Interval.W1)
    # ISO week 2026-W01 runs Mon 2025-12-29 .. Fri 2026-01-02 (holiday on Thu).
    assert ts_to_iso_dates(weekly.time) == ["2025-12-29", "2026-01-05"]
    assert weekly.open.tolist() == [9.5, 13.5]
    assert weekly.high.tolist() == [14.0, 19.0]
    assert weekly.low.tolist() == [9.0, 13.0]
    assert weekly.close.tolist() == [13.0, 18.0]
    assert weekly.volume.tolist() == [4.0, 5.0]


def test_weekly_bar_is_keyed_by_first_trading_day() -> None:
    # Monday 2026-02-16 is a holiday: the week's bar is labelled Tuesday.
    days = [date(2026, 2, 17), date(2026, 2, 18)]
    assert ts_to_iso_dates(resample(bars(days, [1.0, 2.0]), Interval.W1).time) == ["2026-02-17"]


def test_monthly_groups_by_calendar_month() -> None:
    monthly = resample(bars(DAYS, CLOSES), Interval.M1)
    assert ts_to_iso_dates(monthly.time) == ["2025-12-29", "2026-01-02"]
    assert monthly.close.tolist() == [12.0, 18.0]
    assert monthly.adj_close.tolist() == [12.0, 18.0]


# ---------------------------------------------------------------- property tests


@st.composite
def daily_frames(draw: st.DrawFn) -> BarFrame:
    """Random valid daily bars on random weekdays (gaps model holidays)."""
    n = draw(st.integers(min_value=1, max_value=80))
    start = draw(st.dates(min_value=date(2000, 1, 1), max_value=date(2030, 1, 1)))
    steps = draw(st.lists(st.integers(1, 4), min_size=n, max_size=n))
    days: list[date] = []
    day = start
    for step in steps:
        day += timedelta(days=step)
        days.append(day)
    closes = draw(st.lists(st.floats(1.0, 1000.0), min_size=n, max_size=n))
    volume = draw(st.lists(st.floats(0.0, 1e6), min_size=n, max_size=n))
    return bars(days, closes, volume=volume)


@settings(max_examples=200)
@given(daily_frames(), st.sampled_from([Interval.W1, Interval.M1]))
def test_resample_preserves_extremes_totals_and_endpoints(
    frame: BarFrame, interval: Interval
) -> None:
    out = resample(frame, interval)
    assert out.high.max() == frame.high.max()
    assert out.low.min() == frame.low.min()
    assert np.isclose(out.volume.sum(), frame.volume.sum(), rtol=1e-12)
    assert out.open[0] == frame.open[0]
    assert out.close[-1] == frame.close[-1]
    assert np.all(np.diff(out.time) > 0)
    assert np.all(out.high >= out.low)


@settings(max_examples=200)
@given(daily_frames(), st.sampled_from([Interval.W1, Interval.M1]), st.data())
def test_resample_has_no_lookahead(
    frame: BarFrame, interval: Interval, data: st.DataObject
) -> None:
    """Bars built from a prefix equal the full result, except the (partial) last bar."""
    k = data.draw(st.integers(min_value=1, max_value=len(frame)))
    full = resample(frame, interval)
    prefix = resample(frame.take(slice(0, k)), interval)
    completed = len(prefix) - 1
    assert prefix.take(slice(0, completed)).equals(full.take(slice(0, completed)))
    assert prefix.time[-1] == full.time[completed]
