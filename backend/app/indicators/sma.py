r"""Simple Moving Average.

.. math:: \mathrm{SMA}_t = \frac1n\sum_{k=0}^{n-1} x_{t-k}

Kernel :math:`h_k = \frac1n`; lag :math:`\frac{n-1}{2}` bars; noise reduction :math:`\frac1n`.
Warm-up: the first :math:`n-1` bars are ``NaN``. TradingView default: length 9, source close.
"""

from __future__ import annotations

from app.indicators.ma import ma_indicator

SPEC = ma_indicator(
    "sma",
    name="Simple Moving Average",
    default_length=9,
    color="#2962FF",
    description="Equal-weight average of the last n values.",
)
