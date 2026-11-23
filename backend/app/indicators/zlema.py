r"""Zero-Lag Exponential Moving Average (Ehlers & Way, 2010).

.. math:: \mathrm{ZLEMA} = \mathrm{EMA}_n\!\left(x_t + (x_t - x_{t-d})\right),
   \qquad d = \left\lfloor \tfrac{n-1}{2} \right\rfloor

Feeding the EMA a de-lagged input removes its lag :math:`\frac{n-1}{2}` up to the rounding of
:math:`d`. Not a TradingView built-in (included for the filter comparison, decision D4).
Warm-up :math:`n - 1 + d`.
"""

from __future__ import annotations

from app.indicators.ma import ma_indicator

SPEC = ma_indicator(
    "zlema",
    name="Zero-Lag EMA",
    default_length=20,
    color="#D4E157",
    description="EMA of a de-lagged price (2*x - x lagged by (n-1)/2).",
)
