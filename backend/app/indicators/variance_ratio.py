r"""Variance Ratio (Lo-MacKinlay) with the Chow-Denning multiple test: is the market trending,
random or mean-reverting over the last W bars?

Over the last W log returns :math:`r` (mean :math:`\mu`, deviations :math:`d = r - \mu`) and the
overlapping q-bar sums :math:`S_k = \sum_{j<q} r_{k-j}`:

.. math::
    \hat\sigma^2_1 = \frac{\sum d^2}{W - 1}, \qquad
    \hat\sigma^2_q = \frac{\sum_k (S_k - q\mu)^2}{q(W - q + 1)(1 - q/W)}, \qquad
    VR(q) = \hat\sigma^2_q / \hat\sigma^2_1

and the heteroskedasticity-robust statistic

.. math::
    \delta_j = \frac{W\sum_{k>j} d_k^2 d_{k-j}^2}{(\sum d^2)^2}, \quad
    \theta(q) = \sum_{j=1}^{q-1}\Big[\frac{2(q-j)}{q}\Big]^2\delta_j, \quad
    z^*(q) = \frac{\sqrt{W}\,(VR(q) - 1)}{\sqrt{\theta(q)}}

A random walk has VR = 1; VR > 1 (positively autocorrelated returns) is a trend, VR < 1 mean
reversion. Chow and Denning test q = 2, 4, 8, 16 at once with :math:`\max_q |z^*(q)|` against the
studentised maximum modulus (5 %: 2.49 for four ratios), so one lucky q does not count. The line
is the :math:`z^*` with the largest modulus, signed. Warm-up: W bars (W + 1 closes).
"""

from __future__ import annotations

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from app.indicators import hv
from app.indicators.ma import length_param
from app.indicators.registry import MIN_LOOKBACK, IndicatorSpec, OutputSpec, Params
from app.models.bars import BarFrame, FloatArray

QS: tuple[int, ...] = (2, 4, 8, 16)
#: Studentised maximum modulus, 5 %, four ratios, infinite degrees of freedom.
CRITICAL = 2.49
_BLOCK = 1 << 20


def vr_stats(windows: FloatArray) -> tuple[FloatArray, FloatArray]:
    """(rows, len(QS)) VR(q) and z*(q) of each row of returns."""
    n = windows.shape[1]
    mu = windows.mean(axis=1, keepdims=True)
    d = windows - mu
    d2 = d * d
    ss = d2.sum(axis=1)
    var1 = ss / (n - 1)
    c = np.concatenate((np.zeros((len(windows), 1)), np.cumsum(windows, axis=1)), axis=1)
    vr = np.empty((len(windows), len(QS)))
    z = np.empty_like(vr)
    with np.errstate(divide="ignore", invalid="ignore"):  # a flat window: NaN
        delta = [np.zeros(len(windows))] + [
            n * (d2[:, j:] * d2[:, :-j]).sum(axis=1) / (ss * ss) for j in range(1, max(QS))
        ]
    for i, q in enumerate(QS):
        sums = c[:, q:] - c[:, :-q]
        m = q * (n - q + 1) * (1 - q / n)
        varq = ((sums - q * mu) ** 2).sum(axis=1) / m
        with np.errstate(divide="ignore", invalid="ignore"):
            vr[:, i] = varq / var1
            theta = sum(((2 * (q - j) / q) ** 2) * delta[j] for j in range(1, q))
            z[:, i] = np.sqrt(n) * (vr[:, i] - 1) / np.sqrt(theta)
    return vr, z


def signed_max(z: FloatArray) -> FloatArray:
    """Per row, the z* with the largest modulus (NaN if any is NaN)."""
    pick = np.nanargmax(np.where(np.isnan(z), -np.inf, np.abs(z)), axis=1)
    out = z[np.arange(len(z)), pick]
    return np.where(np.isnan(z).any(axis=1), np.nan, out)


def rolling_z(frame: BarFrame, w: int) -> FloatArray:
    """The Chow-Denning signed statistic over the last w returns, at every bar."""
    r = hv.returns(frame)
    out = np.full(len(r), np.nan)
    if len(r) < w + 1:
        return out
    windows = sliding_window_view(r[1:], w)  # returns 1..t
    rows = max(1, _BLOCK // w)
    for lo in range(0, len(windows), rows):
        block = windows[lo : lo + rows]
        _, z = vr_stats(block)
        out[w + lo : w + lo + len(block)] = signed_max(z)
    return out


def compute(frame: BarFrame, params: Params) -> dict[str, FloatArray]:
    return {"z": rolling_z(frame, int(params["length"]))}


SPEC = IndicatorSpec(
    id="variance_ratio",
    version=1,
    name="Variance Ratio (Chow-Denning)",
    short_name="VR z",
    category="oscillators",
    overlay=False,
    inputs=("close",),
    params=(length_param(252, minimum=4 * max(QS)),),
    outputs=(OutputSpec("z", "z*", "line", "#2962FF"),),
    warmup=lambda p: int(p["length"]),
    compute=compute,
    learn_slug="market-regime",
    description="Trend (> 2.49) or mean reversion (< -2.49) over the last 252 bars, at 5 %.",
    levels=(-CRITICAL, 0.0, CRITICAL),
    level_fill=(-CRITICAL, CRITICAL),
    lookback=lambda p: max(MIN_LOOKBACK, int(p["length"]) + 2),
)
