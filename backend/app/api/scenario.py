"""``/api/planner/run`` and ``/api/planner/study``: two options on the same money (H3a)."""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from datetime import date
from typing import Annotated, Literal

import numpy as np
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import get_bar_service, get_macro_service, get_universe
from app.api.home import MAX_YEAR, HomeOptionIn, home_spec
from app.api.planner import (
    InflationIn,
    InvalidPlanError,
    MarketOptionIn,
    Percent,
    fees_of,
    inflation_spec,
    load_mix,
    official_rate_note,
    schedule,
    taxes_of,
)
from app.data.bar_service import BarService
from app.data.universe import Universe
from app.errors import DataUnavailableError
from app.macro.service import MacroService
from app.planner import explain, study
from app.planner.data import FxSeries, Macro, MacroMemo
from app.planner.deposits import add_months, day_number
from app.planner.home import RentMode
from app.planner.market import FillSpec, PlanError
from app.planner.scenario import Account, PairResult, Side, SideResult, run_pair
from app.planner.scenario_data import (
    Change,
    OptionSpec,
    ScenarioSpec,
    build,
    difference,
    dwelling_correlation,
    first_day,
    mixes_differ,
    sensitivity,
    spending_gap,
    term_months,
)

router = APIRouter(tags=["planner"])

#: The first start a study ever tries (and the one it tries when the request names none).
EARLIEST_START = dt.date(1900, 1, 1)
MAX_WINDOWS = 2000
#: The ranges the breakeven rates are searched in, and their tolerance.
APPRECIATION = (-0.2, 0.5)
MARKET_RETURN = (-0.5, 1.0)
MORTGAGE_SHIFT = (-0.1, 0.3)
RENT_SCALE = (0.0, 20.0)
TOLERANCE = 1e-7
#: The time-averaged net worth samples about this many exit months.
AVERAGE_POINTS = 60
#: A warning when both options spend this much more than the larger plan alone.
GAP_SHARE = 0.005


class OptionIn(BaseModel):
    """One option: an apartment, a market account, or both. An empty option is a mirror: it
    invests whatever the other option spends, in the other's asset mix."""

    home: HomeOptionIn | None = None
    sold_on: dt.date | None = Field(
        default=None,
        description="Its apartment's own sale, on the last whole month from its purchase up to "
        "this day; null: by the comparison's end. Sold before the end, what it nets is held in "
        "the account until then",
    )
    market: MarketOptionIn | None = Field(
        default=None, description="Its mix and its own deposits (none: only the top-ups)"
    )


class ScenarioRequest(BaseModel):
    x: OptionIn
    y: OptionIn
    end: dt.date = Field(
        description="Everything still held is sold on it (an apartment: on its month date); "
        "with an apartment of its own sale date, the comparison ends on the last sale"
    )
    inflation: InflationIn = InflationIn()
    forced_discount_pct: Percent = Field(
        default=10.0, description="Off the apartment's value in a forced sale"
    )


class StudyRequest(ScenarioRequest):
    first_start: dt.date | None = Field(default=None, description="The first start to try")
    last_start: dt.date | None = None
    step_months: int = Field(default=1, ge=1, le=12)
    follow_rates: bool = Field(
        default=True,
        description="Move the tracks' rates with the Bank of Israel rate at each window's start",
    )
    horizons_years: list[Annotated[int, Field(ge=1, le=50)]] = Field(
        default=[5, 10, 15, 20, 25, 30], min_length=1, max_length=12
    )


class HomeOut(BaseModel):
    value: float
    balance: float
    betterment_tax: float
    net_worth: float = Field(description="After the selling costs, the loan and the tax")


class AccountOut(BaseModel):
    deposited: float
    value: float
    tax: float
    net_value: float


class OptionOut(BaseModel):
    wealth: float = Field(description="What it is worth in cash at the end")
    wealth_real: float = Field(description="In shekels of the first day")
    xirr: float | None
    xirr_real: float | None
    own: float = Field(description="Its own spending before the end")
    topped_up: float = Field(description="Invested to match the other option's spending")
    home: HomeOut | None
    account: AccountOut | None


class BreakevenOut(BaseModel):
    """The value of one input at which the options end equal (null: none in its range)."""

    appreciation: float | None = Field(description="Yearly growth of the apartment's value")
    market_return: float | None = Field(description="Yearly return of the market asset")
    mortgage_shift: float | None = Field(description="Added to every track's yearly rate")
    rent_scale: float | None = Field(description="A multiple of the rent")


class AveragePoint(BaseModel):
    months: int
    date: dt.date
    x: float
    y: float
    x_forced: float | None = Field(description="With its apartment sold at the discount")
    y_forced: float | None


class AverageOut(BaseModel):
    x: float
    y: float
    points: list[AveragePoint]


class DecompositionOut(BaseModel):
    """The apartment's yearly return and what each source adds to it (they add up)."""

    appreciation: float
    rent: float
    leverage: float
    costs: float
    total: float


class MoveOut(BaseModel):
    """One input moved by ``step`` each way: the change of x's end value minus y's."""

    input: Literal["appreciation", "mortgage_rates", "rent", "market_return", "taxes"]
    step: float = Field(description="Points of a yearly rate (0.01), or a share of the rent")
    down: float | None = Field(description="Null: the plan cannot run with the move")
    up: float | None


class LeadOut(BaseModel):
    leader: Literal["x", "y"] | None = Field(description="Ahead at the last exit; null: a tie")
    since_months: int | None = Field(description="The exit month it stays ahead from")
    x_share: float = Field(description="The share of exit months x is ahead (a tie: half)")
    step_months: int = Field(description="The exit months checked are this far apart")


class OptionLiquidity(BaseModel):
    cash: float = Field(description="The account, after its tax: available at once")
    apartment: float | None = Field(description="Its net worth in a normal sale")
    forced: float | None = Field(description="Its net worth sold at the discount")
    wealth_forced: float = Field(description="The option's end value with a forced sale")


class LiquidityOut(BaseModel):
    discount: float
    x: OptionLiquidity
    y: OptionLiquidity


class CorrelationOut(BaseModel):
    """Between the yearly returns of the dwelling index and of the mix, in shekels."""

    value: float
    years: int
    low: float
    high: float


class RunResponse(BaseModel):
    start: dt.date
    end: dt.date
    months: int = Field(description="The scenario's term")
    spent: float = Field(description="What each option puts in before the end")
    x: OptionOut
    y: OptionOut
    difference: float = Field(description="The end value of x minus that of y")
    difference_real: float
    breakeven: BreakevenOut
    average: AverageOut = Field(description="Net worth averaged over the exit months")
    decomposition: DecompositionOut | None = Field(
        description="Of the first apartment; null: none, or its return does not exist"
    )
    sensitivity: list[MoveOut]
    lead: LeadOut
    liquidity: LiquidityOut
    correlation: CorrelationOut | None = Field(
        description="Null: no apartment or account, or no history (reads the dwelling index)"
    )
    warnings: list[str]


class SummaryOut(BaseModel):
    windows: int
    first: dt.date
    last: dt.date
    effective: float = Field(description="About how many independent terms the windows hold")
    p_win: float = Field(description="The share of windows x ends above y (a tie counts half)")
    median_difference: float
    median_difference_real: float
    x_xirr: float | None
    y_xirr: float | None
    x_xirr_real: float | None
    y_xirr_real: float | None


class WindowOut(BaseModel):
    start: dt.date
    x_wealth: float
    y_wealth: float
    x_xirr: float | None
    y_xirr: float | None


class MapCell(BaseModel):
    x_xirr: float | None
    y_xirr: float | None
    difference: float


class MapRow(BaseModel):
    start: dt.date
    cells: list[MapCell | None] = Field(description="One per horizon (null: it cannot run)")


class WinMap(BaseModel):
    horizons_years: list[int]
    rows: list[MapRow]


class StudyResponse(BaseModel):
    months: int
    summary: SummaryOut
    before: str | None = Field(description="Why the start before the first window cannot run")
    after: str | None
    windows: list[WindowOut]
    win_map: WinMap
    warnings: list[str]


def scenario_spec(
    body: ScenarioRequest, service: BarService, macro: Macro, universe: Universe
) -> tuple[ScenarioSpec, list[str], list[FxSeries | None]]:
    """The scenario of a request, its warnings, and the USD/ILS series its accounts use."""
    if body.end.year > MAX_YEAR:
        raise PlanError(f"Dates after {MAX_YEAR} are not supported")
    warnings: list[str] = []
    options: list[OptionSpec] = []
    rates: list[FxSeries | None] = []
    starts = [
        date
        for option in (body.x, body.y)
        for date in (
            ([] if option.home is None else [option.home.start])
            + ([] if option.market is None else [d.date for d in option.market.deposits])
            + ([] if option.market is None else [r.start for r in option.market.recurring])
        )
    ]
    if not starts:
        raise PlanError("There is nothing to compare: neither option has an apartment or a deposit")
    for option in (body.x, body.y):
        sale = option.sold_on or body.end
        home = None if option.home is None else home_spec(option.home, sale)
        market = option.market
        if market is None:
            options.append(OptionSpec(home=home))
            continue
        assets, fx, notes = load_mix(market, service, macro, universe, day_number(min(starts)))
        warnings.extend(notes)
        rates.append(fx)
        one_off, recurring = schedule(market)
        if any(d.at is not None for d in one_off) or any(r.at is not None for r in recurring):
            warnings.append(
                "A comparison does not use the deposits' times of day: each buys by its day's bar"
            )
        options.append(
            OptionSpec(
                home=home,
                account=Account(
                    [a.data for a in assets],
                    fees_of(market),
                    taxes_of(market),
                    FillSpec(market.fill.mode, market.fill.granularity),
                ),
                one_off=one_off,
                recurring=recurring,
                fill_seed=market.fill.seed,
            )
        )
    spec = ScenarioSpec(options[0], options[1], body.end, inflation_spec(body.inflation))
    return spec, warnings, rates


def _option(side: SideResult) -> OptionOut:
    home, market = side.home, side.market
    return OptionOut(
        wealth=side.wealth,
        wealth_real=side.wealth_real,
        xirr=side.xirr,
        xirr_real=side.xirr_real,
        own=float(side.own.sum()),
        topped_up=float(side.top_up.sum()),
        home=None
        if home is None
        else HomeOut(
            value=float(home.value[-1]),
            balance=float(home.balance[-1]),
            betterment_tax=float(home.betterment[-1]),
            net_worth=float(home.net_worth[-1]),
        ),
        account=None
        if market is None
        else AccountOut(
            deposited=market.deposited,
            value=market.value,
            tax=market.tax,
            net_value=market.net_value,
        ),
    )


def _breakevens(spec: ScenarioSpec, macro: Macro) -> BreakevenOut:
    homes = [o.home for o in (spec.x, spec.y) if o.home is not None]
    accounts = any(o.account is not None for o in (spec.x, spec.y))
    rented = any(h.plan.rent_mode is not RentMode.NONE and h.plan.rent > 0 for h in homes)

    def solve(
        applies: bool, bounds: tuple[float, float], change: Callable[[float], Change]
    ) -> float | None:
        if not applies:
            return None
        return study.breakeven(
            lambda v: difference(spec, macro, change(v)), *bounds, tolerance=TOLERANCE
        )

    return BreakevenOut(
        appreciation=solve(bool(homes), APPRECIATION, lambda v: Change(appreciation=v)),
        market_return=solve(accounts, MARKET_RETURN, lambda v: Change(market_return=v)),
        mortgage_shift=solve(
            any(h.plan.tracks for h in homes), MORTGAGE_SHIFT, lambda v: Change(rate_shift=v)
        ),
        rent_scale=solve(rented, RENT_SCALE, lambda v: Change(rent_scale=v)),
    )


def _forced(side: Side, result: SideResult, discount: float) -> OptionLiquidity:
    """What of an option is cash at once, and its end value if the apartment sells low."""
    cash = 0.0 if result.market is None else result.market.net_value
    home = result.home
    # An apartment sold before the end is cash by then: nothing left to sell low.
    if home is None or not result.home_held or side.home is None or side.series is None:
        return OptionLiquidity(cash=cash, apartment=None, forced=None, wealth_forced=result.wealth)
    normal = float(home.net_worth[-1])
    forced = explain.forced_sale(side.home, side.series, home, discount)
    return OptionLiquidity(
        cash=cash, apartment=normal, forced=forced, wealth_forced=result.wealth - (normal - forced)
    )


def _decomposition(x: Side, y: Side) -> DecompositionOut | None:
    for side in (x, y):
        if side.home is not None and side.series is not None:
            parts = explain.decompose(side.home, side.series)
            return None if parts is None else DecompositionOut(**parts)
    return None


def _lead(average: study.Average, step: int) -> LeadOut:
    points = average.points
    found = explain.lead(
        [p.months for p in points],
        np.array([p.x for p in points]),
        np.array([p.y for p in points]),
    )
    return LeadOut(
        leader=found.leader, since_months=found.since, x_share=found.x_share, step_months=step
    )


def _correlation(spec: ScenarioSpec, macro: Macro) -> CorrelationOut | None:
    try:
        found = dwelling_correlation(spec, macro)
    except DataUnavailableError:
        return None  # an extra: its data missing is not the comparison failing
    if found is None:
        return None
    return CorrelationOut(value=found.value, years=found.years, low=found.low, high=found.high)


def _run(
    body: ScenarioRequest, service: BarService, macro: Macro, universe: Universe
) -> RunResponse:
    spec, warnings, _ = scenario_spec(body, service, macro, universe)
    x, y, end, cpi, notes = build(spec, macro)
    result = run_pair(x, y, end, cpi)
    warnings.extend(notes)
    spent = float(result.budget.sum())
    gap = spending_gap(result)
    if gap > GAP_SHARE * spent:
        warnings.append(
            "The options spend on different dates: each is topped up to the larger spending of "
            f"every date, so both put in {gap:,.0f} more than the larger plan alone"
        )
    if mixes_differ(spec):
        warnings.append(
            "The options hold different mixes: the breakeven market return gives both the same "
            "return, and the market's move in the sensitivity tilts both"
        )
    term = term_months(spec)
    step = max(1, -(-term // AVERAGE_POINTS))
    exits = sorted({*range(step, term + 1, step), term})
    discount = body.forced_discount_pct / 100
    sides: dict[date, tuple[Side, Side]] = {end: (x, y)}

    def exit_after(months: int) -> PairResult:
        early_x, early_y, sold, path, _ = build(spec, macro, Change(months=months))
        sides[sold] = (early_x, early_y)
        return run_pair(early_x, early_y, sold, path)

    average = study.time_average(exit_after, exits)
    if average.skipped:
        warnings.append(
            f"The net worth is averaged over {len(average.points)} of {len(exits)} exit months: "
            "the plan cannot run over the others"
        )
    return RunResponse(
        start=first_day(spec),
        end=end,
        months=term,
        spent=spent,
        x=_option(result.x),
        y=_option(result.y),
        difference=result.x.wealth - result.y.wealth,
        difference_real=result.x.wealth_real - result.y.wealth_real,
        breakeven=_breakevens(spec, macro),
        average=AverageOut(
            x=average.x,
            y=average.y,
            points=[
                AveragePoint(
                    months=p.months,
                    date=p.end,
                    x=p.x,
                    y=p.y,
                    x_forced=_forced(sides[p.end][0], p.result.x, discount).wealth_forced
                    if p.result.x.home_held
                    else None,
                    y_forced=_forced(sides[p.end][1], p.result.y, discount).wealth_forced
                    if p.result.y.home_held
                    else None,
                )
                for p in average.points
            ],
        ),
        decomposition=_decomposition(x, y),
        sensitivity=[
            MoveOut(input=m.input, step=m.step, down=m.down, up=m.up)  # type: ignore[arg-type]
            for m in sensitivity(spec, macro)
        ],
        lead=_lead(average, step),
        liquidity=LiquidityOut(
            discount=discount,
            x=_forced(x, result.x, discount),
            y=_forced(y, result.y, discount),
        ),
        correlation=_correlation(spec, macro),
        warnings=list(dict.fromkeys(warnings)),
    )


def month_shifts(base: dt.date, first: dt.date, last: dt.date, step: int) -> list[int]:
    """The month shifts (multiples of ``step``) that start the plan inside ``first .. last``."""
    low = (first.year - base.year) * 12 + first.month - base.month - 1
    high = (last.year - base.year) * 12 + last.month - base.month + 1
    return [
        k
        for k in range(-(-low // step) * step, high + 1, step)
        if first <= add_months(base, k) <= last
    ]


def _study(
    body: StudyRequest, service: BarService, macro: Macro, universe: Universe
) -> StudyResponse:
    spec, warnings, rates = scenario_spec(body, service, macro, universe)
    base = first_day(spec)
    today = dt.datetime.now(dt.UTC).date()
    if body.first_start and body.last_start and body.last_start < body.first_start:
        raise PlanError("The last start must not be before the first start")
    # History is what a study runs on: no start before the data could begin or after today.
    first = max(body.first_start or EARLIEST_START, EARLIEST_START)
    last = min(body.last_start or today, today)

    def shifts(step: int) -> list[int]:
        return [] if last < first else month_shifts(base, first, last, step)

    if len(shifts(body.step_months)) > MAX_WINDOWS:
        raise PlanError(f"At most {MAX_WINDOWS} starts in a study: narrow the range")
    notes: dict[str, None] = {}

    def window(shift: int, months: int | None = None) -> PairResult:
        change = Change(shift=shift, months=months, historical=True, follow_rates=body.follow_rates)
        x, y, end, cpi, found = build(spec, macro, change)
        notes.update(dict.fromkeys(found))
        return run_pair(x, y, end, cpi)

    windows, skipped = study.rolling(window, shifts(body.step_months))
    term = term_months(spec)
    summary = study.summarize(windows, term)
    homes = [o.home for o in (spec.x, spec.y) if o.home is not None]
    if body.follow_rates and homes and all(h.rates_mode != "historical" for h in homes):
        warnings.append(
            "The tracks' rates do not follow the Bank of Israel rate: the apartment's rates are "
            "assumed, so every window has the rates as entered"
        )
    if homes and all(h.value_mode != "historical" for h in homes):
        warnings.append(
            "The apartment's value is assumed: it is the same in every window, so the windows "
            "differ only by the market"
        )
    earliest = day_number(windows[0].start)
    for fx in rates:
        warnings.extend(official_rate_note(fx, earliest))
    reasons = dict(skipped)
    horizons = sorted(set(body.horizons_years))
    cells = study.win_map(
        window,
        shifts(12),
        [12 * years for years in horizons],
    )
    rows: list[MapRow] = []
    for k in range(0, len(cells), len(horizons)):
        row = cells[k : k + len(horizons)]
        if all(cell.result is None for cell in row):
            continue
        rows.append(
            MapRow(
                start=add_months(base, row[0].shift),
                cells=[
                    None
                    if cell.result is None
                    else MapCell(
                        x_xirr=cell.result.x.xirr,
                        y_xirr=cell.result.y.xirr,
                        difference=cell.result.x.wealth - cell.result.y.wealth,
                    )
                    for cell in row
                ],
            )
        )
    return StudyResponse(
        months=term,
        summary=SummaryOut(
            **{name: getattr(summary, name) for name in SummaryOut.model_fields},
        ),
        before=reasons.get(windows[0].shift - body.step_months),
        after=reasons.get(windows[-1].shift + body.step_months),
        windows=[
            WindowOut(
                start=w.start,
                x_wealth=w.result.x.wealth,
                y_wealth=w.result.y.wealth,
                x_xirr=w.result.x.xirr,
                y_xirr=w.result.y.xirr,
            )
            for w in windows
        ],
        win_map=WinMap(horizons_years=horizons, rows=rows),
        warnings=list(dict.fromkeys([*warnings, *notes])),
    )


@router.post("/planner/run", response_model=RunResponse)
def run_scenario(
    body: ScenarioRequest,
    service: Annotated[BarService, Depends(get_bar_service)],
    macro: Annotated[MacroService, Depends(get_macro_service)],
    universe: Annotated[Universe, Depends(get_universe)],
) -> RunResponse:
    """Two options on the same money: what each is worth at the end, the breakeven rates and
    the net worth averaged over the exit months."""
    try:
        return _run(body, service, MacroMemo(macro), universe)
    except PlanError as exc:
        raise InvalidPlanError(str(exc)) from exc


@router.post("/planner/study", response_model=StudyResponse)
def study_scenario(
    body: StudyRequest,
    service: Annotated[BarService, Depends(get_bar_service)],
    macro: Annotated[MacroService, Depends(get_macro_service)],
    universe: Annotated[Universe, Depends(get_universe)],
) -> StudyResponse:
    """The same scenario started on every month of history that can run it, and a win map by
    start year and horizon."""
    try:
        return _study(body, service, MacroMemo(macro), universe)
    except PlanError as exc:
        raise InvalidPlanError(str(exc)) from exc
