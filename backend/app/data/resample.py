"""Resample daily bars to weekly or monthly bars.

Input must be validated (sorted, unique). Bars are grouped by calendar period of their session
date; each group of daily bars :math:`t = s..e` becomes one bar:

.. math::
    O = O_s,\\quad H = \\max_{s \\le t \\le e} H_t,\\quad L = \\min_{s \\le t \\le e} L_t,\\quad
    C = C_e,\\quad V = \\sum_{t=s}^{e} V_t

The output bar is keyed by the **first trading day** in the period (not the calendar start), which
matches how TradingView labels weekly/monthly bars. Weeks start on Monday (ISO weeks).

Partial periods (the current week, or a week cut by a replay cursor) are emitted as-is: only the
bars that exist are aggregated, so resampling never looks ahead.

Intraday: ``4h`` bars aggregate ``1h`` bars with the same rule, grouped by trading session and
by 4-hour block **counted from the session's first bar** (``app.data.sessions``). A US stock
therefore gets 09:30-13:30 and 13:30-16:00 bars, as on TradingView, and a CME future opening at
18:00 gets 18:00, 22:00, 02:00, ... A block is keyed by its first bar's start time.
"""

from __future__ import annotations

import numpy as np

from app.data.sessions import session_first_index
from app.models.bars import SECONDS_PER_DAY, BarFrame, IntArray, Interval

SECONDS_PER_HOUR = 3600

# 1970-01-01 was a Thursday, so day-number + 3 aligns integer division by 7 to Mondays.
_MONDAY_OFFSET_DAYS = 3


def period_keys(times: IntArray, interval: Interval) -> IntArray:
    """Integer period id per bar: equal ids belong to the same week / month."""
    days = times // SECONDS_PER_DAY
    if interval is Interval.W1:
        return (days + _MONDAY_OFFSET_DAYS) // 7
    if interval is Interval.M1:
        return days.astype("datetime64[D]").astype("datetime64[M]").astype(np.int64)
    raise ValueError(f"No period grouping for interval {interval}")


def resample(frame: BarFrame, interval: Interval) -> BarFrame:
    """Aggregate daily bars into ``interval`` bars (identity for ``1D``)."""
    if interval is Interval.D1 or len(frame) == 0:
        return frame
    return aggregate(frame, period_keys(frame.time, interval))


def intraday_block_keys(times: IntArray, sessions: IntArray, hours: int) -> IntArray:
    """Group id per ``1h`` bar for ``hours``-hour bars: (session, block since session start)."""
    first = session_first_index(sessions)
    block = (times - times[first]) // (hours * SECONDS_PER_HOUR)
    # Sessions are increasing and blocks per session are < 24, so this pairing is unique.
    return sessions * 32 + block


def resample_intraday(frame: BarFrame, sessions: IntArray, interval: Interval) -> BarFrame:
    """Aggregate ``1h`` bars into ``interval`` bars (identity for ``1h``)."""
    if interval is Interval.H1 or len(frame) == 0:
        return frame
    if interval is not Interval.H4:
        raise ValueError(f"No intraday grouping for interval {interval}")
    return aggregate(frame, intraday_block_keys(frame.time, sessions, 4))


def aggregate(frame: BarFrame, keys: IntArray) -> BarFrame:
    """One bar per run of equal consecutive ``keys`` (O first, H max, L min, C last, V sum)."""
    starts = np.flatnonzero(np.concatenate(([True], keys[1:] != keys[:-1])))
    ends = np.concatenate((starts[1:], [len(frame)])) - 1

    return BarFrame(
        time=frame.time[starts],
        open=frame.open[starts],
        high=np.maximum.reduceat(frame.high, starts),
        low=np.minimum.reduceat(frame.low, starts),
        close=frame.close[ends],
        adj_close=frame.adj_close[ends],
        volume=np.add.reduceat(frame.volume, starts),
    )
