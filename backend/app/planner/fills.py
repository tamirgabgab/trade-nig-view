"""The fill price of a purchase inside a bar, from the bar's open, high, low and close only.

Let :math:`t \\in [0, 1]` be the time inside the bar and :math:`f(t)` the price, with
:math:`f(0) = O`, :math:`f(1) = C`, :math:`\\max f = H`, :math:`\\min f = L`. Six models of
:math:`f` (``FillMode``), each O(1) per purchase:

* ``close``: :math:`C`; ``open``: :math:`O`; ``mid``: :math:`(H + L)/2`;
* ``linear``: :math:`O + t (C - O)`;
* ``piecewise``: straight lines through :math:`O, a, b, C` at :math:`t = 0, 1/3, 2/3, 1`, where
  :math:`(a, b) = (L, H)` in an up bar (:math:`C \\ge O`) and :math:`(H, L)` in a down bar;
  ``piecewise_random`` picks the order at random (or averages both when nothing is drawn);
* ``estimated``: :math:`\\mathbb{E}[f(t) \\mid O, H, L, C]` for a driftless random walk, from the
  table made by ``scripts/make_fill_table.py``. With :math:`u = (O - L)/(H - L)` and
  :math:`v = (C - L)/(H - L)`, the table holds the residual
  :math:`d(t; u, v) = \\mathbb{E}[y(t)] - (u + t (v - u))` of the normalised path, so
  :math:`\\hat f(t) = L + (H - L)\\,(u + t (v - u) + d(t; u, v))`, bilinear in (u, v) and linear
  in t. ``Granularity`` picks one of three table sizes.

Three ways to use a model:

* a known time ``t``: the price at ``t``;
* no time and no generator: the **expected** price at a uniformly random time,
  :math:`\\int_0^1 f(t)\\,dt`;
* no time and a generator: a **draw**: :math:`t \\sim U(0, 1)`, and for ``estimated`` a draw of
  :math:`f(t)` from the table's quantiles (inverse CDF through 0, the five quantiles and 1).

A bar with :math:`H = L` returns its close.
"""

from __future__ import annotations

from enum import StrEnum
from functools import cache
from pathlib import Path

import numpy as np
import numpy.typing as npt

from app.models.bars import FloatArray

TABLE_PATH = Path(__file__).with_name("fill_table.npz")
THIRD = 1.0 / 3.0


class FillMode(StrEnum):
    CLOSE = "close"
    OPEN = "open"
    MID = "mid"
    LINEAR = "linear"
    PIECEWISE = "piecewise"
    PIECEWISE_RANDOM = "piecewise_random"
    ESTIMATED = "estimated"


class Granularity(StrEnum):
    COARSE = "coarse"
    MEDIUM = "medium"
    FINE = "fine"


@cache
def _table(level: Granularity) -> tuple[FloatArray, FloatArray, FloatArray]:
    """(mean residual [u, v, t], quantile residuals [u, v, t, q], quantile levels)."""
    with np.load(TABLE_PATH) as data:
        return (
            data[f"{level}_mean"].astype(np.float64),
            data[f"{level}_quantiles"].astype(np.float64),
            data["quantile_levels"].astype(np.float64),
        )


def _lookup(table: FloatArray, u: FloatArray, v: FloatArray, t: FloatArray) -> FloatArray:
    """``table[u, v, t, ...]`` between cell centres (bilinear) and time points (linear)."""
    cells, times = table.shape[0], table.shape[2]
    pu = np.clip(u * cells - 0.5, 0.0, cells - 1.0)
    pv = np.clip(v * cells - 0.5, 0.0, cells - 1.0)
    pt = np.clip(t, 0.0, 1.0) * (times - 1)
    iu = np.minimum(pu.astype(np.intp), cells - 2)
    iv = np.minimum(pv.astype(np.intp), cells - 2)
    it = np.minimum(pt.astype(np.intp), times - 2)
    out = 0.0
    for du, wu in ((0, 1.0 - (pu - iu)), (1, pu - iu)):
        for dv, wv in ((0, 1.0 - (pv - iv)), (1, pv - iv)):
            for dt, wt in ((0, 1.0 - (pt - it)), (1, pt - it)):
                w = wu * wv * wt
                cell = table[iu + du, iv + dv, it + dt]
                out = out + (w[..., None] * cell if cell.ndim > w.ndim else w * cell)
    return np.asarray(out, dtype=np.float64)


def _piecewise(
    u: FloatArray, v: FloatArray, t: FloatArray, low_first: npt.NDArray[np.bool_]
) -> FloatArray:
    """The normalised path through u, a, b, v at t = 0, 1/3, 2/3, 1 ((a, b) = (0, 1) or (1, 0))."""
    a = np.where(low_first, 0.0, 1.0)
    b = 1.0 - a
    return np.where(
        t < THIRD,
        u + (a - u) * t * 3.0,
        np.where(
            t < 2 * THIRD, a + (b - a) * (t - THIRD) * 3.0, b + (v - b) * (t - 2 * THIRD) * 3.0
        ),
    )


def fill_prices(  # noqa: PLR0911 - one branch per model, kept together on purpose
    open_: FloatArray,
    high: FloatArray,
    low: FloatArray,
    close: FloatArray,
    mode: FillMode,
    *,
    t: FloatArray | None = None,
    granularity: Granularity = Granularity.MEDIUM,
    rng: np.random.Generator | None = None,
) -> FloatArray:
    """The fill price of one purchase per bar (see the module docstring for ``t`` and ``rng``)."""
    open_, high, low, close = (np.asarray(x, dtype=np.float64) for x in (open_, high, low, close))
    span = high - low
    flat = span <= 0.0
    safe = np.where(flat, 1.0, span)
    u = np.clip((open_ - low) / safe, 0.0, 1.0)
    v = np.clip((close - low) / safe, 0.0, 1.0)

    def price(y: FloatArray) -> FloatArray:
        return np.where(flat, close, low + span * np.clip(y, 0.0, 1.0))

    if mode is FillMode.CLOSE:
        return close.copy()
    if mode is FillMode.OPEN:
        return open_.copy()
    if mode is FillMode.MID:
        return price(np.full_like(u, 0.5))

    known = t is not None
    if t is None and rng is not None:
        t = rng.uniform(0.0, 1.0, size=u.shape)
    if t is not None:
        t = np.broadcast_to(np.asarray(t, dtype=np.float64), u.shape)

    if mode is FillMode.LINEAR:
        return price((u + v) / 2.0 if t is None else u + t * (v - u))

    if mode in (FillMode.PIECEWISE, FillMode.PIECEWISE_RANDOM):
        up = v >= u
        if t is None:  # the time-average of a path through u, a, b, v: (u + 2a + 2b + v) / 6
            return price((u + v + 2.0) / 6.0)
        if mode is FillMode.PIECEWISE:
            return price(_piecewise(u, v, t, up))
        if rng is None:
            return price((_piecewise(u, v, t, up) + _piecewise(u, v, t, ~up)) / 2.0)
        return price(_piecewise(u, v, t, rng.uniform(size=u.shape) < 0.5))  # noqa: PLR2004

    mean, quantiles, levels = _table(granularity)
    if t is None:  # the time-average of the estimate: trapezoid over the table's time points
        grid = np.linspace(0.0, 1.0, mean.shape[2])
        resid = np.stack([_lookup(mean, u, v, np.full_like(u, g)) for g in grid], axis=-1)
        return price((u + v) / 2.0 + np.trapezoid(resid, grid, axis=-1))
    line = u + t * (v - u)
    if known or rng is None:
        return price(line + _lookup(mean, u, v, t))
    # A draw of y(t): inverse CDF through (0, 0), the stored quantiles and (1, 1).
    q = np.clip(line[..., None] + _lookup(quantiles, u, v, t), 0.0, 1.0)
    q = np.maximum.accumulate(q, axis=-1)
    knots = np.concatenate([np.zeros((*u.shape, 1)), q, np.ones((*u.shape, 1))], axis=-1)
    probs = np.concatenate(([0.0], levels, [1.0]))
    p = rng.uniform(size=u.shape)
    k = np.clip(np.searchsorted(probs, p, side="right") - 1, 0, len(probs) - 2)
    lo_y = np.take_along_axis(knots, k[..., None], axis=-1)[..., 0]
    hi_y = np.take_along_axis(knots, k[..., None] + 1, axis=-1)[..., 0]
    return price(lo_y + (hi_y - lo_y) * (p - probs[k]) / (probs[k + 1] - probs[k]))
