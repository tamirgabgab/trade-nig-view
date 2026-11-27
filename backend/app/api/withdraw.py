"""``/api/planner/withdraw`` - a starting capital, money taken every month by a rule, and what
is left (Phase J, ``docs/WITHDRAWAL_PLAN.md``).

The account is the Market tab's (its mix over history, its fees and its tax settings) or grows
by an assumed yearly return. The plan runs three times: at the cost share asked for and at its
two bounds, 0 (everything sold is gain) and 1 (only growth from the start is).
"""

from __future__ import annotations

import datetime as dt
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
from app.planner.data import cpi_path
from app.planner.deposits import add_months, day_number
from app.planner.market import PlanError, TaxBase
from app.planner.withdraw import MAX_PERCENT, Plan, Result, Rule, assumed_grid, run, sample

router = APIRouter(tags=["planner"])

MAX_MONTHS = 1200
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


class WithdrawRequest(BaseModel):
    start: dt.date
    months: int = Field(ge=1, le=MAX_MONTHS)
    capital: float = Field(gt=0, description="The account's value on the first day, in shekels")
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


class WithdrawSummary(BaseModel):
    cost_share: float
    taken: float = Field(description="Net, all months")
    taken_real: float = Field(description="In shekels of the first day")
    tax: float
    fees: float = Field(description="Account fees")
    commissions: float
    balance: float = Field(description="The account after the last month")
    balance_real: float
    liquidation: float = Field(description="What selling all of it then would leave")
    depleted_month: int | None = Field(description="The first month a fixed amount is not paid")
    depleted_on: dt.date | None
    months_paid: int = Field(description="Months paid in full")
    lowest_net_real: float = Field(description="The lowest month's income, in first-day shekels")


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


class WithdrawResponse(BaseModel):
    start: dt.date
    end: dt.date
    months: int
    summary: WithdrawSummary
    floor: WithdrawSummary
    ceiling: WithdrawSummary
    rows: list[WithdrawRow] = Field(description="One per month date, the start included")
    warnings: list[str]


def _summary(
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
        depleted_month=depleted,
        depleted_on=None if depleted is None else dates[depleted],
        months_paid=months if depleted is None else depleted - 1,
        lowest_net_real=float(real.min()),
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
    rule = body.rule
    if rule.kind is Rule.FIXED and rule.amount <= 0:
        raise PlanError("A fixed rule needs an amount above zero")
    if rule.kind is Rule.PERCENT and rule.percent <= 0:
        raise PlanError("A percent rule needs a percent above zero")
    if body.start.year + (body.start.month - 1 + body.months) // 12 > MAX_YEAR:
        raise PlanError(f"Dates after {MAX_YEAR} are not supported")
    dates = [add_months(body.start, k) for k in range(body.months + 1)]
    first, last = day_number(dates[0]), day_number(dates[-1])
    cpi = cpi_path(inflation_spec(body.inflation), first, last, macro)
    account = body.market
    # The fee and tax helpers read a market option; a ticker stands in when the mix is empty.
    option = MarketOptionIn(
        assets=account.assets or [AssetIn(symbol="RETURN")],
        use_fx=account.use_fx,
        fees=account.fees,
        taxes=account.taxes,
    )
    taxes, fees = taxes_of(option), fees_of(option)
    warnings: list[str] = []
    if last > int(cpi.days[-1]) + MONTH_DAYS:
        warnings.append("After the last published CPI it is held flat")
    if body.returns.mode == "assumed":
        if taxes.base is TaxBase.CURRENCY:
            warnings.append(
                'The assumed return is in shekels: the "currency" tax base has no rate to follow, '
                "and the nominal one is used"
            )
        days = np.array([day_number(d) for d in dates], dtype=np.int64)
        grid = assumed_grid(
            body.months,
            body.returns.yearly_pct / 100,
            cpi.at(days),
            real=taxes.base is TaxBase.REAL,
        )
        weights: list[float] = [1.0]
    else:
        if not account.assets:
            raise PlanError("The mix has no asset: add a ticker, or use an assumed return")
        assets, _, notes = load_mix(option, service, macro, universe, first)
        warnings.extend(notes)
        grid = sample([a.data for a in assets], body.start, body.months, taxes, cpi)
        weights = [a.data.weight for a in assets]

    def at(share: float) -> Result:
        return run(
            Plan(
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
                gains_tax=taxes.gains,
            ),
            grid,
        )

    share = body.cost_share_pct / 100
    result, floor, ceiling = at(share), at(0.0), at(1.0)
    prices = grid.cpi / grid.cpi[0]
    return WithdrawResponse(
        start=dates[0],
        end=dates[-1],
        months=body.months,
        summary=_summary(share, result, prices, dates),
        floor=_summary(0.0, floor, prices, dates),
        ceiling=_summary(1.0, ceiling, prices, dates),
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
            )
            for k in range(body.months + 1)
        ],
        warnings=warnings,
    )
