r"""Moving Average (any type): one entry whose ``ma_type`` picks any average in ``MA_TYPES``.

.. math:: y_t = \mathrm{MA}^{\text{type}}_n(x)_t

Types with extra inputs use their defaults (ALMA 0.85/6, KAMA 2/30, T3 0.7, LSMA offset 0); their
own indicators expose those inputs. Warm-up and lookback follow the chosen type.
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
from app.indicators.registry import IndicatorSpec, OutputSpec, Params
from app.models.bars import BarFrame, FloatArray


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    x = core.source(frame, str(params["source"]))
    y = apply_ma(str(params["ma_type"]), x, int(params["length"]), frame.volume)
    return {"ma": core.shift(y, int(params["offset"]))}


SPEC = IndicatorSpec(
    id="ma",
    version=1,
    name="Moving Average (any type)",
    short_name="MA",
    category="moving_averages",
    overlay=True,
    inputs=("open", "high", "low", "close", "volume"),
    params=(type_param("sma"), length_param(9), source_param(), offset_param()),
    outputs=(OutputSpec("ma", "MA", "line", "#2962FF"),),
    warmup=lambda p: ma_warmup(str(p["ma_type"]), int(p["length"])) + offset_shift(p),
    compute=compute,
    learn_slug="moving-average",
    description="Pick any average (SMA, EMA, Hull, KAMA, ...) from one entry.",
    lookback=lambda p: ma_lookback(str(p["ma_type"]), int(p["length"])),
    shift=offset_shift,
)
