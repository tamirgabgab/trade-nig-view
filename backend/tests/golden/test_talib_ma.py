"""TA-Lib vs ``app.indicators`` (second, independent reference).

Compared on the whole valid region: TA-Lib's SMA and WMA are exact windows, and its EMA uses the
same SMA seed (``compatibility = default``), so no convergence offset is needed. SMMA has no TA-Lib
equivalent with the same seed and is covered by the golden model only.
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


def _reference(indicator: str) -> Callable[[FloatArray, int], FloatArray]:
    assert talib is not None
    return {"sma": talib.SMA, "ema": talib.EMA, "wma": talib.WMA}[indicator]


@pytest.mark.parametrize("indicator", ["sma", "ema", "wma"])
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
