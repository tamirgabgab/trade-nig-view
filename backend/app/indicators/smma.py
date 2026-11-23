r"""Smoothed Moving Average (SMMA, Wilder's RMA, Pine ``ta.rma``).

.. math:: R_t = R_{t-1} + \frac{x_t - R_{t-1}}{n}, \qquad R_{n-1} = \mathrm{SMA}_n

An EMA with :math:`\alpha = \frac1n`, i.e. :math:`\mathrm{RMA}_n \equiv \mathrm{EMA}_{2n-1}` after
the seed. Lag :math:`n-1` bars; noise reduction :math:`\frac{1}{2n-1}`.
TradingView default: length 7, source close.
"""

from __future__ import annotations

from app.indicators.ma import ma_indicator

SPEC = ma_indicator(
    "smma",
    name="Smoothed Moving Average",
    default_length=7,
    color="#AB47BC",
    description="Wilder's smoothing (RMA): an EMA with alpha = 1/n, used inside RSI and ATR.",
)
