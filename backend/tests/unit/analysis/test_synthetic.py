"""Synthetic lab bars: determinism, valid OHLCV, business-day calendar, and each scenario's
defining property (on fixed seeds, so the statistics are deterministic)."""

from __future__ import annotations

from datetime import date

import numpy as np
import pytest

from app.analysis.gaps import find_gaps
from app.analysis.synthetic import Scenario, synthetic_bars
from app.models.bars import FloatArray, ts_to_date

SEEDS = [1, 2, 3, 4, 5]


def log_returns(close: FloatArray) -> FloatArray:
    return np.diff(np.log(close))


@pytest.mark.parametrize("scenario", list(Scenario))
def test_same_seed_same_bars_other_seed_other_bars(scenario: Scenario) -> None:
    a, b = synthetic_bars(scenario, 7, 300), synthetic_bars(scenario, 7, 300)
    assert a.equals(b)
    assert not np.allclose(a.close, synthetic_bars(scenario, 8, 300).close)


@pytest.mark.parametrize("scenario", list(Scenario))
@pytest.mark.parametrize("seed", [0, 1, 999_999])
def test_ohlcv_is_valid(scenario: Scenario, seed: int) -> None:
    f = synthetic_bars(scenario, seed, 2000)
    assert len(f) == 2000
    assert (f.low > 0).all()
    assert (f.low <= np.minimum(f.open, f.close)).all()
    assert (f.high >= np.maximum(f.open, f.close)).all()
    assert (f.volume > 0).all()
    np.testing.assert_array_equal(f.adj_close, f.close)
    assert f.close[0] == 100.0
    assert f.session is None


def test_business_days_from_2020_at_utc_midnight() -> None:
    f = synthetic_bars(Scenario.RANDOM_WALK, 1, 300)
    days = [ts_to_date(int(t)) for t in f.time]
    assert days[0] == date(2020, 1, 1)
    assert all(d.weekday() < 5 for d in days)  # Mon-Fri
    assert (f.time % 86_400 == 0).all()
    assert (np.diff(f.time) > 0).all()
    assert days[2] == date(2020, 1, 3)
    assert days[3] == date(2020, 1, 6)  # the weekend is skipped


@pytest.mark.parametrize("seed", SEEDS)
def test_uptrend_drifts_up(seed: int) -> None:
    r = log_returns(synthetic_bars(Scenario.UPTREND, seed, 2000).close)
    assert r.mean() > 0
    assert r.mean() == pytest.approx(0.0015, abs=5 * 0.012 / np.sqrt(len(r)))


@pytest.mark.parametrize("seed", SEEDS)
def test_random_walk_has_its_drift_and_volatility(seed: int) -> None:
    r = log_returns(synthetic_bars(Scenario.RANDOM_WALK, seed, 2000).close)
    assert r.mean() == pytest.approx(0.0003, abs=5 * 0.015 / np.sqrt(len(r)))
    assert r.std() == pytest.approx(0.015, rel=0.08)


@pytest.mark.parametrize("seed", SEEDS)
def test_range_reverts_to_100(seed: int) -> None:
    x = np.log(synthetic_bars(Scenario.RANGE, seed, 2000).close / 100.0)
    slope = np.polyfit(x[:-1], x[1:], 1)[0]  # AR(1) coefficient 1 - theta = 0.92
    assert slope == pytest.approx(0.92, abs=0.05)
    assert x.std() < 0.06  # stationary sd 0.038; a random walk would wander ~0.015 sqrt(n)
    forward = x[10:] - x[:-10]
    assert np.corrcoef(x[:-10], forward)[0, 1] < -0.3  # far from 100 -> moves back
    r = np.diff(x)
    assert np.corrcoef(r[:-1], r[1:])[0, 1] < 0.02  # expected -theta/2 = -0.04 (weak)


@pytest.mark.parametrize("seed", SEEDS)
def test_reversal_rises_then_falls(seed: int) -> None:
    r = log_returns(synthetic_bars(Scenario.REVERSAL, seed, 1000).close)
    assert r[:499].mean() > 0
    assert r[500:].mean() < 0


@pytest.mark.parametrize("seed", SEEDS)
def test_shock_is_a_15_percent_gap_down(seed: int) -> None:
    n = 500
    f = synthetic_bars(Scenario.SHOCK, seed, n)
    k = n // 2
    assert np.log(f.open[k] / f.close[k - 1]) == pytest.approx(np.log(0.85), abs=0.02)
    assert f.high[k] < f.low[k - 1]  # a full gap
    big = find_gaps(f, 5.0, partial=False)
    assert [(g.index, g.direction) for g in big] == [(k, "down")]
    # the same shocks as the random walk: identical before the jump
    walk = synthetic_bars(Scenario.RANDOM_WALK, seed, n)
    np.testing.assert_allclose(f.close[:k], walk.close[:k], rtol=1e-12)
    np.testing.assert_allclose(f.close[k:] / walk.close[k:], 0.85, rtol=1e-12)


@pytest.mark.parametrize("seed", SEEDS)
def test_volatility_regime_jumps_by_375_percent(seed: int) -> None:
    n = 2000
    r = log_returns(synthetic_bars(Scenario.VOLATILITY_REGIME, seed, n).close)
    half = n // 2
    calm, wild = r[: half - 1], r[half:]  # r[i] is the return of bar i + 1
    assert calm.std() == pytest.approx(0.008, rel=0.1)
    assert wild.std() / calm.std() == pytest.approx(3.75, rel=0.12)
