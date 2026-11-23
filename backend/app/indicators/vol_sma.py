r"""Volume SMA: the simple moving average of volume, drawn on the volume histogram's scale.

.. math:: y_t = \frac1n\sum_{k=0}^{n-1} V_{t-k}

TradingView default (the "Volume" indicator's MA): length 20. Warm-up :math:`n - 1`.
"""

from __future__ import annotations

from app.indicators import core
from app.indicators.ma import length_param
from app.indicators.registry import IndicatorSpec, OutputSpec, Params
from app.models.bars import BarFrame, FloatArray


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    return {"ma": core.sma(frame.volume, int(params["length"]))}


SPEC = IndicatorSpec(
    id="vol_sma",
    version=1,
    name="Volume SMA",
    short_name="Vol SMA",
    category="volume",
    overlay=True,
    inputs=("volume",),
    params=(length_param(20),),
    outputs=(
        OutputSpec(
            "ma", "Volume MA", "line", "#2196F3", line_width=1, style={"price_scale": "volume"}
        ),
    ),
    warmup=lambda p: int(p["length"]) - 1,
    compute=compute,
    learn_slug="volume-sma",
    description="Average volume over the last n bars, on the volume scale.",
)
