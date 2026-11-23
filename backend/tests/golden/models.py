r"""Golden models: independent scalar-loop implementations of the Pine semantics.

Written for clarity, not speed, and deliberately sharing no code with ``app.indicators``: a bug in
the vectorised code cannot hide in a shared helper. Each follows docs/TRADINGVIEW_RESEARCH.md
section 5 literally (``NaN`` = Pine ``na``).
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence

NAN = math.nan


def golden_sma(x: Sequence[float], n: int) -> list[float]:
    out: list[float] = []
    for t in range(len(x)):
        if t < n - 1:
            out.append(NAN)
            continue
        total = 0.0
        for k in range(n):
            total += x[t - k]
        out.append(total / n)
    return out


def golden_wma(x: Sequence[float], n: int) -> list[float]:
    denominator = n * (n + 1) / 2
    out: list[float] = []
    for t in range(len(x)):
        if t < n - 1:
            out.append(NAN)
            continue
        total = 0.0
        for k in range(n):
            total += (n - k) * x[t - k]
        out.append(total / denominator)
    return out


def _seeded_recursion(x: Sequence[float], n: int, alpha: float) -> list[float]:
    """y = SMA of the first n inputs at bar n-1, then y += alpha * (x - y)."""
    out: list[float] = []
    previous = NAN
    for t in range(len(x)):
        if t < n - 1:
            out.append(NAN)
        elif t == n - 1:
            previous = sum(x[:n]) / n
            out.append(previous)
        else:
            previous = alpha * x[t] + (1 - alpha) * previous
            out.append(previous)
    return out


def golden_ema(x: Sequence[float], n: int) -> list[float]:
    return _seeded_recursion(x, n, 2 / (n + 1))


def golden_rma(x: Sequence[float], n: int) -> list[float]:
    return _seeded_recursion(x, n, 1 / n)


def golden_source(
    name: str,
    o: Sequence[float],
    h: Sequence[float],
    lo: Sequence[float],
    c: Sequence[float],
) -> list[float]:
    formulas: dict[str, Callable[[int], float]] = {
        "close": lambda i: c[i],
        "open": lambda i: o[i],
        "high": lambda i: h[i],
        "low": lambda i: lo[i],
        "hl2": lambda i: (h[i] + lo[i]) / 2,
        "hlc3": lambda i: (h[i] + lo[i] + c[i]) / 3,
        "ohlc4": lambda i: (o[i] + h[i] + lo[i] + c[i]) / 4,
        "hlcc4": lambda i: (h[i] + lo[i] + 2 * c[i]) / 4,
    }
    return [formulas[name](i) for i in range(len(c))]


def golden_shift(y: Sequence[float], offset: int) -> list[float]:
    return [NAN] * min(offset, len(y)) + list(y[: max(len(y) - offset, 0)])


GOLDEN_MA = {
    "sma": golden_sma,
    "ema": golden_ema,
    "wma": golden_wma,
    "smma": golden_rma,
}
