"""What many realizations of one withdrawal plan say (J2, ``docs/WITHDRAWAL_PLAN.md``): pure
functions on the batches of ``app.planner.withdraw.run_many``.

* **What is left** of a realization: without an apartment the account's balance at the end,
  against the starting capital; with one, what selling the account and the apartment would
  leave (the liquidation), against the same on the first day:
  :math:`V_0 (1 - \\sigma) - \\tau \\max(V_0 (1 - \\sigma) - c V_0, 0) + W_0`.
* **Still paying** at month :math:`k`: the realization is not depleted, or is only later. The
  curve is read at the start, at every year's end and on the last month.
* **The income fan**: for every year of the plan, the 5th, 25th, 50th, 75th and 95th
  percentiles over the realizations of the year's mean monthly income, in shekels of the first
  day.
* **The sustainable amount** (a fixed rule): the largest monthly amount with which at least a
  share :math:`s` of the realizations last, by bisection to half a shekel. Lasting falls as the
  amount rises (an apartment's sale can move it by a month, not turn it around).
* **The months in reverse**: the market's monthly growths in reverse order,
  :math:`u'_k = u_0 \\prod_{j \\le k} u_{T+1-j} / u_{T-j}`. A month's reinvested dividends keep
  their share of the value, :math:`\\rho'_k = \\rho_{T+1-k}\\,\\ell_{T+1-k}/u_{T+1-k} \\cdot
  u'_k / \\ell_k`; the CPI and the cost's index stay as they were (the dividends' cost is then
  indexed from the month date).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import replace

import numpy as np

from app.models.bars import FloatArray, IntArray
from app.planner.withdraw import Grid, Home, Many, Plan, Rule, run_many

#: The percentiles of the income fan.
FAN = (5, 25, 50, 75, 95)
#: The bisection stops within this many shekels, and looks no higher than ``HIGHEST`` a month.
NEAREST = 0.5
HIGHEST = 1e12


def stack(grids: Sequence[Grid]) -> Grid:
    """Realizations of the same months and assets as one batch."""
    if len({g.unit.shape for g in grids}) != 1:
        raise ValueError("The realizations must have the same months and assets")
    return Grid(
        np.stack([g.unit for g in grids]),
        np.stack([g.reinvested for g in grids]),
        np.stack([g.level for g in grids]),
        np.stack([g.cpi for g in grids]),
    )


def stack_homes(homes: Sequence[Home]) -> Home:
    """The apartment of every realization (one role and one sale month for all)."""
    return replace(
        homes[0],
        cash=np.stack([h.cash for h in homes]),
        worth=np.stack([h.worth for h in homes]),
    )


def start_worth(plan: Plan, home: Home | None, count: int) -> FloatArray:
    """What there was on the first day, on the basis ``left`` uses."""
    if home is None:
        return np.full(count, plan.capital)
    proceeds = plan.capital * (1.0 - plan.sell)
    tax = plan.gains_tax * max(proceeds - plan.cost_share * plan.capital, 0.0)
    return proceeds - tax + home.worth[:, 0]


def left(many: Many, home: Home | None) -> FloatArray:
    """What is left at the end of each realization (see the module docstring)."""
    return many.balance[:, -1] if home is None else many.liquidation


def checkpoints(months: int) -> list[int]:
    """The months a curve is read on: the start, every year's end, and the last month."""
    return sorted({*range(0, months, 12), months})


def survival(depleted: IntArray, months: int) -> FloatArray:
    """The share of the realizations still paying on each checkpoint."""
    lasting = depleted == 0
    return np.array(
        [np.count_nonzero(lasting | (depleted > k)) for k in checkpoints(months)]
    ) / len(depleted)


def income_fan(net: FloatArray, prices: FloatArray) -> FloatArray:
    """``(years, 5)``: the percentiles of each year's mean monthly income, in first-day shekels
    (``prices`` is the CPI's rise since the first day, as ``net`` is: ``(N, T + 1)``)."""
    real = net[:, 1:] / prices[:, 1:]
    months = real.shape[1]
    fan = np.empty((-(-months // 12), len(FAN)))
    for year in range(len(fan)):
        fan[year] = np.percentile(real[:, 12 * year : 12 * year + 12].mean(axis=1), FAN)
    return fan


def sustainable(plan: Plan, grid: Grid, home: Home | None, share: float) -> float:
    """The largest fixed amount with which at least ``share`` of the realizations last."""
    if plan.rule is not Rule.FIXED:
        raise ValueError("Only a fixed rule has an amount to look for")

    def lasts(amount: float) -> bool:
        many = run_many(replace(plan, amount=amount), grid, home)
        return int(np.count_nonzero(many.depleted == 0)) >= share * len(many.depleted)

    low, high = 0.0, 1_000.0
    while lasts(high) and high < HIGHEST:
        low, high = high, high * 2.0
    while high - low > NEAREST:
        middle = (low + high) / 2.0
        low, high = (middle, high) if lasts(middle) else (low, middle)
    return low


def reverse(grid: Grid) -> Grid:
    """One realization (``(T + 1, assets)`` arrays) with its market months in reverse order."""
    growth = grid.unit[1:] / grid.unit[:-1]
    unit = grid.unit[0] * np.vstack([np.ones_like(grid.unit[0]), np.cumprod(growth[::-1], axis=0)])
    share = grid.reinvested * grid.level / grid.unit
    reinvested = np.zeros_like(share)
    reinvested[1:] = share[:0:-1] * unit[1:] / grid.level[1:]
    return Grid(unit, reinvested, grid.level, grid.cpi)
