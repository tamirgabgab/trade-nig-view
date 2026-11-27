"""The synthetic symbols' bars (``app.data.synthetic``) as a DUT.

* golden model: the daily closes and opens of every scenario equal a scalar loop written from the
  lab's documented formulas (``app.analysis.synthetic``), ``rtol=1e-9``;
* the daily bar is exactly the aggregate of its seven 1h bars; 1h bars start at 09:30 New York
  across both DST changes, and their sessions are the daily dates;
* properties over scenario x seed x length x first price: valid OHLCV (``validate_bars`` drops
  nothing), determinism, the first price only scales prices, and a longer series starts with the
  shorter one for the scenarios that do not switch half-way.
"""

from __future__ import annotations

import math
from datetime import date
from pathlib import Path

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.analysis.synthetic import Scenario
from app.data.bar_service import BarService
from app.data.cache.bar_cache import BarCache
from app.data.providers.synthetic import SyntheticProvider
from app.data.sessions import local_wall_seconds, session_days
from app.data.synthetic import SESSION_BARS, daily_bars, hourly_bars
from app.data.universe import Universe
from app.data.validate import validate_bars
from app.errors import IntervalUnavailableError
from app.models.bars import SECONDS_PER_DAY, BarFrame, FloatArray, Interval, ts_to_date
from app.models.symbols import SymbolInfo
from app.models.synthetic import ScenarioDefinition
from app.storage.synthetic import SyntheticSymbols

#: Scenarios with no half-way switch: the bars of day t do not depend on the length.
LENGTH_FREE = (Scenario.RANDOM_WALK, Scenario.UPTREND, Scenario.RANGE, Scenario.ACCUMULATION)


def definition(
    scenario: Scenario = Scenario.RANDOM_WALK,
    seed: int = 1,
    bars: int = 300,
    first_price: float = 100.0,
    first_date: date = date(2020, 1, 1),
) -> ScenarioDefinition:
    return ScenarioDefinition(
        name="T",
        full_name="test",
        scenario=scenario,
        seed=seed,
        bars=bars,
        first_price=first_price,
        first_date=first_date,
    )


def golden_daily(spec: ScenarioDefinition) -> tuple[FloatArray, FloatArray]:
    """(opens, closes) by a scalar loop over the documented recursions (independent of the
    vectorised ``log_path``): a day's draws are row t of ``default_rng(seed)``'s (n, 24) normals,
    eps in column 0 and eta in column 1."""
    n = spec.bars
    draws = np.random.default_rng(spec.seed).standard_normal((n, 24))
    half = n // 2
    opens, closes = np.empty(n), np.empty(n)
    log_c, r_prev, prev = 0.0, 0.0, spec.first_price
    for t in range(n):
        eps, eta = float(draws[t, 0]), float(draws[t, 1])
        jump = 0.0
        s = spec.scenario
        if s is Scenario.RANGE:
            sigma = 0.015
            if t > 0:
                log_c = (1 - 0.08) * log_c + sigma * eps
        elif s is Scenario.REGIMES:
            sigma = 0.012
            phi = 0.25 if t < half else -0.25
            r = phi * r_prev + sigma * eps if t > 0 else 0.0
            log_c, r_prev = log_c + r, r
        else:
            if s is Scenario.ACCUMULATION:
                phase = (t // 25) % 4
                mu = {0: 0.0, 1: 0.004, 2: 0.0, 3: -0.004}[phase]
                sigma = 0.008 if phase in (0, 2) else 0.012
            elif s in (Scenario.RANDOM_WALK, Scenario.SHOCK):
                mu, sigma = 0.0003, 0.015
                if s is Scenario.SHOCK and t == half:
                    jump = math.log(0.85)
            elif s is Scenario.UPTREND:
                mu, sigma = 0.0015, 0.012
            elif s is Scenario.REVERSAL:
                mu, sigma = (0.0025 if t < half else -0.0025), 0.012
            else:  # VOLATILITY_REGIME
                mu, sigma = 0.0, (0.008 if t < half else 0.03)
            if t > 0:
                log_c += mu + sigma * eps + jump
        close = spec.first_price * math.exp(log_c)
        opens[t] = prev * math.exp(jump + eta * sigma / 4)
        closes[t] = close
        prev = close
    return opens, closes


@pytest.mark.parametrize("scenario", list(Scenario))
@pytest.mark.parametrize("seed", [0, 7, 999_999])
def test_daily_open_and_close_match_the_golden_model(scenario: Scenario, seed: int) -> None:
    spec = definition(scenario, seed, bars=600, first_price=37.5)
    daily = daily_bars(spec)
    opens, closes = golden_daily(spec)
    np.testing.assert_allclose(daily.close, closes, rtol=1e-9, atol=1e-12)
    np.testing.assert_allclose(daily.open, opens, rtol=1e-9, atol=1e-12)


@pytest.mark.parametrize("scenario", list(Scenario))
def test_the_daily_bar_is_the_aggregate_of_its_hours(scenario: Scenario) -> None:
    spec = definition(scenario, 3, bars=400)
    hours, daily = hourly_bars(spec), daily_bars(spec)
    shape = (spec.bars, SESSION_BARS)
    assert len(hours) == spec.bars * SESSION_BARS
    np.testing.assert_array_equal(daily.open, hours.open.reshape(shape)[:, 0])
    np.testing.assert_array_equal(daily.high, hours.high.reshape(shape).max(axis=1))
    np.testing.assert_array_equal(daily.low, hours.low.reshape(shape).min(axis=1))
    np.testing.assert_array_equal(daily.close, hours.close.reshape(shape)[:, -1])
    np.testing.assert_allclose(daily.volume, hours.volume.reshape(shape).sum(axis=1), rtol=1e-12)
    # Inside a session each bar opens at the previous bar's close (no gap between hours).
    np.testing.assert_array_equal(
        hours.open.reshape(shape)[:, 1:], hours.close.reshape(shape)[:, :-1]
    )


def test_hours_start_at_0930_new_york_through_both_dst_changes() -> None:
    # 2024: DST starts on 10 March and ends on 3 November.
    spec = definition(bars=260, first_date=date(2024, 1, 2))
    hours, daily = hourly_bars(spec), daily_bars(spec)
    wall = local_wall_seconds(hours.time, "America/New_York") % SECONDS_PER_DAY
    expected = (9 * 3600 + 1800 + 3600 * np.arange(SESSION_BARS)).astype(np.int64)
    np.testing.assert_array_equal(wall.reshape(-1, SESSION_BARS), np.tile(expected, (260, 1)))
    utc_open = (hours.time.reshape(-1, SESSION_BARS)[:, 0] % SECONDS_PER_DAY) // 3600
    assert set(utc_open.tolist()) == {13, 14}  # 09:30 EDT and EST
    sessions = session_days(hours.time, "America/New_York").reshape(-1, SESSION_BARS)
    np.testing.assert_array_equal(
        sessions, np.repeat(daily.time // SECONDS_PER_DAY, 7).reshape(-1, 7)
    )
    days = [ts_to_date(int(t)) for t in daily.time]
    assert days[0] == date(2024, 1, 2)
    assert all(d.weekday() < 5 for d in days)
    assert days[-1] == spec.last_date


def test_a_weekend_first_date_rolls_to_monday() -> None:
    spec = definition(first_date=date(2024, 6, 1))  # a Saturday
    assert ts_to_date(int(daily_bars(spec).time[0])) == date(2024, 6, 3)


@pytest.mark.parametrize("seed", [1, 2, 3])
def test_random_walk_keeps_its_drift_and_volatility(seed: int) -> None:
    r = np.diff(np.log(daily_bars(definition(seed=seed, bars=5000)).close))
    assert r.mean() == pytest.approx(0.0003, abs=5 * 0.015 / math.sqrt(len(r)))
    assert r.std() == pytest.approx(0.015, rel=0.05)


@settings(max_examples=40, deadline=None)
@given(
    scenario=st.sampled_from(list(Scenario)),
    seed=st.integers(0, 1_000_000),
    bars=st.integers(100, 10_000),
    first_price=st.floats(0.01, 1_000_000),
)
def test_bars_are_valid_and_deterministic(
    scenario: Scenario, seed: int, bars: int, first_price: float
) -> None:
    spec = definition(scenario, seed, bars, first_price)
    for frame in (hourly_bars(spec), daily_bars(spec)):
        clean, report = validate_bars(frame)
        assert report.ok
        assert not report.warnings
        assert clean.equals(frame)
        assert (frame.volume > 0).all()
        np.testing.assert_array_equal(frame.adj_close, frame.close)
    assert hourly_bars(spec).equals(hourly_bars(spec))


@settings(max_examples=25, deadline=None)
@given(scenario=st.sampled_from(list(Scenario)), seed=st.integers(0, 1_000_000))
def test_the_first_price_only_scales_prices(scenario: Scenario, seed: int) -> None:
    base, scaled = (
        hourly_bars(definition(scenario, seed)),
        hourly_bars(definition(scenario, seed, first_price=250.0)),
    )
    for column in ("open", "high", "low", "close"):
        np.testing.assert_allclose(getattr(scaled, column), 2.5 * getattr(base, column), rtol=1e-12)
    np.testing.assert_allclose(scaled.volume, base.volume, rtol=1e-12)


@settings(max_examples=25, deadline=None)
@given(
    scenario=st.sampled_from(LENGTH_FREE),
    seed=st.integers(0, 1_000_000),
    short=st.integers(100, 600),
    extra=st.integers(1, 600),
)
def test_a_longer_series_starts_with_the_shorter_one(
    scenario: Scenario, seed: int, short: int, extra: int
) -> None:
    a = hourly_bars(definition(scenario, seed, short))
    b = hourly_bars(definition(scenario, seed, short + extra))
    assert b.take(np.arange(len(b)) < len(a)).equals(a)


def test_another_seed_gives_another_path() -> None:
    a, b = daily_bars(definition(seed=1)), daily_bars(definition(seed=2))
    assert not np.allclose(a.close, b.close)


def test_an_edited_definition_is_another_series_at_once() -> None:
    # Memoised by the whole definition: the same one is served from memory, an edit is new.
    spec = definition()
    assert hourly_bars(spec) is hourly_bars(definition())
    assert not daily_bars(definition(seed=2)).equals(daily_bars(spec))


class _Refuses:
    """A market provider the bar service must never ask for a synthetic symbol."""

    id = "market"

    def supports(self, symbol: SymbolInfo) -> bool:
        return True

    def supports_intraday(self, symbol: SymbolInfo, base: Interval) -> bool:
        return True

    def fetch_daily(self, symbol: SymbolInfo, start: date, end: date) -> BarFrame:
        raise AssertionError(f"asked the market for {symbol.symbol}")

    def fetch_intraday(
        self, symbol: SymbolInfo, base: Interval, start: date, end: date
    ) -> BarFrame:
        raise AssertionError(f"asked the market for {symbol.symbol}")


def test_online_the_bar_service_never_asks_the_market(tmp_path: Path) -> None:
    store = SyntheticSymbols(tmp_path / "app.db")
    spec = definition(bars=120)
    store.put(spec, 0)
    universe = Universe([]).with_extra(store)
    service = BarService(
        universe,
        BarCache(tmp_path / "bars.db"),
        [_Refuses()],
        provider_limits=True,
        synthetic=SyntheticProvider(store.definition),
    )
    hours = service.get_bars(spec.symbol, Interval.H1)
    assert (hours.source, hours.provider_window_days, len(hours.frame)) == ("synthetic", None, 840)
    assert len(service.get_bars(spec.symbol, Interval.D1).frame) == 120
    assert service.quote(spec.symbol).error is None
    with pytest.raises(IntervalUnavailableError):
        service.get_bars(spec.symbol, Interval.MIN5)
    store.close()


def test_the_shared_frames_are_read_only() -> None:
    with pytest.raises(ValueError, match="read-only"):
        daily_bars(definition()).close[0] = 1.0
