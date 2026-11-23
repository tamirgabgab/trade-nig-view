r"""Hull Moving Average (Alan Hull, 2005).

.. math:: \mathrm{HMA} = \mathrm{WMA}_s\!\left(2\,\mathrm{WMA}_m(x) - \mathrm{WMA}_n(x)\right),
   \quad m = \lfloor n/2 \rfloor,\ s = \lfloor \sqrt n \rfloor

Lag :math:`\frac{s + 2m - n - 2}{3}` (0 at n = 9), NRF 0.442 at n = 9. Needs n >= 2. Warm-up
:math:`n + s - 2`. Pine passes ``length/2`` and ``sqrt(length)`` as floats to ``ta.wma``; flooring
is our assumption (E2), checked in the TradingView cross-check.
TradingView default: length 9, source close.
"""

from __future__ import annotations

from app.indicators.ma import ma_indicator

SPEC = ma_indicator(
    "hma",
    name="Hull Moving Average",
    default_length=9,
    color="#FFCA28",
    description="WMA of 2*WMA(n/2) - WMA(n), smoothed over √n bars: fast and smooth.",
)
