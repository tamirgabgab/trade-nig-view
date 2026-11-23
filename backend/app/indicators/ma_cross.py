r"""Moving Average Cross: a fast and a slow average and their crossings.

.. math::
   \text{cross}_t = \begin{cases}
   +1 & F_t > S_t \text{ and } F_{t-1} \le S_{t-1} \\
   -1 & F_t < S_t \text{ and } F_{t-1} \ge S_{t-1} \\
   \text{NaN} & \text{otherwise}
   \end{cases}

Both averages must be valid at :math:`t-1` and :math:`t`, so a crossing is known at the close of
bar :math:`t` (no lookahead). Each average can be any type in ``MA_TYPES``.
TradingView's "MA Cross" defaults: SMA 9 and SMA 21, source close.
"""

from __future__ import annotations

import numpy as np

from app.indicators import core
from app.indicators.ma import (
    MA_TYPES,
    apply_ma,
    length_param,
    ma_lookback,
    source_param,
    type_param,
)
from app.indicators.registry import IndicatorSpec, OutputSpec, Params
from app.models.bars import BarFrame, FloatArray


def crossings(fast: FloatArray, slow: FloatArray) -> FloatArray:
    """+1 where ``fast`` crosses above ``slow``, -1 where it crosses below, NaN elsewhere."""
    diff = fast - slow
    previous = core.lagged(diff, 1)
    out = core.nan_like(diff)
    with np.errstate(invalid="ignore"):
        out[(diff > 0) & (previous <= 0)] = 1.0
        out[(diff < 0) & (previous >= 0)] = -1.0
    return out


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    x = core.source(frame, str(params["source"]))
    fast = apply_ma(str(params["fast_type"]), x, int(params["fast_length"]), frame.volume)
    slow = apply_ma(str(params["slow_type"]), x, int(params["slow_length"]), frame.volume)
    return {"fast": fast, "slow": slow, "crosses": crossings(fast, slow)}


def warmup(params: Params) -> int:
    return max(
        MA_TYPES[str(params["fast_type"])].warmup(int(params["fast_length"])),
        MA_TYPES[str(params["slow_type"])].warmup(int(params["slow_length"])),
    )


def lookback(params: Params) -> int:
    return max(
        ma_lookback(str(params["fast_type"]), int(params["fast_length"])),
        ma_lookback(str(params["slow_type"]), int(params["slow_length"])),
    )


SPEC = IndicatorSpec(
    id="ma_cross",
    version=1,
    name="Moving Average Cross",
    short_name="MA Cross",
    category="moving_averages",
    overlay=True,
    inputs=("open", "high", "low", "close", "volume"),
    params=(
        type_param("sma", "fast_type", "Fast MA type"),
        length_param(9, "fast_length", "Fast length"),
        type_param("sma", "slow_type", "Slow MA type"),
        length_param(21, "slow_length", "Slow length"),
        source_param(),
    ),
    outputs=(
        OutputSpec("fast", "Fast", "line", "#FF6D00"),
        OutputSpec("slow", "Slow", "line", "#2962FF"),
        OutputSpec(
            "crosses",
            "Crosses",
            "markers",
            "#089981",
            style={"up": "#089981", "down": "#F23645"},
        ),
    ),
    warmup=warmup,
    compute=compute,
    learn_slug="ma-cross",
    description="Fast and slow averages with arrows where they cross (golden / death cross).",
    lookback=lookback,
)
