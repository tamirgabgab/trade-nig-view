"""Filter view: measured lag, NRF and responses equal the closed forms (PLAN.md section 5.3).

The measures come from running the real indicators on synthetic bars, so this is also a directed
test of every linear MA's kernel.
"""

from __future__ import annotations

import math
from collections.abc import Callable

import numpy as np
import numpy.typing as npt
import pytest

from app.analysis.response import ADAPTIVE, MAX_TAPS, VOLUME, OutputResponse, filter_response
from app.indicators import core
from app.indicators.catalog import CATALOG
from app.indicators.registry import resolve_params

EXACT = 1e-9

Formula = Callable[[int], float]


def _measure(indicator: str, **params: object) -> OutputResponse:
    spec = CATALOG[indicator]
    (only,) = filter_response(spec, resolve_params(spec, params))
    return only


def _hma_lag(n: int) -> float:
    m, s = core.hma_lengths(n)
    return (s + 2 * m - n - 2) / 3


#: (indicator, closed-form lag(n), closed-form NRF(n)) for the MAs with both in closed form.
CLOSED_FORMS: list[tuple[str, Formula, Formula]] = [
    ("sma", lambda n: (n - 1) / 2, lambda n: 1 / n),
    ("ema", lambda n: (n - 1) / 2, lambda n: 1 / n),
    ("wma", lambda n: (n - 1) / 3, lambda n: 2 * (2 * n + 1) / (3 * n * (n + 1))),
    ("smma", lambda n: n - 1, lambda n: 1 / (2 * n - 1)),
    ("lsma", lambda n: 0.0, lambda n: 2 * (2 * n - 1) / (n * (n + 1))),
]


@pytest.mark.parametrize("n", [9, 20, 50])
@pytest.mark.parametrize(("indicator", "lag", "nrf"), CLOSED_FORMS)
def test_lag_and_nrf_match_the_closed_forms(
    indicator: str, lag: Formula, nrf: Formula, n: int
) -> None:
    r = _measure(indicator, length=n)
    assert r.linear
    assert r.dc_gain == pytest.approx(1.0, abs=EXACT)
    assert r.lag == pytest.approx(lag(n), abs=EXACT)
    assert r.nrf == pytest.approx(nrf(n), abs=EXACT)
    assert r.ramp_lag == pytest.approx(lag(n), abs=1e-7)


LAG_COMPENSATED: list[tuple[str, Formula]] = [
    ("dema", lambda n: 0.0),
    ("tema", lambda n: 0.0),
    ("hma", _hma_lag),
    ("t3", lambda n: 3 * (1 - core.T3_DEFAULT_FACTOR) * (n - 1) / 2),
    ("zlema", lambda n: (n - 1) / 2 - core.zlema_lag(n)),
]


@pytest.mark.parametrize("n", [9, 20, 33])
@pytest.mark.parametrize(("indicator", "lag"), LAG_COMPENSATED)
def test_lag_compensated_lags_match_the_closed_forms(indicator: str, lag: Formula, n: int) -> None:
    r = _measure(indicator, length=n)
    assert r.linear
    assert r.lag == pytest.approx(lag(n), abs=EXACT)


#: The numeric columns of section 5.3 (3 decimals): NRF at n = 9 and n = 20, ALMA's lag too.
@pytest.mark.parametrize(
    ("indicator", "n", "lag", "nrf"),
    [
        ("dema", 9, 0.0, 0.254),
        ("dema", 20, 0.0, 0.120),
        ("tema", 9, 0.0, 0.382),
        ("tema", 20, 0.0, 0.190),
        ("hma", 9, 0.0, 0.442),
        ("hma", 20, 0.667, 0.206),
        ("alma", 9, 1.557, 0.233),
        ("alma", 20, 3.801, 0.110),
        ("t3", 9, 3.6, 0.105),
        ("t3", 20, 8.55, 0.050),
        ("zlema", 9, 0.0, 0.374),
        ("zlema", 20, 0.5, 0.169),
    ],
)
def test_numeric_table_values(indicator: str, n: int, lag: float, nrf: float) -> None:
    r = _measure(indicator, length=n)
    assert r.lag == pytest.approx(lag, abs=5e-4)
    assert r.nrf == pytest.approx(nrf, abs=5e-4)


def test_swma_is_the_fixed_1_2_2_1_kernel() -> None:
    r = _measure("swma")
    assert r.impulse is not None
    np.testing.assert_allclose(r.impulse[:4], [1 / 6, 2 / 6, 2 / 6, 1 / 6], atol=EXACT)
    assert r.lag == pytest.approx(1.5, abs=EXACT)
    assert r.nrf == pytest.approx(5 / 18, abs=EXACT)


@pytest.mark.parametrize("n", [5, 14])
def test_impulse_responses_are_the_kernels(n: int) -> None:
    k = np.arange(n)
    alpha = 2 / (n + 1)
    kernels = {
        "sma": np.full(n, 1 / n),
        "wma": 2 * (n - k) / (n * (n + 1)),
        "lsma": (4 * n - 2 - 6 * k) / (n * (n + 1)),
        "ema": alpha * (1 - alpha) ** k,
    }
    for indicator, h in kernels.items():
        impulse = _measure(indicator, length=n).impulse
        assert impulse is not None
        np.testing.assert_allclose(impulse[:n], h, atol=EXACT, err_msg=indicator)


def test_sma_step_is_a_ramp_and_its_frequency_response_is_the_dirichlet_kernel() -> None:
    n = 10
    r = _measure("sma", length=n)
    np.testing.assert_allclose(r.step[:n], (np.arange(n) + 1) / n, atol=EXACT)
    assert r.frequency is not None
    w = 2 * np.pi / r.frequency.period
    exact = np.abs(np.sin(n * w / 2) / (n * np.sin(w / 2)))
    nonzero = exact > 1e-6
    np.testing.assert_allclose(
        r.frequency.magnitude_db[nonzero], 20 * np.log10(exact[nonzero]), atol=1e-6
    )
    # A symmetric FIR has linear phase: the group delay is (n - 1) / 2 at every frequency.
    delay = r.frequency.group_delay[nonzero]
    np.testing.assert_allclose(delay, (n - 1) / 2, atol=1e-6)


def test_ema_magnitude_matches_its_transfer_function() -> None:
    n = 9
    r = _measure("ema", length=n)
    assert r.frequency is not None
    alpha = 2 / (n + 1)
    w = 2 * np.pi / r.frequency.period
    exact = np.abs(alpha / (1 - (1 - alpha) * np.exp(-1j * w)))
    np.testing.assert_allclose(r.frequency.magnitude_db, 20 * np.log10(exact), atol=1e-9)


def test_plot_offset_adds_to_the_lag() -> None:
    assert _measure("sma", length=9, offset=3).lag == pytest.approx(4 + 3, abs=EXACT)


@pytest.mark.parametrize(
    ("indicator", "reason"), [("vwma", VOLUME), ("kama", ADAPTIVE), ("mcginley", ADAPTIVE)]
)
def test_nonlinear_mas_get_step_and_ramp_only(indicator: str, reason: str) -> None:
    r = _measure(indicator)
    assert not r.linear
    assert r.reason == reason
    assert r.impulse is None
    assert r.frequency is None
    assert r.lag is None
    assert r.nrf is None
    assert r.step[-1] == pytest.approx(1.0, abs=1e-3)


def test_kama_follows_a_trend_like_an_ema_of_the_squared_fast_constant() -> None:
    # On a straight line ER = 1, so c = f^2 with f = 2 / (F + 1): lag (1 - c) / c.
    c = (2 / (core.KAMA_FAST + 1)) ** 2
    assert _measure("kama").ramp_lag == pytest.approx((1 - c) / c, abs=1e-6)


def test_composites_measure_every_line_output() -> None:
    spec = CATALOG["envelope"]
    gains = {r.name: r.dc_gain for r in filter_response(spec, resolve_params(spec, {}))}
    assert gains == pytest.approx({"upper": 1.1, "basis": 1.0, "lower": 0.9}, abs=EXACT)
    cross = filter_response(CATALOG["ma_cross"], resolve_params(CATALOG["ma_cross"], {}))
    assert [r.name for r in cross] == ["fast", "slow"]  # markers have no response


def test_a_long_iir_reports_a_truncated_impulse() -> None:
    assert _measure("smma", length=4000).truncated
    assert not _measure("smma", length=20).truncated
    ramp_lag = _measure("smma", length=4000).ramp_lag
    assert ramp_lag is not None
    assert math.isfinite(ramp_lag)


@pytest.mark.parametrize("indicator", ["sma", "hma", "alma"])
def test_a_long_fir_is_not_reported_truncated(indicator: str) -> None:
    # The tap budget is the IIR rule (25 n), but an FIR kernel ends after n taps: nothing is cut.
    r = _measure(indicator, length=1500)
    assert not r.truncated
    if indicator == "sma":
        assert r.lag == pytest.approx(749.5, abs=EXACT)


def test_scaled_nonlinear_outputs_are_normalised_by_their_gain() -> None:
    # Envelope bands are 1.1 and 0.9 x an adaptive KAMA basis: same unit step and lag as the basis.
    spec = CATALOG["envelope"]
    outs = {r.name: r for r in filter_response(spec, resolve_params(spec, {"ma_type": "kama"}))}
    basis = outs["basis"]
    assert basis.reason == ADAPTIVE
    for band in ("upper", "lower"):
        assert outs[band].ramp_lag == pytest.approx(basis.ramp_lag, abs=1e-6)
        np.testing.assert_allclose(outs[band].step, basis.step, rtol=0, atol=1e-9)


@pytest.mark.parametrize("indicator", sorted(CATALOG))
def test_every_indicator_gives_a_finite_response_or_none(indicator: str) -> None:
    """Outputs that do not follow the price (oscillators, volume lines, VWAP without sessions)
    are left out; everything returned is finite (JSON has no NaN), and OBV's whole-history
    lookback does not size the impulse (it is capped at MAX_TAPS)."""
    spec = CATALOG[indicator]
    for r in filter_response(spec, resolve_params(spec, {})):
        assert np.isfinite(r.step).all()
        assert r.ramp_lag is None or math.isfinite(r.ramp_lag)
        if r.impulse is not None:
            assert len(r.impulse) <= MAX_TAPS
            assert np.isfinite(r.impulse).all()
            assert r.frequency is not None


@pytest.mark.parametrize(
    ("indicator", "names"),
    [
        ("bb", ["basis", "upper", "lower"]),
        ("rsi", []),
        ("macd", ["hist", "macd", "signal"]),
        ("stoch", []),
        ("atr", []),
        ("obv", []),
        ("vwap", []),
        ("vol_sma", []),
    ],
)
def test_only_price_following_and_band_pass_outputs_are_measured(
    indicator: str, names: list[str]
) -> None:
    spec = CATALOG[indicator]
    assert [r.name for r in filter_response(spec, resolve_params(spec, {}))] == names


def test_macd_is_a_band_pass_filter() -> None:
    """MACD = EMA12 - EMA26: H = a1/(1 - p1 z^-1) - a2/(1 - p2 z^-1), zero DC gain, no lag; the
    signal is H * EMA9 and the histogram H * (1 - EMA9). Golden: the closed form on the same
    periods."""
    spec = CATALOG["macd"]
    out = {r.name: r for r in filter_response(spec, resolve_params(spec, {}))}
    frequency = out["macd"].frequency
    assert frequency is not None
    z: npt.NDArray[np.complex128] = np.exp(-2j * np.pi / frequency.period).astype(np.complex128)

    def ema(n: int) -> npt.NDArray[np.complex128]:
        a = 2.0 / (n + 1)
        return (a / (1 - (1 - a) * z)).astype(np.complex128)

    golden = {"macd": ema(12) - ema(26)}
    golden["signal"] = golden["macd"] * ema(9)
    golden["hist"] = golden["macd"] * (1 - ema(9))
    for name, h in golden.items():
        r = out[name]
        assert r.linear
        assert r.lag is None
        assert r.ramp_lag is None
        assert r.dc_gain == pytest.approx(0.0, abs=1e-12)
        # A step passes, then dies out (the plot stops within 1e-4 of the peak of the curve).
        assert abs(r.step[-1]) <= 1e-4 * np.abs(r.step).max() * 1.0001
        assert r.frequency is not None
        expected = np.maximum(20 * np.log10(np.abs(h)), -120.0)
        np.testing.assert_allclose(r.frequency.magnitude_db, expected, atol=1e-6)
    # The band-pass peak: about a 55-bar cycle for MACD 12/26.
    f = out["macd"].frequency
    assert f is not None
    assert 50 < f.period[int(np.argmax(f.magnitude_db))] < 60


def test_bollinger_bands_are_not_linear_but_the_basis_is() -> None:
    spec = CATALOG["bb"]
    out = {r.name: r for r in filter_response(spec, resolve_params(spec, {}))}
    assert out["basis"].linear
    assert out["basis"].lag == pytest.approx(9.5, abs=EXACT)
    assert out["upper"].reason == ADAPTIVE
