r"""Building blocks shared by every moving average: price sources, FIR and IIR filters.

Notation (docs/TRADINGVIEW_RESEARCH.md section 5, PLAN.md section 5): bars :math:`t = 0..N-1`,
source :math:`x_t`, length :math:`n`. Outputs are ``NaN`` during warm-up and the value at bar
:math:`t` depends only on bars :math:`\le t` (no lookahead).

Two kinds of filter cover the whole moving-average family:

* **FIR** (finite kernel): :math:`y_t = \sum_{j=0}^{n-1} w_j\,x_{t-n+1+j}`, weights ordered oldest
  to newest. Computed exactly per window (``sliding_window_view @ w``, O(N n)), so there is no
  running-sum drift. A ``NaN`` anywhere in the window gives ``NaN`` (leading ``NaN`` of a nested
  input simply delays the warm-up).
* **IIR** (first-order recursion): :math:`y_t = y_{t-1} + \alpha\,(x_t - y_{t-1})`, seeded with the
  SMA of the first :math:`n` valid inputs (TA-Lib and Pine ``ta.rma`` convention; see the EMA
  seeding note in the research document).
"""

from __future__ import annotations

from collections.abc import Callable
from enum import StrEnum

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

from app.models.bars import BarFrame, FloatArray


class Source(StrEnum):
    """Price series an indicator reads (TradingView's ``source`` input)."""

    CLOSE = "close"
    OPEN = "open"
    HIGH = "high"
    LOW = "low"
    HL2 = "hl2"
    HLC3 = "hlc3"
    OHLC4 = "ohlc4"
    HLCC4 = "hlcc4"


SOURCES: tuple[str, ...] = tuple(s.value for s in Source)


def source(frame: BarFrame, name: str | Source) -> FloatArray:
    r"""The source series of ``frame``.

    ``hl2`` :math:`=\frac{H+L}{2}`, ``hlc3`` :math:`=\frac{H+L+C}{3}`,
    ``ohlc4`` :math:`=\frac{O+H+L+C}{4}`, ``hlcc4`` :math:`=\frac{H+L+2C}{4}`.
    """
    return _SOURCES[Source(name)](frame)


_SOURCES: dict[Source, Callable[[BarFrame], FloatArray]] = {
    Source.CLOSE: lambda f: f.close.astype(np.float64, copy=True),
    Source.OPEN: lambda f: f.open.astype(np.float64, copy=True),
    Source.HIGH: lambda f: f.high.astype(np.float64, copy=True),
    Source.LOW: lambda f: f.low.astype(np.float64, copy=True),
    Source.HL2: lambda f: (f.high + f.low) / 2.0,
    Source.HLC3: lambda f: (f.high + f.low + f.close) / 3.0,
    Source.OHLC4: lambda f: (f.open + f.high + f.low + f.close) / 4.0,
    Source.HLCC4: lambda f: (f.high + f.low + 2.0 * f.close) / 4.0,
}


def as_float(x: FloatArray) -> FloatArray:
    """``x`` as a contiguous float64 array (no copy when it already is one)."""
    return np.ascontiguousarray(x, dtype=np.float64)


def nan_like(x: FloatArray) -> FloatArray:
    return np.full(len(x), np.nan, dtype=np.float64)


def first_valid(x: FloatArray) -> int:
    """Index of the first finite value of ``x`` (``len(x)`` if there is none)."""
    finite = np.flatnonzero(np.isfinite(x))
    return int(finite[0]) if len(finite) else len(x)


def fir(x: FloatArray, weights: FloatArray) -> FloatArray:
    r"""Finite-window weighted sum :math:`y_t = \sum_{j=0}^{n-1} w_j\,x_{t-n+1+j}`.

    ``weights`` run oldest to newest (``weights[-1]`` multiplies :math:`x_t`); they are used as
    given (normalise them first for a moving average). The first :math:`n-1` outputs are ``NaN``.
    """
    x = as_float(x)
    w = as_float(weights)
    n = len(w)
    if n < 1:
        raise ValueError("fir needs at least one weight")
    out = nan_like(x)
    if len(x) >= n:
        out[n - 1 :] = sliding_window_view(x, n) @ w
    return out


def ema_recursive(x: FloatArray, alpha: float, length: int) -> FloatArray:
    r"""First-order IIR :math:`y_t = y_{t-1} + \alpha\,(x_t - y_{t-1})`.

    Seed: :math:`y_{f+n-1} = \frac1n\sum_{i=f}^{f+n-1} x_i` where :math:`f` is the first finite
    input (so a nested EMA of an EMA warms up after both). Earlier outputs are ``NaN``. A ``NaN``
    input after the seed propagates (validated bars never contain one).
    """
    x = as_float(x)
    if not 0.0 < alpha <= 1.0:
        raise ValueError(f"alpha must be in (0, 1], got {alpha}")
    if length < 1:
        raise ValueError(f"length must be >= 1, got {length}")
    out = nan_like(x)
    seed_at = first_valid(x) + length - 1
    if seed_at >= len(x):
        return out
    level = float(np.mean(x[seed_at - length + 1 : seed_at + 1]))
    out[seed_at] = level
    values = x[seed_at + 1 :].tolist()
    tail: list[float] = []
    for value in values:
        level += alpha * (value - level)
        tail.append(level)
    out[seed_at + 1 :] = tail
    return out


def sma(x: FloatArray, length: int) -> FloatArray:
    r"""Simple MA :math:`\frac1n\sum_{k=0}^{n-1} x_{t-k}`."""
    return fir(x, np.full(length, 1.0 / length))


def wma_weights(length: int) -> FloatArray:
    r"""Linear weights :math:`\frac{2(j+1)}{n(n+1)}`, oldest to newest (newest weighs most)."""
    j = np.arange(1, length + 1, dtype=np.float64)
    return j / j.sum()


def wma(x: FloatArray, length: int) -> FloatArray:
    r"""Linearly weighted MA :math:`\frac{\sum_{k=0}^{n-1}(n-k)\,x_{t-k}}{n(n+1)/2}`."""
    return fir(x, wma_weights(length))


def ema(x: FloatArray, length: int) -> FloatArray:
    r"""Exponential MA, :math:`\alpha = \frac{2}{n+1}`, SMA seed."""
    return ema_recursive(x, 2.0 / (length + 1.0), length)


def rma(x: FloatArray, length: int) -> FloatArray:
    r"""Wilder's smoothed MA (SMMA, Pine ``ta.rma``).

    An EMA with :math:`\alpha = \frac1n` and an SMA seed.
    """
    return ema_recursive(x, 1.0 / length, length)


def shift(y: FloatArray, offset: int) -> FloatArray:
    """Plot offset: move ``y`` ``offset`` bars to the right (later); vacated bars are ``NaN``.

    Values pushed past the last bar are dropped (TradingView draws them in the future area).
    Only ``offset >= 0`` exists here, so the value at bar t still uses bars <= t.
    """
    if offset < 0:
        raise ValueError("offset must be >= 0 (a negative offset would read future bars)")
    if offset == 0:
        return y
    out = nan_like(y)
    if offset < len(y):
        out[offset:] = y[: len(y) - offset]
    return out
