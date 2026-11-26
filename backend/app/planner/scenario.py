"""Two options on the same money: an apartment, a market account, or both, on each side.

**An option** spends its own money on dated flows:

* an apartment (``app.planner.home``): the equity and the purchase costs on the purchase day
  :math:`d_0`; on each month date :math:`d_k` the mortgage payment plus the owner costs minus the
  rent (saved or received), which may be negative: a surplus;
* its own deposits into a market account (``app.planner.market``).

Let :math:`f_X(d)` and :math:`f_Y(d)` be what options X and Y spend on day :math:`d` (zero on a
day without a flow).

**The same money.** On every day before the end both options spend the budget

.. math::
    b(d) = \\max(f_X(d),\\, f_Y(d),\\, 0)

and each invests the rest, :math:`b(d) - f(d) \\ge 0`, in its market account (in the other
option's asset mix when it names none). So an option that spends less never keeps idle cash, a
month of surplus is invested, and the two ledgers of money put in are equal day by day. The
classic case: X is an apartment and Y an empty account, the apartment's *mirror*, which invests
everything the apartment costs, when it costs it.

Flows on different days do not offset each other: a deposit of X on the 5th and one of Y on the
20th make both options spend both.

**The end** (day :math:`T`): every apartment is sold on it and every account is sold on it. The
flows of that day are settled in cash, not invested:

.. math::
    W = \\text{net worth}_T + \\text{account}_T - f(T)

with the apartment's net worth after the selling costs, the loan and the betterment tax, and the
account's value after the sell commission and the capital-gains tax.

**The return** of an option is the XIRR of :math:`-b(d)` on each day and :math:`+W` at the end.
The outflows are equal on both sides, so the higher :math:`W` is the higher return. Real results
are in shekels of the first day: every flow is divided by :math:`\\text{CPI}(d) /
\\text{CPI}(d_{\\text{first}})`.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, timedelta

import numpy as np

from app.models.bars import FloatArray, IntArray
from app.planner.deposits import EPOCH, Deposit, day_number
from app.planner.home import HomePlan, HomeResult, HomeSeries, run_home
from app.planner.inflation import CpiPath
from app.planner.market import AssetData, Fees, FillSpec, MarketResult, PlanError, Taxes, run_market
from app.planner.xirr import xirr

#: A top-up below this many shekels is rounding noise, not a purchase.
DUST = 1e-6


@dataclass(frozen=True, slots=True)
class Account:
    """A market account's asset mix and its costs."""

    assets: Sequence[AssetData]
    fees: Fees = field(default_factory=Fees)
    taxes: Taxes = field(default_factory=Taxes)
    fill: FillSpec = field(default_factory=FillSpec)


@dataclass(frozen=True, slots=True)
class Side:
    """One option: an apartment (with its monthly series), own deposits, or both. ``account`` is
    where its deposits and its top-ups are invested (None: in the other option's mix)."""

    home: HomePlan | None = None
    series: HomeSeries | None = None
    account: Account | None = None
    deposits: Sequence[Deposit] = ()


@dataclass(frozen=True, slots=True)
class SideResult:
    home: HomeResult | None
    market: MarketResult | None
    #: Per ledger day: the option's own spending, and what it invests to match the budget.
    own: FloatArray
    top_up: FloatArray
    #: Its own spending on the end day (settled in cash).
    last_flow: float
    wealth: float
    wealth_real: float
    xirr: float | None
    xirr_real: float | None


@dataclass(frozen=True, slots=True)
class PairResult:
    #: The days before the end with a flow, and what both options spend on each.
    days: IntArray
    budget: FloatArray
    end: date
    x: SideResult
    y: SideResult


def _own_flows(side: Side, end_day: int) -> tuple[dict[int, float], HomeResult | None]:
    """The option's own spending by day, and its apartment's result."""
    flows: dict[int, float] = {}
    result = None
    if side.home is not None:
        if side.series is None:
            raise PlanError("An apartment needs its monthly series")
        result = run_home(side.home, side.series)
        if day_number(result.dates[-1]) != end_day:
            raise PlanError(
                f"Every apartment must be sold on the end date: this one is sold on "
                f"{result.dates[-1]}"
            )
        spent = result.payment + result.costs - result.rent
        spent[0] = side.home.equity + result.purchase_costs
        for day, amount in zip(result.dates, spent, strict=True):
            flows[day_number(day)] = float(amount)
    for deposit in side.deposits:
        day = day_number(deposit.day)
        if day >= end_day:
            raise PlanError("Every deposit must be before the end date")
        flows[day] = flows.get(day, 0.0) + deposit.amount
    return flows, result


def run_pair(x: Side, y: Side, end: date, cpi: CpiPath) -> PairResult:
    """Run both options on the same money (see the module docstring)."""
    end_day = day_number(end)
    flows_x, home_x = _own_flows(x, end_day)
    flows_y, home_y = _own_flows(y, end_day)
    days = np.array(sorted(d for d in flows_x.keys() | flows_y.keys() if d < end_day), np.int64)
    if len(days) == 0:
        raise PlanError("There is nothing to compare: neither option spends before the end date")
    own_x = np.array([flows_x.get(int(d), 0.0) for d in days])
    own_y = np.array([flows_y.get(int(d), 0.0) for d in days])
    budget = np.maximum(np.maximum(own_x, own_y), 0.0)
    deflate = float(cpi.at(int(days[0]))) / cpi.at(np.append(days, end_day))

    def side_result(
        side: Side, other: Side, own: FloatArray, flows: dict[int, float], home: HomeResult | None
    ) -> SideResult:
        top_up = budget - own
        top_up[top_up < DUST] = 0.0
        deposits = list(side.deposits)
        deposits += [
            Deposit(EPOCH + timedelta(days=int(d)), float(a))
            for d, a in zip(days, top_up, strict=True)
            if a
        ]
        market = None
        if deposits:
            account = side.account or other.account
            if account is None:
                raise PlanError(
                    "The options spend different amounts: give one of them an asset mix, "
                    "so the difference can be invested"
                )
            market = run_market(
                account.assets,
                sorted(deposits, key=lambda d: d.day),
                end,
                fees=account.fees,
                taxes=account.taxes,
                fill=account.fill,
                cpi=cpi,
            )
        last_flow = flows.get(end_day, 0.0)
        wealth = (
            (0.0 if home is None else float(home.net_worth[-1]))
            + (0.0 if market is None else market.net_value)
            - last_flow
        )
        ledger = np.append(-budget, wealth)
        ledger_days = np.append(days, end_day)
        return SideResult(
            home=home,
            market=market,
            own=own,
            top_up=top_up,
            last_flow=last_flow,
            wealth=wealth,
            wealth_real=wealth * float(deflate[-1]),
            xirr=xirr(ledger_days, ledger),
            xirr_real=xirr(ledger_days, ledger * deflate),
        )

    return PairResult(
        days=days,
        budget=budget,
        end=end,
        x=side_result(x, y, own_x, flows_x, home_x),
        y=side_result(y, x, own_y, flows_y, home_y),
    )
