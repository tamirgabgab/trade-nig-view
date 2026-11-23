r"""Stochastic oscillator (Lane): where the close sits in the recent high-low range.

.. math:: \%K^{raw}_t = 100\,\frac{C_t - LL_t}{HH_t - LL_t}, \quad
   HH_t = \max_{k<n} H_{t-k}, \quad LL_t = \min_{k<n} L_{t-k}

.. math:: \%K = \mathrm{SMA}_{s_k}(\%K^{raw}), \quad \%D = \mathrm{SMA}_{s_d}(\%K)

:math:`HH = LL` (a flat range) divides by zero: ``NaN`` there, as Pine's ``na``, and the averages
over a window containing it are ``NaN`` too. TradingView defaults: %K length 14, %K smoothing 1,
%D smoothing 3, levels 80 / 50 / 20. Warm-up: %K :math:`n + s_k - 2`, %D :math:`n + s_k + s_d - 3`.
"""

from __future__ import annotations

from app.indicators import core
from app.indicators.ma import length_param
from app.indicators.registry import IndicatorSpec, OutputSpec, Params
from app.models.bars import BarFrame, FloatArray


def raw_k(frame: BarFrame, length: int) -> FloatArray:
    """Unsmoothed %K; ``NaN`` where the window's high equals its low."""
    hh = core.highest(frame.high, length)
    ll = core.lowest(frame.low, length)
    span = hh - ll
    out = core.nan_like(span)
    ok = span > 0
    out[ok] = 100.0 * (frame.close[ok] - ll[ok]) / span[ok]
    return out


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    k = core.sma(raw_k(frame, int(params["k_length"])), int(params["k_smoothing"]))
    return {"k": k, "d": core.sma(k, int(params["d_smoothing"]))}


def warmup(params: Params) -> int:
    return int(params["k_length"]) + int(params["k_smoothing"]) + int(params["d_smoothing"]) - 3


SPEC = IndicatorSpec(
    id="stoch",
    version=1,
    name="Stochastic",
    short_name="Stoch",
    category="oscillators",
    overlay=False,
    inputs=("high", "low", "close"),
    params=(
        length_param(14, "k_length", "%K length"),
        length_param(1, "k_smoothing", "%K smoothing"),
        length_param(3, "d_smoothing", "%D smoothing"),
    ),
    outputs=(
        OutputSpec("k", "%K", "line", "#2962FF"),
        OutputSpec("d", "%D", "line", "#FF6D00"),
    ),
    warmup=warmup,
    compute=compute,
    learn_slug="stochastic",
    description="Where the close sits in the recent high-low range, from 0 to 100.",
    levels=(80.0, 50.0, 20.0),
)
