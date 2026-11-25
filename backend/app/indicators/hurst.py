r"""Hurst exponent by Detrended Fluctuation Analysis (DFA) over the last W bars.

The profile of the last W log returns, :math:`Y_k = \sum_{i \le k}(r_i - \mu)`, is cut into
non-overlapping boxes of s bars, counted back from the last bar; in each box a straight line is
fitted and the residual sum of squares :math:`RSS_b(s)` kept:

.. math::
    F(s) = \sqrt{\frac{1}{n_s s}\sum_{b=1}^{n_s} RSS_b(s)}, \qquad
    \ln F(s) = c + H \ln s \quad (s = 8, 16, 32, 64)

H = 0.5 for a random walk, above 0.5 for persistent (trending) returns, below for anti-persistent
(mean-reverting) ones. The linear detrending makes DFA robust to drifts, which bias the classic
rescaled range. Only the scales with at least four boxes in W are used. A window whose profile
is a straight line (returns equal to within 1e-6 of their mean) has only rounding noise in F(s)
and no H (NaN). The profile is taken
from the cumulative returns of the whole series: within a window it differs from the window's own
profile by a straight line, which each box's fit removes.
Warm-up: W bars.
"""

from __future__ import annotations

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from app.indicators import core, hv
from app.indicators.ma import length_param
from app.indicators.registry import MIN_LOOKBACK, IndicatorSpec, OutputSpec, Params
from app.models.bars import BarFrame, FloatArray

SCALES: tuple[int, ...] = (8, 16, 32, 64)
#: A window whose returns vary by less than this share of their mean is a straight-line profile
#: (equal returns, up to rounding): its F(s) is rounding noise and it has no H.
FLAT_RETURNS = 1e-6


def box_rss(profile: FloatArray, s: int) -> FloatArray:
    """RSS of a straight-line fit to the s profile values ending at each bar (NaN before)."""
    out = np.full(len(profile), np.nan)
    if len(profile) < s:
        return out
    boxes = sliding_window_view(profile, s)
    y = boxes - boxes.mean(axis=1, keepdims=True)
    x = np.arange(s) - (s - 1) / 2
    sxy = y @ x
    out[s - 1 :] = (y * y).sum(axis=1) - sxy * sxy / (x @ x)
    return out


def fluctuations(profile: FloatArray, w: int, scales: tuple[int, ...]) -> FloatArray:
    """(len(scales), n): F(s) over the w profile values ending at each bar."""
    out = np.full((len(scales), len(profile)), np.nan)
    for i, s in enumerate(scales):
        rss = box_rss(profile, s)
        nb = w // s
        total = np.zeros(len(profile))
        for b in range(nb):
            total += core.lagged(rss, b * s)  # the box ending b boxes before the bar
        out[i] = np.sqrt(np.maximum(total, 0.0) / (nb * s))
    return out


def slope(scales: tuple[int, ...], f: FloatArray) -> FloatArray:
    """OLS slope of ln F on ln s for each column of f (NaN where some F <= 0 or missing)."""
    x = np.log(np.asarray(scales, dtype=np.float64))
    x = x - x.mean()
    with np.errstate(divide="ignore", invalid="ignore"):
        y = np.log(np.where(f > 0, f, np.nan))
    return (x @ (y - y.mean(axis=0))) / (x @ x)


def rolling_hurst(frame: BarFrame, w: int) -> FloatArray:
    r = hv.returns(frame)
    profile = np.concatenate(([np.nan], np.cumsum(r[1:])))
    scales = tuple(s for s in SCALES if s <= w // 4)
    h = slope(scales, fluctuations(profile, w, scales))
    h[:w] = np.nan  # the boxes span at most w bars: values only once there are w returns
    if len(r) > w:
        windows = sliding_window_view(r[1:], w)  # the w returns ending at each bar from w on
        spread = windows.std(axis=1)
        flat = spread <= FLAT_RETURNS * np.abs(windows.mean(axis=1))
        h[w:][flat] = np.nan
    return h


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    return {"hurst": rolling_hurst(frame, int(params["length"]))}


SPEC = IndicatorSpec(
    id="hurst_dfa",
    version=1,
    name="Hurst Exponent (DFA)",
    short_name="Hurst",
    category="oscillators",
    overlay=False,
    inputs=("close",),
    params=(length_param(252, minimum=4 * SCALES[1]),),
    outputs=(OutputSpec("hurst", "H", "line", "#FF6D00"),),
    warmup=lambda p: int(p["length"]),
    compute=compute,
    learn_slug="market-regime",
    description="Persistence of returns: H > 0.5 trending, H < 0.5 mean-reverting (DFA, 252 bars).",
    levels=(0.5,),
    lookback=lambda p: max(MIN_LOOKBACK, int(p["length"]) + 2),
)
