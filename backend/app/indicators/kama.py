r"""Kaufman Adaptive Moving Average (Perry Kaufman, 1995).

.. math::
   ER_t = \frac{|x_t - x_{t-n}|}{\sum_{i=0}^{n-1} |x_{t-i} - x_{t-i-1}|},\quad
   c_t = \left(ER_t\,(f - s) + s\right)^2,\quad
   K_t = K_{t-1} + c_t\,(x_t - K_{t-1})

with :math:`f = \frac{2}{F+1}`, :math:`s = \frac{2}{S+1}`. A trending market (ER near 1) makes it
an EMA of length F; a choppy one (ER near 0) an EMA of length S. Seed :math:`K_{n-1} = x_{n-1}`,
first value at bar :math:`n` (identical to TA-Lib). Not a TradingView built-in (decision D4).
Defaults (Kaufman): 10, 2, 30; ``fast > slow`` is rejected.
"""

from __future__ import annotations

from app.indicators import core
from app.indicators.ma import KAMA_FAST, KAMA_SLOW, kama_lookback, length_param, source_param
from app.indicators.registry import (
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
    """The smoothing ranges over [f^2, s^2]; the slower end (the longer of the two EMA lengths)
    sets how fast the seed fades."""
    return kama_lookback(int(params["length"]), max(int(params["fast"]), int(params["slow"])))


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
        ParamSpec("fast", "int", KAMA_FAST, "Fast EMA length", min=1, max=200, step=1),
        ParamSpec("slow", "int", KAMA_SLOW, "Slow EMA length", min=1, max=200, step=1),
        source_param(),
    ),
    outputs=(OutputSpec("ma", "KAMA", "line", "#EF5350"),),
    warmup=lambda p: int(p["length"]),
    compute=compute,
    learn_slug="kama",
    description="Speeds up in trends and slows down in noise, using Kaufman's efficiency ratio.",
    lookback=lookback,
)
