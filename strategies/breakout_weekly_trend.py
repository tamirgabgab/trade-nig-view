"""Example Python strategy: a breakout of the last N bars in the direction of the weekly trend.

Long when the close breaks above the highest high of the previous ``length`` bars while the close
is above the weekly SMA (last closed week); out when it falls below the lowest low of the previous
``length // 2`` bars. Short in the mirror case. See README.md in this folder for the contract.
"""

from collections.abc import Callable
from typing import TYPE_CHECKING, Any

import numpy as np
import numpy.typing as npt

if TYPE_CHECKING:
    from app.models.bars import BarFrame

Array = npt.NDArray[Any]

SPEC = {
    "description": "Breakout of the last N bars in the direction of the weekly SMA (Position).",
    "params": {
        "length": {"type": "int", "default": 55, "min": 4, "max": 400, "label": "Breakout bars"},
        "trend": {"type": "int", "default": 30, "min": 2, "max": 200, "label": "Weekly SMA"},
    },
}


def _prior(x: Array, n: int, how: Callable[..., Array]) -> Array:
    """Max or min of the ``n`` bars before each bar (NaN for the first ``n``): causal."""
    out = np.full(len(x), np.nan)
    if len(x) > n:
        windows = np.lib.stride_tricks.sliding_window_view(x, n)[:-1]
        out[n:] = how(windows, axis=1)
    return out


def signals(
    bars: "BarFrame", params: dict[str, Any], ind: Callable[..., dict[str, Array]]
) -> dict[str, Array]:
    n = params["length"]
    weekly = ind("sma", interval="1W", length=params["trend"])["ma"]
    up, down = bars.close > weekly, bars.close < weekly
    return {
        "long_entry": (bars.close > _prior(bars.high, n, np.max)) & up,
        "long_exit": bars.close < _prior(bars.low, max(n // 2, 1), np.min),
        "short_entry": (bars.close < _prior(bars.low, n, np.min)) & down,
        "short_exit": bars.close > _prior(bars.high, max(n // 2, 1), np.max),
    }
