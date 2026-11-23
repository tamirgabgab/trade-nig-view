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


# --- R3b: generalized moving averages -----------------------------------------------------------


def test_swma_hand_vector() -> None:
    # (1 + 2*2 + 2*3 + 4) / 6 = 2.5; (2 + 2*3 + 2*4 + 5) / 6 = 3.5
    np.testing.assert_allclose(
        core.swma(arr(1, 2, 3, 4, 5)), arr(NAN, NAN, NAN, 2.5, 3.5), equal_nan=True
    )


def test_vwma_hand_vector() -> None:
    # (1*1 + 2*1) / 2 = 1.5; (2*1 + 3*2) / 3 = 8/3
    np.testing.assert_allclose(
        core.vwma(arr(1, 2, 3), arr(1, 1, 2), 2), arr(NAN, 1.5, 8 / 3), equal_nan=True
    )


def test_vwma_without_volume_is_nan() -> None:
    y = core.vwma(arr(1, 2, 3, 4), arr(0, 0, 0, 5), 2)
    np.testing.assert_allclose(y, arr(NAN, NAN, NAN, 4), equal_nan=True)


def test_mcginley_hand_vector() -> None:
    # n = 2: seed EMA_2 = mean(2, 4) = 3; M_2 = 3 + (4 - 3) / (2 * (4/3)^4) = 3 + 81/512
    np.testing.assert_allclose(
        core.mcginley(arr(2, 4, 4), 2), arr(NAN, 3, 3 + 81 / 512), equal_nan=True
    )


def test_kama_hand_vector() -> None:
    # n = 2, f = 2/3: seed K_1 = x_1 = 2; noise = change at t = 2, 3, so ER = 1, c = f^2 = 4/9
    k2 = 2 + 4 / 9
    k3 = k2 + 4 / 9 * (3 - k2)
    np.testing.assert_allclose(core.kama(arr(1, 2, 3, 3), 2), arr(NAN, NAN, k2, k3), equal_nan=True)


def test_kama_efficiency_ratio_slows_it_down_in_chop() -> None:
    # change |5 - 5| = 0 over a noisy window: ER = 0, c = s^2 with s = 2/31
    s = 2 / 31
    y = core.kama(arr(5, 6, 5, 6, 5), 4)
    np.testing.assert_allclose(y[4], 6 + s * s * (5 - 6))


def test_lsma_on_a_line_returns_the_line() -> None:
    x = np.asarray(3.0 + 2.0 * np.arange(40), dtype=np.float64)
    np.testing.assert_allclose(core.lsma(x, 7)[6:], x[6:])
    # offset o evaluates the fitted line o bars back
    np.testing.assert_allclose(core.lsma(x, 7, offset=2)[6:], x[4:-2])


def test_lsma_equals_3wma_minus_2sma() -> None:
    x = np.random.default_rng(5).normal(100, 5, 80)
    np.testing.assert_allclose(core.lsma(x, 10), 3 * core.wma(x, 10) - 2 * core.sma(x, 10))


def test_alma_weights_are_a_normalised_gaussian() -> None:
    w = core.alma_weights(9)
    assert w.sum() == pytest.approx(1.0)
    assert int(np.argmax(w)) == round(0.85 * 8)
    assert np.all(w > 0)


def test_hma_rejects_length_one() -> None:
    with pytest.raises(ValueError, match=">= 2"):
        core.hma(arr(1, 2, 3), 1)


def _ramp_lags(n: int, v: float = 0.7) -> dict[str, tuple[float, int]]:
    """Analytic ramp lag and warm-up per lag-compensated MA (PLAN section 5.4)."""
    m, s = core.hma_lengths(n)
    d = core.zlema_lag(n)
    return {
        "dema": (0.0, 2 * (n - 1)),
        "tema": (0.0, 3 * (n - 1)),
        "lsma": (0.0, n - 1),
        "hma": ((s + 2 * m - n - 2) / 3, n + s - 2),
        "zlema": ((n - 1) / 2 - d, n - 1 + d),
        "t3": (3 * (1 - v) * (n - 1) / 2, 6 * (n - 1)),
    }


FUNCTIONS = {
    "dema": core.dema,
    "tema": core.tema,
    "lsma": core.lsma,
    "hma": core.hma,
    "zlema": core.zlema,
    "t3": core.t3,
}


@pytest.mark.parametrize("n", [2, 3, 9, 16, 21])
@pytest.mark.parametrize("name", sorted(FUNCTIONS))
def test_ramp_lag_of_lag_compensated_mas(name: str, n: int) -> None:
    """On x_t = a + b t every output from the warm-up on is x_{t - lag} exactly."""
    x = np.asarray(50.0 + 0.5 * np.arange(400), dtype=np.float64)
    lag, warmup = _ramp_lags(n)[name]
    y = FUNCTIONS[name](x, n)
    assert np.isnan(y[:warmup]).all()
    np.testing.assert_allclose(y[warmup:], x[warmup:] - 0.5 * lag, rtol=0, atol=1e-9)


@pytest.mark.parametrize("name", sorted(FUNCTIONS))
def test_lag_compensated_mas_overshoot_a_step(name: str) -> None:
    """The price of less lag: a negative kernel lobe overshoots a unit step."""
    x = np.r_[np.zeros(200), np.ones(200)]
    y = FUNCTIONS[name](x, 10)
    assert np.nanmax(y) > 1.0 + 1e-3


def test_t3_with_factor_zero_is_a_triple_ema() -> None:
    """v = 0 leaves only c4 e3, but the warm-up stays 6(n-1) as in TA-Lib."""
    x = np.random.default_rng(8).normal(100, 5, 120)
    triple = core.ema(core.ema(core.ema(x, 4), 4), 4)
    y = core.t3(x, 4, 0.0)
    assert np.isnan(y[:18]).all()
    np.testing.assert_allclose(y[18:], triple[18:])


def test_mcginley_reseeds_from_the_ema_after_a_zero_divisor() -> None:
    """Length 1 and a halving drive M negative and then huge until (x/M)^4 underflows to 0:
    Pine gives na there and takes the EMA (= x for n = 1) on the next bar."""
    x = arr(2, 1, 1, 1, 1, 1, 1, 1, 1, 1)
    y = core.mcginley(x, 1)
    gap = np.flatnonzero(np.isnan(y))
    assert gap.size == 1
    assert y[gap[0] + 1] == x[gap[0] + 1]
