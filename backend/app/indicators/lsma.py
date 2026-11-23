r"""Least Squares Moving Average (Pine ``ta.linreg``).

.. math:: \mathrm{LSMA}_t = a + b\,(n-1-\text{offset})

where :math:`a, b` are the OLS intercept and slope over the last :math:`n` bars (oldest = 0).
As an FIR kernel: :math:`w_j = \frac1n + \frac{(p-\bar j)(j-\bar j)}{S}` with
:math:`p = n-1-\text{offset}`.
With offset 0 it equals :math:`3\,\mathrm{WMA}_n - 2\,\mathrm{SMA}_n` (lag 0, NRF
:math:`\frac{2(2n-1)}{n(n+1)}`). Unlike the other MAs, ``offset`` here is TradingView's linreg
offset (evaluate the line ``offset`` bars back), not a plot shift. Warm-up :math:`n-1`.
TradingView default: length 25, offset 0, source close.
"""

from __future__ import annotations

from app.indicators import core
from app.indicators.ma import MAX_OFFSET, length_param, source_param
from app.indicators.registry import IndicatorSpec, OutputSpec, Params, ParamSpec
from app.models.bars import BarFrame, FloatArray


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    x = core.source(frame, str(params["source"]))
    return {"ma": core.lsma(x, int(params["length"]), int(params["offset"]))}


SPEC = IndicatorSpec(
    id="lsma",
    version=1,
    name="Least Squares Moving Average",
    short_name="LSMA",
    category="moving_averages",
    overlay=True,
    inputs=("open", "high", "low", "close"),
    params=(
        length_param(25),
        ParamSpec("offset", "int", 0, "Offset", min=0, max=MAX_OFFSET, step=1),
        source_param(),
    ),
    outputs=(OutputSpec("ma", "LSMA", "line", "#7E57C2"),),
    warmup=lambda p: int(p["length"]) - 1,
    compute=compute,
    learn_slug="lsma",
    description="End point of the least-squares line through the last n bars.",
)
