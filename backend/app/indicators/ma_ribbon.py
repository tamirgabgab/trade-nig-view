r"""Moving Average Ribbon: four averages of one type (default EMA 20/50/100/200).

.. math:: y^{(i)}_t = \mathrm{MA}^{\text{type}}_{n_i}(x)_t, \quad i = 1..4

The fan's order and spacing show the trend's direction and strength at four time scales.
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
from app.indicators.registry import IndicatorSpec, OutputSpec, Params
from app.models.bars import BarFrame, FloatArray

LINES = (
    ("ma_1", 20, "#F7A600"),
    ("ma_2", 50, "#FF6D00"),
    ("ma_3", 100, "#F23645"),
    ("ma_4", 200, "#AB47BC"),
)


def _lengths(params: Params) -> list[int]:
    return [int(params[f"length_{i}"]) for i in range(1, len(LINES) + 1)]


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    x = core.source(frame, str(params["source"]))
    kind = str(params["ma_type"])
    return {
        name: apply_ma(kind, x, n, frame.volume)
        for (name, _, _), n in zip(LINES, _lengths(params), strict=True)
    }


SPEC = IndicatorSpec(
    id="ma_ribbon",
    version=1,
    name="Moving Average Ribbon",
    short_name="Ribbon",
    category="moving_averages",
    overlay=True,
    inputs=("open", "high", "low", "close", "volume"),
    params=(
        type_param("ema"),
        *(
            length_param(default, f"length_{i}", f"Length {i}")
            for i, (_, default, _) in enumerate(LINES, start=1)
        ),
        source_param(),
    ),
    outputs=tuple(
        OutputSpec(name, f"MA {i}", "line", color, line_width=1)
        for i, (name, _, color) in enumerate(LINES, start=1)
    ),
    warmup=lambda p: max(ma_warmup(str(p["ma_type"]), n) for n in _lengths(p)),
    compute=compute,
    learn_slug="ma-ribbon",
    description="Four averages of one type (20/50/100/200) drawn as a fan.",
    lookback=lambda p: max(ma_lookback(str(p["ma_type"]), n) for n in _lengths(p)),
)
