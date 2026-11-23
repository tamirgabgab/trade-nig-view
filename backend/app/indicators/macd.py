r"""Moving Average Convergence Divergence (Appel).

.. math:: \mathrm{MACD}_t = \mathrm{MA}^{\text{osc}}_f(x)_t - \mathrm{MA}^{\text{osc}}_s(x)_t,
   \quad S_t = \mathrm{MA}^{\text{sig}}_g(\mathrm{MACD})_t, \quad H_t = \mathrm{MACD}_t - S_t

The signal average is seeded on the first valid MACD values (``apply_ma_valid``). TradingView
defaults: fast 12, slow 26, signal 9, close, both averages EMA. Warm-up: MACD
:math:`w_{osc} = \max(w(f), w(s))` (:math:`s - 1` for EMAs), signal and histogram
:math:`w_{osc} + w_{sig}(g)` (:math:`s + g - 2`).
"""

from __future__ import annotations

from app.indicators import core
from app.indicators.ma import (
    apply_ma,
    apply_ma_valid,
    length_param,
    ma_lookback,
    ma_warmup,
    source_param,
    type_param,
)
from app.indicators.registry import IndicatorSpec, OutputSpec, Params
from app.models.bars import BarFrame, FloatArray


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    x = core.source(frame, str(params["source"]))
    osc = str(params["osc_ma_type"])
    fast = apply_ma(osc, x, int(params["fast_length"]), frame.volume)
    slow = apply_ma(osc, x, int(params["slow_length"]), frame.volume)
    macd = fast - slow
    signal = apply_ma_valid(
        str(params["signal_ma_type"]), macd, int(params["signal_length"]), frame.volume
    )
    return {"hist": macd - signal, "macd": macd, "signal": signal}


def _osc_warmup(params: Params) -> int:
    osc = str(params["osc_ma_type"])
    return max(ma_warmup(osc, int(params[name])) for name in ("fast_length", "slow_length"))


def warmup(params: Params) -> int:
    return _osc_warmup(params) + ma_warmup(
        str(params["signal_ma_type"]), int(params["signal_length"])
    )


def lookback(params: Params) -> int:
    """The oscillator averages' lookback, then the signal average's on top of it."""
    osc = str(params["osc_ma_type"])
    line = max(ma_lookback(osc, int(params[name])) for name in ("fast_length", "slow_length"))
    return line + ma_lookback(str(params["signal_ma_type"]), int(params["signal_length"]))


SPEC = IndicatorSpec(
    id="macd",
    version=1,
    name="MACD",
    short_name="MACD",
    category="oscillators",
    overlay=False,
    inputs=("open", "high", "low", "close", "volume"),
    params=(
        length_param(12, "fast_length", "Fast length"),
        length_param(26, "slow_length", "Slow length"),
        length_param(9, "signal_length", "Signal smoothing"),
        source_param(),
        type_param("ema", name="osc_ma_type", label="Oscillator MA type"),
        type_param("ema", name="signal_ma_type", label="Signal line MA type"),
    ),
    outputs=(
        OutputSpec(
            "hist",
            "Histogram",
            "histogram",
            "#26A69A",
            style={
                "up": "#26A69A",
                "up_weak": "#B2DFDB",
                "down": "#FF5252",
                "down_weak": "#FFCDD2",
            },
        ),
        OutputSpec("macd", "MACD", "line", "#2962FF"),
        OutputSpec("signal", "Signal", "line", "#FF6D00"),
    ),
    warmup=warmup,
    compute=compute,
    learn_slug="macd",
    description="Fast minus slow average, its signal line and the histogram between them.",
    levels=(0.0,),
    lookback=lookback,
)
