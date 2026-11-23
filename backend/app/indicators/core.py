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

import math
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


def adaptive_recursion(
    x: FloatArray, coefficient: FloatArray, start: int, seed: float
) -> FloatArray:
    r""":math:`y_t = y_{t-1} + c_t\,(x_t - y_{t-1})` from ``start`` on, with :math:`y_{start-1} =`
    ``seed`` (not output). Earlier outputs are ``NaN``."""
    out = nan_like(x)
    level = seed
    values = x[start:].tolist()
    rates = coefficient[start:].tolist()
    tail: list[float] = []
    for value, rate in zip(values, rates, strict=True):
        level += rate * (value - level)
        tail.append(level)
    out[start:] = tail
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
    seed_at = first_valid(x) + length - 1
    if seed_at >= len(x):
        return nan_like(x)
    seed = float(np.mean(x[seed_at - length + 1 : seed_at + 1]))
    out = adaptive_recursion(x, np.full(len(x), alpha), seed_at + 1, seed)
    out[seed_at] = seed
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


def lagged(x: FloatArray, d: int) -> FloatArray:
    """:math:`x_{t-d}` (``NaN`` for the first ``d`` bars); ``d >= 0``."""
    if d < 0:
        raise ValueError("lag must be >= 0")
    out = nan_like(x)
    if d < len(x):
        out[d:] = x[: len(x) - d]
    return out


def dema(x: FloatArray, length: int) -> FloatArray:
    r"""Double EMA :math:`2E - E(E)` (Mulloy): first moment cancelled, lag 0, warm-up
    :math:`2(n-1)`."""
    e1 = ema(x, length)
    return 2.0 * e1 - ema(e1, length)


def tema(x: FloatArray, length: int) -> FloatArray:
    r"""Triple EMA :math:`3E - 3E(E) + E(E(E))` (Mulloy): lag 0, warm-up :math:`3(n-1)`."""
    e1 = ema(x, length)
    e2 = ema(e1, length)
    return 3.0 * e1 - 3.0 * e2 + ema(e2, length)


def hma_lengths(length: int) -> tuple[int, int]:
    r""":math:`m = \lfloor n/2 \rfloor` and :math:`s = \lfloor\sqrt n\rfloor` (Pine casts the float
    ``length/2`` and ``sqrt(length)`` to int; assumption E2)."""
    return length // 2, math.isqrt(length)


HMA_MIN_LENGTH = 2


def hma(x: FloatArray, length: int) -> FloatArray:
    r"""Hull MA :math:`\mathrm{WMA}_s\left(2\,\mathrm{WMA}_m(x) - \mathrm{WMA}_n(x)\right)`;
    needs :math:`n \ge 2`. Warm-up :math:`n + s - 2`."""
    if length < HMA_MIN_LENGTH:
        raise ValueError(f"HMA needs length >= {HMA_MIN_LENGTH}")
    m, s = hma_lengths(length)
    return wma(2.0 * wma(x, m) - wma(x, length), s)


def linreg_weights(length: int, offset: int = 0) -> FloatArray:
    r"""FIR kernel of the least-squares line through the window, evaluated at position
    :math:`p = n-1-\text{offset}` (oldest bar = 0): with :math:`\bar j = \frac{n-1}{2}` and
    :math:`S = \sum_j (j-\bar j)^2 = \frac{n(n^2-1)}{12}`,
    :math:`w_j = \frac1n + \frac{(p-\bar j)(j-\bar j)}{S}` (Pine ``ta.linreg``)."""
    if length == 1:
        return np.ones(1)
    j = np.arange(length, dtype=np.float64)
    centre = (length - 1) / 2.0
    spread = float(np.sum((j - centre) ** 2))
    position = length - 1 - offset
    return 1.0 / length + (position - centre) * (j - centre) / spread


def lsma(x: FloatArray, length: int, offset: int = 0) -> FloatArray:
    r"""Least-squares MA (Pine ``ta.linreg``); ``offset = 0`` equals
    :math:`3\,\mathrm{WMA}_n - 2\,\mathrm{SMA}_n` (lag 0)."""
    return fir(x, linreg_weights(length, offset))


ALMA_DEFAULT_OFFSET = 0.85
ALMA_DEFAULT_SIGMA = 6.0


def alma_weights(
    length: int,
    offset: float = ALMA_DEFAULT_OFFSET,
    sigma: float = ALMA_DEFAULT_SIGMA,
    floor: bool = False,
) -> FloatArray:
    r"""Gaussian window :math:`w_j = e^{-(j-m)^2 / (2 s^2)}`, :math:`m = \text{offset}\,(n-1)`
    (floored if ``floor``), :math:`s = n/\sigma`, normalised; oldest to newest (Pine
    ``ta.alma``)."""
    centre = offset * (length - 1)
    if floor:
        centre = math.floor(centre)
    width = length / sigma
    j = np.arange(length, dtype=np.float64)
    w = np.exp(-((j - centre) ** 2) / (2.0 * width * width))
    return w / w.sum()


def alma(
    x: FloatArray,
    length: int,
    offset: float = ALMA_DEFAULT_OFFSET,
    sigma: float = ALMA_DEFAULT_SIGMA,
    floor: bool = False,
) -> FloatArray:
    """Arnaud Legoux MA: a Gaussian-weighted window shifted towards recent bars."""
    return fir(x, alma_weights(length, offset, sigma, floor))


SWMA_WEIGHTS = np.array([1.0, 2.0, 2.0, 1.0]) / 6.0


def swma(x: FloatArray) -> FloatArray:
    r"""Symmetrically weighted MA :math:`\frac{x_t + 2x_{t-1} + 2x_{t-2} + x_{t-3}}{6}` (Pine
    ``ta.swma``; fixed 4 taps, lag 1.5)."""
    return fir(x, SWMA_WEIGHTS)


def vwma(x: FloatArray, volume: FloatArray, length: int) -> FloatArray:
    r"""Volume-weighted MA :math:`\frac{\sum_{k<n} x_{t-k}V_{t-k}}{\sum_{k<n} V_{t-k}}`;
    ``NaN`` where the window's volume is 0 (indices and forex)."""
    ones = np.ones(length)
    weighted = fir(as_float(x) * as_float(volume), ones)
    total = fir(as_float(volume), ones)
    out = nan_like(weighted)
    ok = total > 0
    out[ok] = weighted[ok] / total[ok]
    return out


def _mcginley_divisor(length: int, value: float, level: float) -> float:
    r""":math:`n\,(x/M)^4` with IEEE semantics (Python raises on overflow; Pine gives inf, so the
    step is 0). A zero level gives 0, i.e. ``na``."""
    if level == 0.0:
        return 0.0
    try:
        return length * (value / level) ** 4
    except OverflowError:
        return math.inf


def mcginley(x: FloatArray, length: int) -> FloatArray:
    r"""McGinley Dynamic :math:`M_t = M_{t-1} + \frac{x_t - M_{t-1}}{n\,(x_t/M_{t-1})^4}`.

    Pine semantics (TradingView's built-in script): wherever :math:`M_{t-1}` is ``na`` the value
    is :math:`\mathrm{EMA}_n(x)_t`, so the first value is the EMA seed; a zero divisor gives ``na``
    and the next bar re-seeds from the EMA.

    One deliberate deviation: a drop of more than about half in one bar makes the step overshoot
    below zero, and Pine then oscillates through values like :math:`\pm 10^{200}` until the divisor
    underflows. Prices are positive, so a level :math:`\le 0` is replaced by
    :math:`\mathrm{EMA}_n(x)_t` on that bar (the same fallback Pine uses after ``na``, without the
    gap). Wherever Pine's level stays positive the values are identical.
    """
    x = as_float(x)
    seed = ema(x, length).tolist()
    values = x.tolist()
    out: list[float] = []
    level = math.nan
    for t, value in enumerate(values):
        if math.isnan(level):
            level = seed[t]
        else:
            divisor = _mcginley_divisor(length, value, level)
            level = level + (value - level) / divisor if divisor != 0.0 else math.nan
            if level <= 0.0:  # overshoot below zero: fall back to the EMA on this bar
                level = seed[t]
        out.append(level)
    return np.asarray(out, dtype=np.float64)


#: Kaufman's defaults for the fast and slow EMA lengths.
KAMA_FAST = 2
KAMA_SLOW = 30


def kama(x: FloatArray, length: int, fast: int = KAMA_FAST, slow: int = KAMA_SLOW) -> FloatArray:
    r"""Kaufman adaptive MA (TA-Lib semantics).

    Efficiency ratio :math:`ER_t = \frac{|x_t - x_{t-n}|}{\sum_{i=0}^{n-1}|x_{t-i} - x_{t-i-1}|}`
    (1 when the denominator is 0 or not larger than the numerator), smoothing
    :math:`c_t = \left(ER_t(f - s) + s\right)^2` with :math:`f=\frac{2}{F+1}`,
    :math:`s=\frac{2}{S+1}`, and :math:`K_t = K_{t-1} + c_t(x_t - K_{t-1})` seeded with
    :math:`K_{n-1} = x_{n-1}`. First value at bar :math:`n`.
    """
    x = as_float(x)
    out = nan_like(x)
    start = first_valid(x) + length
    if start >= len(x):
        return out
    change = np.abs(x - lagged(x, length))
    steps = np.abs(x - lagged(x, 1))
    noise = fir(steps, np.ones(length))
    with np.errstate(invalid="ignore", divide="ignore"):
        ratio = np.where((noise <= change) | (noise == 0.0), 1.0, change / noise)
    f, s = 2.0 / (fast + 1.0), 2.0 / (slow + 1.0)
    rate = (ratio * (f - s) + s) ** 2
    return adaptive_recursion(x, rate, start, float(x[start - 1]))


T3_DEFAULT_FACTOR = 0.7


def t3(x: FloatArray, length: int, factor: float = T3_DEFAULT_FACTOR) -> FloatArray:
    r"""Tillson T3 :math:`GD(GD(GD(x)))` with :math:`GD = (1+v)E - vE(E)`, expanded over six
    cascaded EMAs: :math:`c_1 e_6 + c_2 e_5 + c_3 e_4 + c_4 e_3` with :math:`c_1 = -v^3`,
    :math:`c_2 = 3v^2 + 3v^3`, :math:`c_3 = -6v^2 - 3v - 3v^3`, :math:`c_4 = 1 + 3v + v^3 + 3v^2`
    (TA-Lib). Warm-up :math:`6(n-1)`."""
    v = factor
    e: list[FloatArray] = []
    level = as_float(x)
    for _ in range(6):
        level = ema(level, length)
        e.append(level)
    c1 = -(v**3)
    c2 = 3 * v**2 + 3 * v**3
    c3 = -6 * v**2 - 3 * v - 3 * v**3
    c4 = 1 + 3 * v + v**3 + 3 * v**2
    return c1 * e[5] + c2 * e[4] + c3 * e[3] + c4 * e[2]


def zlema_lag(length: int) -> int:
    r""":math:`d = \lfloor (n-1)/2 \rfloor`."""
    return (length - 1) // 2


def zlema(x: FloatArray, length: int) -> FloatArray:
    r"""Zero-lag EMA (Ehlers & Way) :math:`\mathrm{EMA}_n(x_t + (x_t - x_{t-d}))`; warm-up
    :math:`n - 1 + d`."""
    x = as_float(x)
    return ema(2.0 * x - lagged(x, zlema_lag(length)), length)


def shift(y: FloatArray, offset: int) -> FloatArray:
    """Plot offset: move ``y`` ``offset`` bars to the right (later); vacated bars are ``NaN``.

    Values pushed past the last bar are dropped (TradingView draws them in the future area).
    Only ``offset >= 0`` exists here, so the value at bar t still uses bars <= t.
    """
    if offset < 0:
        raise ValueError("offset must be >= 0 (a negative offset would read future bars)")
    return y if offset == 0 else lagged(y, offset)


#: Window values processed per block by ``stdev`` (bounds its N x n temporaries to ~8 MB).
_STDEV_BLOCK = 1 << 20


def stdev(x: FloatArray, length: int) -> FloatArray:
    r"""Population standard deviation of each window (Pine ``ta.stdev``, ``biased = true``).

    .. math:: \mu_t = \frac1n\sum_{k=0}^{n-1} x_{t-k}, \qquad
       \sigma_t = \sqrt{\frac1n\sum_{k=0}^{n-1} (x_{t-k} - \mu_t)^2}

    Two passes per window (mean, then squared deviations), never :math:`E[x^2] - E[x]^2`, which
    cancels catastrophically when :math:`\sigma \ll |\mu|`. The first :math:`n-1` outputs are
    ``NaN``; a ``NaN`` anywhere in the window gives ``NaN``.
    """
    x = as_float(x)
    if length < 1:
        raise ValueError(f"length must be >= 1, got {length}")
    out = nan_like(x)
    if len(x) < length:
        return out
    windows = sliding_window_view(x, length)
    rows = max(1, _STDEV_BLOCK // length)
    for lo in range(0, len(windows), rows):
        block = windows[lo : lo + rows]
        deviation = block - block.mean(axis=1, keepdims=True)
        out[length - 1 + lo : length - 1 + lo + len(block)] = np.sqrt(
            (deviation * deviation).mean(axis=1)
        )
    return out


def highest(x: FloatArray, length: int) -> FloatArray:
    r""":math:`\max_{0 \le k < n} x_{t-k}` (Pine ``ta.highest``); first :math:`n-1` outputs
    ``NaN``."""
    x = as_float(x)
    out = nan_like(x)
    if len(x) >= length:
        out[length - 1 :] = sliding_window_view(x, length).max(axis=1)
    return out


def lowest(x: FloatArray, length: int) -> FloatArray:
    r""":math:`\min_{0 \le k < n} x_{t-k}` (Pine ``ta.lowest``); first :math:`n-1` outputs
    ``NaN``."""
    x = as_float(x)
    out = nan_like(x)
    if len(x) >= length:
        out[length - 1 :] = sliding_window_view(x, length).min(axis=1)
    return out


def true_range(high: FloatArray, low: FloatArray, close: FloatArray) -> FloatArray:
    r"""True range :math:`TR_t = \max(H_t - L_t,\ |H_t - C_{t-1}|,\ |L_t - C_{t-1}|)` with
    :math:`TR_0 = H_0 - L_0` (Pine ``ta.tr(true)``; TA-Lib's ``TRANGE`` leaves bar 0 empty)."""
    high, low, close = as_float(high), as_float(low), as_float(close)
    out = high - low
    if len(out) > 1:
        previous = close[:-1]
        out[1:] = np.maximum(
            out[1:], np.maximum(np.abs(high[1:] - previous), np.abs(low[1:] - previous))
        )
    return out
