"""The monthly series an apartment plan needs, from history or from assumptions.

Every series has one value per month date :math:`d_0, d_1, \\dots` (the purchase day moved by
whole months).

* **The anchor rate** (prime, variable tracks): the Bank of Israel rate on each date (the last
  one published on or before it; held at the last value beyond the data), or an assumed constant
  with an optional jump after some months.
* **The apartment's value index**: a CBS dwelling price index, interpolated geometrically
  between its monthly values (the plan must lie inside the index's dates), or an assumed path
  (``app.planner.home.assumed_values``).
* **The rent index**: the CPI, the apartment's value, or a fixed yearly rise.

Past its last published value a series is held flat: a warning for one plan, and a refusal
(``strict``) for a window of history, whose point is that the data is real.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

import numpy as np

from app.macro.series import SERIES
from app.models.bars import FloatArray, IntArray
from app.planner.data import Macro
from app.planner.deposits import add_months, day_number
from app.planner.home import HomePlan, HomeSeries, assumed_values
from app.planner.inflation import CpiPath
from app.planner.market import PlanError
from app.planner.mortgage import RateKind

#: A monthly index is dated the 1st and describes its whole month.
MONTH_DAYS = 31


def month_days(start: date, months: int) -> IntArray:
    """Day numbers of :math:`d_0 .. d_{months}`."""
    return np.array([day_number(add_months(start, k)) for k in range(months + 1)], dtype=np.int64)


def _date(day: int) -> date:
    return date(1970, 1, 1) + timedelta(days=int(day))


def historical_anchor(macro: Macro, days: IntArray) -> FloatArray:
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


def historical_values(macro: Macro, series_id: str, days: IntArray) -> FloatArray:
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


@dataclass(frozen=True, slots=True)
class HomeSpec:
    """An apartment and where its monthly series come from."""

    plan: HomePlan
    value_mode: Literal["assumed", "historical"] = "assumed"
    value_series: str = "dwelling"
    #: Yearly mean growth and volatility of an assumed value; a seed draws a path.
    value_mean: float = 0.03
    value_sd: float = 0.0
    value_seed: int | None = None
    rates_mode: Literal["assumed", "historical"] = "assumed"
    #: The assumed Bank of Israel rate, and a move of it after some months.
    rates_base: float = 0.0325
    rates_shock: float = 0.0
    rates_shock_after: int = 0
    rent_growth: Literal["cpi", "value", "fixed"] = "cpi"
    rent_growth_rate: float = 0.0


def home_series(
    spec: HomeSpec, path: CpiPath, macro: Macro, *, strict: bool = False
) -> tuple[HomeSeries, list[str]]:
    """The apartment's monthly series, and warnings about data held flat."""
    plan = spec.plan
    held = plan.months
    horizon = max([held, *(t.months for t in plan.tracks)])
    days = month_days(plan.start, horizon)
    warnings: list[str] = []

    def held_flat(what: str, last: int, in_schedule: bool) -> None:
        """The plan runs past the published data (``last`` is its last day)."""
        if days[held] > last + MONTH_DAYS:
            if strict:
                raise PlanError(f"The {what} is published until {_date(last)}: end by then")
            warnings.append(f"After the last published {what} it is held flat")
        elif in_schedule and days[-1] > last + MONTH_DAYS:
            warnings.append(
                f"The schedule after the sale holds the {what} flat past its last published value"
            )

    held_flat("CPI", int(path.days[-1]), any(t.linked for t in plan.tracks))
    cpi = path.at(days)
    if spec.rates_mode == "historical":
        anchor = historical_anchor(macro, days)
        held_flat(
            "Bank of Israel rate",
            int(macro.get("boi_rate").data.days[-1]),
            any(t.kind is not RateKind.FIXED for t in plan.tracks),
        )
    else:
        anchor = assumed_anchor(horizon, spec.rates_base, spec.rates_shock, spec.rates_shock_after)
    if spec.value_mode == "historical":
        value = historical_values(macro, spec.value_series, days[: held + 1])
    else:
        rng = None if spec.value_seed is None else np.random.default_rng(spec.value_seed)
        value = assumed_values(held, spec.value_mean, spec.value_sd, rng)
    rent_index = {
        "cpi": cpi[: held + 1],
        "value": value,
        "fixed": (1 + spec.rent_growth_rate) ** (np.arange(held + 1) / 12),
    }[spec.rent_growth]
    return HomeSeries(value, cpi, anchor, rent_index), warnings
