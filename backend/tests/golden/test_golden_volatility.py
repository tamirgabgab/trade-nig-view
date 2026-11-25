"""Golden models vs ``app.indicators`` for the volatility set (V1: ``hv``, ``hv_percentile``):
every bar of every golden data set, ``rtol=1e-9, atol=1e-12``; TA-Lib for the close estimator."""

from __future__ import annotations

import numpy as np
import pytest

from app.indicators import hv
from app.indicators.catalog import CATALOG
from app.models.bars import BarFrame
from tests.golden.conftest import Row
from tests.golden.harness import Comparison, compare, golden_frames
from tests.golden.models import (
    golden_bars_per_year,
    golden_hv,
    golden_percentrank,
    golden_var_bands,
    golden_variance,
)
from tests.golden.talib_ref import load_talib

FRAMES = golden_frames()
DATA = sorted(FRAMES)
ESTIMATORS = sorted(hv.ESTIMATORS)
talib, reason = load_talib()


def _ohlc(frame: BarFrame) -> tuple[list[float], list[float], list[float], list[float]]:
    return frame.open.tolist(), frame.high.tolist(), frame.low.tolist(), frame.close.tolist()


def _record(
    scoreboard: list[Row], indicator: str, params: str, data: str, stats: Comparison
) -> None:
    scoreboard.append(
        {
            "check": "golden",
            "indicator": indicator,
            "params": params,
            "data": data,
            "bars_compared": stats.compared,
            "max_abs_err": stats.max_abs,
            "max_rel_err": stats.max_rel,
        }
    )


@pytest.mark.parametrize("data", DATA)
def test_bars_per_year_matches_golden_model(data: str) -> None:
    times = FRAMES[data].time
    compare(hv.bars_per_year(times), golden_bars_per_year(times.tolist()))


@pytest.mark.parametrize("annualize", [True, False])
@pytest.mark.parametrize("estimator", ESTIMATORS)
@pytest.mark.parametrize("data", DATA)
def test_hv_matches_golden_model(
    data: str, estimator: str, annualize: bool, scoreboard: list[Row]
) -> None:
    frame = FRAMES[data]
    params = {"estimator": estimator, "length": 21, "annualize": annualize}
    out = CATALOG["hv"].run(frame, params)["hv"]
    want = golden_hv(*_ohlc(frame), frame.time.tolist(), estimator, 21, annualize)
    _record(scoreboard, "hv", f"{estimator} 21 {annualize}", data, compare(out, want))


@pytest.mark.parametrize("length", [2, 3, 63])
@pytest.mark.parametrize("estimator", ESTIMATORS)
def test_hv_lengths_match_golden_model(estimator: str, length: int) -> None:
    frame = FRAMES[DATA[0]]
    out = hv.rolling_variance(frame, estimator, length)
    compare(out, golden_variance(*_ohlc(frame), estimator, length))


@pytest.mark.parametrize("estimator", ["yang_zhang", "close"])
@pytest.mark.parametrize("data", DATA)
def test_hv_percentile_matches_golden_model(
    data: str, estimator: str, scoreboard: list[Row]
) -> None:
    """End to end against the scalar models (variance, then rank). Prices on a 0.01 grid repeat
    windows, so two variances can tie up to rounding and ``<=`` may flip on a 1e-17 difference
    between two correct implementations: a mismatch is allowed only on such a tie."""
    frame = FRAMES[data]
    out = CATALOG["hv_percentile"].run(frame, {"estimator": estimator})["rank"]
    variance = golden_variance(*_ohlc(frame), estimator, 21)
    want = np.asarray(golden_percentrank(variance, 252))
    np.testing.assert_array_equal(np.isnan(out), np.isnan(want))
    v = np.asarray(variance)
    for t in np.flatnonzero(~np.isnan(want) & (out != want)):
        window = v[t - 252 : t]
        assert np.isclose(window, v[t], rtol=1e-12, atol=0).any(), f"bar {t}: no tie"
        ties = np.isclose(window, v[t], rtol=1e-12).sum()
        assert abs(out[t] - want[t]) <= 100 * ties / 252 + 1e-9  # one step per tied value
    exact = ~np.isnan(want) & (out == want)
    assert exact.sum() >= 0.99 * (~np.isnan(want)).sum()
    _record(
        scoreboard,
        "hv_percentile",
        f"{estimator} 21, 252",
        data,
        compare(out[exact], want[exact].tolist()),
    )


@pytest.mark.skipif(talib is None, reason=reason)
@pytest.mark.parametrize("length", [5, 21])
@pytest.mark.parametrize("data", DATA)
def test_close_estimator_matches_talib_stddev(data: str, length: int) -> None:
    """Per bar, the close estimator is TA-Lib's STDDEV (population) of the log returns."""
    assert talib is not None
    frame = FRAMES[data]
    ours = CATALOG["hv"].run(frame, {"estimator": "close", "length": length, "annualize": False})
    returns = np.ascontiguousarray(hv.returns(frame))
    theirs = 100 * talib.STDDEV(returns, length, 1.0)
    compare(ours["hv"][length:], theirs[length:].tolist())


@pytest.mark.parametrize("level", ["90", "99"])
@pytest.mark.parametrize("data", DATA)
def test_var_bands_match_golden_model(data: str, level: str, scoreboard: list[Row]) -> None:
    frame = FRAMES[data]
    out = CATALOG["var_bands"].run(frame, {"level": level, "window": 250})
    want = golden_var_bands(*_ohlc(frame), float(level) / 100, 250, 21)
    compare(out["upper"], want["upper"])
    compare(out["breaches"], want["breaches"])
    _record(scoreboard, "var_bands", f"{level} 250, 21", data, compare(out["lower"], want["lower"]))
