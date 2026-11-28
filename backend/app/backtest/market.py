"""What a profile adds to the bars for the engine: the trade cap's period, the Day session close.

* **Period** of each bar, in the exchange's calendar: its (session) day, ISO week, month or year.
* **Session end** (Day profile only): a bar that ends at or after the cash session's close
  (``SymbolInfo.cash_hours``, ``friday_hours`` on Fridays, else US 09:30-16:00) is the session's
  last: the engine is flat at its close. A signal on a bar that ends within
  ``no_entry_last_minutes`` of the close opens nothing (it would fill that late). Early-close days
  (no holiday calendar) are not known in advance: a position still held when a new session starts
  is closed at that session's first open (``session_open``). Markets without a cash session
  (futures, forex: a ``session_start``) have no session end.
"""

from __future__ import annotations

from datetime import date

import numpy as np

from app.data.resample import period_keys
from app.data.sessions import local_wall_seconds
from app.indicators.catalog import get_spec
from app.models.bars import SECONDS_PER_DAY, BarFrame, Interval, date_to_ts
from app.models.symbols import SymbolInfo, parse_session_start

from .engine import BoolArray, Market
from .profiles import TraderProfile
from .signals import bar_days

US_CASH_HOURS = "09:30-16:00"
FRIDAY = 4  # Monday = 0
YEAR_SECONDS = 365.25 * SECONDS_PER_DAY


def first_bar(frame: BarFrame, interval: Interval, day: date) -> int:
    """Index of the first bar of ``day``'s session or later (a start date is a session date)."""
    return int(np.searchsorted(bar_days(frame, interval), date_to_ts(day) // SECONDS_PER_DAY))


def cap_periods(frame: BarFrame, interval: Interval, period: str) -> np.ndarray:
    """Integer key of each bar's period (equal keys: the same day, week, month or year)."""
    days = bar_days(frame, interval)
    if period == "day":
        return days
    if period == "week":
        return period_keys(days * SECONDS_PER_DAY, Interval.W1)
    months = period_keys(days * SECONDS_PER_DAY, Interval.M1)
    return months if period == "month" else months // 12


def session_flags(
    frame: BarFrame, interval: Interval, info: SymbolInfo, no_entry_minutes: int
) -> tuple[BoolArray, BoolArray, BoolArray]:
    """(session end, no entry, session open) per bar; all false for daily bars and 24-hour
    markets."""
    none = np.zeros(len(frame), dtype=np.bool_)
    if not interval.is_intraday or info.session_start is not None or frame.session is None:
        return none, none.copy(), none.copy()
    local = local_wall_seconds(frame.time, info.timezone)
    days = local // SECONDS_PER_DAY
    friday = (days + 3) % 7 == FRIDAY  # 1970-01-01 was a Thursday

    def close_minute(hours: str | None) -> int:
        return parse_session_start((hours or US_CASH_HOURS).partition("-")[2])

    regular = close_minute(info.cash_hours)
    closes = np.where(
        friday & (info.friday_hours is not None), close_minute(info.friday_hours), regular
    )
    ends = (local % SECONDS_PER_DAY + interval.seconds) / 60  # minutes after local midnight
    first = np.concatenate(([False], frame.session[1:] != frame.session[:-1]))
    return ends >= closes, ends >= closes - no_entry_minutes, first


def build_market(
    frame: BarFrame,
    interval: Interval,
    profile: TraderProfile,
    info: SymbolInfo,
    atr_length: int,
    start: int,
) -> Market:
    """The engine's view of ``frame`` for ``profile`` (bars a year over the bars from ``start``)."""
    end, no_entry, first = (
        session_flags(frame, interval, info, profile.no_entry_last_minutes)
        if not profile.overnight
        else (np.zeros(len(frame), dtype=np.bool_),) * 3
    )
    years = float(frame.time[-1] - frame.time[start]) / YEAR_SECONDS if len(frame) else 0.0
    return Market(
        frame=frame,
        atr=get_spec("atr").run(frame, {"length": atr_length})["atr"],
        period=cap_periods(frame, interval, profile.cap_period),
        session_end=end,
        no_entry=no_entry,
        session_open=first,
        bars_per_year=(len(frame) - start - 1) / years if years > 0 else float("nan"),
    )
