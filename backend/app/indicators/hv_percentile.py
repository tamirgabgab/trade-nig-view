r"""Volatility percentile: where today's Historical Volatility sits among its own recent past.

.. math:: \mathrm{rank}_t = \frac{100}{m}\,\#\{\,1 \le j \le m : v_{t-j} \le v_t\,\}

with :math:`v` the per-bar volatility of ``hv`` (estimator, length n) and :math:`m` the lookback
(Pine ``ta.percentrank(v, m)``: the previous m values, not the current one). Below 10 the market
is unusually calm (a squeeze), above 90 unusually wild. The annualisation scale does not change
the rank, so the per-bar volatility is ranked. Warm-up: ``hv``'s plus :math:`m`.
"""

from __future__ import annotations

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from app.indicators import hv
from app.indicators.ma import length_param
from app.indicators.registry import MIN_LOOKBACK, IndicatorSpec, OutputSpec, Params
from app.models.bars import BarFrame, FloatArray


def percent_rank(x: FloatArray, m: int) -> FloatArray:
    """Pine ``ta.percentrank``: % of the previous ``m`` values <= the current one (NaN if any of
    the m + 1 values is NaN)."""
    out = np.full(len(x), np.nan)
    if len(x) <= m:
        return out
    windows = sliding_window_view(x, m + 1)
    current = windows[:, -1:]
    rank = 100.0 * (windows[:, :-1] <= current).sum(axis=1) / m
    out[m:] = np.where(np.isnan(windows).any(axis=1), np.nan, rank)
    return out


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    v = hv.rolling_variance(frame, str(params["estimator"]), int(params["length"]))
    return {"rank": percent_rank(v, int(params["lookback"]))}


SPEC = IndicatorSpec(
    id="hv_percentile",
    version=1,
    name="Volatility Percentile",
    short_name="Vol %ile",
    category="volatility",
    overlay=False,
    inputs=("open", "high", "low", "close"),
    params=(
        hv.estimator_param(),
        length_param(21, minimum=hv.MIN_WINDOW),
        length_param(252, name="lookback", label="Lookback"),
    ),
    outputs=(OutputSpec("rank", "Percentile", "line", "#7E57C2"),),
    warmup=lambda p: hv.warmup(str(p["estimator"]), int(p["length"])) + int(p["lookback"]),
    compute=compute,
    learn_slug="historical-volatility",
    description="Percentile of the current volatility among its last 252 values: < 10 = squeeze.",
    levels=(10.0, 90.0),
    level_fill=(10.0, 90.0),
    lookback=lambda p: max(MIN_LOOKBACK, int(p["length"]) + int(p["lookback"]) + 1),
)
