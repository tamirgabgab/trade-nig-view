r"""Weighted (linearly) Moving Average.

.. math:: \mathrm{WMA}_t = \frac{\sum_{k=0}^{n-1}(n-k)\,x_{t-k}}{n(n+1)/2}

Kernel :math:`h_k = \frac{2(n-k)}{n(n+1)}`; lag :math:`\frac{n-1}{3}` bars.
Warm-up: the first :math:`n-1` bars are ``NaN``. TradingView default: length 9, source close.
"""

from __future__ import annotations

from app.indicators.ma import ma_indicator

SPEC = ma_indicator(
    "wma",
    name="Weighted Moving Average",
    default_length=9,
    color="#00BCD4",
    description="Linearly weighted average: the newest value weighs n, the oldest 1.",
)
