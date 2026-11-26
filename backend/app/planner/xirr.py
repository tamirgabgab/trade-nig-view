"""XIRR: the money-weighted yearly return of dated cash flows.

The rate :math:`r` that solves

.. math::
    \\sum_k c_k\\,(1 + r)^{-(d_k - d_0)/365.25} = 0

for cash flows :math:`c_k` (deposits negative, the final value positive) on days :math:`d_k`.
With many deposits a CAGR of "final value over total deposited" is wrong: it ignores when the
money went in. Solved by bisection on :math:`(-0.9999, 100)`; ``None`` when the flows do not
change sign (no root).
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

DAYS_PER_YEAR = 365.25
LOW, HIGH = -0.9999, 100.0


def xirr(days: Sequence[float] | np.ndarray, flows: Sequence[float] | np.ndarray) -> float | None:
    d = np.asarray(days, dtype=np.float64)
    c = np.asarray(flows, dtype=np.float64)
    if len(c) == 0 or not (np.any(c > 0) and np.any(c < 0)):
        return None
    years = (d - d.min()) / DAYS_PER_YEAR

    def npv(rate: float) -> float:
        return float(np.sum(c * (1.0 + rate) ** -years))

    lo, hi = LOW, HIGH
    f_lo, f_hi = npv(lo), npv(hi)
    if f_lo * f_hi > 0:
        return None
    for _ in range(200):
        mid = (lo + hi) / 2.0
        f_mid = npv(mid)
        if f_lo * f_mid <= 0:
            hi = mid
        else:
            lo, f_lo = mid, f_mid
        if hi - lo < 1e-12:  # noqa: PLR2004
            break
    return (lo + hi) / 2.0
