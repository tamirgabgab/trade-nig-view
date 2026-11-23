r"""Symmetrically Weighted Moving Average (Pine ``ta.swma``).

.. math:: \mathrm{SWMA}_t = \frac{x_t + 2x_{t-1} + 2x_{t-2} + x_{t-3}}{6}

A fixed 4-tap triangular filter (no length input): lag 1.5 bars, NRF 5/18. Warm-up 3 bars.
Available in Pine as a function, used by other indicators (e.g. RVI); shown here as an overlay.
"""

from __future__ import annotations

from app.indicators import core
from app.indicators.ma import offset_param, source_param
from app.indicators.registry import IndicatorSpec, OutputSpec, Params
from app.models.bars import BarFrame, FloatArray


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    x = core.source(frame, str(params["source"]))
    return {"ma": core.shift(core.swma(x), int(params["offset"]))}


SPEC = IndicatorSpec(
    id="swma",
    version=1,
    name="Symmetrically Weighted Moving Average",
    short_name="SWMA",
    category="moving_averages",
    overlay=True,
    inputs=("open", "high", "low", "close"),
    params=(source_param(), offset_param()),
    outputs=(OutputSpec("ma", "SWMA", "line", "#8D6E63"),),
    warmup=lambda p: 3 + int(p["offset"]),
    compute=compute,
    learn_slug="swma",
    description="Fixed 1-2-2-1 weights over four bars.",
)
