"""TA-Lib vs ``app.indicators`` for the R3c set (second, independent reference).

Where TA-Lib follows the same conventions the comparison covers every bar (BBANDS with an SMA
basis and population sigma, RSI, STOCH/STOCHF, TRANGE from bar 1). Elsewhere it is restricted
to the documented region (docs/TRADINGVIEW_RESEARCH.md section 5):

* RSI: TA-Lib returns 0 where both averages are 0 (a flat history), Pine 100: those bars are
  excluded.
* STOCH/STOCHF: TA-Lib returns 0 for a flat range (HH = LL), Pine ``na``, and starts %K together
  with %D: compared from the %D warm-up on, where ours has a value.
* MACD: TA-Lib seeds the fast EMA later (aligned with the slow one) and ATR skips bar 0; both are
  compared after ``CONVERGED`` bars, when the seed weight is below 1e-40.
* OBV: TA-Lib starts at ``V_0`` instead of 0, a constant offset.
"""

from __future__ import annotations

import numpy as np
import pytest

from app.indicators.catalog import CATALOG
from app.models.bars import BarFrame, FloatArray
from tests.golden.harness import compare, golden_frames
from tests.golden.talib_ref import load_talib

talib, reason = load_talib()
pytestmark = pytest.mark.skipif(talib is None, reason=reason)

FRAMES = golden_frames()
DATA = sorted(FRAMES)
#: Bars after which every seed has faded (RMA 14: e^{-650/14}; EMA 12: (11/13)^650).
CONVERGED = 650


def _hlc(frame: BarFrame) -> tuple[FloatArray, FloatArray, FloatArray]:
    return (
        np.ascontiguousarray(frame.high),
        np.ascontiguousarray(frame.low),
        np.ascontiguousarray(frame.close),
    )


@pytest.mark.parametrize(("length", "mult"), [(20, 2.0), (5, 1.0), (50, 3.0)])
@pytest.mark.parametrize("data", DATA)
def test_bb_matches_talib(length: int, mult: float, data: str) -> None:
    assert talib is not None
    frame = FRAMES[data]
    out = CATALOG["bb"].run(frame, {"length": length, "mult": mult})
    upper, middle, lower = talib.BBANDS(np.ascontiguousarray(frame.close), length, mult, mult, 0)
    compare(out["basis"], middle.tolist())
    # TA-Lib's variance is E[x^2] - E[x]^2 from running sums: ~1e-11 absolute error in sigma.
    np.testing.assert_allclose(out["upper"], upper, rtol=1e-9, equal_nan=True)
    np.testing.assert_allclose(out["lower"], lower, rtol=1e-9, equal_nan=True)


@pytest.mark.parametrize("length", [2, 14, 50])
@pytest.mark.parametrize("data", DATA)
def test_rsi_matches_talib_except_flat_history(length: int, data: str) -> None:
    assert talib is not None
    frame = FRAMES[data]
    ours = CATALOG["rsi"].run(frame, {"length": length})["rsi"]
    theirs = talib.RSI(np.ascontiguousarray(frame.close), length)
    flat = (ours == 100.0) & (theirs == 0.0)
    compare(ours[~flat], theirs[~flat].tolist())


@pytest.mark.parametrize(("fast", "slow", "signal"), [(12, 26, 9), (5, 35, 5)])
@pytest.mark.parametrize("data", DATA)
def test_macd_matches_talib_after_convergence(fast: int, slow: int, signal: int, data: str) -> None:
    assert talib is not None
    frame = FRAMES[data]
    params = {"fast_length": fast, "slow_length": slow, "signal_length": signal}
    out = CATALOG["macd"].run(frame, params)
    macd, sig, hist = talib.MACD(np.ascontiguousarray(frame.close), fast, slow, signal)
    for name, theirs in (("macd", macd), ("signal", sig), ("hist", hist)):
        compare(out[name][CONVERGED:], theirs[CONVERGED:].tolist())


@pytest.mark.parametrize(("n", "sk", "sd"), [(14, 1, 3), (14, 3, 3), (5, 2, 4)])
@pytest.mark.parametrize("data", DATA)
def test_stoch_matches_talib_where_the_range_is_not_flat(
    n: int, sk: int, sd: int, data: str
) -> None:
    assert talib is not None
    frame = FRAMES[data]
    out = CATALOG["stoch"].run(frame, {"k_length": n, "k_smoothing": sk, "d_smoothing": sd})
    if sk == 1:
        k, d = talib.STOCHF(*_hlc(frame), n, sd, 0)
    else:
        k, d = talib.STOCH(*_hlc(frame), n, sk, 0, sd, 0)
    start = CATALOG["stoch"].warmup({"k_length": n, "k_smoothing": sk, "d_smoothing": sd})
    for ours, theirs in ((out["k"][start:], k[start:]), (out["d"][start:], d[start:])):
        assert not (np.isnan(theirs) & ~np.isnan(ours)).any()
        ok = ~np.isnan(ours)
        assert ok.sum() > len(ours) // 2
        compare(ours[ok], theirs[ok].tolist())


@pytest.mark.parametrize("data", DATA)
def test_true_range_matches_talib_from_bar_one(data: str) -> None:
    assert talib is not None
    frame = FRAMES[data]
    ours = CATALOG["atr"].run(frame, {"length": 1, "ma_type": "sma"})["atr"]
    compare(ours[1:], talib.TRANGE(*_hlc(frame))[1:].tolist())


@pytest.mark.parametrize("length", [5, 14])
@pytest.mark.parametrize("data", DATA)
def test_atr_matches_talib_after_convergence(length: int, data: str) -> None:
    assert talib is not None
    frame = FRAMES[data]
    ours = CATALOG["atr"].run(frame, {"length": length})["atr"]
    compare(ours[CONVERGED:], talib.ATR(*_hlc(frame), length)[CONVERGED:].tolist())


@pytest.mark.parametrize("data", DATA)
def test_obv_matches_talib_up_to_its_start_offset(data: str) -> None:
    assert talib is not None
    frame = FRAMES[data]
    ours = CATALOG["obv"].run(frame)["obv"]
    theirs = talib.OBV(np.ascontiguousarray(frame.close), np.ascontiguousarray(frame.volume))
    scale = max(float(np.abs(theirs).max()), 1.0)
    np.testing.assert_allclose(ours + frame.volume[0], theirs, rtol=0, atol=1e-12 * scale)
    np.testing.assert_allclose(np.diff(ours), np.diff(theirs), rtol=0, atol=1e-12 * scale)
