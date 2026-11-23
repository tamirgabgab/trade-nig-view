r"""Tillson T3 Moving Average (Tim Tillson, 1998).

.. math:: GD(x) = (1+v)\,E(x) - v\,E(E(x)), \qquad T3 = GD(GD(GD(x)))

Expanded over six cascaded EMAs :math:`e_1..e_6`:
:math:`T3 = c_1 e_6 + c_2 e_5 + c_3 e_4 + c_4 e_3` with :math:`c_1 = -v^3`,
:math:`c_2 = 3v^2 + 3v^3`, :math:`c_3 = -6v^2 - 3v - 3v^3`, :math:`c_4 = 1 + 3v + v^3 + 3v^2`.
Lag :math:`3(1-v)\frac{n-1}{2}`. Warm-up :math:`6(n-1)` (identical to TA-Lib). Not a TradingView
built-in (decision D4). Defaults (Tillson): length 5, volume factor 0.7.
"""

from __future__ import annotations

from app.indicators import core
from app.indicators.ma import (
    length_param,
    ma_lookback,
    ma_warmup,
    offset_param,
    offset_shift,
    source_param,
)
from app.indicators.registry import IndicatorSpec, OutputSpec, Params, ParamSpec
from app.models.bars import BarFrame, FloatArray


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    x = core.source(frame, str(params["source"]))
    y = core.t3(x, int(params["length"]), float(params["factor"]))
    return {"ma": core.shift(y, int(params["offset"]))}


SPEC = IndicatorSpec(
    id="t3",
    version=1,
    name="Tillson T3",
    short_name="T3",
    category="moving_averages",
    overlay=True,
    inputs=("open", "high", "low", "close"),
    params=(
        length_param(5),
        ParamSpec(
            "factor", "float", core.T3_DEFAULT_FACTOR, "Volume factor", min=0.0, max=1.0, step=0.05
        ),
        source_param(),
        offset_param(),
    ),
    outputs=(OutputSpec("ma", "T3", "line", "#5C6BC0"),),
    warmup=lambda p: ma_warmup("t3", int(p["length"])) + offset_shift(p),
    compute=compute,
    learn_slug="t3",
    description="Six cascaded EMAs combined for a smooth line with reduced lag.",
    lookback=lambda p: ma_lookback("t3", int(p["length"])),
    shift=offset_shift,
)
