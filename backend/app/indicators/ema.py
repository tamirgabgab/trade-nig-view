r"""Exponential Moving Average.

.. math:: E_t = \alpha x_t + (1-\alpha) E_{t-1}, \qquad \alpha = \frac{2}{n+1}

Seed :math:`E_{n-1} = \mathrm{SMA}_n` (TA-Lib convention; see the seeding note in
docs/TRADINGVIEW_RESEARCH.md section 5). Kernel :math:`h_k = \alpha(1-\alpha)^k`; same lag
(:math:`\frac{n-1}{2}`) and noise reduction (:math:`\frac1n`) as an n-bar SMA.
TradingView default: length 9, source close.
"""

from __future__ import annotations

from app.indicators.ma import ma_indicator

SPEC = ma_indicator(
    "ema",
    name="Exponential Moving Average",
    default_length=9,
    color="#FF6D00",
    description="Recursive average with weights decaying by 1 - 2/(n+1) per bar.",
)
