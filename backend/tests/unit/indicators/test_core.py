"""Directed tests of the filter building blocks: hand vectors, analytic responses, edge cases."""

from __future__ import annotations

import numpy as np
import pytest

from app.indicators import core
from app.models.bars import BarFrame

NAN = np.nan


def arr(*values: float) -> np.ndarray:
    return np.array(values, dtype=np.float64)


def test_sma_hand_vector() -> None:
    np.testing.assert_allclose(
        core.sma(arr(1, 2, 3, 4, 10), 3), arr(NAN, NAN, 2, 3, 17 / 3), equal_nan=True
    )


def test_wma_hand_vector() -> None:
    # (1*1 + 2*2 + 3*3) / 6 = 14/6; (1*2 + 2*3 + 3*4) / 6 = 20/6
    np.testing.assert_allclose(
        core.wma(arr(1, 2, 3, 4), 3), arr(NAN, NAN, 14 / 6, 20 / 6), equal_nan=True
    )


def test_ema_hand_vector_with_sma_seed() -> None:
    # n = 3, alpha = 0.5: seed mean(2, 4, 6) = 4; then 4 + 0.5*(8-4) = 6; 6 + 0.5*(0-6) = 3
    np.testing.assert_allclose(
        core.ema(arr(2, 4, 6, 8, 0), 3), arr(NAN, NAN, 4, 6, 3), equal_nan=True
    )


def test_rma_hand_vector() -> None:
    # n = 2, alpha = 1/2 (same as EMA_3): seed mean(1, 3) = 2; 2 + (5-2)/2 = 3.5
    np.testing.assert_allclose(core.rma(arr(1, 3, 5), 2), arr(NAN, 2, 3.5), equal_nan=True)


def test_rma_equals_ema_of_length_2n_minus_1_after_seed() -> None:
    x = np.random.default_rng(7).normal(100, 5, 400)
    r, e = core.rma(x, 10), core.ema(x, 19)
    # Same alpha; only the seeds differ (SMA_10 vs SMA_19), and that difference decays as 0.9^k.
    np.testing.assert_allclose(r[300:], e[300:], rtol=1e-9)


def test_length_one_is_identity() -> None:
    x = arr(3, 1, 4, 1, 5)
    for fn in (core.sma, core.ema, core.wma, core.rma):
        np.testing.assert_allclose(fn(x, 1), x)


def test_series_shorter_than_length_is_all_nan() -> None:
    for fn in (core.sma, core.ema, core.wma, core.rma):
        assert np.isnan(fn(arr(1, 2), 3)).all()
        assert len(fn(arr(), 3)) == 0


def test_nested_ema_seeds_after_the_inner_warm_up() -> None:
    inner = core.ema(np.arange(1.0, 11.0), 3)  # NaN, NaN, then values
    outer = core.ema(inner, 3)
    assert np.isnan(outer[:4]).all()
    assert outer[4] == pytest.approx(np.mean(inner[2:5]))


def test_fir_nan_in_window_gives_nan() -> None:
    out = core.sma(arr(1, NAN, 3, 4, 5), 2)
    np.testing.assert_allclose(out, arr(NAN, NAN, NAN, 3.5, 4.5), equal_nan=True)


@pytest.mark.parametrize("bad_alpha", [0.0, -0.1, 1.5])
def test_ema_recursive_rejects_bad_alpha(bad_alpha: float) -> None:
    with pytest.raises(ValueError, match="alpha"):
        core.ema_recursive(arr(1, 2, 3), bad_alpha, 2)


def test_rejects_bad_lengths() -> None:
    with pytest.raises(ValueError, match="length"):
        core.ema_recursive(arr(1, 2, 3), 0.5, 0)
    with pytest.raises(ValueError, match="weight"):
        core.fir(arr(1, 2, 3), arr())


def test_shift_moves_values_right() -> None:
    y = arr(1, 2, 3, 4)
    np.testing.assert_allclose(core.shift(y, 0), y)
    np.testing.assert_allclose(core.shift(y, 2), arr(NAN, NAN, 1, 2), equal_nan=True)
    assert np.isnan(core.shift(y, 9)).all()
    with pytest.raises(ValueError, match="future"):
        core.shift(y, -1)


def test_sources() -> None:
    frame = BarFrame.from_columns([0], open=[1.0], high=[4.0], low=[0.0], close=[3.0])
    expected = {
        "close": 3.0,
        "open": 1.0,
        "high": 4.0,
        "low": 0.0,
        "hl2": 2.0,
        "hlc3": 7 / 3,
        "ohlc4": 2.0,
        "hlcc4": 2.5,
    }
    assert {name: float(core.source(frame, name)[0]) for name in core.SOURCES} == pytest.approx(
        expected
    )
    copy = core.source(frame, "close")
    copy[0] = 99.0
    assert frame.close[0] == 3.0  # sources never alias the frame


@pytest.mark.parametrize("n", [2, 5, 9, 20])
def test_ramp_lag_is_exact_for_sma_wma_ema(n: int) -> None:
    """x_t = a + b t  ->  y_t = x_{t - lag} after warm-up (PLAN section 5.1)."""
    t = np.arange(300, dtype=np.float64)
    x = 5.0 + 0.25 * t
    lags = {core.sma: (n - 1) / 2, core.ema: (n - 1) / 2, core.wma: (n - 1) / 3}
    for fn, lag in lags.items():
        y = fn(x, n)
        np.testing.assert_allclose(y[n - 1 :], 5.0 + 0.25 * (t[n - 1 :] - lag), rtol=1e-12)


def test_ramp_lag_of_rma_converges_to_n_minus_1() -> None:
    n = 10
    t = np.arange(800, dtype=np.float64)
    y = core.rma(2.0 * t, n)
    np.testing.assert_allclose(y[-1], 2.0 * (t[-1] - (n - 1)), rtol=1e-12)


@pytest.mark.parametrize("n", [3, 9])
def test_impulse_response_equals_kernel(n: int) -> None:
    """A unit impulse after a zero history returns the kernel h_k (PLAN section 5.1)."""
    pad, k = 50, np.arange(40)
    x = np.zeros(pad + 40)
    x[pad] = 1.0
    alpha = 2 / (n + 1)
    kernels = {
        core.sma: np.where(k < n, 1 / n, 0.0),
        core.wma: np.where(k < n, 2 * (n - k) / (n * (n + 1)), 0.0),
        core.ema: alpha * (1 - alpha) ** k,
        core.rma: (1 / n) * (1 - 1 / n) ** k,
    }
    for fn, h in kernels.items():
        np.testing.assert_allclose(fn(x, n)[pad:], h, atol=1e-15)
        # Unit DC gain and lag = centre of mass for the finite kernels.
        if fn in (core.sma, core.wma):
            assert h.sum() == pytest.approx(1.0)
