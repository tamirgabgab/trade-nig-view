r"""Envelope: a moving average and two bands a fixed percentage above and below it.

.. math:: B_t = \mathrm{MA}^{\text{type}}_n(x)_t, \quad U_t = B_t\,(1 + p/100), \quad
   L_t = B_t\,(1 - p/100)

TradingView defaults: length 20, percent 10, source close, simple MA ("Exponential" off); here
any MA type can be the basis.
"""

from __future__ import annotations

from app.indicators import core
from app.indicators.ma import (
    apply_ma,
    length_param,
    ma_lookback,
    ma_warmup,
    source_param,
    type_param,
)
from app.indicators.registry import IndicatorSpec, OutputSpec, Params, ParamSpec
from app.models.bars import BarFrame, FloatArray


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    x = core.source(frame, str(params["source"]))
    basis = apply_ma(str(params["ma_type"]), x, int(params["length"]), frame.volume)
    width = float(params["percent"]) / 100.0
    return {"upper": basis * (1.0 + width), "basis": basis, "lower": basis * (1.0 - width)}


SPEC = IndicatorSpec(
    id="envelope",
    version=1,
    name="Envelope",
    short_name="Env",
    category="bands",
    overlay=True,
    inputs=("open", "high", "low", "close", "volume"),
    params=(
        length_param(20),
        ParamSpec("percent", "float", 10.0, "Percent", min=0.0, max=100.0, step=0.1),
        source_param(),
        type_param("sma", label="Basis MA type"),
    ),
    outputs=(
        OutputSpec("upper", "Upper", "line", "#2962FF", line_width=1),
        OutputSpec("basis", "Basis", "line", "#FF6D00", line_width=1),
        OutputSpec("lower", "Lower", "line", "#2962FF", line_width=1),
    ),
    warmup=lambda p: ma_warmup(str(p["ma_type"]), int(p["length"])),
    compute=compute,
    learn_slug="envelope",
    description="An average with bands a fixed percentage above and below it.",
    lookback=lambda p: ma_lookback(str(p["ma_type"]), int(p["length"])),
)
