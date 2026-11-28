"""The four trader profiles (``docs/PHASE4_PLAN.md``): how often the trader acts.

A profile fixes the decision interval (the bars rules are evaluated on), the longer context
intervals a rule may read, the calendar period the trade cap counts over, overnight holding (with
the Day's no-entry minutes before the close), and the window H of the reversal decision (B1).
The cap itself (``default_max_trades``) is only a default: every strategy can change it, and the
B4/B7 sweeps tune it like any other parameter (the user, 2026-11-28). What tells the profiles apart
is the period it counts over: a day, an ISO week, a month or a year.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field

from app.models.bars import Interval

CapPeriod = Literal["day", "week", "month", "year"]


class ProfileId(StrEnum):
    DAY = "day"
    SWING = "swing"
    POSITION = "position"
    LONG_TERM = "long_term"


class TraderProfile(BaseModel):
    id: ProfileId
    label: str
    description: str
    decision_intervals: list[Interval] = Field(description="The first one is the default")
    context_intervals: list[Interval] = Field(
        description="Longer intervals a rule may read; a value arrives once its bar has closed"
    )
    cap_period: CapPeriod = Field(description="Calendar period the trade cap counts over")
    default_max_trades: int = Field(description="Default trade cap per period (a parameter)")
    overnight: bool = Field(description="False: flat at the session close (Day)")
    no_entry_last_minutes: int = Field(description="No new entry this close to the session close")
    reversal_window: int = Field(
        description="H: decision bars after an opposite entry over which reversing, closing and "
        "holding are scored (the profile's long horizon)"
    )

    def context_for(self, decision: Interval) -> list[Interval]:
        """The context intervals longer than ``decision``."""
        return [c for c in self.context_intervals if _rank(c) > _rank(decision)]


_DAYS = {Interval.D1: 1, Interval.W1: 7, Interval.M1: 31}


def _rank(interval: Interval) -> int:
    """The bar's length in seconds (a month as 31 days): orders intervals by length."""
    return interval.seconds if interval.is_intraday else _DAYS[interval] * 86_400


PROFILES: dict[ProfileId, TraderProfile] = {
    p.id: p
    for p in (
        TraderProfile(
            id=ProfileId.DAY,
            label="Day",
            description="In and out within the session: minutes to hours, flat at the close.",
            decision_intervals=[Interval.MIN5, Interval.MIN15],
            context_intervals=[Interval.H1, Interval.D1],
            cap_period="day",
            default_max_trades=10,
            overnight=False,
            no_entry_last_minutes=15,
            reversal_window=12,
        ),
        TraderProfile(
            id=ProfileId.SWING,
            label="Swing",
            description="Hours to about ten days, decided on hourly bars.",
            decision_intervals=[Interval.H1],
            context_intervals=[Interval.D1],
            cap_period="week",
            default_max_trades=10,
            overnight=True,
            no_entry_last_minutes=0,
            reversal_window=70,
        ),
        TraderProfile(
            id=ProfileId.POSITION,
            label="Position",
            description="Days to weeks, decided on daily bars with the weekly trend as context.",
            decision_intervals=[Interval.D1],
            context_intervals=[Interval.W1],
            cap_period="month",
            default_max_trades=10,
            overnight=True,
            no_entry_last_minutes=0,
            reversal_window=20,
        ),
        TraderProfile(
            id=ProfileId.LONG_TERM,
            label="Long-term",
            description="Weeks to months, decided on weekly (or monthly) bars.",
            decision_intervals=[Interval.W1, Interval.M1],
            context_intervals=[Interval.M1],
            cap_period="year",
            default_max_trades=12,
            overnight=True,
            no_entry_last_minutes=0,
            reversal_window=12,
        ),
    )
}
