"""Withdrawals from an account: a starting capital, money taken every month by a rule, and what
is left (``docs/WITHDRAWAL_PLAN.md``). Pure arithmetic on a month grid.

**The grid.** Month date :math:`k = 0..T` is the start day moved by :math:`k` months. For asset
:math:`a` the grid holds :math:`u_{k,a}`, the shekel value on that date of what one unit held at
the start has become (net dividends reinvested); :math:`\\rho_{k,a}`, the cost of the dividends
reinvested in month :math:`k` per starting unit, already divided by the index of the day they
were reinvested on; :math:`\\ell_{k,a}`, the index the cost is linked to (1: nominal, the CPI:
real, the shekel rate: the currency); and :math:`I_k`, the CPI.

**The start.** The capital :math:`V_0` is split by the weights :math:`w_a`: the account holds
:math:`q_a = V_0 w_a / u_{0,a}` units. Its purchase history is not known, so each asset is one
lot whose cost is a share :math:`c` of its value: :math:`b_a = c\\,V_0 w_a / \\ell_{0,a}`
(:math:`c = 0`: everything sold is gain; :math:`c = 1`: only growth from the start is).

**Month** :math:`k \\ge 1`, in this order:

1. the dividends of the month join the cost: :math:`b_a \\leftarrow b_a + q_a \\rho_{k,a}`;
2. the account is worth :math:`V = \\sum_a q_a u_{k,a}`. Selling all of it would bring
   :math:`P = V (1 - \\sigma)` after the sell commission :math:`\\sigma`, a gain of
   :math:`G = P - \\sum_a b_a \\ell_{k,a}`;
3. the account fee is :math:`F = \\min(V,\\ V (1 - (1 - \\mu)^{1/12}) + f)` (yearly management
   fee :math:`\\mu`, monthly fee :math:`f`);
4. a fraction :math:`\\varphi` of every asset is sold. Its gain :math:`\\varphi G` is first set
   against the loss carried from earlier months, :math:`L`; the tax is
   :math:`\\tau \\max(\\varphi G - L, 0)` and :math:`L \\leftarrow \\max(L - \\varphi G, 0)`
   (a loss raises it; nothing is ever refunded). What the sale leaves,
   :math:`\\varphi P - \\text{tax}`, pays the fee first and the rest is the income;
5. :math:`q_a` and :math:`b_a` are multiplied by :math:`1 - \\varphi`.

**The fraction sold.**

* *A fixed amount* :math:`N` (net, in shekels of the first day): the month owes
  :math:`N_k = N\\,I_k / I_0` when it is indexed, :math:`N` when not, and :math:`\\varphi` is
  the fraction whose sale leaves :math:`N_k + F`. What a sale leaves is piecewise linear in
  :math:`\\varphi`, with one kink where the carried loss is used up, so
  :math:`\\varphi = (N_k + F)/P` while :math:`\\varphi G \\le L` and
  :math:`\\varphi = (N_k + F - \\tau L) / (P - \\tau G)` beyond it. A fraction above 1 sells
  everything and pays what there is: the first such month is the **depletion month**.
* *A percent* :math:`p` a year: :math:`\\varphi = p / 12` (more only when the fee alone needs
  more). The balance then does not depend on :math:`c`; only the income does.

The sale, its tax and the fee are one event on the month date. (The market account of
``app.planner.market`` charges fees at calendar month ends and taxes everything at the end.)
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, replace
from datetime import date, timedelta
from enum import StrEnum

import numpy as np

from app.models.bars import FloatArray
from app.planner.deposits import add_months, day_number
from app.planner.inflation import CpiPath
from app.planner.market import MAX_STALE_DAYS, AssetData, PlanError, TaxBase, Taxes, growth

#: A month is paid in full when it is short by less than this (half an agora).
PAID = 0.005
#: The most a percent rule can sell: everything, every month.
MAX_PERCENT = 12.0


class Rule(StrEnum):
    FIXED = "fixed"
    PERCENT = "percent"


@dataclass(frozen=True, slots=True)
class Grid:
    """One realization on the month dates 0..T (see the module docstring); the per-asset arrays
    are ``(T + 1, assets)``."""

    unit: FloatArray
    reinvested: FloatArray
    level: FloatArray
    cpi: FloatArray


@dataclass(frozen=True, slots=True)
class Plan:
    capital: float
    weights: Sequence[float] = (1.0,)
    #: The share of the starting capital that is cost; the rest is gain not yet taxed.
    cost_share: float = 0.5
    rule: Rule = Rule.FIXED
    #: A fixed rule: the net amount a month, in shekels of the first day.
    amount: float = 0.0
    indexed: bool = True
    #: A percent rule: the yearly fraction of the account that is sold.
    percent: float = 0.0
    sell: float = 0.0
    management: float = 0.0
    monthly_fee: float = 0.0
    gains_tax: float = 0.25


@dataclass(frozen=True, slots=True)
class Result:
    """One value per month date (index 0 is the start: nothing is sold on it)."""

    #: The account after the month's sale.
    balance: FloatArray
    sold: FloatArray
    commission: FloatArray
    tax: FloatArray
    fee: FloatArray
    #: What reached the hand.
    net: FloatArray
    #: What a fixed rule owed the month (zeros under a percent rule).
    due: FloatArray
    #: The first month a fixed amount was not paid in full (None: every month was).
    depleted: int | None
    #: What selling everything on the last date would leave, after the commission and the tax.
    liquidation: float


def assumed_grid(months: int, rate: float, cpi: FloatArray, *, real: bool = False) -> Grid:
    """One asset that grows by ``rate`` a year (an effective rate, in nominal shekels),
    compounded monthly. ``real``: the cost is linked to the CPI."""
    k = np.arange(months + 1, dtype=np.float64)
    level = cpi[:, None] if real else np.ones((months + 1, 1))
    unit: FloatArray = np.power(1.0 + rate, k / 12.0)[:, None]
    return Grid(unit, np.zeros((months + 1, 1)), level, cpi)


def sample(
    assets: Sequence[AssetData], start: date, months: int, taxes: Taxes, cpi: CpiPath
) -> Grid:
    """The grid of real assets: each month date reads the asset's first bar on or after it."""
    days = np.array([day_number(add_months(start, k)) for k in range(months + 1)], dtype=np.int64)
    shape = (months + 1, len(assets))
    unit, reinvested, level = np.empty(shape), np.empty(shape), np.empty(shape)
    for a, whole in enumerate(assets):
        if days[0] < whole.days[0]:
            first = date(1970, 1, 1) + timedelta(days=int(whole.days[0]))
            raise PlanError(f"{whole.symbol} has no data before {first}: start the plan later")
        # Only the bars from the first day on: the dividend factor is relative to that bar.
        cut = slice(int(np.searchsorted(whole.days, int(days[0]), side="left")), None)
        asset = replace(
            whole,
            days=whole.days[cut],
            close=whole.close[cut],
            factor=whole.factor[cut],
            fx=whole.fx[cut],
        )
        last = len(asset.days) - 1
        if last < 0 or days[-1] - asset.days[last] > MAX_STALE_DAYS:
            until = date(1970, 1, 1) + timedelta(days=int(whole.days[-1]))
            raise PlanError(f"{whole.symbol} has no data after {until}: end the plan by then")
        # A last date on a weekend or a holiday past the data sells on the last bar.
        i = np.minimum(np.searchsorted(asset.days, days, side="left"), last)
        if not np.all(np.isfinite(asset.fx[i])):
            raise PlanError(f"No exchange rate for {asset.symbol} on a month date")
        units, _ = growth(asset, taxes.dividend)
        shekel = asset.close * asset.fx
        if taxes.base is TaxBase.REAL:
            index = cpi.at(asset.days)
        elif taxes.base is TaxBase.CURRENCY:
            index = asset.fx
        else:
            index = np.ones(len(asset.days))
        # The cost of the net dividends reinvested on each bar, per unit held on the first bar.
        bought = np.zeros(len(units))
        bought[1:] = units[:-1] * (units[1:] / units[:-1] - 1.0) * shekel[1:]
        total = np.cumsum(bought / index)
        unit[:, a] = units[i] * shekel[i]
        reinvested[:, a] = np.diff(total[i], prepend=total[i[0]])
        level[:, a] = index[i]
    return Grid(unit, reinvested, level, cpi.at(days))


def _fraction(need: float, proceeds: float, gain: float, carried: float, tax: float) -> float:
    """The fraction of the account whose sale leaves ``need`` after its tax (at most 1)."""
    if proceeds <= 0.0 or need <= 0.0:
        return 0.0
    untaxed = need / proceeds
    if gain <= 0.0 or untaxed * gain <= carried:
        return min(untaxed, 1.0)
    rest = proceeds - tax * gain
    return 1.0 if rest <= 0.0 else min((need - tax * carried) / rest, 1.0)


def run(plan: Plan, grid: Grid) -> Result:
    """Run the plan on one realization (see the module docstring)."""
    months, assets = grid.unit.shape[0] - 1, grid.unit.shape[1]
    weights = np.asarray(plan.weights, dtype=np.float64)
    if plan.capital <= 0:
        raise PlanError("The starting capital must be positive")
    if not 0.0 <= plan.cost_share <= 1.0:
        raise PlanError("The cost share must be between 0 and 100 %")
    if plan.amount < 0:
        raise PlanError("The amount cannot be negative")
    if not 0.0 <= plan.percent <= MAX_PERCENT:
        raise PlanError("The yearly percent sold must be between 0 and 1,200")
    if len(weights) != assets or np.any(weights < 0) or weights.sum() <= 0:
        raise PlanError("The weights do not match the assets")
    weights = weights / weights.sum()
    units = plan.capital * weights / grid.unit[0]
    basis = plan.cost_share * plan.capital * weights / grid.level[0]
    carried = 0.0
    keep = 1.0 - plan.sell
    monthly_rate = 1.0 - (1.0 - plan.management) ** (1.0 / 12.0)
    balance, sold, commission, tax, fee, net, due = (np.zeros(months + 1) for _ in range(7))
    balance[0] = plan.capital
    depleted: int | None = None
    for k in range(1, months + 1):
        basis = basis + units * grid.reinvested[k]
        value = float(units @ grid.unit[k])
        proceeds = value * keep
        gain = proceeds - float(basis @ grid.level[k])
        fee_due = min(value, value * monthly_rate + plan.monthly_fee)
        if plan.rule is Rule.FIXED:
            due[k] = plan.amount * (grid.cpi[k] / grid.cpi[0] if plan.indexed else 1.0)
            fraction = _fraction(due[k] + fee_due, proceeds, gain, carried, plan.gains_tax)
        else:
            covers_fee = _fraction(fee_due, proceeds, gain, carried, plan.gains_tax)
            fraction = max(min(plan.percent / 12.0, 1.0), covers_fee) if value > 0 else 0.0
        realised = fraction * gain
        tax[k] = plan.gains_tax * max(realised - carried, 0.0)
        carried = max(carried - realised, 0.0)
        left = fraction * proceeds - tax[k]
        fee[k] = min(fee_due, left)
        net[k] = left - fee[k]
        sold[k] = fraction * value
        commission[k] = sold[k] * plan.sell
        balance[k] = (1.0 - fraction) * value
        units = units * (1.0 - fraction)
        basis = basis * (1.0 - fraction)
        if depleted is None and due[k] - net[k] > PAID:
            depleted = k
    proceeds = balance[-1] * keep
    gain = proceeds - float(basis @ grid.level[-1])
    liquidation = proceeds - plan.gains_tax * max(gain - carried, 0.0)
    return Result(balance, sold, commission, tax, fee, net, due, depleted, float(liquidation))
