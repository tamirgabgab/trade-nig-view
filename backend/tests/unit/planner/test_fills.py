"""The fill models: hand vectors, the table's symmetries, and the table against the user's
direct rejection sampling."""

from __future__ import annotations

from functools import cache

import numpy as np
import pytest

from app.planner.fills import TABLE_PATH, FillMode, Granularity, fill_prices

# One bar: open 10, high 14, low 8, close 12 (u = 1/3, v = 2/3).
BAR = (np.array([10.0]), np.array([14.0]), np.array([8.0]), np.array([12.0]))
DOWN = (np.array([12.0]), np.array([14.0]), np.array([8.0]), np.array([10.0]))


def one(bar: tuple[np.ndarray, ...], mode: FillMode, t: float | None = None, **kw: object) -> float:
    at = None if t is None else np.array([t])
    return float(fill_prices(*bar, mode, t=at, **kw)[0])  # type: ignore[arg-type]


def test_hand_vectors_of_the_simple_models() -> None:
    assert one(BAR, FillMode.CLOSE) == 12.0
    assert one(BAR, FillMode.OPEN) == 10.0
    assert one(BAR, FillMode.MID) == 11.0
    assert one(BAR, FillMode.LINEAR, 0.25) == pytest.approx(10.5)
    assert one(BAR, FillMode.LINEAR) == pytest.approx(11.0)  # the time-average, (O + C) / 2


def test_piecewise_goes_through_the_low_first_in_an_up_bar() -> None:
    # Up bar: O -> L -> H -> C at t = 0, 1/3, 2/3, 1.
    assert one(BAR, FillMode.PIECEWISE, 1 / 6) == pytest.approx(9.0)
    assert one(BAR, FillMode.PIECEWISE, 1 / 2) == pytest.approx(11.0)
    assert one(BAR, FillMode.PIECEWISE, 5 / 6) == pytest.approx(13.0)
    # Down bar: O -> H -> L -> C.
    assert one(DOWN, FillMode.PIECEWISE, 1 / 6) == pytest.approx(13.0)
    # The time-average of either order: (O + 2H + 2L + C) / 6.
    assert one(BAR, FillMode.PIECEWISE) == pytest.approx((10 + 28 + 16 + 12) / 6)
    # Random order, nothing drawn: the average of both orders (9 and 12 at t = 1/6).
    assert one(BAR, FillMode.PIECEWISE_RANDOM, 1 / 6) == pytest.approx(10.5)
    rng = np.random.default_rng(1)
    draws = {round(one(BAR, FillMode.PIECEWISE_RANDOM, 1 / 6, rng=rng), 9) for _ in range(40)}
    assert draws == {9.0, 12.0}


@pytest.mark.parametrize("level", list(Granularity))
def test_estimated_is_exact_at_the_ends_and_stays_in_the_range(level: Granularity) -> None:
    assert one(BAR, FillMode.ESTIMATED, 0.0, granularity=level) == pytest.approx(10.0)
    assert one(BAR, FillMode.ESTIMATED, 1.0, granularity=level) == pytest.approx(12.0)
    grid = np.linspace(0, 1, 41)
    o, h, lo, c = (np.repeat(x, 41) for x in BAR)
    prices = fill_prices(o, h, lo, c, FillMode.ESTIMATED, t=grid, granularity=level)
    assert np.all((prices >= 8.0) & (prices <= 14.0))


def test_a_flat_bar_returns_its_close() -> None:
    flat = (np.array([5.0]), np.array([5.0]), np.array([5.0]), np.array([5.0]))
    for mode in FillMode:
        assert one(flat, mode) == 5.0
        assert one(flat, mode, 0.3) == 5.0


@pytest.mark.parametrize("level", list(Granularity))
def test_the_table_is_symmetric_under_reflection_and_time_reversal(level: Granularity) -> None:
    rng = np.random.default_rng(3)
    u, v, t = rng.uniform(size=(3, 200))
    zero, unit = np.zeros(200), np.ones(200)
    est = fill_prices(u, unit, zero, v, FillMode.ESTIMATED, t=t, granularity=level)
    mirror = fill_prices(1 - u, unit, zero, 1 - v, FillMode.ESTIMATED, t=t, granularity=level)
    np.testing.assert_allclose(est + mirror, 1.0, atol=5e-5)  # float32 table
    reverse = fill_prices(v, unit, zero, u, FillMode.ESTIMATED, t=1 - t, granularity=level)
    np.testing.assert_allclose(est, reverse, atol=5e-5)


@cache
def rejection(u: float, v: float, paths: int = 400_000, delta: float = 0.05) -> np.ndarray:
    """The user's algorithm as written: simulate, normalise, keep the paths near (u, v)."""
    rng = np.random.default_rng(11)
    kept = []
    for _ in range(paths // 50_000):
        x = np.cumsum(rng.standard_normal((50_000, 390)), axis=1)
        x = np.concatenate([np.zeros((50_000, 1)), x], axis=1)
        lo = x.min(axis=1, keepdims=True)
        y = (x - lo) / (x.max(axis=1, keepdims=True) - lo)
        near = (np.abs(y[:, 0] - u) < delta) & (np.abs(y[:, -1] - v) < delta)
        s = np.linspace(0, 1, 391)
        kept.append(y[near] + (u - y[near][:, :1]) * (1 - s) + (v - y[near][:, -1:]) * s)
    return np.concatenate(kept)


@pytest.mark.parametrize("level", list(Granularity))
def test_the_table_agrees_with_direct_rejection_sampling(level: Granularity) -> None:
    paths = rejection(1 / 3, 2 / 3)
    assert len(paths) > 2_000
    unit = (np.array([1 / 3]), np.array([1.0]), np.array([0.0]), np.array([2 / 3]))
    for t in (0.25, 0.5, 0.75):
        want = paths[:, round(t * 390)].mean()
        assert one(unit, FillMode.ESTIMATED, t, granularity=level) == pytest.approx(want, abs=0.02)
    # The expected price at an unknown time: the time-average (0.5 by symmetry here).
    assert one(unit, FillMode.ESTIMATED, granularity=level) == pytest.approx(paths.mean(), abs=0.01)


def test_draws_follow_the_conditional_law() -> None:
    n = 20_000
    o, h, lo, c = (np.repeat(x, n) for x in BAR)
    rng = np.random.default_rng(5)
    draws = (fill_prices(o, h, lo, c, FillMode.ESTIMATED, rng=rng) - 8.0) / 6.0
    assert np.all((draws >= 0) & (draws <= 1))
    assert draws.mean() == pytest.approx(0.5, abs=0.01)
    # The price at a random time in a (1/3, 2/3) bar: sd about a quarter of the range.
    assert draws.std() == pytest.approx(0.245, abs=0.02)


def test_the_committed_table_has_enough_samples_in_every_cell() -> None:
    with np.load(TABLE_PATH) as data:
        assert data["fine_mean"].shape == (40, 40, 79)
        assert data["medium_mean"].shape == (20, 20, 27)
        assert data["coarse_mean"].shape == (10, 10, 14)
        assert data["fine_count"].min() >= 1_000
