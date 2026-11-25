"""The market regime (``app.analysis.regime`` and its indicators): the variance ratio of known
processes, DFA on white noise, MF-DFA's width, the regime of the ``regimes`` scenario's two
halves, a random walk's false alarms, and the event study's bookkeeping."""

from __future__ import annotations

import time

import numpy as np
import pytest

from app.analysis import regime as rg
from app.analysis.synthetic import Scenario, synthetic_bars
from app.indicators import hurst, variance_ratio
from app.indicators.catalog import CATALOG
from app.models.bars import BarFrame


def frame_of(r: np.ndarray) -> BarFrame:
    close = 100 * np.exp(np.concatenate(([0.0], np.cumsum(r))))
    return BarFrame.from_columns(
        time=np.arange(len(close)) * 86_400, open=close, high=close, low=close, close=close
    )


def ar1(phi: float, n: int, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    e = rng.standard_normal(n) * 0.01
    r = np.zeros(n)
    for t in range(1, n):
        r[t] = phi * r[t - 1] + e[t]
    return r


def test_variance_ratio_of_known_processes() -> None:
    # AR(1) returns: VR(2) = 1 + phi.
    for phi in (-0.3, 0.0, 0.3):
        vr, z = variance_ratio.vr_stats(ar1(phi, 20_000, 1)[None, :])
        assert vr[0, 0] == pytest.approx(1 + phi, abs=0.03)
        assert (z[0, 0] > 3) == (phi > 0)
        assert (z[0, 0] < -3) == (phi < 0)
    # Under homoskedasticity theta(q) -> 2 (2q - 1)(q - 1) / (3q): z* is a standard normal.
    zs = [variance_ratio.vr_stats(ar1(0.0, 500, s)[None, :])[1][0, 0] for s in range(200)]
    assert np.std(zs) == pytest.approx(1.0, abs=0.15)


def test_dfa_of_white_noise_and_of_persistence() -> None:
    assert rg.dfa_h(np.random.default_rng(2).standard_normal(4096), rg.scales_for(4096)) == (
        pytest.approx(0.5, abs=0.05)
    )
    persistent = np.cumsum(np.random.default_rng(3).standard_normal(4096))  # a walk as "returns"
    assert rg.dfa_h(persistent, rg.scales_for(4096)) > 1.2
    assert rg.scales_for(255) == (8, 16, 32)
    assert hurst.SCALES == (8, 16, 32, 64)


def test_mfdfa_width_is_small_for_gaussian_noise_and_large_for_fat_bursts() -> None:
    rng = np.random.default_rng(4)
    gauss = rg.mfdfa(rng.standard_normal(4096))
    assert gauss is not None
    assert abs(gauss.width) < 0.1
    bursts = rng.standard_normal(4096) * np.where(rng.uniform(size=4096) < 0.02, 20.0, 1.0)
    fat = rg.mfdfa(bursts)
    assert fat is not None
    assert fat.width > gauss.width + 0.1
    assert rg.mfdfa(rng.standard_normal(40)) is None


def test_the_regimes_scenario_and_a_random_walk() -> None:
    frame = synthetic_bars(Scenario.REGIMES, 2, 3000)
    labels = CATALOG["regime"].run(frame)["regime"]
    assert np.mean(labels[400:1500] == 1) > 0.8  # momentum half: a trend
    assert np.mean(labels[1900:] == -1) > 0.8  # reverting half
    r = rg.report(frame)
    assert r is not None
    assert r.label == "reversion"
    assert r.p_bootstrap < rg.ALPHA
    assert r.cd < -2.49
    assert r.window == 262
    assert sum(r.cells.values()) == pytest.approx(1.0)
    walk = rg.report(synthetic_bars(Scenario.RANDOM_WALK, 3, 3000))
    assert walk is not None
    assert walk.label == "random"
    assert walk.hurst_null[0] < walk.hurst_window < walk.hurst_null[1]


def test_event_study_bookkeeping() -> None:
    frame = synthetic_bars(Scenario.REGIMES, 2, 3000)
    labels = CATALOG["regime"].run(frame)["regime"]
    stats = rg.event_study(frame, labels)
    rules = {s.rule for s in stats}
    assert rules == set(rg.signals(frame))
    for s in stats:
        assert s.n >= 2
        assert 0 <= s.hit_rate <= 1
    # Each rule's signals are split by the regime of their bar: the counts add up.
    hits = rg.signals(frame)
    forward_known = np.arange(len(frame)) < len(frame) - rg.FORWARD
    for rule, (_, signal) in hits.items():
        counted = sum(s.n for s in stats if s.rule == rule)
        possible = int((signal & np.isfinite(labels) & forward_known).sum())
        assert counted <= possible
        assert counted >= possible - 6  # a regime with fewer than two signals is left out


def test_too_short_is_none() -> None:
    assert rg.report(synthetic_bars(Scenario.RANDOM_WALK, 1, 200)) is None


def test_flat_and_bad_histories() -> None:
    assert rg.report(frame_of(np.zeros(400))) is None  # flat: nothing to test, no crash
    r = ar1(0.0, 2000, 6)
    bad = frame_of(r)
    close = bad.close.copy()
    close[10] = np.nan  # one bad close long before the window
    damaged = BarFrame.from_columns(time=bad.time, open=close, high=close, low=close, close=close)
    report = rg.report(damaged)
    assert report is not None
    assert np.isfinite(report.hurst_history)  # the bad return is dropped, not the history


def test_a_year_of_24_5_hourly_bars_and_a_long_history_are_fast() -> None:
    # Forex hours: 24 bars a day, 5 days a week: about 6,260 bars a year, above the indicator's
    # parameter range for the volatility percentile.
    n = 2 * 6260
    days = np.arange(n) // 24
    weeks, weekday = days // 5, days % 5
    t = (weeks * 7 + weekday) * 86_400 + (np.arange(n) % 24) * 3600
    close = 100 * np.exp(np.cumsum(ar1(0.0, n, 7)))
    hourly = BarFrame.from_columns(time=t, open=close, high=close, low=close, close=close)
    report = rg.report(hourly)
    assert report is not None
    assert report.window > 6000
    start = time.perf_counter()
    spectrum = rg.mfdfa(ar1(0.0, 25_000, 8))
    assert time.perf_counter() - start < 1.0
    assert spectrum is not None


def test_hurst_is_undefined_on_equal_returns() -> None:
    """A straight-line profile (every return equal) has F(s) of rounding noise only: no H, rather
    than a number that changes with the next bar (found by the no-lookahead property)."""
    h = CATALOG["hurst_dfa"].run(frame_of(np.full(120, 0.01)), {"length": 64})["hurst"]
    assert np.isnan(h).all()
    noisy = frame_of(np.random.default_rng(1).normal(0.0005, 0.01, 120))
    assert np.isfinite(CATALOG["hurst_dfa"].run(noisy, {"length": 64})["hurst"][64:]).all()
