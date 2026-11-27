"""``/api/planner/withdraw`` - a starting capital, money taken every month by a rule, and what
is left (Phase J, ``docs/WITHDRAWAL_PLAN.md``).

The account is the Market tab's (its mix over history, its fees and its tax settings) or grows
by an assumed yearly return. The plan runs three times: at the cost share asked for and at its
two bounds, 0 (everything sold is gain) and 1 (only growth from the start is).

An apartment owned on the first day (J1) joins the balance: ``app.planner.home.run_home`` gives
its cash each month and what its sale would leave, read as "today" (no purchase costs; what is
left of its mortgage as one track).
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Annotated, Literal

import numpy as np
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import get_bar_service, get_macro_service, get_universe
from app.api.home import MAX_YEAR
from app.api.planner import (
    AssetIn,
    FeesIn,
    InflationIn,
    InvalidPlanError,
    MarketOptionIn,
    Percent,
    TaxesIn,
    fees_of,
    inflation_spec,
    load_mix,
    taxes_of,
)
from app.data.bar_service import BarService
from app.data.universe import Universe
from app.macro.service import MacroService
from app.models.bars import FloatArray
from app.planner.data import FxSeries, Macro, cpi_path
from app.planner.deposits import add_months, day_number
from app.planner.home import HomePlan, RentMode, run_home
from app.planner.home_data import HomeSpec, home_series
from app.planner.inflation import CpiPath
from app.planner.market import AssetData, Fees, PlanError, TaxBase, Taxes
from app.planner.mortgage import RateKind, Track
from app.planner.tax_presets import BETTERMENT
from app.planner.withdraw import (
    MAX_PERCENT,
    Cause,
    Grid,
    Home,
    Plan,
    Result,
    Rule,
    Sale,
    assumed_grid,
    run,
    sample,
)
from app.planner.withdraw_study import reverse

router = APIRouter(tags=["planner"])

MAX_MONTHS = 1200
NO_CURRENCY_BASE = (
    'The assumed return is in shekels: the "currency" tax base has no rate to follow, and the '
    "nominal one is used"
)
#: A CPI published until less than this many days before the last month date covers the plan.
MONTH_DAYS = 31


class RuleIn(BaseModel):
    kind: Rule = Rule.FIXED
    amount: float = Field(
        default=0.0, ge=0, description="A fixed rule: net a month, in shekels of the first day"
    )
    indexed: bool = Field(default=True, description="A fixed amount rises with the CPI")
    percent: float = Field(
        default=0.0,
        ge=0,
        le=100 * MAX_PERCENT,
        description="A percent rule: the share of the account sold a year, a twelfth each month",
    )


class ReturnsIn(BaseModel):
    mode: Literal["mix", "assumed"] = Field(
        default="mix", description="The market's mix over history, or an assumed yearly return"
    )
    yearly_pct: float = Field(
        default=5.0, ge=-50, le=100, description="Effective, in nominal shekels (assumed mode)"
    )


class AccountIn(BaseModel):
    """The account's mix, fees and taxes. The mix may be empty: an assumed return does not use
    it."""

    assets: list[AssetIn] = Field(default_factory=list[AssetIn], max_length=60)
    use_fx: bool = Field(default=True, description="Convert dollar assets by the USD/ILS rate")
    fees: FeesIn = FeesIn()
    taxes: TaxesIn = TaxesIn()


class HomeIn(BaseModel):
    """An apartment owned on the first day."""

    value: float = Field(gt=0, description="Its value on the first day, in shekels")
    growth: Literal["assumed", "index"] = Field(
        default="assumed", description="An assumed yearly rate, or the national dwelling index"
    )
    growth_pct: float = Field(default=3.0, ge=-20, le=30, description="Yearly, assumed mode")
    use: Literal["live", "rent_out"] = Field(
        default="live", description="Lived in (no cash), or rented out"
    )
    rent: float = Field(default=0.0, ge=0, description="A month, in shekels of the first day")
    vacancy_pct: Percent = 4.0
    rent_tax_pct: Percent = 10.0
    maintenance_pct: float = Field(default=0.5, ge=0, le=10, description="Of the value, a year")
    insurance: float = Field(default=1_500.0, ge=0, description="A year; follows the CPI")
    loan: float = Field(default=0.0, ge=0, description="What is left of its mortgage")
    loan_rate_pct: float = Field(default=4.0, ge=0, le=30, description="Fixed, a year")
    loan_months: int = Field(default=180, ge=1, le=600, description="Payments left")
    loan_linked: bool = Field(default=False, description="Linked to the CPI")
    role: Sale = Sale.KEPT
    sell_after_months: int = Field(default=120, ge=1, le=MAX_MONTHS, description="On a date")
    selling_pct: Percent = 2.4
    early_repayment_pct: Percent = 0.0
    betterment: Literal["single_home", "full"] = Field(
        default="single_home",
        description="A single home, exempt up to the ceiling; or 25 % of the real gain",
    )
    cost: float | None = Field(
        default=None, gt=0, description="What it cost, in shekels of the day it was bought"
    )
    bought: dt.date | None = None


class WithdrawRequest(BaseModel):
    start: dt.date
    months: int = Field(ge=1, le=MAX_MONTHS)
    capital: float = Field(
        ge=0, description="The account's value on the first day (zero only with an apartment)"
    )
    cost_share_pct: Percent = Field(
        default=50.0, description="The share of the capital that is cost; the rest is gain"
    )
    rule: RuleIn
    returns: ReturnsIn = ReturnsIn()
    market: AccountIn = Field(
        default_factory=AccountIn,
        description="The mix (unused on an assumed return), the fees and the taxes",
    )
    inflation: InflationIn = InflationIn()
    home: HomeIn | None = None


class WithdrawSummary(BaseModel):
    cost_share: float
    taken: float = Field(description="Net, all months")
    taken_real: float = Field(description="In shekels of the first day")
    tax: float
    fees: float = Field(description="Account fees")
    commissions: float
    balance: float = Field(description="The account after the last month")
    balance_real: float
    liquidation: float = Field(
        description="What selling all of it then would leave, the apartment included while held"
    )
    liquidation_real: float
    depleted_month: int | None = Field(
        description="From this month on, no month is paid in full again"
    )
    depleted_on: dt.date | None
    months_paid: int = Field(description="Months paid in full")
    short_months: int = Field(description="Months not paid in full, before the end or not")
    first_short_month: int | None
    first_short_on: dt.date | None
    lowest_net_real: float = Field(description="The lowest month's income, in first-day shekels")
    home_worth: float = Field(description="What the apartment's sale would leave at the end")
    home_cash: float = Field(description="The apartment's cash, all months")
    invested: float = Field(description="Put into the account: rent surplus, the sale")
    home_sold_month: int | None
    home_sold_on: dt.date | None
    home_sale: Cause | None


class WithdrawRow(BaseModel):
    month: int
    date: dt.date
    prices: float = Field(description="The CPI's rise since the first day (1 on it)")
    due: float = Field(description="What a fixed rule owes the month")
    sold: float
    commission: float
    tax: float
    fee: float
    net: float
    net_real: float
    balance: float
    balance_floor: float = Field(description="At a cost share of 0")
    balance_ceiling: float = Field(description="At a cost share of 1")
    net_floor: float
    net_ceiling: float
    home: float = Field(description="The apartment's worth while it is held")
    home_cash: float
    invested: float


class WithdrawResponse(BaseModel):
    start: dt.date
    end: dt.date
    months: int
    summary: WithdrawSummary
    floor: WithdrawSummary
    ceiling: WithdrawSummary
    reversed: WithdrawSummary | None = Field(
        description="The plan with its market months in reverse order (null on an assumed return)"
    )
    rows: list[WithdrawRow] = Field(description="One per month date, the start included")
    warnings: list[str]


def summary_of(
    share: float, result: Result, prices: FloatArray, dates: list[dt.date]
) -> WithdrawSummary:
    """The totals of one run; ``prices`` is the CPI's rise since the first day."""
    months = len(dates) - 1
    depleted = result.depleted
    real = result.net[1:] / prices[1:]
    return WithdrawSummary(
        cost_share=share,
        taken=float(result.net.sum()),
        taken_real=float(real.sum()),
        tax=float(result.tax.sum()),
        fees=float(result.fee.sum()),
        commissions=float(result.commission.sum()),
        balance=float(result.balance[-1]),
        balance_real=float(result.balance[-1] / prices[-1]),
        liquidation=result.liquidation,
        liquidation_real=float(result.liquidation / prices[-1]),
        depleted_month=depleted,
        depleted_on=None if depleted is None else dates[depleted],
        months_paid=months - result.short,
        short_months=result.short,
        first_short_month=result.first_short,
        first_short_on=None if result.first_short is None else dates[result.first_short],
        lowest_net_real=float(real.min()),
        home_worth=float(result.home[-1]),
        home_cash=float(result.home_cash.sum()),
        invested=float(result.invested.sum()),
        home_sold_month=result.home_sold,
        home_sold_on=None if result.home_sold is None else dates[result.home_sold],
        home_sale=result.cause,
    )


def home_cost(start: dt.date, home: HomeIn, macro: Macro) -> tuple[float | None, list[str]]:
    """What the apartment cost in shekels of the first day (None: not given), after checking
    the apartment can be read."""
    if home.loan > home.value:
        raise PlanError("The mortgage left cannot be more than the apartment's value")
    if home.cost is None or home.bought is None:
        if (home.cost is None) != (home.bought is None):
            raise PlanError("What the apartment cost and the day it was bought go together")
        return None, []
    if home.bought > start:
        raise PlanError("The apartment must be bought on or before the first day")
    series = macro.get("cpi").data
    published = CpiPath(series.days, series.values)
    if day_number(home.bought) < int(series.days[0]):
        first = dt.date(1970, 1, 1) + dt.timedelta(days=int(series.days[0]))
        raise PlanError(f"The CPI starts on {first}: the purchase must be after it")
    bought, first_day = published.at(np.array([day_number(home.bought), day_number(start)]))
    notes: list[str] = []
    if day_number(start) > int(series.days[-1]) + MONTH_DAYS:
        notes.append("The apartment's cost is indexed by the CPI to its last published value")
    return home.cost * float(first_day / bought), notes


def apartment(
    home: HomeIn,
    start: dt.date,
    months: int,
    cpi: CpiPath,
    macro: Macro,
    cost: float | None,
    bought: dt.date | None,
    *,
    strict: bool = False,
    value: FloatArray | None = None,
) -> tuple[Home, list[str]]:
    """The apartment's cash and worth on the month dates from ``start``, read as "today".
    ``strict`` refuses a series held flat past its data (a window of history); ``value`` is a
    simulated world's dwelling index."""
    plan = HomePlan(
        start=start,
        months=months,
        price=home.value,
        equity=home.value - home.loan,
        tracks=[
            Track(
                home.loan,
                home.loan_months,
                RateKind.FIXED,
                home.loan_rate_pct / 100,
                home.loan_linked,
            )
        ]
        if home.loan > 0
        else [],
        rent_mode=RentMode.RENT_OUT if home.use == "rent_out" else RentMode.NONE,
        rent=home.rent,
        vacancy=home.vacancy_pct / 100,
        rent_tax=home.rent_tax_pct / 100,
        maintenance=home.maintenance_pct / 100,
        insurance=home.insurance,
        selling=home.selling_pct / 100,
        early_repayment=home.early_repayment_pct / 100,
        betterment=BETTERMENT[0 if home.betterment == "single_home" else 1].spec,
        cost=cost,
        bought=bought,
    )
    spec = HomeSpec(
        plan,
        value_mode="historical" if home.growth == "index" else "assumed",
        value_mean=home.growth_pct / 100,
    )
    monthly, warnings = home_series(spec, cpi, macro, strict=strict, value=value)
    result = run_home(plan, monthly)
    cash = result.rent - result.payment - result.costs
    # The engine reads no month after the plan's last: a note on the schedule beyond it is moot.
    beyond = [w for w in warnings if not w.startswith("The schedule after the sale")]
    return Home(cash, result.net_worth, home.role, home.sell_after_months), beyond


@dataclass(frozen=True, slots=True)
class Account:
    """What every run of a request shares: the Market tab's taxes and fees, and its mix (None on
    an assumed return)."""

    taxes: Taxes
    fees: Fees
    mix: list[AssetData] | None
    warnings: list[str]
    #: The shekel rate a dollar asset uses (None: no asset does).
    fx: FxSeries | None = None


def check(body: WithdrawRequest) -> None:
    """The rule has what it needs, and the plan ends in a year the calendar reaches."""
    rule = body.rule
    if rule.kind is Rule.FIXED and rule.amount <= 0:
        raise PlanError("A fixed rule needs an amount above zero")
    if rule.kind is Rule.PERCENT and rule.percent <= 0:
        raise PlanError("A percent rule needs a percent above zero")
    if body.start.year + (body.start.month - 1 + body.months) // 12 > MAX_YEAR:
        raise PlanError(f"Dates after {MAX_YEAR} are not supported")


def account_of(
    body: WithdrawRequest, service: BarService, macro: Macro, universe: Universe, *, mix: bool
) -> Account:
    """The request's account; ``mix`` loads the Market tab's assets with all their history."""
    account = body.market
    # The fee and tax helpers read a market option; a ticker stands in when the mix is empty.
    option = MarketOptionIn(
        assets=account.assets or [AssetIn(symbol="RETURN")],
        use_fx=account.use_fx,
        fees=account.fees,
        taxes=account.taxes,
    )
    if not mix:
        return Account(taxes_of(option), fees_of(option), None, [])
    if not account.assets:
        raise PlanError("The mix has no asset: add a ticker, or use an assumed return")
    assets, fx, notes = load_mix(option, service, macro, universe, day_number(body.start))
    return Account(taxes_of(option), fees_of(option), [a.data for a in assets], notes, fx)


def plan_of(
    body: WithdrawRequest, account: Account, weights: Sequence[float], share: float
) -> Plan:
    """The engine's plan at one cost share."""
    rule, fees = body.rule, account.fees
    return Plan(
        capital=body.capital,
        weights=weights,
        cost_share=share,
        rule=rule.kind,
        amount=rule.amount,
        indexed=rule.indexed,
        percent=rule.percent / 100,
        sell=fees.sell,
        management=fees.management,
        monthly_fee=fees.monthly,
        gains_tax=account.taxes.gains,
        buy=fees.buy,
    )


@router.post("/planner/withdraw", response_model=WithdrawResponse)
def withdraw(
    body: WithdrawRequest,
    service: Annotated[BarService, Depends(get_bar_service)],
    macro: Annotated[MacroService, Depends(get_macro_service)],
    universe: Annotated[Universe, Depends(get_universe)],
) -> WithdrawResponse:
    """A withdrawal plan from one account: a row per month, the totals, and the two tax bounds."""
    try:
        return _run(body, service, macro, universe)
    except PlanError as exc:
        raise InvalidPlanError(str(exc)) from exc


def _run(
    body: WithdrawRequest, service: BarService, macro: MacroService, universe: Universe
) -> WithdrawResponse:
    check(body)
    dates = [add_months(body.start, k) for k in range(body.months + 1)]
    first, last = day_number(dates[0]), day_number(dates[-1])
    # A mortgage that ends after the plan still needs its index (its balance at a sale).
    loan_months = body.home.loan_months if body.home is not None and body.home.loan > 0 else 0
    horizon = day_number(add_months(body.start, max(body.months, loan_months)))
    cpi = cpi_path(inflation_spec(body.inflation), first, horizon, macro)
    account = account_of(body, service, macro, universe, mix=body.returns.mode == "mix")
    taxes = account.taxes
    warnings = list(account.warnings)
    if last > int(cpi.days[-1]) + MONTH_DAYS:
        warnings.append("After the last published CPI it is held flat")
    if account.mix is None:
        if taxes.base is TaxBase.CURRENCY:
            warnings.append(NO_CURRENCY_BASE)
        days = np.array([day_number(d) for d in dates], dtype=np.int64)
        grid = assumed_grid(
            body.months,
            body.returns.yearly_pct / 100,
            cpi.at(days),
            real=taxes.base is TaxBase.REAL,
        )
        weights: list[float] = [1.0]
    else:
        grid = sample(account.mix, body.start, body.months, taxes, cpi)
        weights = [a.weight for a in account.mix]
    home = None
    if body.home is not None:
        cost, notes = home_cost(body.start, body.home, macro)
        home, more = apartment(
            body.home, body.start, body.months, cpi, macro, cost, body.home.bought
        )
        warnings.extend(note for note in [*notes, *more] if note not in warnings)

    def at(share: float, path: Grid = grid) -> Result:
        return run(plan_of(body, account, weights, share), path, home)

    share = body.cost_share_pct / 100
    result, floor, ceiling = at(share), at(0.0), at(1.0)
    if result.cause is Cause.FORCED and result.home_sold is not None:
        warnings.append(
            f"The apartment is sold on {dates[result.home_sold]}: the account could not pay its "
            "costs (a forced sale)"
        )
    prices = grid.cpi / grid.cpi[0]
    return WithdrawResponse(
        start=dates[0],
        end=dates[-1],
        months=body.months,
        summary=summary_of(share, result, prices, dates),
        floor=summary_of(0.0, floor, prices, dates),
        ceiling=summary_of(1.0, ceiling, prices, dates),
        # The market's months in reverse; the CPI and the apartment as they were.
        reversed=None
        if account.mix is None
        else summary_of(share, at(share, reverse(grid)), prices, dates),
        rows=[
            WithdrawRow(
                month=k,
                date=dates[k],
                prices=float(prices[k]),
                due=float(result.due[k]),
                sold=float(result.sold[k]),
                commission=float(result.commission[k]),
                tax=float(result.tax[k]),
                fee=float(result.fee[k]),
                net=float(result.net[k]),
                net_real=float(result.net[k] / prices[k]),
                balance=float(result.balance[k]),
                balance_floor=float(floor.balance[k]),
                balance_ceiling=float(ceiling.balance[k]),
                net_floor=float(floor.net[k]),
                net_ceiling=float(ceiling.net[k]),
                home=float(result.home[k]),
                home_cash=float(result.home_cash[k]),
                invested=float(result.invested[k]),
            )
            for k in range(body.months + 1)
        ],
        warnings=warnings,
    )
