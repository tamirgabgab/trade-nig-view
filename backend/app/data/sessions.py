"""Trading sessions of intraday bars.

Every intraday bar belongs to one **trading session**, identified by its session date (the same
date the provider uses for that session's daily bar). Let :math:`w_t` be the wall-clock time of
bar :math:`t` in the symbol's exchange time zone and :math:`s` the session start (minutes after
local midnight, ``SymbolInfo.session_start``). Then

.. math::
    \\mathrm{session}_t =
    \\begin{cases}
      \\mathrm{date}(w_t) & \\text{no session start (session within one calendar day)} \\\\
      \\mathrm{date}(w_t + 24\\,\\mathrm{h} - s) & \\text{session starts at } s
    \\end{cases}

so a CME futures bar at 18:00 New York (``session_start = "18:00"``) belongs to the **next**
calendar day's session, exactly like the daily bar Yahoo labels with that trade date. Stocks,
ETFs and cash indices trade inside one calendar day and have no session start.

The session date drives 4-hour bars (anchored to the session's first bar), dividend adjustment
of intraday bars (factor of that session's daily bar) and date filters (``start``/``end``/
``until`` select whole sessions).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.models.bars import SECONDS_PER_DAY, FloatArray, IntArray
from app.models.symbols import MINUTES_PER_DAY


def local_wall_seconds(times: IntArray, timezone: str) -> IntArray:
    """UTC epoch seconds -> wall-clock seconds in ``timezone`` (as if that clock were UTC)."""
    if len(times) == 0:
        return np.empty(0, dtype=np.int64)
    utc = pd.DatetimeIndex(pd.to_datetime(times, unit="s", utc=True))
    local = utc.tz_convert(timezone).tz_localize(None)
    return local.as_unit("s").asi8.astype(np.int64)


def session_days(times: IntArray, timezone: str, session_start: int | None = None) -> IntArray:
    """Session date of each intraday bar as a day number (``date_to_ts(day) // 86400``)."""
    wall = local_wall_seconds(times, timezone)
    shift = 0 if session_start is None else (MINUTES_PER_DAY - session_start) * 60
    return (wall + shift) // SECONDS_PER_DAY


def session_offsets(times: IntArray, timezone: str, session_start: int | None = None) -> IntArray:
    """Seconds of each intraday bar since the start of its session's day (local midnight, or
    the session start for sessions that span midnight): 09:30 New York is 34,200."""
    wall = local_wall_seconds(times, timezone)
    shift = 0 if session_start is None else (MINUTES_PER_DAY - session_start) * 60
    return (wall + shift) % SECONDS_PER_DAY


def session_first_index(days: IntArray) -> IntArray:
    """For each bar, the index of the first bar of its session (bars sorted by time)."""
    n = len(days)
    if n == 0:
        return np.empty(0, dtype=np.int64)
    new_session = np.concatenate(([True], days[1:] != days[:-1]))
    return np.maximum.accumulate(np.where(new_session, np.arange(n), 0)).astype(np.int64)


def daily_factor_per_session(
    days: IntArray, daily_time: IntArray, daily_factor: FloatArray
) -> FloatArray:
    """Dividend factor of each intraday bar: the factor of its session's daily bar.

    A session without its own daily bar (today's session before the daily refresh, or a gap) uses
    the nearest earlier daily bar; sessions before the first daily bar use the first factor.
    Without daily bars every factor is 1.
    """
    if len(daily_time) == 0:
        return np.ones(len(days), dtype=np.float64)
    daily_days = daily_time // SECONDS_PER_DAY
    pos = np.searchsorted(daily_days, days, side="right") - 1
    return daily_factor[np.clip(pos, 0, len(daily_factor) - 1)]
