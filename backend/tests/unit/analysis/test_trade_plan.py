"""The trade plan (``app.analysis.trade_plan``): the Brownian bridge (symmetry, limits, a
continuity-corrected Monte Carlo), the path simulation on hand-made paths (fills, gaps, a
two-level bar, the fill bar), the Brownian reference, and the plan on synthetic bars (a
driftless walk's odds, calibration, no lookahead, the short side)."""

from __future__ import annotations

import math

import numpy as np
import pytest

from app.analysis import trade_plan as tp
from app.analysis.synthetic import Scenario, synthetic_bars
from app.models.bars import BarFrame


def arr(*v: float) -> np.ndarray:
    return np.array(v, dtype=np.float64)


def test_bridge_symmetry_and_limits() -> None:
    a, b, x = arr(0.2, 0.5, 0.3), arr(0.5, 0.2, 0.1), arr(0.3, -0.4, 0.0)
    p = tp.bridge_target_first(a, b, x)
    np.testing.assert_allclose(p + tp.bridge_target_first(b, a, -x), 1.0, atol=1e-9)
    assert tp.bridge_target_first(arr(0.3), arr(0.3), arr(0.0))[0] == pytest.approx(0.5)
    # A level next to the open is hit first almost surely.
    assert tp.bridge_target_first(arr(0.01), arr(1.0), arr(0.0))[0] > 0.95
    np.testing.assert_allclose(tp.bridge_lookup(a, b, x), p, atol=2e-3)


def test_bridge_matches_a_monte_carlo_of_bridges() -> None:
    """Bridges 0 -> x on 1,000 steps, the levels moved out by 0.5826 sqrt(dt) (Broadie-Glasserman:
    a discretely watched path misses touches by about that much)."""
    rng = np.random.default_rng(7)
    steps, n = 1000, 20_000
    shift = 0.5826 * math.sqrt(1 / steps)
    for a, b, x in ((0.2, 0.5, 0.3), (0.5, 0.2, -0.4), (0.4, 0.6, 0.5)):
        w = np.cumsum(rng.standard_normal((n, steps)) * math.sqrt(1 / steps), axis=1)
        t = np.arange(1, steps + 1) / steps
        path = w - t * w[:, -1:] + t * x
        up, down = path >= a - shift, path <= -b + shift
        both = up.any(axis=1) & down.any(axis=1)
        first_up = up.argmax(axis=1) < down.argmax(axis=1)
        mc = first_up[both].mean()
        exact = tp.bridge_target_first(arr(a), arr(b), arr(x))[0]
        assert exact == pytest.approx(mc, abs=0.02), (a, b, x)


Rows = list[list[float]]


def paths(o: Rows, h: Rows, lo: Rows, c: Rows) -> tp.Paths:
    return tp.Paths(
        np.array(o), np.array(h), np.array(lo), np.array(c), np.arange(len(o), dtype=np.int64)
    )


def test_simulate_on_hand_paths() -> None:
    # Entry at the close (0), target +0.10, stop -0.05; three bars per path.
    p = paths(
        o=[[0.0, 0.02, 0.0], [0.0, -0.08, 0.0], [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]],
        h=[[0.03, 0.12, 0.0], [0.01, -0.07, 0.0], [0.02, 0.02, 0.02], [0.12, 0.0, 0.0]],
        lo=[[-0.01, 0.01, 0.0], [-0.01, -0.09, 0.0], [-0.02, -0.02, -0.02], [-0.06, 0.0, 0.0]],
        c=[[0.02, 0.11, 0.0], [0.0, -0.08, 0.0], [0.01, 0.0, 0.015], [0.0, 0.0, 0.0]],
    )
    out = tp.simulate(p, 1.0, 0.0, 0.10, -0.05)
    # Path 0: the target on bar 2 (+2R in prices, about); path 1: a gap below the stop exits at
    # the open (worse than -1R); path 2: neither, out at the last close; path 3: both levels in
    # bar 1 -> the bridge splits it.
    np.testing.assert_allclose(out.target[:3], [1, 0, 0])
    np.testing.assert_allclose(out.stop[:3], [0, 1, 0])
    np.testing.assert_allclose(out.neither, [0, 0, 1, 0])
    assert 0 < out.target[3] < 1
    assert out.target[3] + out.stop[3] == pytest.approx(1)
    risk = 1 - math.exp(-0.05)
    assert out.r_target[0] == pytest.approx((math.exp(0.10) - 1) / risk)
    assert out.r_stop[1] == pytest.approx((math.exp(-0.08) - 1) / risk)
    assert out.r_stop[1] < -1
    assert out.r_neither[2] == pytest.approx((math.exp(0.015) - 1) / risk)
    np.testing.assert_allclose(out.bars, [2, 2, 3, 1])
    np.testing.assert_allclose(out.ambiguous, [0, 0, 0, 1])


def test_a_limit_entry_fills_on_touch_and_the_fill_bar_counts_only_the_stop() -> None:
    # Limit at -0.03 (below the close), target +0.05, stop -0.08.
    p = paths(
        o=[[0.0, 0.0], [-0.04, 0.0], [0.0, 0.0]],
        h=[[0.06, 0.06], [-0.03, 0.0], [0.01, 0.01]],
        lo=[[-0.03, -0.01], [-0.09, -0.01], [-0.01, -0.01]],
        c=[[0.0, 0.0], [-0.05, 0.0], [0.0, 0.0]],
    )
    out = tp.simulate(p, 1.0, -0.03, 0.05, -0.08)
    np.testing.assert_array_equal(out.filled, [True, True, False])
    # Path 0: filled on bar 0, whose +0.06 high may have come first: not counted; target on bar 1.
    assert out.target[0] == 1
    assert out.bars[0] == 2
    # Path 1: a gap below the entry fills at the open (-0.04); the same bar's low hits the stop.
    assert out.stop[1] == 1
    risk = math.exp(-0.03) - math.exp(-0.08)
    assert out.r_stop[1] == pytest.approx((math.exp(-0.08) - math.exp(-0.04)) / risk)


def test_brownian_reference() -> None:
    assert tp.brownian_reference(0.0, 0.01, 0.02, 0.01) == pytest.approx(1 / 3)
    assert tp.brownian_reference(0.001, 0.01, 0.02, 0.01) > 1 / 3
    assert math.isnan(tp.brownian_reference(0.0, 0.0, 0.02, 0.01))


def walk(n: int = 3000, seed: int = 5) -> BarFrame:
    """A Gaussian walk with Brownian-like bars (no gaps) whose second half mirrors the first
    (every step negated): no drift in the sample at all, the textbook case."""
    rng = np.random.default_rng(seed)
    half = rng.standard_normal((n // 2, 16)) * 0.01 / 4
    steps = np.concatenate((half, -half))
    inside = np.cumsum(steps, axis=1)
    start = np.concatenate(([0.0], np.cumsum(inside[:, -1])[:-1]))
    hi = start + np.maximum(inside.max(axis=1), 0)
    lo = start + np.minimum(inside.min(axis=1), 0)
    close = start + inside[:, -1]
    e = np.exp
    return BarFrame.from_columns(
        time=np.arange(n) * 86_400,
        open=100 * e(start),
        high=100 * e(hi),
        low=100 * e(lo),
        close=100 * e(close),
    )


def test_plan_on_a_driftless_walk_has_the_textbook_odds_and_is_calibrated() -> None:
    frame = walk()
    o = len(frame) - 1
    c = float(frame.close[o])
    p = tp.plan(frame, o, c, c * math.exp(0.06), c * math.exp(-0.03), 60)
    assert p is not None
    s = p.summary
    assert s is not None
    assert p.side == "long"
    assert s.p_fill == 1.0
    assert s.p_target + s.p_stop + s.p_neither == pytest.approx(1)
    # Gambler's ruin without drift: P(+2 units before -1) = 1/3. Within 60 bars few end in neither.
    assert s.p_target == pytest.approx(1 / 3, abs=0.03)
    assert p.reference == pytest.approx(1 / 3, abs=0.02)
    assert s.p_neither < 0.06
    assert s.p_target_bounds[0] <= s.p_target <= s.p_target_bounds[1]
    assert len(p.heat) == len(p.heat[0]) == len(tp.MULTIPLES)


def test_calibration_on_a_random_walk() -> None:
    """Out of sample, the forecast P(target) matches the observed share bin by bin, and beats
    the base rate. (The mirrored walk above would not: its drift reverses half-way.)"""
    frame = synthetic_bars(Scenario.RANDOM_WALK, 1, 3000)
    o = 2500
    c = float(frame.close[o])
    p = tp.plan(frame, o, c, c * 1.04, c * 0.98, 20)
    assert p is not None
    cal = p.calibration
    assert cal is not None
    assert cal.n == 18_000  # 36 plans x 500 origins
    assert cal.brier < 0.7 * cal.brier_base
    for f, ob, n in zip(cal.forecast, cal.observed, cal.count, strict=True):
        if n >= 1000:
            assert ob == pytest.approx(f, abs=0.06)


def test_plan_uses_no_bar_after_the_origin_and_reports_the_actual_outcome() -> None:
    frame = synthetic_bars(Scenario.RANDOM_WALK, 3, 1500)
    o = 1200
    c = float(frame.close[o])
    full = tp.plan(frame, o, c, c * 1.05, c * 0.97, 15)
    cut = tp.plan(frame.take(slice(0, o + 1)), o, c, c * 1.05, c * 0.97, 15)
    assert full is not None
    assert cut is not None
    assert full.summary == cut.summary
    assert full.heat == cut.heat
    assert cut.actual is None
    assert full.actual in {"target", "stop", "neither"}
    partial = tp.plan(frame.take(slice(0, o + 3)), o, c, c * 1.05, c * 0.97, 15)
    assert partial is not None
    assert partial.actual in {"open", "target", "stop"}


def test_a_short_plan_mirrors_the_long_one() -> None:
    frame = synthetic_bars(Scenario.RANDOM_WALK, 4, 1500)
    o = 1300
    c = float(frame.close[o])
    short = tp.plan(frame, o, c, c * 0.95, c * 1.03, 15)
    assert short is not None
    assert short.side == "short"
    s = short.summary
    assert s is not None
    assert s.loss_r is not None
    assert s.loss_r <= -0.99  # a stop costs at least the planned risk (gaps: more)


def test_too_few_paths_is_none() -> None:
    frame = synthetic_bars(Scenario.RANDOM_WALK, 1, 120)
    c = float(frame.close[-1])
    assert tp.plan(frame, len(frame) - 1, c, c * 1.05, c * 0.97, 20) is None
