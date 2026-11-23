r"""Relative Strength Index (Wilder), with an optional smoothing average and Bollinger Bands on it.

.. math:: U_t = \max(x_t - x_{t-1}, 0), \quad D_t = \max(x_{t-1} - x_t, 0), \quad
   \bar U = \mathrm{RMA}_n(U), \quad \bar D = \mathrm{RMA}_n(D)

.. math:: \mathrm{RSI}_t = \begin{cases}
   100 & \bar D_t = 0 \\
   0 & \bar U_t = 0 \\
   100 - \dfrac{100}{1 + \bar U_t / \bar D_t} & \text{otherwise}
   \end{cases}

in that order (Pine: a perfectly flat window gives 100). The first change needs one prior bar, so
the RSI starts at bar :math:`n`. Optional:
``rsi_ma`` :math:`= \mathrm{MA}^{\text{type}}_m(\mathrm{RSI})`
seeded on the first RSI values, and bands ``rsi_ma`` :math:`\pm k\,\sigma_m(\mathrm{RSI})`
(population :math:`\sigma`). TradingView defaults: length 14, close, levels 70 / 50 / 30,
smoothing off (length 14, BB StdDev 2).
"""

from __future__ import annotations

from dataclasses import replace

import numpy as np

from app.indicators import core
from app.indicators.ma import (
    MA_TYPE_IDS,
    MA_TYPES,
    apply_ma_valid,
    length_param,
    ma_lookback,
    ma_warmup,
    source_param,
)
from app.indicators.registry import (
    LOOKBACK_PER_LENGTH,
    MIN_LOOKBACK,
    IndicatorSpec,
    OutputSpec,
    Params,
    ParamSpec,
)
from app.models.bars import BarFrame, FloatArray

NO_SMOOTHING = "none"


def rsi(x: FloatArray, length: int) -> FloatArray:
    """Wilder's RSI of ``x`` (see the module docstring); ``NaN`` before bar ``length``."""
    x = core.as_float(x)
    change = x - core.lagged(x, 1)
    up = core.rma(np.maximum(change, 0.0), length)
    down = core.rma(np.maximum(-change, 0.0), length)
    out = core.nan_like(x)
    valid = ~np.isnan(up) & ~np.isnan(down)
    u, d = up[valid], down[valid]
    with np.errstate(divide="ignore", invalid="ignore"):
        formula = 100.0 - 100.0 / (1.0 + u / d)
    out[valid] = np.where(d == 0.0, 100.0, np.where(u == 0.0, 0.0, formula))
    return out


def _smoothing(params: Params) -> str | None:
    """The smoothing MA type, or ``None`` when it is off."""
    ma_type = str(params["ma_type"])
    return None if ma_type == NO_SMOOTHING else ma_type


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    x = core.source(frame, str(params["source"]))
    value = rsi(x, int(params["length"]))
    smooth = core.nan_like(value)
    upper = core.nan_like(value)
    lower = core.nan_like(value)
    ma_type = _smoothing(params)
    if ma_type is not None:
        m = int(params["ma_length"])
        smooth = apply_ma_valid(ma_type, value, m, frame.volume)
        if params["bb"]:
            dev = float(params["bb_mult"]) * core.stdev(value, m)
            upper, lower = smooth + dev, smooth - dev
    return {"rsi": value, "rsi_ma": smooth, "bb_upper": upper, "bb_lower": lower}


def warmup(params: Params) -> int:
    n = int(params["length"])
    ma_type = _smoothing(params)
    if ma_type is None:
        return n
    m = int(params["ma_length"])
    smooth = n + ma_warmup(ma_type, m)
    return max(smooth, n + m - 1) if params["bb"] else smooth


def lookback(params: Params) -> int:
    """The RSI's RMA needs ``25 n`` bars to forget its seed; the smoothing average then needs its
    own lookback on top (its seed sits on the first RSI values of the loaded window)."""
    rsi_bars = max(LOOKBACK_PER_LENGTH * int(params["length"]), MIN_LOOKBACK)
    ma_type = _smoothing(params)
    if ma_type is None:
        return rsi_bars
    return rsi_bars + ma_lookback(ma_type, int(params["ma_length"]))


SPEC = IndicatorSpec(
    id="rsi",
    version=1,
    name="Relative Strength Index",
    short_name="RSI",
    category="oscillators",
    overlay=False,
    inputs=("open", "high", "low", "close", "volume"),
    params=(
        length_param(14),
        source_param(),
        ParamSpec(
            "ma_type",
            "enum",
            NO_SMOOTHING,
            "Smoothing",
            options=(NO_SMOOTHING, *MA_TYPE_IDS),
            option_labels=("None", *(t.label for t in MA_TYPES.values())),
        ),
        replace(length_param(14, "ma_length", "Smoothing length"), requires="ma_type"),
        ParamSpec("bb", "bool", False, "Bollinger Bands", requires="ma_type"),
        ParamSpec(
            "bb_mult", "float", 2.0, "BB StdDev", min=0.001, max=50.0, step=0.1, requires="bb"
        ),
    ),
    outputs=(
        OutputSpec("rsi", "RSI", "line", "#7E57C2"),
        OutputSpec("rsi_ma", "RSI-based MA", "line", "#FDD835", line_width=1, requires="ma_type"),
        OutputSpec(
            "bb_upper",
            "Upper band",
            "line",
            "#089981",
            line_width=1,
            style={"fill_to": "bb_lower", "fill": "rgba(8, 153, 129, 0.1)"},
            requires="bb",
        ),
        OutputSpec("bb_lower", "Lower band", "line", "#089981", line_width=1, requires="bb"),
    ),
    warmup=warmup,
    compute=compute,
    learn_slug="rsi",
    description="Momentum oscillator from 0 to 100: average gains vs average losses.",
    levels=(70.0, 50.0, 30.0),
    level_fill=(30.0, 70.0),
    lookback=lookback,
)
