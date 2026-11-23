r"""Moving-average types (``MA_TYPES``) and factories for MA indicators.

Every MA is implemented once in :mod:`app.indicators.core`; ``MA_TYPES`` wraps each as
:math:`(x, n, V) \mapsto y` with its warm-up, lookback and minimum length. Single-line MA
indicators, the generic "Moving Average" (type enum) and the composites (MA Cross, Ribbon,
Envelope; later the Bollinger basis and MACD) all pick their averages from it. Types with extra
inputs (ALMA, KAMA, T3) use their TradingView/author defaults here; their own indicators expose
those inputs.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from app.indicators import core
from app.indicators.registry import (
    LOOKBACK_PER_LENGTH,
    MIN_LOOKBACK,
    IndicatorSpec,
    InvalidParamsError,
    OutputSpec,
    Params,
    ParamSpec,
    length_lookback,
)
from app.models.bars import BarFrame, FloatArray

MaFn = Callable[[FloatArray, int, FloatArray], FloatArray]

#: KAMA's slowest smoothing is s^2 with s = 2/(S+1): the seed fades like (1 - s^2)^k.
KAMA_SLOW = 30
KAMA_FAST = 2


def _default_lookback(n: int) -> int:
    return LOOKBACK_PER_LENGTH * n


def kama_lookback(n: int, slow: int = KAMA_SLOW) -> int:
    r"""Bars until KAMA's seed weight is below :math:`e^{-25}` even in a flat market:
    :math:`25 / s^2` with :math:`s = \frac{2}{S+1}` (6,006 bars for S = 30)."""
    return max(LOOKBACK_PER_LENGTH * n, int(LOOKBACK_PER_LENGTH * ((slow + 1) / 2) ** 2) + n)


@dataclass(frozen=True, slots=True)
class MaType:
    """One moving-average type: label, function, first valid index and lookback."""

    id: str
    label: str
    fn: MaFn
    warmup: Callable[[int], int]
    lookback: Callable[[int], int] = _default_lookback
    min_length: int = 1
    uses_volume: bool = False


def _types() -> dict[str, MaType]:
    entries = (
        MaType("sma", "SMA", lambda x, n, _v: core.sma(x, n), lambda n: n - 1),
        MaType("ema", "EMA", lambda x, n, _v: core.ema(x, n), lambda n: n - 1),
        MaType("wma", "WMA", lambda x, n, _v: core.wma(x, n), lambda n: n - 1),
        MaType("smma", "SMMA (RMA)", lambda x, n, _v: core.rma(x, n), lambda n: n - 1),
        MaType("dema", "DEMA", lambda x, n, _v: core.dema(x, n), lambda n: 2 * (n - 1)),
        MaType("tema", "TEMA", lambda x, n, _v: core.tema(x, n), lambda n: 3 * (n - 1)),
        MaType(
            "hma",
            "HMA (Hull)",
            lambda x, n, _v: core.hma(x, n),
            lambda n: n + core.hma_lengths(n)[1] - 2,
            min_length=core.HMA_MIN_LENGTH,
        ),
        MaType("lsma", "LSMA", lambda x, n, _v: core.lsma(x, n), lambda n: n - 1),
        MaType("alma", "ALMA", lambda x, n, _v: core.alma(x, n), lambda n: n - 1),
        MaType("swma", "SWMA", lambda x, _n, _v: core.swma(x), lambda _n: 3),
        MaType(
            "vwma",
            "VWMA",
            lambda x, n, v: core.vwma(x, v, n),
            lambda n: n - 1,
            uses_volume=True,
        ),
        MaType("mcginley", "McGinley", lambda x, n, _v: core.mcginley(x, n), lambda n: n - 1),
        MaType(
            "kama",
            "KAMA",
            lambda x, n, _v: core.kama(x, n, KAMA_FAST, KAMA_SLOW),
            lambda n: n,
            lookback=kama_lookback,
        ),
        MaType(
            "t3",
            "T3 (Tillson)",
            lambda x, n, _v: core.t3(x, n),
            lambda n: 6 * (n - 1),
            lookback=lambda n: 2 * LOOKBACK_PER_LENGTH * n,
        ),
        MaType(
            "zlema",
            "ZLEMA",
            lambda x, n, _v: core.zlema(x, n),
            lambda n: n - 1 + core.zlema_lag(n),
        ),
    )
    return {t.id: t for t in entries}


MA_TYPES: dict[str, MaType] = _types()
MA_TYPE_IDS: tuple[str, ...] = tuple(MA_TYPES)

MAX_LENGTH = 5000
MAX_OFFSET = 500


def apply_ma(type_id: str, x: FloatArray, length: int, volume: FloatArray) -> FloatArray:
    """The ``type_id`` MA of ``x``; ``InvalidParamsError`` if ``length`` is below its minimum."""
    ma = MA_TYPES[type_id]
    if length < ma.min_length:
        raise InvalidParamsError(f"{ma.label} needs a length of at least {ma.min_length}")
    return ma.fn(x, length, volume)


def ma_lookback(type_id: str, length: int) -> int:
    return max(MA_TYPES[type_id].lookback(length), MIN_LOOKBACK)


def source_param(default: str = "close") -> ParamSpec:
    return ParamSpec("source", "source", default, "Source", options=core.SOURCES)


def length_param(
    default: int, name: str = "length", label: str = "Length", minimum: int = 1
) -> ParamSpec:
    return ParamSpec(name, "int", default, label, min=minimum, max=MAX_LENGTH, step=1)


def offset_param() -> ParamSpec:
    return ParamSpec("offset", "int", 0, "Offset", min=0, max=MAX_OFFSET, step=1)


def type_param(default: str = "sma", name: str = "ma_type", label: str = "MA type") -> ParamSpec:
    return ParamSpec(
        name,
        "enum",
        default,
        label,
        options=MA_TYPE_IDS,
        option_labels=tuple(t.label for t in MA_TYPES.values()),
    )


def ma_indicator(
    ma_type: str,
    *,
    name: str,
    default_length: int,
    color: str,
    description: str,
    learn_slug: str | None = None,
) -> IndicatorSpec:
    """A one-line overlay MA with ``length``, ``source`` and ``offset`` (TradingView's inputs)."""
    kind = MA_TYPES[ma_type]

    def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
        x = core.source(frame, str(params["source"]))
        y = kind.fn(x, int(params["length"]), frame.volume)
        return {"ma": core.shift(y, int(params["offset"]))}

    def warmup(params: Params) -> int:
        return kind.warmup(int(params["length"])) + int(params["offset"])

    def lookback(params: Params) -> int:
        return max(ma_lookback(ma_type, int(params["length"])), length_lookback(params))

    short = kind.label.split(" ")[0]
    return IndicatorSpec(
        id=ma_type,
        version=1,
        name=name,
        short_name=short,
        category="moving_averages",
        overlay=True,
        inputs=("open", "high", "low", "close", "volume")
        if kind.uses_volume
        else ("open", "high", "low", "close"),
        params=(
            length_param(default_length, minimum=kind.min_length),
            source_param(),
            offset_param(),
        ),
        outputs=(OutputSpec("ma", short, "line", color),),
        warmup=warmup,
        compute=compute,
        learn_slug=learn_slug or ma_type,
        description=description,
        lookback=lookback,
    )
