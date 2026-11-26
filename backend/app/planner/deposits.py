"""Deposit schedules: one-off deposits and recurring ones, as a sorted list.

A recurring deposit of ``amount`` starts on ``start`` and repeats every ``every_months`` months,
``count`` times, on the start's day of the month (the month's last day when it is shorter). With
``indexed``, the amount is raised once a year by the planner's CPI:
:math:`a_k = a_0 \\cdot \\text{CPI}(d_{12 \\lfloor k'/12 \\rfloor}) / \\text{CPI}(d_0)`, where
:math:`k'` counts months since the start.
"""

from __future__ import annotations

import calendar
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, time

from app.planner.inflation import CpiPath

EPOCH = date(1970, 1, 1)


def day_number(day: date) -> int:
    return (day - EPOCH).days


@dataclass(frozen=True, slots=True)
class Deposit:
    day: date
    amount: float
    #: Local time of the purchase when known (else the fill model decides).
    at: time | None = None


@dataclass(frozen=True, slots=True)
class Recurring:
    start: date
    amount: float
    every_months: int = 1
    count: int = 12
    indexed: bool = False
    at: time | None = None


def add_months(day: date, months: int) -> date:
    """``day`` moved by ``months`` calendar months (clamped to the month's last day)."""
    index = day.year * 12 + day.month - 1 + months
    year, month = divmod(index, 12)
    return date(year, month + 1, min(day.day, calendar.monthrange(year, month + 1)[1]))


def expand(
    one_off: Sequence[Deposit], recurring: Sequence[Recurring], cpi: CpiPath | None = None
) -> list[Deposit]:
    """Every deposit, sorted by date (stable: one-off deposits first on equal dates)."""
    out = list(one_off)
    for plan in recurring:
        for k in range(plan.count):
            months = k * plan.every_months
            amount = plan.amount
            if plan.indexed and cpi is not None:
                anniversary = add_months(plan.start, months - months % 12)
                amount *= float(cpi.at(day_number(anniversary)) / cpi.at(day_number(plan.start)))
            out.append(Deposit(add_months(plan.start, months), amount, plan.at))
    return sorted(out, key=lambda d: d.day)
