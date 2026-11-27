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

**Known purchases** (J4). When the account's lots are known (``Lots``: the units and the cost of
every purchase, oldest first) they replace the one lot of the start, and a sale is **first in,
first out** within each asset: selling :math:`\\varphi` of asset :math:`a` takes its oldest units
first, and realises their own cost. Money invested later is a new lot, sold last. What a sale
leaves still rises with :math:`\\varphi` (a unit never costs more tax than it brings), but it has
a kink at every lot, so the fraction for a net amount is found by bisection instead of the
closed form. One pooled lot is the account above, unchanged.

**Many realizations** (J2) run through the same loop: every array gets a leading axis, one row a
realization, and each step of the month is taken by all of them together (``run_many``). One
plan is a batch of one (``run``).

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
import numpy.typing as npt

from app.models.bars import FloatArray, IntArray
from app.planner.deposits import add_months, day_number
from app.planner.inflation import CpiPath
from app.planner.market import (
    MAX_STALE_DAYS,
    AssetData,
    Lot,
    PlanError,
    TaxBase,
    Taxes,
    growth,
)

#: Half an agora: a month short by less is paid in full, and an account worth less is empty.
PAID = 0.005
#: The most a percent rule can sell: everything, every month.
MAX_PERCENT = 12.0
#: Halvings of the fraction sold from known lots: down to the last bit of a double.
BISECTIONS = 60


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
class Lots:
    """The purchases behind an account, oldest first: ``(lots, assets)`` arrays for one
    realization (``(N, lots, assets)`` for a batch). ``basis`` is the cost in the units of the
    grid's ``level`` (shekels on the nominal base)."""

    units: FloatArray
    basis: FloatArray


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


@dataclass(frozen=True, slots=True)
class Many:
    """``Result`` for N realizations: the series are ``(N, T + 1)``, the rest ``(N,)``. A month
    that is None in ``Result`` is 0 here, and no cause is the empty string."""

    balance: FloatArray
    sold: FloatArray
    commission: FloatArray
    tax: FloatArray
    fee: FloatArray
    net: FloatArray
    due: FloatArray
    depleted: IntArray
    liquidation: FloatArray
    home: FloatArray
    home_cash: FloatArray
    invested: FloatArray
    home_sold: IntArray
    cause: npt.NDArray[np.str_]
    short: IntArray
    first_short: IntArray


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


def _fraction(
    need: FloatArray, proceeds: FloatArray, gain: FloatArray, carried: FloatArray, tax: float
) -> FloatArray:
    """The fraction of each account whose sale leaves ``need`` after its tax (at most 1)."""
    nothing = (proceeds <= 0.0) | (need <= 0.0)
    safe = np.where(proceeds > 0.0, proceeds, 1.0)
    untaxed = need / safe
    rest = proceeds - tax * gain
    taxed = np.where(
        rest <= 0.0, 1.0, np.minimum((need - tax * carried) / np.where(rest > 0, rest, 1.0), 1.0)
    )
    below = (gain <= 0.0) | (untaxed * gain <= carried)
    return np.where(nothing, 0.0, np.where(below, np.minimum(untaxed, 1.0), taxed))


def _leaves(
    fraction: float, proceeds: FloatArray, gain: FloatArray, carried: FloatArray, tax: float
) -> FloatArray:
    """What selling ``fraction`` of each account leaves after its tax."""
    return fraction * proceeds - tax * np.maximum(fraction * gain - carried, 0.0)


def handover(bought: Sequence[Lot], grid: Grid, sell: float) -> Lots:
    """The lots of a market account (``run_market``'s, a block of deposits per asset) on the day
    it becomes the withdrawal plan's: ``grid`` starts on that day. A lot's units are its value
    there; its cost is what the market account would tax it on, the indexed cost less the account
    fees its units already paid, so selling everything on that day pays the same tax."""
    assets = grid.unit.shape[1]
    deposits = len(bought) // assets
    value = np.array([lot.value for lot in bought]).reshape(assets, deposits).T
    gain = np.array([lot.gain for lot in bought]).reshape(assets, deposits).T
    # Oldest first: the order of the deposits' own days.
    order = np.argsort([lot.day for lot in bought[:deposits]], kind="stable")
    cost = (1.0 - sell) * value - gain
    return Lots((value / grid.unit[0])[order], (cost / grid.level[0])[order])


def _weights(
    plan: Plan, assets: int, home: Home | None, shape: tuple[int, int], lots: bool
) -> FloatArray:
    """The plan's weights as shares of the capital, after checking the plan can run."""
    weights = np.asarray(plan.weights, dtype=np.float64)
    if plan.capital < 0 or (plan.capital == 0 and home is None and not lots):
        raise PlanError("The starting capital must be positive (or zero with an apartment)")
    if home is not None:
        if home.cash.shape != shape or home.worth.shape != shape:
            raise PlanError("The apartment's series do not match the plan's months")
        if home.role is Sale.ON_DATE and not 1 <= home.sell_on < shape[1]:
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


def run_many(  # noqa: PLR0912, PLR0915
    plan: Plan, grid: Grid, home: Home | None = None, lots: Lots | None = None
) -> Many:
    """Run the plan on many realizations at once (see the module docstring): the grid's arrays
    are ``(N, T + 1, assets)`` and ``(N, T + 1)``, the apartment's ``(N, T + 1)``, known lots
    ``(N, lots, assets)``. Every step of the loop over the months is taken by all the
    realizations together."""
    n, months, assets = grid.unit.shape[0], grid.unit.shape[1] - 1, grid.unit.shape[2]
    weights = _weights(plan, assets, home, (n, months + 1), lots is not None)
    if lots is None:
        # One pooled lot: its cost is a share of its value, and new money joins it.
        units = (plan.capital * weights / grid.unit[:, 0])[:, None]
        basis = (plan.cost_share * plan.capital * weights / grid.level[:, 0])[:, None]
        newest = None
    else:
        if lots.units.shape != lots.basis.shape or lots.units.shape[::2] != (n, assets):
            raise PlanError("The lots do not match the realizations and the assets")
        # A lot a month at most can join them: a rent surplus, an apartment's sale.
        room = np.zeros((n, months, assets))
        units = np.concatenate([lots.units, room], axis=1)
        basis = np.concatenate([lots.basis, room], axis=1)
        newest = lots.units.shape[1] - 1
    carried = np.zeros(n)
    keep = 1.0 - plan.sell
    monthly_rate = 1.0 - (1.0 - plan.management) ** (1.0 / 12.0)
    fixed = plan.rule is Rule.FIXED
    shape = (n, months + 1)
    balance, sold, commission, tax, fee, net, due = (np.zeros(shape) for _ in range(7))
    worth, home_cash, invested = (np.zeros(shape) for _ in range(3))
    balance[:, 0] = np.einsum("nla,na->n", units, grid.unit[:, 0])
    missed = np.zeros(shape, dtype=np.bool_)
    #: The realizations that still hold the apartment.
    held = np.full(n, home is not None)
    #: What a sale left owing (the loan above what it brought) that the account could not pay yet.
    debt = np.zeros(n)
    home_sold = np.zeros(n, dtype=np.int64)
    cause = np.full(n, "", dtype="<U7")
    if home is not None:
        worth[:, 0] = home.worth[:, 0]

    def invest(money: FloatArray, k: int) -> None:
        # The pooled lot, or the month's own new lot.
        slot = 0 if newest is None else newest + k
        units[:, slot] += money[:, None] * weights / ((1.0 + plan.buy) * grid.unit[:, k])
        basis[:, slot] += money[:, None] * weights / grid.level[:, k]
        invested[:, k] += money
        commission[:, k] += money * plan.buy / (1.0 + plan.buy)

    def account(k: int) -> tuple[FloatArray, FloatArray, FloatArray, FloatArray]:
        """The value, the proceeds of selling all of it, their gain, and the month's fee."""
        value = np.einsum("nla,na->n", units, grid.unit[:, k])
        proceeds = value * keep
        gain = proceeds - np.einsum("nla,na->n", basis, grid.level[:, k])
        return value, proceeds, gain, np.minimum(value, value * monthly_rate + plan.monthly_fee)

    def taken(fraction: FloatArray) -> FloatArray:
        """The share of every lot that selling ``fraction`` of each asset takes, oldest first."""
        before = np.cumsum(units, axis=1) - units
        wanted = fraction[:, None, None] * units.sum(axis=1)[:, None]
        sold = np.clip(wanted - before, 0.0, units)
        return np.divide(sold, units, out=np.zeros_like(units), where=units > 0)

    def realised(fraction: FloatArray, proceeds: FloatArray, k: int) -> FloatArray:
        """The gain of selling ``fraction`` first in, first out."""
        cost = np.einsum("nla,na->n", basis * taken(fraction), grid.level[:, k])
        return fraction * proceeds - cost

    def fraction_for(
        need: FloatArray, proceeds: FloatArray, gain: FloatArray, carried: FloatArray, k: int
    ) -> FloatArray:
        """The fraction whose sale leaves ``need`` after its tax (at most 1)."""
        if newest is None:
            return _fraction(need, proceeds, gain, carried, plan.gains_tax)

        def leaves(fraction: FloatArray) -> FloatArray:
            gained = realised(fraction, proceeds, k)
            return fraction * proceeds - plan.gains_tax * np.maximum(gained - carried, 0.0)

        low, high = np.zeros(n), np.ones(n)
        for _ in range(BISECTIONS):
            middle = (low + high) / 2.0
            short = leaves(middle) < need
            low, high = np.where(short, middle, low), np.where(short, high, middle)
        nothing = (proceeds <= 0.0) | (need <= 0.0)
        return np.where(nothing, 0.0, np.where(leaves(np.ones(n)) <= need, 1.0, high))

    for k in range(1, months + 1):
        basis += units * grid.reinvested[:, k][:, None]
        value, proceeds, gain, fee_due = account(k)
        if fixed:
            due[:, k] = plan.amount * (grid.cpi[:, k] / grid.cpi[:, 0] if plan.indexed else 1.0)
        cash = np.where(held, home.cash[:, k], 0.0) if home is not None else np.zeros(n)
        owed = debt
        if home is not None and held.any():
            duty = fee_due - cash
            everything = _leaves(1.0, proceeds, gain, carried, plan.gains_tax)
            planned = held & (home.role is Sale.ON_DATE and k == home.sell_on)
            forced = held & ~planned & (duty > 0.0) & (everything < duty - PAID)
            empty = held & ~planned & ~forced & (everything < due[:, k] + duty - PAID)
            empty &= home.role is Sale.WHEN_EMPTY
            selling = planned | forced | empty
            if selling.any():
                cause[planned], cause[forced], cause[empty] = (
                    Cause.PLANNED,
                    Cause.FORCED,
                    Cause.EMPTY,
                )
                held = held & ~selling
                home_sold[selling] = k
                money = np.where(selling, home.worth[:, k], 0.0)
                invest(np.maximum(money, 0.0), k)
                owed = owed + np.maximum(-money, 0.0)
                value, proceeds, gain, fee_due = account(k)
        duty = fee_due - cash + owed
        if fixed:
            fraction = fraction_for(due[:, k] + duty, proceeds, gain, carried, k)
        else:
            least = fraction_for(duty, proceeds, gain, carried, k)
            fraction = np.where(value > 0, np.maximum(min(plan.percent / 12.0, 1.0), least), 0.0)
        fraction = np.where(
            (1.0 - fraction) * value < PAID, np.where(value > 0, 1.0, 0.0), fraction
        )
        if newest is None:
            share, gained = fraction[:, None, None], fraction * gain
        else:
            share, gained = taken(fraction), realised(fraction, proceeds, k)
        tax[:, k] = plan.gains_tax * np.maximum(gained - carried, 0.0)
        carried = np.maximum(carried - gained, 0.0)
        available = fraction * proceeds - tax[:, k] + cash - owed
        debt = np.where(available < -PAID, -available, 0.0)
        fee[:, k] = np.minimum(fee_due, np.maximum(available, 0.0))
        rest = available - fee[:, k]
        sold[:, k] = fraction * value
        commission[:, k] += sold[:, k] * plan.sell
        units *= 1.0 - share
        basis *= 1.0 - share
        if fixed:
            net[:, k] = np.minimum(np.maximum(rest, 0.0), due[:, k])
            surplus = rest - due[:, k]
            if (surplus > PAID).any():
                invest(np.where(surplus > PAID, surplus, 0.0), k)
        else:
            net[:, k] = np.maximum(rest, 0.0)
        balance[:, k] = np.einsum("nla,na->n", units, grid.unit[:, k])
        home_cash[:, k] = cash
        worth[:, k] = np.where(held, home.worth[:, k], -debt) if home is not None else -debt
        # A fixed amount not paid in full, or nothing left to sell and no apartment.
        missed[:, k] = (due[:, k] - net[:, k] > PAID) | ((value <= 0.0) & ~held)
    proceeds = balance[:, -1] * keep
    gain = proceeds - np.einsum("nla,na->n", basis, grid.level[:, -1])
    liquidation = proceeds - plan.gains_tax * np.maximum(gain - carried, 0.0) + worth[:, -1]
    # The last month kept (0: none), and the first short one (0: none).
    kept = ~missed[:, 1:]
    last_kept = np.where(kept.any(axis=1), months - np.argmax(kept[:, ::-1], axis=1), 0)
    short = missed.sum(axis=1)
    return Many(
        balance,
        sold,
        commission,
        tax,
        fee,
        net,
        due,
        np.where(last_kept < months, last_kept + 1, 0),
        liquidation,
        worth,
        home_cash,
        invested,
        home_sold,
        cause,
        short,
        np.where(short > 0, np.argmax(missed, axis=1), 0),
    )


def run(plan: Plan, grid: Grid, home: Home | None = None, lots: Lots | None = None) -> Result:
    """Run the plan on one realization: a batch of one."""
    if home is not None and (home.cash.ndim != 1 or home.worth.ndim != 1):
        raise PlanError("The apartment's series do not match the plan's months")
    many = run_many(
        plan,
        Grid(grid.unit[None], grid.reinvested[None], grid.level[None], grid.cpi[None]),
        None if home is None else replace(home, cash=home.cash[None], worth=home.worth[None]),
        None if lots is None else Lots(lots.units[None], lots.basis[None]),
    )
    return Result(
        many.balance[0],
        many.sold[0],
        many.commission[0],
        many.tax[0],
        many.fee[0],
        many.net[0],
        many.due[0],
        int(many.depleted[0]) or None,
        float(many.liquidation[0]),
        many.home[0],
        many.home_cash[0],
        many.invested[0],
        int(many.home_sold[0]) or None,
        Cause(str(many.cause[0])) if many.cause[0] else None,
        int(many.short[0]),
        int(many.first_short[0]) or None,
    )
