r"""Triple Exponential Moving Average (Mulloy, 1994).

.. math:: \mathrm{TEMA} = 3E - 3E(E) + E(E(E)), \qquad E = \mathrm{EMA}_n

Zero lag on straight lines, NRF 0.382 at n = 9. Warm-up :math:`3(n-1)` (identical to TA-Lib).
TradingView default: length 9, source close.
"""

from __future__ import annotations

from app.indicators.ma import ma_indicator

SPEC = ma_indicator(
    "tema",
    name="Triple EMA",
    default_length=9,
    color="#EC407A",
    description="3*E - 3*E(E) + E(E(E)): lag-free on trends, noisier than DEMA.",
)
