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
  A sale that would leave less than half an agora sells everything (no dust of rounding stays
  behind to be "paid" the month after).
* *A percent* :math:`p` a year: :math:`\\varphi = p / 12` (more only when the fee alone needs
  more). The balance then does not depend on :math:`c`; only the income does. The withdrawals
  alone never empty the account; a fee larger than what is left can, and so can a percent of
  1,200. The depletion month is then the first month that starts with nothing.

The sale, its tax and the fee are one event on the month date. (The market account of
``app.planner.market`` charges fees at calendar month ends and taxes everything at the end.)

**An apartment** owned on the first day (J1) adds two series: :math:`h_k`, the cash it gives on
month :math:`k` while it is held (rent received less the mortgage payment and the owner costs;
negative when they are more), and :math:`W_k`, what its sale on month :math:`k` would leave (the
value less the selling costs, the loan with its early-repayment fee, and the betterment tax).

* The account owes the month :math:`D = F - h_k` before any withdrawal: the fee and what the
  apartment does not pay itself. A fixed rule sells for :math:`N_k + D`; a percent rule sells
  :math:`\\max(p / 12, \\text{the fraction for } D)`, and its income is that sale's net plus
  :math:`h_k`. (So under a percent rule the balance ignores :math:`c` only while the
  :math:`p / 12` sale pays :math:`D`.)
* Under a fixed rule a surplus, :math:`h_k - F - N_k > 0`, is invested.
* **The sale** is on the month asked for (*on a date*); whatever the role, on the first month the
  account cannot pay :math:`D` (*forced*); or on the first month it cannot pay :math:`N_k + D`
  (*when empty*). Its month still has :math:`h_k`. :math:`W_k > 0` is invested; a negative
  :math:`W_k` joins :math:`D`, and what the account cannot pay of it stays a debt, paid first in
  the months after and shown as the apartment's (negative) worth until it is.
* **Money invested** buys the plan's weights at the buy commission :math:`\\beta`: asset
  :math:`a` gains :math:`m w_a / ((1 + \\beta) u_{k,a})` units at a cost of
  :math:`m w_a / \\ell_{k,a}` (as an H1 deposit, the commission is part of the cost).
* What is left is the account plus :math:`W_k` while the apartment is held. A month is *short*
  when a fixed amount is not paid in full, or when the account is empty and no apartment is
  left; the plan is *depleted* from the first month of the short run that lasts to the end (a
  short month followed by full ones, as before a forced sale, is counted but is not the end).
* shortcut: a debt left by a sale bears no interest; model a loan's rate if debts ever last.
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

#: Half an agora: a month short by less is paid in full, and an account worth less is empty.
PAID = 0.005
#: The most a percent rule can sell: everything, every month.
MAX_PERCENT = 12.0


class Rule(StrEnum):
    FIXED = "fixed"
    PERCENT = "percent"


class Sale(StrEnum):
    """When the apartment is sold (a forced sale aside)."""

    KEPT = "kept"
    ON_DATE = "on_date"
    WHEN_EMPTY = "when_empty"


class Cause(StrEnum):
    """Why it was sold."""

    PLANNED = "planned"
    EMPTY = "empty"
    FORCED = "forced"


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
    #: The buy commission of money invested (a rent surplus, the apartment's sale).
    buy: float = 0.0


@dataclass(frozen=True, slots=True)
class Home:
    """An apartment owned on the first day, on the month dates 0..T (see the module docstring)."""

    #: What it gives on month k while it is held: rent received less the mortgage payment and the
    #: owner costs.
    cash: FloatArray
    #: What its sale on month k would leave.
    worth: FloatArray
    role: Sale = Sale.KEPT
    #: The month of a sale on a date, 1..T.
    sell_on: int = 0


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
    #: The month from which the rule is never kept again: a fixed amount not paid in full, or an
    #: account already empty with no apartment (a percent rule gets there only when the fees take
    #: what is left, or when it sells everything). None: the last month was kept.
    depleted: int | None
    #: What selling everything on the last date would leave, after the commission and the tax,
    #: the apartment's worth included while it is held.
    liquidation: float
    #: The apartment's worth while it is held (0 from the month it is sold, and without one).
    home: FloatArray
    #: The cash it gave each month while held.
    home_cash: FloatArray
    #: Money put into the account: a surplus of rent, the apartment's sale.
    invested: FloatArray
    home_sold: int | None = None
    cause: Cause | None = None
    #: Months not kept, and the first of them: with an apartment, a short month can be followed by
    #: full ones again (a forced sale, a sale on a date).
    short: int = 0
    first_short: int | None = None


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


def _leaves(fraction: float, proceeds: float, gain: float, carried: float, tax: float) -> float:
    """What selling ``fraction`` of the account leaves after its tax."""
    return fraction * proceeds - tax * max(fraction * gain - carried, 0.0)


def _weights(plan: Plan, assets: int, home: Home | None, months: int) -> FloatArray:
    """The plan's weights as shares of the capital, after checking the plan can run."""
    weights = np.asarray(plan.weights, dtype=np.float64)
    if plan.capital < 0 or (plan.capital == 0 and home is None):
        raise PlanError("The starting capital must be positive (or zero with an apartment)")
    if home is not None:
        if home.cash.shape != (months + 1,) or home.worth.shape != (months + 1,):
            raise PlanError("The apartment's series do not match the plan's months")
        if home.role is Sale.ON_DATE and not 1 <= home.sell_on <= months:
            raise PlanError("The apartment's sale must be on a month of the plan")
    if plan.buy < 0:
        raise PlanError("The buy commission cannot be negative")
    if not 0.0 <= plan.cost_share <= 1.0:
        raise PlanError("The cost share must be between 0 and 100 %")
    if plan.amount < 0:
        raise PlanError("The amount cannot be negative")
    if not 0.0 <= plan.sell < 1.0:
        raise PlanError("The sell commission must be below 100 %: no sale could pay anything")
    if not 0.0 <= plan.percent <= MAX_PERCENT:
        raise PlanError("The yearly percent sold must be between 0 and 1,200")
    if len(weights) != assets or np.any(weights < 0) or weights.sum() <= 0:
        raise PlanError("The weights do not match the assets")
    return weights / weights.sum()


def run(plan: Plan, grid: Grid, home: Home | None = None) -> Result:  # noqa: PLR0912, PLR0915
    """Run the plan on one realization (see the module docstring)."""
    months, assets = grid.unit.shape[0] - 1, grid.unit.shape[1]
    weights = _weights(plan, assets, home, months)
    units = plan.capital * weights / grid.unit[0]
    basis = plan.cost_share * plan.capital * weights / grid.level[0]
    carried = 0.0
    keep = 1.0 - plan.sell
    monthly_rate = 1.0 - (1.0 - plan.management) ** (1.0 / 12.0)
    balance, sold, commission, tax, fee, net, due = (np.zeros(months + 1) for _ in range(7))
    worth, home_cash, invested = (np.zeros(months + 1) for _ in range(3))
    balance[0] = plan.capital
    missed = np.zeros(months + 1, dtype=np.bool_)
    #: The apartment while it is held.
    owned = home
    #: What a sale left owing (the loan above what it brought) that the account could not pay yet.
    debt = 0.0
    home_sold: int | None = None
    cause: Cause | None = None
    if home is not None:
        worth[0] = home.worth[0]

    def invest(money: float, k: int) -> None:
        nonlocal units, basis
        units = units + money * weights / ((1.0 + plan.buy) * grid.unit[k])
        basis = basis + money * weights / grid.level[k]
        invested[k] += money
        commission[k] += money * plan.buy / (1.0 + plan.buy)

    def account(k: int) -> tuple[float, float, float, float]:
        """The value, the proceeds of selling all of it, their gain, and the month's fee."""
        value = float(units @ grid.unit[k])
        proceeds = value * keep
        gain = proceeds - float(basis @ grid.level[k])
        return value, proceeds, gain, min(value, value * monthly_rate + plan.monthly_fee)

    for k in range(1, months + 1):
        basis = basis + units * grid.reinvested[k]
        value, proceeds, gain, fee_due = account(k)
        if plan.rule is Rule.FIXED:
            due[k] = plan.amount * (grid.cpi[k] / grid.cpi[0] if plan.indexed else 1.0)
        cash = float(owned.cash[k]) if owned is not None else 0.0
        owed = debt
        if owned is not None:
            duty = fee_due - cash
            everything = _leaves(1.0, proceeds, gain, carried, plan.gains_tax)
            if owned.role is Sale.ON_DATE and k == owned.sell_on:
                cause = Cause.PLANNED
            elif duty > 0.0 and everything < duty - PAID:
                cause = Cause.FORCED
            elif owned.role is Sale.WHEN_EMPTY and everything < due[k] + duty - PAID:
                cause = Cause.EMPTY
            if cause is not None:
                money, owned, home_sold = float(owned.worth[k]), None, k
                if money > 0.0:
                    invest(money, k)
                    value, proceeds, gain, fee_due = account(k)
                else:
                    owed += -money
        duty = fee_due - cash + owed
        if plan.rule is Rule.FIXED:
            fraction = _fraction(due[k] + duty, proceeds, gain, carried, plan.gains_tax)
        else:
            least = _fraction(duty, proceeds, gain, carried, plan.gains_tax)
            fraction = max(min(plan.percent / 12.0, 1.0), least) if value > 0 else 0.0
        if (1.0 - fraction) * value < PAID:
            fraction = 1.0 if value > 0 else 0.0
        realised = fraction * gain
        tax[k] = plan.gains_tax * max(realised - carried, 0.0)
        carried = max(carried - realised, 0.0)
        available = fraction * proceeds - tax[k] + cash - owed
        debt = -available if available < -PAID else 0.0
        fee[k] = min(fee_due, max(available, 0.0))
        rest = available - fee[k]
        sold[k] = fraction * value
        commission[k] += sold[k] * plan.sell
        units = units * (1.0 - fraction)
        basis = basis * (1.0 - fraction)
        if plan.rule is Rule.FIXED:
            net[k] = min(max(rest, 0.0), due[k])
            if rest - due[k] > PAID:
                invest(rest - due[k], k)
        else:
            net[k] = max(rest, 0.0)
        balance[k] = float(units @ grid.unit[k])
        home_cash[k] = cash
        worth[k] = float(owned.worth[k]) if owned is not None else -debt
        # A fixed amount not paid in full, or nothing left to sell and no apartment.
        missed[k] = due[k] - net[k] > PAID or (value <= 0.0 and owned is None)
    proceeds = balance[-1] * keep
    gain = proceeds - float(basis @ grid.level[-1])
    liquidation = proceeds - plan.gains_tax * max(gain - carried, 0.0) + worth[-1]
    kept = np.flatnonzero(~missed[1:])
    last_kept = int(kept[-1]) + 1 if kept.size else 0
    shorts = np.flatnonzero(missed)
    return Result(
        balance,
        sold,
        commission,
        tax,
        fee,
        net,
        due,
        last_kept + 1 if last_kept < months else None,
        float(liquidation),
        worth,
        home_cash,
        invested,
        home_sold,
        cause,
        int(shorts.size),
        int(shorts[0]) if shorts.size else None,
    )
