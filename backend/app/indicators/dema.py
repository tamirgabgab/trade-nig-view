r"""Double Exponential Moving Average (Mulloy, 1994).

.. math:: \mathrm{DEMA} = 2E - E(E), \qquad E = \mathrm{EMA}_n

The first moment of the kernel cancels, so a straight line is tracked with zero lag; the price is
negative kernel weights (overshoot at turns) and NRF 0.254 at n = 9 versus 0.111 for the EMA.
Warm-up :math:`2(n-1)` (each EMA is SMA-seeded on its first n valid inputs; identical to TA-Lib).
TradingView default: length 9, source close.
"""

from __future__ import annotations

from app.indicators.ma import ma_indicator

SPEC = ma_indicator(
    "dema",
    name="Double EMA",
    default_length=9,
    color="#26A69A",
    description="2*EMA - EMA(EMA): an EMA with its lag cancelled on trends.",
)
