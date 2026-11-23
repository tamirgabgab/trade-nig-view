r"""Kaufman Adaptive Moving Average (Perry Kaufman, 1995).

.. math::
   ER_t = \frac{|x_t - x_{t-n}|}{\sum_{i=0}^{n-1} |x_{t-i} - x_{t-i-1}|},\quad
   c_t = \left(ER_t\,(f - s) + s\right)^2,\quad
   K_t = K_{t-1} + c_t\,(x_t - K_{t-1})

with :math:`f = \frac{2}{F+1}`, :math:`s = \frac{2}{S+1}`. Because :math:`c` is squared, a trending
market (ER near 1) makes it an EMA with :math:`\alpha = f^2` and a choppy one (ER near 0) one with
:math:`\alpha = s^2`: EMA lengths :math:`2/\alpha - 1` = 3.5 and 479.5 at the defaults, not F and S.
Seed :math:`K_{n-1} = x_{n-1}`,
first value at bar :math:`n` (identical to TA-Lib). Not a TradingView built-in (decision D4).
Defaults (Kaufman): 10, 2, 30; ``fast > slow`` is rejected.
"""

from __future__ import annotations

from app.indicators import core
from app.indicators.ma import kama_lookback, length_param, ma_warmup, source_param
from app.indicators.registry import (
    MIN_LOOKBACK,
    IndicatorSpec,
    InvalidParamsError,
    OutputSpec,
    Params,
    ParamSpec,
)
from app.models.bars import BarFrame, FloatArray


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    fast, slow = int(params["fast"]), int(params["slow"])
    if fast > slow:
        raise InvalidParamsError(f"'fast' ({fast}) must not be longer than 'slow' ({slow})")
    x = core.source(frame, str(params["source"]))
    return {"ma": core.kama(x, int(params["length"]), fast, slow)}


def lookback(params: Params) -> int:
    """The slow end of the smoothing range sets how fast the seed fades."""
    return max(kama_lookback(int(params["length"]), int(params["slow"])), MIN_LOOKBACK)


SPEC = IndicatorSpec(
    id="kama",
    version=1,
    name="Kaufman Adaptive Moving Average",
    short_name="KAMA",
    category="moving_averages",
    overlay=True,
    inputs=("open", "high", "low", "close"),
    params=(
        length_param(10, label="Efficiency length"),
        ParamSpec("fast", "int", core.KAMA_FAST, "Fast EMA length", min=1, max=200, step=1),
        ParamSpec("slow", "int", core.KAMA_SLOW, "Slow EMA length", min=1, max=200, step=1),
        source_param(),
    ),
    outputs=(OutputSpec("ma", "KAMA", "line", "#EF5350"),),
    warmup=lambda p: ma_warmup("kama", int(p["length"])),
    compute=compute,
    learn_slug="kama",
    description="Speeds up in trends and slows down in noise, using Kaufman's efficiency ratio.",
    lookback=lookback,
)
