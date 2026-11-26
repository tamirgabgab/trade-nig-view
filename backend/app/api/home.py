"""``/api/planner/home`` - the apartment side of the planner (Phase H, H2)."""

from __future__ import annotations

import datetime as dt
from typing import Annotated, Literal

import numpy as np
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import get_macro_service
from app.api.planner import InflationIn, InvalidPlanError, Percent
from app.macro.service import MacroService
from app.models.bars import IntArray
from app.planner import tax_presets
from app.planner.deposits import add_months
from app.planner.home import (
    Betterment,
    Bracket,
    HomePlan,
    HomeSeries,
    RentMode,
    assumed_values,
    run_home,
)
from app.planner.home_data import (
    MONTH_DAYS,
    assumed_anchor,
    historical_anchor,
    historical_values,
    month_days,
)
from app.planner.inflation import HISTORICAL_FROM, CpiPath, assumed_cpi, historical_cpi
from app.planner.market import PlanError
from app.planner.mortgage import RateKind, Repayment, Schedule, Track

router = APIRouter(tags=["planner"])

#: Bounds that keep the month dates and the value path finite.
MAX_YEAR = 2200
MAX_HELD_MONTHS = 1200


class BracketIn(BaseModel):
    up_to: float | None = Field(default=None, gt=0, description="Upper bound; null: no bound")
    rate_pct: Percent


class TrackIn(BaseModel):
    share: float = Field(default=1.0, gt=0, description="Relative share of the loan")
    months: int = Field(default=240, ge=1, le=480)
    kind: RateKind = RateKind.FIXED
    rate_pct: float = Field(
        default=4.0,
        ge=-5,
        le=30,
        description="Yearly: the rate (fixed), the first period's (variable), the spread on prime",
    )
    linked: bool = Field(default=False, description="The balance follows the CPI")
    reset_years: int = Field(default=5, ge=1, le=10, description="Of a variable track")
    repayment: Repayment = Repayment.SPITZER
    grace_months: int = Field(default=0, ge=0, le=479)
    grace_full: bool = Field(
        default=False, description="In the grace (or the balloon) the interest accrues, unpaid"
    )


class RatesIn(BaseModel):
    mode: Literal["assumed", "historical"] = "assumed"
    base_pct: Percent = Field(default=3.25, description="The assumed Bank of Israel rate")
    shock_pct: float = Field(default=0.0, ge=-10, le=20, description="It moves by this much")
    shock_after_months: int = Field(default=0, ge=0, le=480)


class PurchaseIn(BaseModel):
    tax_brackets: list[BracketIn] = Field(default_factory=list[BracketIn], max_length=12)
    lawyer_pct: Percent = 0.0
    broker_pct: Percent = 0.0
    renovation: float = Field(default=0.0, ge=0)


class OwnerIn(BaseModel):
    maintenance_pct: Percent = Field(default=0.0, description="Of the value, a year")
    insurance: float = Field(default=0.0, ge=0, description="Shekels a year, CPI-indexed")


class RentIn(BaseModel):
    mode: RentMode = RentMode.NONE
    monthly: float = Field(default=0.0, ge=0, description="Shekels a month at the start")
    growth: Literal["cpi", "value", "fixed"] = "cpi"
    growth_pct: float = Field(default=0.0, ge=-20, le=50, description="Yearly, for 'fixed'")
    vacancy_pct: Percent = 0.0
    tax_pct: Percent = 0.0


class ValueIn(BaseModel):
    mode: Literal["assumed", "historical"] = "assumed"
    series: str = Field(default="dwelling", description="A dwelling price index of /macro")
    mean_pct: float = Field(default=3.0, ge=-20, le=50, description="Yearly mean growth")
    sd_pct: Percent = Field(default=0.0, description="Yearly volatility")
    seed: int | None = Field(default=None, description="Draw a path; null: the mean path")


class BettermentIn(BaseModel):
    rate_pct: Percent = 25.0
    single_home: bool = False
    ceiling: float = Field(default=5_008_000.0, gt=0)
    linear: bool = True
    brackets: list[BracketIn] = Field(default_factory=list[BracketIn], max_length=12)


class SaleIn(BaseModel):
    costs_pct: Percent = 0.0
    early_repayment_pct: Percent = 0.0
    betterment: BettermentIn = BettermentIn()


class HomeRequest(BaseModel):
    start: dt.date
    end: dt.date = Field(description="The sale: on the last whole month from the start before it")
    price: float = Field(gt=0)
    equity: float = Field(ge=0)
    tracks: list[TrackIn] = Field(default_factory=list[TrackIn], max_length=3)
    rates: RatesIn = RatesIn()
    purchase: PurchaseIn = PurchaseIn()
    owner: OwnerIn = OwnerIn()
    rent: RentIn = RentIn()
    value: ValueIn = ValueIn()
    sale: SaleIn = SaleIn()
    inflation: InflationIn = InflationIn()


class TrackOut(BaseModel):
    amount: float
    months: int
    first_rate: float = Field(description="Yearly, as a fraction")
    first_payment: float
    highest_payment: float
    total_interest: float = Field(description="Over the whole term")
    total_linkage: float


class ScheduleRow(BaseModel):
    date: dt.date
    payment: float
    interest: float
    principal: float
    linkage: float
    balance: float
    rate: float = Field(description="Balance-weighted yearly rate of the month")


class HomePoint(BaseModel):
    date: dt.date
    value: float
    balance: float
    net_worth: float = Field(description="If sold this month")
    payment: float
    costs: float
    rent: float


class HomeSummary(BaseModel):
    months: int
    loan: float
    equity: float
    purchase_tax: float
    purchase_costs: float
    first_payment: float
    highest_payment: float = Field(description="Until the sale")
    paid: float = Field(description="Mortgage payments until the sale")
    interest: float
    linkage: float
    owner_costs: float
    rent: float = Field(description="Saved or received until the sale")
    value: float = Field(description="At the sale")
    balance: float
    selling_costs: float
    early_repayment_fee: float
    betterment_tax: float
    net_worth: float
    net_worth_real: float = Field(description="In shekels of the purchase day")
    xirr: float | None
    xirr_real: float | None


class HomeResponse(BaseModel):
    summary: HomeSummary
    tracks: list[TrackOut]
    schedule: list[ScheduleRow] = Field(description="All tracks, the whole term")
    path: list[HomePoint]
    warnings: list[str]


class PurchasePresetOut(BaseModel):
    id: str
    name: str
    note: str
    brackets: list[BracketIn]


class BettermentPresetOut(BaseModel):
    id: str
    name: str
    note: str
    spec: BettermentIn


class TaxPresets(BaseModel):
    as_of: str
    source: str
    purchase: list[PurchasePresetOut]
    betterment: list[BettermentPresetOut]


def _pct(fraction: float) -> float:
    """A stored fraction as a percentage a form can show (3.5, not 3.5000000000000004)."""
    return round(fraction * 100, 6)


def _brackets_out(brackets: tuple[Bracket, ...]) -> list[BracketIn]:
    return [BracketIn(up_to=b.up_to, rate_pct=_pct(b.rate)) for b in brackets]


@router.get("/planner/tax-presets", response_model=TaxPresets)
def get_tax_presets() -> TaxPresets:
    """The built-in purchase-tax tables and betterment-tax settings (defaults, not tax advice)."""
    return TaxPresets(
        as_of=tax_presets.AS_OF,
        source=tax_presets.SOURCE,
        purchase=[
            PurchasePresetOut(id=p.id, name=p.name, note=p.note, brackets=_brackets_out(p.brackets))
            for p in tax_presets.PURCHASE
        ],
        betterment=[
            BettermentPresetOut(
                id=p.id,
                name=p.name,
                note=p.note,
                spec=BettermentIn(
                    rate_pct=_pct(p.spec.rate),
                    single_home=p.spec.single_home,
                    ceiling=p.spec.ceiling,
                    linear=p.spec.linear,
                ),
            )
            for p in tax_presets.BETTERMENT
        ],
    )


def _brackets(rows: list[BracketIn]) -> tuple[Bracket, ...]:
    """Rising slices; the last one has no bound."""
    bounds = [float("inf") if r.up_to is None else r.up_to for r in rows]
    if bounds != sorted(bounds) or len(set(bounds)) != len(bounds):
        raise PlanError("Tax brackets must rise, each with a different upper bound")
    if rows and rows[-1].up_to is not None:
        raise PlanError("The last tax bracket must have no upper bound")
    return tuple(Bracket(r.up_to, r.rate_pct / 100) for r in rows)


def months_between(start: dt.date, end: dt.date) -> int:
    """The largest k with ``add_months(start, k) <= end`` (so Jan 31 to Feb 28 is a month)."""
    k = (end.year - start.year) * 12 + end.month - start.month
    return k if k < 1 or add_months(start, k) <= end else k - 1


@router.post("/planner/home", response_model=HomeResponse)
def run_home_plan(
    body: HomeRequest, macro: Annotated[MacroService, Depends(get_macro_service)]
) -> HomeResponse:
    """An apartment bought with a mortgage and sold on ``end``: payments, costs and net worth."""
    try:
        return _run(body, macro)
    except PlanError as exc:
        raise InvalidPlanError(str(exc)) from exc


def _cpi(body: HomeRequest, macro: MacroService, days: IntArray) -> CpiPath:
    spec = body.inflation
    if spec.mode == "historical":
        if days[0] < HISTORICAL_FROM:
            raise PlanError("The historical CPI is used from 1994 on: start later or assume one")
        return historical_cpi(macro.get("cpi").data)
    rng = None if spec.seed is None else np.random.default_rng(spec.seed)
    return assumed_cpi(
        int(days[0]),
        int(days[-1]),
        mu=spec.mean_pct / 100,
        sigma=spec.sd_pct / 100,
        phi=spec.persistence,
        rng=rng,
    )


def _run(body: HomeRequest, macro: MacroService) -> HomeResponse:
    if body.end.year > MAX_YEAR:
        raise PlanError(f"Dates after {MAX_YEAR} are not supported")
    held = months_between(body.start, body.end)
    if held < 1:
        raise PlanError("The sale must be at least a month after the purchase")
    if held > MAX_HELD_MONTHS:
        raise PlanError(f"The apartment can be held for at most {MAX_HELD_MONTHS // 12} years")
    loan = body.price - body.equity
    if loan < 0:
        raise PlanError("The equity cannot exceed the price")
    if loan > 0 and not body.tracks:
        raise PlanError("A loan needs at least one mortgage track")
    shares = sum(t.share for t in body.tracks)
    tracks = [
        Track(
            amount=loan * t.share / shares,
            months=t.months,
            kind=t.kind,
            rate=t.rate_pct / 100,
            linked=t.linked,
            reset_months=t.reset_years * 12,
            repayment=t.repayment,
            grace_months=t.grace_months,
            grace_full=t.grace_full,
        )
        for t in (body.tracks if loan > 0 else [])
    ]
    horizon = max([held, *(t.months for t in tracks)])
    days = month_days(body.start, horizon)
    warnings: list[str] = []

    def held_flat(what: str, last: int, in_schedule: bool) -> None:
        """Warn when the plan runs past the published data (``last`` is its last day)."""
        if days[held] > last + MONTH_DAYS:
            warnings.append(f"After the last published {what} it is held flat")
        elif in_schedule and days[-1] > last + MONTH_DAYS:
            warnings.append(
                f"The schedule after the sale holds the {what} flat past its last published value"
            )

    path = _cpi(body, macro, days)
    held_flat("CPI", int(path.days[-1]), any(t.linked for t in tracks))
    cpi = path.at(days)
    if body.rates.mode == "historical":
        anchor = historical_anchor(macro, days)
        held_flat(
            "Bank of Israel rate",
            int(macro.get("boi_rate").data.days[-1]),
            any(t.kind is not RateKind.FIXED for t in tracks),
        )
    else:
        anchor = assumed_anchor(
            horizon,
            body.rates.base_pct / 100,
            body.rates.shock_pct / 100,
            body.rates.shock_after_months,
        )
    if body.value.mode == "historical":
        value = historical_values(macro, body.value.series, days[: held + 1])
    else:
        rng = None if body.value.seed is None else np.random.default_rng(body.value.seed)
        value = assumed_values(held, body.value.mean_pct / 100, body.value.sd_pct / 100, rng)
    rent_index = {
        "cpi": cpi[: held + 1],
        "value": value,
        "fixed": (1 + body.rent.growth_pct / 100) ** (np.arange(held + 1) / 12),
    }[body.rent.growth]
    spec = body.sale.betterment
    plan = HomePlan(
        start=body.start,
        months=held,
        price=body.price,
        equity=body.equity,
        tracks=tracks,
        purchase_tax=_brackets(body.purchase.tax_brackets),
        lawyer=body.purchase.lawyer_pct / 100,
        broker=body.purchase.broker_pct / 100,
        renovation=body.purchase.renovation,
        maintenance=body.owner.maintenance_pct / 100,
        insurance=body.owner.insurance,
        rent_mode=body.rent.mode,
        rent=body.rent.monthly,
        vacancy=body.rent.vacancy_pct / 100,
        rent_tax=body.rent.tax_pct / 100,
        selling=body.sale.costs_pct / 100,
        early_repayment=body.sale.early_repayment_pct / 100,
        betterment=Betterment(
            rate=spec.rate_pct / 100,
            single_home=spec.single_home,
            ceiling=spec.ceiling,
            linear=spec.linear,
            brackets=_brackets(spec.brackets),
        ),
    )
    result = run_home(plan, HomeSeries(value, cpi, anchor, rent_index))
    m = result.mortgage
    until = slice(0, held)

    def track_out(track: Track, s: Schedule) -> TrackOut:
        return TrackOut(
            amount=track.amount,
            months=track.months,
            first_rate=float(s.rate[0]),
            first_payment=float(s.payment[0]),
            highest_payment=float(s.payment.max()),
            total_interest=float(s.interest.sum()),
            total_linkage=float(s.linkage.sum()),
        )

    end_value, end_balance = float(result.value[-1]), float(result.balance[-1])
    return HomeResponse(
        summary=HomeSummary(
            months=held,
            loan=result.loan,
            equity=body.equity,
            purchase_tax=result.purchase_tax,
            purchase_costs=result.purchase_costs,
            first_payment=float(m.payment[0]) if tracks else 0.0,
            highest_payment=float(result.payment.max()),
            paid=float(m.payment[until].sum()),
            interest=float(m.interest[until].sum()),
            linkage=float(m.linkage[until].sum()),
            owner_costs=float(result.costs.sum()),
            rent=float(result.rent.sum()),
            value=end_value,
            balance=end_balance,
            selling_costs=end_value * plan.selling,
            early_repayment_fee=end_balance * plan.early_repayment,
            betterment_tax=float(result.betterment[-1]),
            net_worth=float(result.net_worth[-1]),
            net_worth_real=result.net_worth_real,
            xirr=result.xirr,
            xirr_real=result.xirr_real,
        ),
        tracks=[track_out(t, s) for t, s in zip(tracks, result.schedules, strict=True)],
        schedule=[
            ScheduleRow(
                date=dt.date(1970, 1, 1) + dt.timedelta(days=int(days[k + 1])),
                payment=float(m.payment[k]),
                interest=float(m.interest[k]),
                principal=float(m.principal[k]),
                linkage=float(m.linkage[k]),
                balance=float(m.balance[k]),
                rate=float(m.rate[k]),
            )
            for k in range(len(m.payment) if tracks else 0)
        ],
        path=[
            HomePoint(
                date=result.dates[k],
                value=float(result.value[k]),
                balance=float(result.balance[k]),
                net_worth=float(result.net_worth[k]),
                payment=float(result.payment[k]),
                costs=float(result.costs[k]),
                rent=float(result.rent[k]),
            )
            for k in range(held + 1)
        ],
        warnings=warnings,
    )
