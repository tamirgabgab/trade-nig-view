"""TA-Lib vs ``app.indicators`` (second, independent reference).

Compared on every bar (same NaN positions): TA-Lib's SMA, WMA and LINEARREG are exact windows;
its EMA, DEMA, TEMA and T3 use the same SMA seeds (``compatibility = default``) and its KAMA the
same ``x[n-1]`` seed, so no convergence offset is needed. SMMA, HMA, ALMA, SWMA, VWMA, McGinley
and ZLEMA have no TA-Lib equivalent and are covered by the golden models only.
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np
import pytest

from app.indicators.catalog import CATALOG
from app.models.bars import FloatArray
from tests.golden.conftest import Row
from tests.golden.harness import compare, golden_frames
from tests.golden.talib_ref import load_talib

talib, reason = load_talib()
pytestmark = pytest.mark.skipif(talib is None, reason=reason)

FRAMES = golden_frames()
TALIB_IDS = ("sma", "ema", "wma", "dema", "tema", "kama", "lsma", "t3")


def _reference(indicator: str) -> Callable[[FloatArray, int], FloatArray]:
    assert talib is not None
    lib = talib

    def t3(x: FloatArray, n: int) -> FloatArray:
        return lib.T3(x, n, 0.7)

    return {
        "sma": lib.SMA,
        "ema": lib.EMA,
        "wma": lib.WMA,
        "dema": lib.DEMA,
        "tema": lib.TEMA,
        "kama": lib.KAMA,
        "lsma": lib.LINEARREG,
        "t3": t3,
    }[indicator]


@pytest.mark.parametrize("indicator", TALIB_IDS)
@pytest.mark.parametrize("length", [2, 9, 20, 50, 200])
@pytest.mark.parametrize("data", sorted(FRAMES))
def test_ma_matches_talib(indicator: str, length: int, data: str, scoreboard: list[Row]) -> None:
    close = FRAMES[data].close
    actual = CATALOG[indicator].run(FRAMES[data], {"length": length})["ma"]
    expected = _reference(indicator)(np.ascontiguousarray(close), length)
    stats = compare(actual, expected.tolist())
    scoreboard.append(
        {
            "check": "talib",
            "indicator": indicator,
            "params": f"length={length}",
            "data": data,
            "bars_compared": stats.compared,
            "max_abs_err": stats.max_abs,
            "max_rel_err": stats.max_rel,
        }
    )


@pytest.mark.parametrize("factor", [0.0, 0.35, 0.7, 1.0])
def test_t3_factor_matches_talib(factor: float) -> None:
    assert talib is not None
    frame = FRAMES["data/SPY"]
    actual = CATALOG["t3"].run(frame, {"length": 7, "factor": factor})["ma"]
    compare(actual, talib.T3(np.ascontiguousarray(frame.close), 7, factor).tolist())
