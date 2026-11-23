r"""Average True Range (Wilder): the average size of a bar including gaps.

.. math:: TR_t = \max(H_t - L_t,\ |H_t - C_{t-1}|,\ |L_t - C_{t-1}|), \quad TR_0 = H_0 - L_0,
   \quad \mathrm{ATR}_t = \mathrm{MA}^{\text{type}}_n(TR)_t

TradingView defaults: length 14, smoothing RMA (Wilder); SMA, EMA and WMA are the other choices.
Warm-up :math:`n - 1` (the first true range exists on bar 0, as Pine ``ta.tr(true)``).
"""

from __future__ import annotations

from app.indicators import core
from app.indicators.ma import MA_TYPES, apply_ma, length_param, ma_lookback, ma_warmup
from app.indicators.registry import IndicatorSpec, OutputSpec, Params, ParamSpec
from app.models.bars import BarFrame, FloatArray

#: Smoothing options (TradingView's) -> ``MA_TYPES`` id.
SMOOTHING = {"rma": "smma", "sma": "sma", "ema": "ema", "wma": "wma"}


def _ma_type(params: Params) -> str:
    return SMOOTHING[str(params["ma_type"])]


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    tr = core.true_range(frame.high, frame.low, frame.close)
    return {"atr": apply_ma(_ma_type(params), tr, int(params["length"]), frame.volume)}


SPEC = IndicatorSpec(
    id="atr",
    version=1,
    name="Average True Range",
    short_name="ATR",
    category="volatility",
    overlay=False,
    inputs=("high", "low", "close"),
    params=(
        length_param(14),
        ParamSpec(
            "ma_type",
            "enum",
            "rma",
            "Smoothing",
            options=tuple(SMOOTHING),
            option_labels=tuple(MA_TYPES[t].label for t in SMOOTHING.values()),
        ),
    ),
    outputs=(OutputSpec("atr", "ATR", "line", "#B71C1C"),),
    warmup=lambda p: ma_warmup(_ma_type(p), int(p["length"])),
    compute=compute,
    learn_slug="atr",
    description="Average bar size including gaps: a volatility gauge in price units.",
    lookback=lambda p: ma_lookback(_ma_type(p), int(p["length"])),
)
