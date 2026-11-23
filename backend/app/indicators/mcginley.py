r"""McGinley Dynamic (John McGinley, 1990).

.. math:: M_t = M_{t-1} + \frac{x_t - M_{t-1}}{n\,(x_t / M_{t-1})^4},
   \qquad M_{n-1} = \mathrm{EMA}_n

An EMA whose speed adapts to the distance from price: the 4th power slows it when price runs away
above it and speeds it up below. Seed = the first EMA value (TradingView's built-in script).
A zero divisor gives ``na`` and the next bar re-seeds from the EMA, as in Pine. A level <= 0
(after a one-bar drop of more than about half, where Pine oscillates to +-1e200) is replaced
by the EMA on that bar.
Warm-up :math:`n-1`. TradingView default: length 14, source close.
"""

from __future__ import annotations

from app.indicators.ma import ma_indicator

SPEC = ma_indicator(
    "mcginley",
    name="McGinley Dynamic",
    default_length=14,
    color="#FFA726",
    description="Self-adjusting average that tracks price more closely in fast markets.",
)
