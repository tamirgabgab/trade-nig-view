r"""Bollinger Bands: a moving average and bands a multiple of the standard deviation away.

.. math:: B_t = \mathrm{MA}^{\text{type}}_n(x)_t, \quad
   \sigma_t = \sqrt{\frac1n\sum_{k=0}^{n-1}\left(x_{t-k} - \mathrm{SMA}_n(x)_t\right)^2}, \quad
   U_t = B_t + k\,\sigma_t, \quad L_t = B_t - k\,\sigma_t

:math:`\sigma` is the **population** deviation about the window's SMA (Pine ``ta.stdev``,
``biased = true``), whatever the basis type, as in TradingView's script. All three lines are moved
right by the plot ``offset``. TradingView defaults: length 20, SMA basis, StdDev 2, close, offset 0.
Warm-up: the later of the basis warm-up and :math:`n - 1` (the deviation), plus the offset.
"""

from __future__ import annotations

from app.indicators import core
from app.indicators.ma import (
    apply_ma,
    length_param,
    ma_lookback,
    ma_warmup,
    offset_param,
    offset_shift,
    source_param,
    type_param,
)
from app.indicators.registry import IndicatorSpec, OutputSpec, Params, ParamSpec
from app.models.bars import BarFrame, FloatArray


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    x = core.source(frame, str(params["source"]))
    n = int(params["length"])
    basis = apply_ma(str(params["ma_type"]), x, n, frame.volume)
    dev = float(params["mult"]) * core.stdev(x, n)
    offset = int(params["offset"])
    return {
        "basis": core.shift(basis, offset),
        "upper": core.shift(basis + dev, offset),
        "lower": core.shift(basis - dev, offset),
    }


def warmup(params: Params) -> int:
    n = int(params["length"])
    return max(ma_warmup(str(params["ma_type"]), n), n - 1) + offset_shift(params)


SPEC = IndicatorSpec(
    id="bb",
    version=1,
    name="Bollinger Bands",
    short_name="BB",
    category="bands",
    overlay=True,
    inputs=("open", "high", "low", "close", "volume"),
    params=(
        length_param(20),
        type_param("sma", label="Basis MA type"),
        source_param(),
        ParamSpec("mult", "float", 2.0, "StdDev", min=0.001, max=50.0, step=0.1),
        offset_param(),
    ),
    outputs=(
        OutputSpec("basis", "Basis", "line", "#FF6D00", line_width=1),
        OutputSpec(
            "upper",
            "Upper",
            "line",
            "#2962FF",
            line_width=1,
            style={"fill_to": "lower", "fill": "rgba(33, 150, 243, 0.08)"},
        ),
        OutputSpec("lower", "Lower", "line", "#2962FF", line_width=1),
    ),
    warmup=warmup,
    compute=compute,
    learn_slug="bollinger-bands",
    description="An average with bands k standard deviations away: they widen with volatility.",
    lookback=lambda p: ma_lookback(str(p["ma_type"]), int(p["length"])),
    shift=offset_shift,
)
