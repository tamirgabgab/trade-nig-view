"""Dividend adjustment (the ``ADJ`` toggle).

Providers deliver split-adjusted OHLC plus a split-and-dividend adjusted close. The dividend factor
of bar ``t`` is

.. math:: f_t = \\frac{\\mathrm{adj\\_close}_t}{\\mathrm{close}_t}

and the adjusted bar is :math:`(f_t O_t, f_t H_t, f_t L_t, \\mathrm{adj\\_close}_t)`. Volume is not
changed (it is already split-adjusted and dividends do not change share counts).

Note: ``adj_close`` embeds dividends paid *after* bar ``t`` (that is what makes the series
continuous), so adjusted history is a function of the download date. Replay (R7) must account for
this; unadjusted prices have no such dependency.
"""

from __future__ import annotations

from app.models.bars import BarFrame


def dividend_adjust(frame: BarFrame) -> BarFrame:
    """Scale open/high/low by the per-bar dividend factor and use ``adj_close`` as close."""
    factor = frame.adj_close / frame.close
    return BarFrame(
        time=frame.time,
        open=frame.open * factor,
        high=frame.high * factor,
        low=frame.low * factor,
        close=frame.adj_close.copy(),
        adj_close=frame.adj_close,
        volume=frame.volume,
    )
