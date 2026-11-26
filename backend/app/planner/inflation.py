"""The planner's consumer price index: assumed (a model) or the actual CBS index.

**Assumed** (the default): yearly inflation follows a mean-reverting AR(1) process

.. math::
    \\pi_y = \\mu + \\phi(\\pi_{y-1} - \\mu) + \\sigma\\sqrt{1 - \\phi^2}\\,\\varepsilon_y,
    \\qquad \\varepsilon_y \\sim N(0, 1), \\qquad \\pi_0 = \\mu + \\sigma\\varepsilon_0

so every year has mean :math:`\\mu` and standard deviation :math:`\\sigma`, and consecutive years
correlate by :math:`\\phi` (0 = independent years). A year's rate is spread evenly over its
months:

.. math::
    \\text{CPI}_m = \\text{CPI}_{m-1}\\,(1 + \\pi_{y(m)})^{1/12}, \\qquad \\text{CPI}_0 = 100

Without a generator the path is the mean one (:math:`\\pi_y = \\mu`). Rates are floored at
-50 % a year so the index stays positive.

**Historical:** the CBS index (``app.macro``, monthly, dated the 1st), from 1994 on only: the
years before hold Israel's hyperinflation, which the user excluded.

Between month starts the index is interpolated geometrically (linear in its logarithm).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.macro.series import MacroSeries
from app.models.bars import FloatArray, IntArray

MIN_YEARLY_RATE = -0.5
#: The first month of the actual CPI the planner uses (day number of 1994-01-01).
HISTORICAL_FROM = int(np.datetime64("1994-01-01", "D").astype(np.int64))


@dataclass(frozen=True, slots=True)
class CpiPath:
    """Index levels at month starts (day numbers, increasing)."""

    days: IntArray
    values: FloatArray

    def at(self, days: IntArray | int) -> FloatArray:
        """The index on ``days`` (geometric inside a month; flat beyond the ends)."""
        return np.exp(np.interp(days, self.days, np.log(self.values)))


def month_starts(first_day: int, last_day: int) -> IntArray:
    """Day numbers of every month start from the month of ``first_day`` to the one after
    ``last_day``'s."""
    first = int(np.datetime64(int(first_day), "D").astype("datetime64[M]").astype(np.int64))
    last = int(np.datetime64(int(last_day), "D").astype("datetime64[M]").astype(np.int64)) + 1
    months = np.arange(first, last + 1, dtype=np.int64).astype("datetime64[M]")
    return months.astype("datetime64[D]").astype(np.int64)


def yearly_rates(
    years: int, mu: float, sigma: float, phi: float, rng: np.random.Generator | None
) -> FloatArray:
    """``years`` yearly inflation rates of the AR(1) model (the mean path without ``rng``)."""
    if rng is None or sigma == 0.0:
        return np.full(years, max(mu, MIN_YEARLY_RATE))
    eps = rng.standard_normal(years)
    rates = np.empty(years)
    rates[0] = mu + sigma * eps[0]
    step = sigma * np.sqrt(1.0 - phi * phi)
    for y in range(1, years):
        rates[y] = mu + phi * (rates[y - 1] - mu) + step * eps[y]
    return np.maximum(rates, MIN_YEARLY_RATE)


def assumed_cpi(
    first_day: int,
    last_day: int,
    *,
    mu: float,
    sigma: float = 0.0,
    phi: float = 0.0,
    rng: np.random.Generator | None = None,
) -> CpiPath:
    """The model index over the months covering ``first_day .. last_day`` (100 at the start)."""
    days = month_starts(first_day, last_day)
    months = len(days) - 1
    rates = yearly_rates(months // 12 + 1, mu, sigma, phi, rng)
    monthly = np.repeat((1.0 + rates) ** (1.0 / 12.0), 12)[:months]
    return CpiPath(days, 100.0 * np.concatenate(([1.0], np.cumprod(monthly))))


def historical_cpi(series: MacroSeries) -> CpiPath:
    """The actual index from 1994 on."""
    keep = series.days >= HISTORICAL_FROM
    return CpiPath(series.days[keep], series.values[keep])
