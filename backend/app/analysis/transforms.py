"""Chart-type transforms that rebuild the OHLC bars themselves (served by ``/api/bars``).

Heikin Ashi ("average bar") smooths candles so trends read as runs of one colour:

.. math::

    C^{HA}_t &= \\frac{O_t + H_t + L_t + C_t}{4} \\\\
    O^{HA}_0 &= \\frac{O_0 + C_0}{2}, \\qquad
    O^{HA}_t = \\frac{O^{HA}_{t-1} + C^{HA}_{t-1}}{2} \\\\
    H^{HA}_t &= \\max(H_t, O^{HA}_t, C^{HA}_t), \\qquad
    L^{HA}_t = \\min(L_t, O^{HA}_t, C^{HA}_t)

``O^{HA}`` is a recursion (an EMA with :math:`\\alpha = 1/2` of the previous HA close), so the
result depends on where the series starts. The API therefore applies the transform to the whole
available history **before** windowing: a page loaded later (``before=``) carries exactly the
values a full-history computation gives. Volume and time pass through unchanged; the value at
bar ``t`` uses only bars ``<= t``.
"""

from __future__ import annotations

from enum import StrEnum

import numpy as np

from app.models.bars import BarFrame


class Transform(StrEnum):
    """Bar transforms selectable with ``/api/bars?transform=``."""

    NONE = "none"
    HEIKIN_ASHI = "heikin_ashi"


def heikin_ashi(frame: BarFrame) -> BarFrame:
    """Heikin Ashi bars of ``frame`` (same length and times; ``adj_close`` follows the HA close)."""
    n = len(frame)
    if n == 0:
        return frame
    ha_close = (frame.open + frame.high + frame.low + frame.close) / 4.0
    ha_open = np.empty(n, dtype=np.float64)
    ha_open[0] = (frame.open[0] + frame.close[0]) / 2.0
    # Scalar recursion: ~1 ms for 10k bars, and exactly the textbook definition.
    for t in range(1, n):
        ha_open[t] = (ha_open[t - 1] + ha_close[t - 1]) / 2.0
    ha_high = np.maximum(frame.high, np.maximum(ha_open, ha_close))
    ha_low = np.minimum(frame.low, np.minimum(ha_open, ha_close))
    return BarFrame(
        time=frame.time,
        open=ha_open,
        high=ha_high,
        low=ha_low,
        close=ha_close,
        adj_close=ha_close.copy(),
        volume=frame.volume,
    )


def apply_transform(frame: BarFrame, transform: Transform) -> BarFrame:
    """Apply ``transform`` to ``frame`` (identity for :attr:`Transform.NONE`)."""
    if transform is Transform.HEIKIN_ASHI:
        return heikin_ashi(frame)
    return frame
