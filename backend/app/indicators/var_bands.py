r"""VaR bands (filtered historical simulation): where the next bar's close should stay with a given
confidence, from the bar's own volatility and the history of standardised returns.

With :math:`r_s = \ln(C_s/C_{s-1})` and :math:`\sigma_s` the per-bar Yang-Zhang volatility over the
last n bars (``hv``), the standardised returns :math:`z_s = r_s / \sigma_{s-1}` (the volatility
known before the return). At bar t, over the last W of them:

.. math::
    q^-_t = Q_{1-L}(z_{t-W+1..t}), \quad q^+_t = Q_L(z_{t-W+1..t}),

    \text{lower}_{t+1} = C_t\, e^{\sigma_t q^-_t}, \quad
    \text{upper}_{t+1} = C_t\, e^{\sigma_t q^+_t}

with :math:`Q_p` the empirical quantile (linear interpolation, numpy's default). The bands are
drawn on the bar they forecast (t + 1, a plot offset of one bar), so a close outside them is a
breach of the 1-bar VaR: marked +1 above, -1 below. Warm-up :math:`n + W + 1`.
"""

from __future__ import annotations

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from app.indicators import core, hv
from app.indicators.ma import length_param
from app.indicators.registry import (
    MIN_LOOKBACK,
    IndicatorSpec,
    OutputSpec,
    Params,
    ParamSpec,
)
from app.models.bars import BarFrame, FloatArray

LEVELS = {"90": 0.90, "95": 0.95, "99": 0.99}


def standardised_returns(frame: BarFrame, n: int) -> tuple[FloatArray, FloatArray]:
    """:math:`\\sigma_t` and :math:`z_t = r_t / \\sigma_{t-1}` (NaN where either is missing)."""
    sigma = np.sqrt(np.maximum(hv.rolling_variance(frame, "yang_zhang", n), 0.0))
    previous = np.concatenate(([np.nan], sigma[:-1]))
    with np.errstate(divide="ignore", invalid="ignore"):
        z = np.where(previous > 0, hv.returns(frame) / previous, np.nan)
    return sigma, z


def rolling_quantile(z: FloatArray, w: int, p: float) -> FloatArray:
    """:math:`Q_p` of the last w values (NaN if any is NaN or before w values)."""
    out = np.full(len(z), np.nan)
    if len(z) >= w:
        out[w - 1 :] = np.quantile(sliding_window_view(z, w), p, axis=1)
    return out


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    level = LEVELS[str(params["level"])]
    sigma, z = standardised_returns(frame, int(params["length"]))
    w = int(params["window"])
    lower = core.shift(frame.close * np.exp(sigma * rolling_quantile(z, w, 1 - level)), 1)
    upper = core.shift(frame.close * np.exp(sigma * rolling_quantile(z, w, level)), 1)
    breach = np.full(len(z), np.nan)
    breach[frame.close > upper] = 1.0
    breach[frame.close < lower] = -1.0
    return {"upper": upper, "lower": lower, "breaches": breach}


SPEC = IndicatorSpec(
    id="var_bands",
    version=1,
    name="VaR Bands (FHS)",
    short_name="VaR",
    category="volatility",
    overlay=True,
    inputs=("open", "high", "low", "close"),
    params=(
        ParamSpec(
            "level",
            "enum",
            "95",
            "Confidence",
            options=tuple(LEVELS),
            option_labels=("90 %", "95 %", "99 %"),
        ),
        length_param(500, name="window", label="History (bars)", minimum=50),
        length_param(21, label="Volatility length", minimum=hv.MIN_WINDOW),
    ),
    outputs=(
        OutputSpec("upper", "Upper", "line", "#F23645", line_width=1),
        OutputSpec("lower", "Lower", "line", "#F23645", line_width=1),
        OutputSpec(
            "breaches",
            "Breaches",
            "markers",
            "#F23645",
            style={"up": "#089981", "down": "#F23645"},
        ),
    ),
    warmup=lambda p: int(p["length"]) + int(p["window"]) + 1,
    compute=compute,
    learn_slug="value-at-risk",
    description="Where the next close should stay with 90-99 % confidence; closes outside marked.",
    lookback=lambda p: max(MIN_LOOKBACK, int(p["length"]) + int(p["window"]) + 2),
    shift=lambda _p: 1,
)
