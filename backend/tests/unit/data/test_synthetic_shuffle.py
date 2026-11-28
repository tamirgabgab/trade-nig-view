"""A shuffled copy of a market symbol (``app.data.synthetic_shuffle``, K3) as a DUT.

* the order: a permutation of the source's bars in whole blocks, never the identity, the same for
  a seed;
* golden model: a scalar loop of the rebuild, ``rtol=1e-12``; what a permutation keeps (the first
  bar, the dates, the set of ratios and volumes, the last close) and the level following the
  source's adjustment;
* the hours land exactly on the daily bar (directed corner days and properties);
* the source's range checks; the sequence measures on hand vectors; the learn page's example.
"""

from __future__ import annotations

from datetime import date

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.data.providers.base import ProviderError
from app.data.providers.synthetic import SyntheticProvider
from app.data.resample import resample, resample_intraday
from app.data.sessions import session_days
from app.data.synthetic import PLACEHOLDER_PRICE, SESSION_BARS, shuffle_daily, shuffle_hourly
from app.data.synthetic_shuffle import (
    MIN_BARS,
    PREVIEW_POINTS,
    block_order,
    chart_points,
    measures,
    shuffled,
    source_slice,
)
from app.data.validate import validate_bars
from app.errors import DataUnavailableError
from app.macro.service import CachedSeries
from app.models.bars import SECONDS_PER_DAY, BarFrame, FloatArray, Interval, date_to_ts
from app.models.synthetic import ShuffleDefinition

FIRST = date(2010, 1, 4)


def source(n: int = 600, seed: int = 0, scale: float = 1.0) -> BarFrame:
    """Valid daily bars on weekdays from 2010-01-04: a random walk with gaps and wicks."""
    rng = np.random.default_rng(seed)
    close = 50 * np.exp(np.cumsum(rng.normal(0.0003, 0.015, n))) * scale
    prev = np.r_[close[0], close[:-1]]
    day_open = prev * np.exp(rng.normal(0, 0.004, n))
    high = np.maximum(day_open, close) * np.exp(np.abs(rng.normal(0, 0.006, n)))
    low = np.minimum(day_open, close) * np.exp(-np.abs(rng.normal(0, 0.006, n)))
    days = np.busday_offset(np.datetime64(FIRST, "D"), np.arange(n), roll="forward")
    return BarFrame.from_columns(
        time=days.astype(np.int64) * SECONDS_PER_DAY,
        open=day_open,
        high=high,
        low=low,
        close=close,
        volume=rng.integers(1_000, 100_000, n).astype(float),
    )


def definition(**changes: object) -> ShuffleDefinition:
    base: dict[str, object] = {
        "name": "COPY",
        "full_name": "A copy",
        "source": "AAPL",
        "start": FIRST,
        "end": date(2012, 12, 31),
        "seed": 3,
    }
    return ShuffleDefinition.model_validate({**base, **changes})


@pytest.mark.parametrize(("moves", "block"), [(599, 21), (599, 1), (100, 50), (101, 50), (10, 3)])
def test_the_order_is_a_permutation_of_whole_blocks(moves: int, block: int) -> None:
    order = block_order(moves, block, 7)
    np.testing.assert_array_equal(np.sort(order), np.arange(1, moves + 1))
    # Read it back block by block: each starts on a block boundary and runs whole, in order.
    pos, seen = 0, 0
    while pos < moves:
        first = int(order[pos])
        assert (first - 1) % block == 0
        length = min(block, moves + 1 - first)
        np.testing.assert_array_equal(order[pos : pos + length], np.arange(first, first + length))
        pos, seen = pos + length, seen + 1
    assert seen == -(-moves // block)
    np.testing.assert_array_equal(block_order(moves, block, 7), order)


def test_the_order_is_never_the_identity() -> None:
    # Two blocks: half of all draws would keep them in place; every seed swaps them.
    for seed in range(200):
        np.testing.assert_array_equal(block_order(10, 5, seed), [6, 7, 8, 9, 10, 1, 2, 3, 4, 5])
    with pytest.raises(ValueError, match="one block"):
        block_order(10, 10, 0)


def golden(src: BarFrame, block: int, seed: int) -> tuple[FloatArray, ...]:
    """The rebuild by a scalar loop, from the module's own order."""
    pick = block_order(len(src) - 1, block, seed)
    o, h, lo, c, v = (
        [float(col[0])] for col in (src.open, src.high, src.low, src.close, src.volume)
    )
    for k in pick:
        prev = c[-1]
        base = float(src.close[k - 1])
        o.append(prev * float(src.open[k]) / base)
        h.append(prev * float(src.high[k]) / base)
        lo.append(prev * float(src.low[k]) / base)
        c.append(prev * float(src.close[k]) / base)
        v.append(float(src.volume[k]))
    return tuple(np.array(x) for x in (o, h, lo, c, v))


@pytest.mark.parametrize(("block", "seed"), [(21, 0), (1, 1), (5, 2), (250, 3)])
def test_the_rebuild_matches_the_golden_model(block: int, seed: int) -> None:
    src = source()
    copy = shuffled(src, block, seed)
    for got, want in zip(
        (copy.open, copy.high, copy.low, copy.close, copy.volume),
        golden(src, block, seed),
        strict=True,
    ):
        np.testing.assert_allclose(got, want, rtol=1e-12)


def test_a_permutation_keeps_the_first_bar_the_dates_the_ratios_and_the_last_close() -> None:
    src = source()
    copy = shuffled(src, 21, 4)
    np.testing.assert_array_equal(copy.time, src.time)
    for column in ("open", "high", "low", "close", "volume"):
        assert getattr(copy, column)[0] == getattr(src, column)[0]
    assert copy.close[-1] == pytest.approx(src.close[-1], rel=1e-12)
    for column in ("open", "high", "low", "close"):
        mine = getattr(copy, column)[1:] / copy.close[:-1]
        theirs = getattr(src, column)[1:] / src.close[:-1]
        np.testing.assert_allclose(np.sort(mine), np.sort(theirs), rtol=1e-12)
    np.testing.assert_array_equal(np.sort(copy.volume), np.sort(src.volume))
    assert not np.allclose(copy.close, src.close)
    clean, report = validate_bars(copy)
    assert report.ok
    assert clean.equals(copy)


def test_the_level_follows_the_sources_adjustment() -> None:
    # A new dividend rescales every earlier adjusted price by one factor: same returns, new level.
    copy = shuffled(source(), 21, 5)
    rescaled = shuffled(source(scale=0.97), 21, 5)
    np.testing.assert_allclose(rescaled.close, copy.close * 0.97, rtol=1e-12)
    np.testing.assert_allclose(rescaled.high / rescaled.close, copy.high / copy.close, rtol=1e-12)


def test_the_hours_land_exactly_on_the_daily_bar() -> None:
    src = source()
    d = definition()
    daily = shuffle_daily(d, src)
    hours = shuffle_hourly(d, src)
    shape = (len(daily), SESSION_BARS)
    np.testing.assert_array_equal(hours.open.reshape(shape)[:, 0], daily.open)
    np.testing.assert_array_equal(hours.close.reshape(shape)[:, -1], daily.close)
    np.testing.assert_array_equal(hours.high.reshape(shape).max(axis=1), daily.high)
    np.testing.assert_array_equal(hours.low.reshape(shape).min(axis=1), daily.low)
    np.testing.assert_allclose(hours.volume.reshape(shape).sum(axis=1), daily.volume, rtol=1e-12)
    np.testing.assert_array_equal(
        hours.time.reshape(shape)[:, 0] // SECONDS_PER_DAY, daily.time // SECONDS_PER_DAY
    )
    clean, report = validate_bars(hours)
    assert report.ok
    assert clean.equals(hours)
    assert shuffle_hourly(d, src).equals(hours)


def corner_source() -> BarFrame:
    """MIN_BARS days, the first few of them corner cases: open at the high, close at the low,
    a flat day, the open at the low and the close at the high."""
    src = source(MIN_BARS)
    o, h, lo, c = (col.copy() for col in (src.open, src.high, src.low, src.close))
    o[1], h[1] = 60.0, 60.0  # O == H
    lo[1], c[1] = 55.0, 55.0  # C == L
    o[2] = h[2] = lo[2] = c[2] = c[1]  # H == L: a flat day
    o[3], lo[3], c[3], h[3] = 50.0, 50.0, 58.0, 58.0  # O == L, C == H
    return BarFrame.from_columns(time=src.time, open=o, high=h, low=lo, close=c, volume=src.volume)


@pytest.mark.parametrize("seed", range(5))
def test_corner_days_have_hours_that_land_on_them(seed: int) -> None:
    src = corner_source()
    d = definition(seed=seed, block_days=1)
    daily = shuffle_daily(d, src)
    hours = shuffle_hourly(d, src)
    shape = (len(daily), SESSION_BARS)
    np.testing.assert_array_equal(hours.high.reshape(shape).max(axis=1), daily.high)
    np.testing.assert_array_equal(hours.low.reshape(shape).min(axis=1), daily.low)
    np.testing.assert_array_equal(hours.close.reshape(shape)[:, -1], daily.close)
    assert validate_bars(hours)[1].ok
    flat = np.flatnonzero(daily.high == daily.low)
    assert flat.size >= 1
    assert (hours.high.reshape(shape)[flat] == hours.low.reshape(shape)[flat]).all()


@settings(max_examples=25, deadline=None)
@given(seed=st.integers(0, 1_000_000), block=st.integers(1, 120), shape_seed=st.integers(0, 50))
def test_hours_land_on_the_day_for_any_seed_and_block(
    seed: int, block: int, shape_seed: int
) -> None:
    src = source(300, shape_seed)
    d = definition(seed=seed, block_days=block)
    daily = shuffle_daily(d, src)
    hours = shuffle_hourly(d, src)
    shape = (len(daily), SESSION_BARS)
    np.testing.assert_array_equal(hours.high.reshape(shape).max(axis=1), daily.high)
    np.testing.assert_array_equal(hours.low.reshape(shape).min(axis=1), daily.low)
    assert validate_bars(hours)[1].ok
    assert validate_bars(daily)[1].ok


def test_the_source_range_is_checked() -> None:
    src = source()
    in_range = int((src.time <= date_to_ts(date(2012, 12, 31))).sum())
    assert len(source_slice(definition(), src)) == in_range
    sliced = source_slice(definition(start=date(2010, 2, 1), end=date(2010, 12, 31)), src)
    assert sliced.time[0] == date_to_ts(date(2010, 2, 1))
    assert sliced.time[-1] == date_to_ts(date(2010, 12, 31))
    with pytest.raises(ValueError, match=f"needs {MIN_BARS}"):
        source_slice(definition(end=date(2010, 3, 1)), src)
    with pytest.raises(ValueError, match="nothing to shuffle"):
        source_slice(definition(block_days=599), src)
    broken = BarFrame.from_columns(
        time=src.time, open=src.open, high=src.high, low=np.r_[0.0, src.low[1:]], close=src.close
    )
    with pytest.raises(ValueError, match="0 or less"):
        source_slice(definition(), broken)


def test_a_definition_refuses_a_synthetic_source_and_an_empty_range() -> None:
    with pytest.raises(ValueError, match="market symbol"):
        definition(source="SYN:WALK")
    with pytest.raises(ValueError, match="after start"):
        definition(end=FIRST)
    assert definition(source=" aapl ").source == "AAPL"


def days(*iso: str) -> np.ndarray:
    return np.array([date_to_ts(date.fromisoformat(d)) for d in iso], dtype=np.int64)


def test_the_sequence_measures_on_a_hand_vector() -> None:
    time = days("2020-12-29", "2020-12-30", "2020-12-31", "2021-01-04", "2021-01-05", "2021-01-06")
    close = np.array([100.0, 90.0, 80.0, 85.0, 70.0, 75.0])
    m = measures(time, close)
    assert m.total_return_pct == pytest.approx(-25.0)
    assert m.max_drawdown_pct == pytest.approx(-30.0)  # 100 to 70
    # 2020: 100 to 80 (-20 %); 2021: from 2020's last close, 80 to 75 (-6.25 %).
    assert (m.worst_year, m.worst_year_pct) == (2020, pytest.approx(-20.0))
    assert m.longest_losing_streak == 2  # 100 > 90 > 80


def test_the_chart_points_keep_the_ends() -> None:
    for n in (5, 400, 401, 6500):
        points = chart_points(n)
        assert points[0] == 0
        assert points[-1] == n - 1
        assert len(points) == min(n, PREVIEW_POINTS)
        assert (np.diff(points) > 0).all()


def test_the_learn_pages_worked_example() -> None:
    # docs/indicators/synthetic-symbols.md: closes 100, 120, 108, 86.4, 108 in two blocks of two.
    close = np.array([100.0, 120.0, 108.0, 86.4, 108.0])
    src = BarFrame.from_columns(
        time=days("2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"),
        open=close,
        high=close,
        low=close,
        close=close,
    )
    copy = shuffled(src, 2, 0)
    np.testing.assert_allclose(copy.close, [100.0, 80.0, 100.0, 120.0, 108.0], rtol=1e-12)
    mine, theirs = measures(copy.time, copy.close), measures(src.time, src.close)
    assert mine.total_return_pct == pytest.approx(theirs.total_return_pct) == pytest.approx(8.0)
    assert theirs.max_drawdown_pct == pytest.approx(-28.0)
    assert mine.max_drawdown_pct == pytest.approx(-20.0)
    assert (theirs.longest_losing_streak, mine.longest_losing_streak) == (2, 1)


def test_a_copy_carries_its_sources_staleness_and_reads_its_bars() -> None:
    d = definition()
    src = source()
    warnings = ("AAPL: the refresh failed, cached bars shown",)

    def no_index(series: str) -> CachedSeries:
        raise AssertionError(f"a copy needs no index ({series})")

    provider = SyntheticProvider(lambda _: d, no_index, lambda _: (src, True, warnings))
    info = d.info()
    assert provider.generate(info, Interval.D1, FIRST, FIRST)[1:] == (True, warnings)
    daily = provider.fetch_daily(info, date(2000, 1, 1), date(2030, 1, 1))
    np.testing.assert_array_equal(daily.close, shuffle_daily(d, source_slice(d, src)).close)
    assert len(provider.fetch_intraday(info, Interval.H1, FIRST, FIRST)) == SESSION_BARS
    # Too few bars in the range: the placeholder, flagged, with the reason.
    short = SyntheticProvider(lambda _: d, no_index, lambda _: (src.take(slice(0, 50)), False, ()))
    frame, stale, (warning,) = short.generate(info, Interval.D1, d.start, d.end)
    assert stale
    assert (frame.close == PLACEHOLDER_PRICE).all()
    assert "needs 100" in warning


def test_a_bar_off_its_range_by_the_tolerance_is_widened_not_broken() -> None:
    # The validator keeps an open or close up to 1e-6 outside [low, high]: the hours stay valid.
    src = source(MIN_BARS)
    o, h, lo, c = (col.copy() for col in (src.open, src.high, src.low, src.close))
    o[5] = h[5] * (1 + 5e-7)
    c[6] = lo[6] * (1 - 5e-7)
    nudged = BarFrame.from_columns(
        time=src.time, open=o, high=h, low=lo, close=c, volume=src.volume
    )
    d = definition(block_days=1)
    daily = shuffle_daily(d, nudged)
    hours = shuffle_hourly(d, nudged)
    assert (daily.high >= np.maximum(daily.open, daily.close)).all()
    assert (daily.low <= np.minimum(daily.open, daily.close)).all()
    assert validate_bars(hours)[1].ok
    shape = (len(daily), SESSION_BARS)
    np.testing.assert_array_equal(hours.high.reshape(shape).max(axis=1), daily.high)
    np.testing.assert_array_equal(hours.low.reshape(shape).min(axis=1), daily.low)


def test_a_sunday_to_thursday_source_keeps_its_days_at_every_interval() -> None:
    # A Tel Aviv index (before 2026): Sunday to Thursday, no volume.
    src = source(300)
    days_ = np.busday_offset(
        np.datetime64("2015-01-04", "D"),
        np.arange(300),
        roll="forward",
        weekmask="Sun Mon Tue Wed Thu",
    )
    tase = BarFrame.from_columns(
        time=days_.astype(np.int64) * SECONDS_PER_DAY,
        open=src.open,
        high=src.high,
        low=src.low,
        close=src.close,
    )
    d = definition(start=date(2015, 1, 4), end=date(2016, 12, 31))
    daily = shuffle_daily(d, tase)
    hours = shuffle_hourly(d, tase)
    np.testing.assert_array_equal(daily.time, tase.time)
    assert (daily.volume == 0).all()
    sessions = session_days(hours.time, "America/New_York")
    np.testing.assert_array_equal(sessions[::SESSION_BARS], daily.time // SECONDS_PER_DAY)
    four = resample_intraday(hours, sessions, Interval.H4)
    assert len(four) == 2 * len(daily)
    assert validate_bars(four)[1].ok
    weekly = resample(daily, Interval.W1)
    assert weekly.close[-1] == daily.close[-1]
    assert validate_bars(weekly)[1].ok


@pytest.mark.parametrize(
    "error",
    [
        DataUnavailableError("No 1D data for AAPL: offline and nothing cached"),
        ProviderError("AAPL is not a market symbol in the universe"),
    ],
)
def test_without_its_sources_data_a_copy_is_flat_at_100_and_says_so(error: Exception) -> None:
    d = definition(start=date(2024, 1, 1), end=date(2024, 3, 29))

    def no_index(series: str) -> CachedSeries:
        raise AssertionError(f"a copy needs no index ({series})")

    def no_source(symbol: str) -> tuple[BarFrame, bool, tuple[str, ...]]:
        raise error

    provider = SyntheticProvider(lambda _: d, no_index, no_source)
    info = d.info()
    daily, stale, (warning,) = provider.generate(info, Interval.D1, d.start, d.end)
    assert stale
    assert warning.startswith("No data for AAPL: a flat placeholder at 100 until it can be fetched")
    assert str(error) in warning
    weekdays = np.busday_count(np.datetime64("2024-01-01"), np.datetime64("2024-03-30"))
    assert len(daily) == weekdays
    assert daily.time[0] == date_to_ts(date(2024, 1, 1))
    assert daily.time[-1] == date_to_ts(date(2024, 3, 29))
    for column in (daily.open, daily.high, daily.low, daily.close):
        assert (column == PLACEHOLDER_PRICE).all()
    assert (daily.volume == 0).all()
    hours, _, _ = provider.generate(info, Interval.H1, d.start, d.end)
    assert len(hours) == SESSION_BARS * weekdays
    assert (hours.high == PLACEHOLDER_PRICE).all()
    assert (hours.low == PLACEHOLDER_PRICE).all()
    assert validate_bars(hours)[1].ok
