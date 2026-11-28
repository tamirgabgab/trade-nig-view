"""A dwelling-price synthetic symbol (``app.data.synthetic``, K1) as a DUT.

* golden model: without noise, the closes equal a scalar loop of the geometric interpolation
  between the index's month dates (``rtol=1e-9``); with noise, every anchor still lands exactly;
* the noise is a Brownian bridge: its variance in a segment is sigma^2 k (tau - k) / tau;
* causal: a value changes no bar before its publication; interpolated: it does (the documented
  lookahead);
* a new month changes no earlier bar; valid bars; the daily bar is the aggregate of its hours.
"""

from __future__ import annotations

import math
from datetime import date
from pathlib import Path

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.data.synthetic import (
    SESSION_BARS,
    dwelling_closes,
    dwelling_daily,
    dwelling_hourly,
)
from app.data.validate import validate_bars
from app.macro.fixtures import read_macro_fixture
from app.macro.series import MacroSeries
from app.models.bars import SECONDS_PER_DAY, BarFrame, date_to_ts
from app.models.synthetic import DwellingDefinition
from app.planner.deposits import add_months

FIXTURES = Path(__file__).parents[3] / "fixtures" / "macro"
INDEX = read_macro_fixture(FIXTURES / "dwelling.csv")
TODAY = date(2026, 11, 27)
UNTIL = date_to_ts(TODAY) // SECONDS_PER_DAY


def spec(**changes: object) -> DwellingDefinition:
    base: dict[str, object] = {"name": "HOME", "full_name": "Dwelling prices", "seed": 3}
    return DwellingDefinition.model_validate({**base, **changes})


def series(days: list[int], values: list[float]) -> MacroSeries:
    return MacroSeries(np.array(days, dtype=np.int64), np.array(values))


def day(n: int | np.integer) -> date:
    return date.fromisoformat(str(np.datetime64(int(n), "D")))


def number(d: date) -> int:
    return date_to_ts(d) // SECONDS_PER_DAY


def golden_interpolated(index: MacroSeries, first_price: float) -> tuple[list[int], list[float]]:
    """Every weekday from the first month date to the last (or the weekday after it), and its
    close, by a scalar loop: between two month dates the log close moves by the share of the
    month's weekdays gone by."""
    months = [int(m) for m in index.days]
    values = [float(v) for v in index.values]

    def weekdays(start: int, end: int) -> list[int]:
        return [d for d in range(start, end) if day(d).weekday() < 5]

    days: list[int] = []
    closes: list[float] = []
    for j in range(len(months) - 1):
        segment = weekdays(months[j], months[j + 1])
        for k, d in enumerate(segment):
            log_value = math.log(values[j] / values[0]) + k / len(segment) * math.log(
                values[j + 1] / values[j]
            )
            days.append(d)
            closes.append(first_price * math.exp(log_value))
    last = months[-1]
    while day(last).weekday() >= 5:
        last += 1
    days.append(last)
    closes.append(first_price * values[-1] / values[0])
    return days, closes


@pytest.mark.parametrize("district", ["dwelling", "dwelling_telaviv", "dwelling_south"])
def test_without_noise_the_closes_are_the_geometric_interpolation(district: str) -> None:
    index = read_macro_fixture(FIXTURES / f"{district}.csv")
    days, closes, _ = dwelling_closes(
        spec(noise_pct=0, first_price=250.0), index.days, index.values, UNTIL
    )
    gold_days, gold_closes = golden_interpolated(index, 250.0)
    assert days.tolist() == gold_days
    np.testing.assert_allclose(closes, gold_closes, rtol=1e-9, atol=1e-12)


@pytest.mark.parametrize("causal", [False, True])
@pytest.mark.parametrize("seed", [0, 1, 999_999])
def test_every_anchor_lands_exactly_on_the_index(causal: bool, seed: int) -> None:
    definition = spec(seed=seed, causal=causal, noise_pct=1.0, first_price=100.0)
    days, closes, _ = dwelling_closes(definition, INDEX.days, INDEX.values, UNTIL)
    for m, value in zip(INDEX.days, INDEX.values, strict=True):
        anchor = number(add_months(day(m), 2)) if causal else int(m)
        # On the anchor, or on the weekday after it when it falls on a weekend.
        landing = int(np.busday_offset(np.datetime64(anchor, "D"), 0, roll="forward").astype(int))
        hit = np.flatnonzero(days == landing)
        if landing < UNTIL or not causal:
            assert len(hit) == 1
            assert closes[hit[0]] == pytest.approx(100.0 * value / INDEX.values[0], rel=1e-12)


def test_the_noise_is_a_brownian_bridge() -> None:
    # One month (2024-01-01 to 2024-02-01: 23 weekdays) at 1 % a day, over many seeds.
    index = series([number(date(2024, 1, 1)), number(date(2024, 2, 1))], [100.0, 100.0])
    sigma, tau = 0.01, 23
    deviations = np.array(
        [
            np.log(dwelling_closes(spec(seed=s, noise_pct=1.0), index.days, index.values, 0)[1])
            for s in range(600)
        ]
    )
    assert deviations.shape == (600, tau + 1)  # 23 days and the last month date
    np.testing.assert_allclose(deviations[:, 0], np.log(100.0), rtol=0, atol=1e-15)
    np.testing.assert_allclose(deviations[:, -1], np.log(100.0), rtol=0, atol=1e-15)
    for k in (5, 11, 17):
        expected = sigma**2 * k * (tau - k) / tau
        assert deviations[:, k].var() == pytest.approx(expected, rel=0.2)
        assert abs(deviations[:, k].mean() - np.log(100.0)) < 4 * math.sqrt(expected / 600)


def test_causal_a_value_changes_no_bar_before_its_publication() -> None:
    raised = series(list(INDEX.days), [*INDEX.values[:-1], INDEX.values[-1] * 1.1])
    published = number(add_months(day(INDEX.days[-1]), 2))
    a = dwelling_hourly(spec(causal=True), INDEX, TODAY)
    b = dwelling_hourly(spec(causal=True), raised, TODAY)
    before = a.time // SECONDS_PER_DAY < published
    assert before.any()
    assert b.take(b.time // SECONDS_PER_DAY < published).equals(a.take(before))
    # From its publication on, it shows.
    assert not np.allclose(a.close[~before], b.close[~before])


def test_interpolated_a_value_moves_the_month_before_it() -> None:
    # The documented lookahead: the last month's value shapes the days that lead to it.
    raised = series(list(INDEX.days), [*INDEX.values[:-1], INDEX.values[-1] * 1.1])
    a = dwelling_daily(spec(), INDEX, TODAY)
    b = dwelling_daily(spec(), raised, TODAY)
    month_before = a.time // SECONDS_PER_DAY >= INDEX.days[-2]
    assert not np.allclose(a.close[month_before], b.close[month_before])
    np.testing.assert_array_equal(a.close[~month_before], b.close[~month_before])


@pytest.mark.parametrize("causal", [False, True])
def test_a_new_month_changes_no_earlier_bar(causal: bool) -> None:
    shorter = series(list(INDEX.days[:-1]), list(INDEX.values[:-1]))
    old = dwelling_hourly(spec(causal=causal), shorter, TODAY)
    new = dwelling_hourly(spec(causal=causal), INDEX, TODAY)
    # Up to the shorter series' last month date (interpolated) or the new value's publication.
    end = number(add_months(day(INDEX.days[-1]), 2)) if causal else int(INDEX.days[-2]) + 1
    keep_old = old.time // SECONDS_PER_DAY < end
    keep_new = new.time // SECONDS_PER_DAY < end
    assert keep_old.sum() > 0
    assert new.take(keep_new).equals(old.take(keep_old))


def test_causal_ends_before_today_holding_the_last_value() -> None:
    days, closes, _ = dwelling_closes(
        spec(causal=True, noise_pct=0), INDEX.days, INDEX.values, UNTIL
    )
    assert day(days[-1]) == date(2026, 11, 26)  # the weekday before 2026-11-27
    assert closes[-1] == pytest.approx(100.0 * INDEX.values[-1] / INDEX.values[0], rel=1e-12)
    # A step function: no value before its publication two months after its month.
    assert day(days[0]) == date(1994, 3, 1)


@settings(max_examples=30, deadline=None)
@given(
    causal=st.booleans(),
    seed=st.integers(0, 1_000_000),
    noise=st.sampled_from([0.0, 0.2, 2.0, 5.0]),
    lag=st.integers(0, 12),
    first_price=st.floats(0.01, 1_000_000),
)
def test_bars_are_valid_deterministic_and_aggregate_their_hours(
    causal: bool, seed: int, noise: float, lag: int, first_price: float
) -> None:
    definition = spec(
        causal=causal, seed=seed, noise_pct=noise, lag_months=lag, first_price=first_price
    )
    hours = dwelling_hourly(definition, INDEX, TODAY)
    daily = dwelling_daily(definition, INDEX, TODAY)
    for frame in (hours, daily):
        clean, report = validate_bars(frame)
        assert report.ok
        assert clean.equals(frame)
        assert (frame.volume == 0).all()
    shape = (len(daily), SESSION_BARS)
    np.testing.assert_array_equal(daily.open, hours.open.reshape(shape)[:, 0])
    np.testing.assert_array_equal(daily.close, hours.close.reshape(shape)[:, -1])
    np.testing.assert_array_equal(daily.high, hours.high.reshape(shape).max(axis=1))
    np.testing.assert_array_equal(daily.low, hours.low.reshape(shape).min(axis=1))
    assert dwelling_hourly(definition, INDEX, TODAY).equals(hours)


def test_another_index_is_another_series_at_once() -> None:
    # The memo's key holds the index's values: new data is never served from an old series.
    # (Scaling every value would change nothing: the first value is the first price.)
    values = INDEX.values.copy()
    values[200] *= 1.05
    other = series(list(INDEX.days), list(values))
    assert not np.allclose(
        dwelling_daily(spec(), other, TODAY).close, dwelling_daily(spec(), INDEX, TODAY).close
    )


def test_the_learn_pages_worked_example() -> None:
    # docs/indicators/synthetic-symbols.md: January 1994 117.2, February 119.6, first price 100.
    definition = spec(noise_pct=0)
    days, closes, _ = dwelling_closes(definition, INDEX.days, INDEX.values, UNTIL)
    close = dict(zip((day(d) for d in days), closes, strict=True))
    assert round(close[date(1994, 1, 17)], 2) == 100.97
    assert close[date(1994, 1, 3)] == pytest.approx(100.0)  # 1994-01-01 was a Saturday
    assert round(close[date(1994, 2, 1)], 2) == 102.05
    days, closes, _ = dwelling_closes(
        spec(noise_pct=0, causal=True), INDEX.days, INDEX.values, UNTIL
    )
    close = dict(zip((day(d) for d in days), closes, strict=True))
    assert round(close[date(1994, 3, 1)], 2) == round(close[date(1994, 3, 31)], 2) == 100.0
    assert round(close[date(1994, 4, 1)], 2) == 102.05
    assert round(0.2 * math.sqrt(11 * 11 / 22), 2) == 0.47


def test_a_weekend_month_date_lands_on_the_next_weekday() -> None:
    # The fixture's last value, 2026-08-01, is a Saturday: it is the close of Monday 2026-08-03.
    days, closes, _ = dwelling_closes(spec(noise_pct=1.0), INDEX.days, INDEX.values, UNTIL)
    assert day(days[-1]) == date(2026, 8, 3)
    assert closes[-1] == pytest.approx(100.0 * INDEX.values[-1] / INDEX.values[0], rel=1e-12)


def test_the_provider_reads_today_from_its_clock_not_from_the_window() -> None:
    from app.data.providers.synthetic import SyntheticProvider  # noqa: PLC0415
    from app.macro.series import SERIES  # noqa: PLC0415
    from app.macro.service import CachedSeries  # noqa: PLC0415

    definition = spec(causal=True)
    cached = CachedSeries(SERIES["dwelling"], INDEX, "fixtures", True, 0.0, ("refresh failed",))
    provider = SyntheticProvider(
        lambda _: definition, lambda _: cached, _no_source, today=lambda: TODAY
    )
    info = definition.info()
    # An earlier inclusive end keeps its own bar (2026-09-15 is a Tuesday).
    window = provider.fetch_daily(info, date(2026, 9, 1), date(2026, 9, 15))
    assert day(window.time[-1] // SECONDS_PER_DAY) == date(2026, 9, 15)
    assert provider.freshness(info) == (True, ("refresh failed",))


def _no_source(symbol: str) -> tuple[BarFrame, bool, tuple[str, ...]]:
    raise AssertionError(f"a dwelling symbol needs no source ({symbol})")
