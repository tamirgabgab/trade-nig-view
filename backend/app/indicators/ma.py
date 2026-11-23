r"""Moving-average dispatcher (``MA_TYPES``) and the factory for single-line MA indicators.

``MA_TYPES`` maps a type id to a function :math:`(x, n) \mapsto y`. Composite indicators (MA Cross,
Ribbon, Envelope, later the Bollinger basis and MACD) pick their averages from it, so every MA is
implemented once. ``MA_WARMUP`` gives the index of the first valid output for a clean input.
"""

from __future__ import annotations

from collections.abc import Callable

from app.indicators import core
from app.indicators.registry import (
    IndicatorSpec,
    OutputSpec,
    Params,
    ParamSpec,
)
from app.models.bars import BarFrame, FloatArray

MaFn = Callable[[FloatArray, int], FloatArray]

MA_TYPES: dict[str, MaFn] = {
    "sma": core.sma,
    "ema": core.ema,
    "wma": core.wma,
    "smma": core.rma,
}

MA_LABELS: dict[str, str] = {
    "sma": "SMA",
    "ema": "EMA",
    "wma": "WMA",
    "smma": "SMMA (RMA)",
}

#: First valid index of each MA type for a clean input of length ``n``.
MA_WARMUP: dict[str, Callable[[int], int]] = {
    "sma": lambda n: n - 1,
    "ema": lambda n: n - 1,
    "wma": lambda n: n - 1,
    "smma": lambda n: n - 1,
}

MAX_LENGTH = 5000
MAX_OFFSET = 500


def source_param(default: str = "close") -> ParamSpec:
    return ParamSpec("source", "source", default, "Source", options=core.SOURCES)


def length_param(default: int, name: str = "length", label: str = "Length") -> ParamSpec:
    return ParamSpec(name, "int", default, label, min=1, max=MAX_LENGTH, step=1)


def offset_param() -> ParamSpec:
    return ParamSpec("offset", "int", 0, "Offset", min=0, max=MAX_OFFSET, step=1)


def ma_indicator(
    ma_type: str,
    *,
    name: str,
    default_length: int,
    color: str,
    description: str,
    learn_slug: str | None = None,
) -> IndicatorSpec:
    """A one-line overlay MA with ``source``, ``length`` and ``offset`` (TradingView's inputs)."""
    fn = MA_TYPES[ma_type]
    warm = MA_WARMUP[ma_type]

    def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
        x = core.source(frame, str(params["source"]))
        y = fn(x, int(params["length"]))
        return {"ma": core.shift(y, int(params["offset"]))}

    def warmup(params: Params) -> int:
        return warm(int(params["length"])) + int(params["offset"])

    return IndicatorSpec(
        id=ma_type,
        version=1,
        name=name,
        short_name=MA_LABELS[ma_type].split(" ")[0],
        category="moving_averages",
        overlay=True,
        inputs=("open", "high", "low", "close"),
        params=(length_param(default_length), source_param(), offset_param()),
        outputs=(OutputSpec("ma", MA_LABELS[ma_type].split(" ")[0], "line", color),),
        warmup=warmup,
        compute=compute,
        learn_slug=learn_slug or ma_type,
        description=description,
    )
