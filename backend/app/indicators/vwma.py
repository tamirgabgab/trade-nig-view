r"""Volume Weighted Moving Average.

.. math:: \mathrm{VWMA}_t = \frac{\sum_{k<n} x_{t-k} V_{t-k}}{\sum_{k<n} V_{t-k}}

Weights are the volumes, so the filter is data-dependent (not time-invariant). ``NaN`` where the
window has no volume (indices, forex). Warm-up :math:`n-1`.
TradingView default: length 20, source close.
"""

from __future__ import annotations

from app.indicators.ma import ma_indicator

SPEC = ma_indicator(
    "vwma",
    name="Volume Weighted Moving Average",
    default_length=20,
    color="#66BB6A",
    description="Average price weighted by volume: heavy-volume bars count more.",
)
