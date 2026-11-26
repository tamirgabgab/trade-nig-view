"""The monthly series an apartment plan needs, from history or from assumptions.

Every series has one value per month date :math:`d_0, d_1, \\dots` (the purchase day moved by
whole months).

* **The anchor rate** (prime, variable tracks): the Bank of Israel rate on each date (the last
  one published on or before it; held at the last value beyond the data), or an assumed constant
  with an optional jump after some months.
* **The apartment's value index**: a CBS dwelling price index, interpolated geometrically
  between its monthly values (the plan must lie inside the index's dates), or an assumed path
  (``app.planner.home.assumed_values``).
"""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np

from app.macro.series import SERIES
from app.macro.service import MacroService
from app.models.bars import FloatArray, IntArray
from app.planner.deposits import add_months, day_number
from app.planner.market import PlanError

#: A monthly index is dated the 1st and describes its whole month.
MONTH_DAYS = 31


def month_days(start: date, months: int) -> IntArray:
    """Day numbers of :math:`d_0 .. d_{months}`."""
    return np.array([day_number(add_months(start, k)) for k in range(months + 1)], dtype=np.int64)


def _date(day: int) -> date:
    return date(1970, 1, 1) + timedelta(days=int(day))


def historical_anchor(macro: MacroService, days: IntArray) -> FloatArray:
    """The Bank of Israel rate (a fraction) on each day."""
    series = macro.get("boi_rate").data
    if days[0] < series.days[0]:
        raise PlanError(
            f"The Bank of Israel rate starts on {_date(series.days[0])}: start later, "
            "or assume a rate"
        )
    index = np.searchsorted(series.days, days, side="right") - 1
    return series.values[index] / 100.0


def assumed_anchor(months: int, base: float, shock: float = 0.0, after: int = 0) -> FloatArray:
    """A constant rate that moves by ``shock`` from month ``after`` on."""
    return base + np.where(np.arange(months + 1) >= after, shock, 0.0)


def historical_values(macro: MacroService, series_id: str, days: IntArray) -> FloatArray:
    """The dwelling price index on each day (geometric between its monthly values)."""
    if not series_id.startswith("dwelling") or series_id not in SERIES:
        raise PlanError(f"'{series_id}' is not a dwelling price index")
    series = macro.get(series_id).data
    first, last = int(series.days[0]), int(series.days[-1]) + MONTH_DAYS
    if days[0] < first or days[-1] > last:
        raise PlanError(
            f"The index '{series_id}' covers {_date(first)} to {_date(last)}: "
            "move the purchase or the sale inside it, or assume the appreciation"
        )
    return np.exp(np.interp(days, series.days, np.log(series.values)))
