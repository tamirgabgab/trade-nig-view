"""``/api/planner/withdraw/study`` and ``/simulate``: one withdrawal plan over many realizations
(Phase J, J2, ``docs/WITHDRAWAL_PLAN.md``).

* **study**: the plan shifted by whole months, every start the data allows (the Market tab's
  mix over history).
* **simulate**: the plan on simulated worlds (``app.planner.paths``): a block bootstrap of the
  mix's history, or a modelled market.

Both answer with the same report: a row per realization (what is left, what was taken, when the
money ended), the plan at the two tax bounds, the share still paying by year, the income by year
as percentiles, and for a fixed rule the sustainable amount.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import replace
from typing import Annotated, Literal

import numpy as np
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import get_bar_service, get_macro_service, get_universe
from app.api.planner import InvalidPlanError, inflation_spec, official_rate_note
from app.api.scenario import EARLIEST_START, month_shifts
from app.api.withdraw import (
    MONTH_DAYS,
    NO_CURRENCY_BASE,
    Account,
    WithdrawRequest,
    account_of,
    apartment,
    check,
    home_cost,
    plan_of,
)
from app.data.bar_service import BarService
from app.data.universe import Universe
from app.macro.service import MacroService
from app.models.bars import FloatArray, IntArray
from app.planner import risk
from app.planner.data import Macro, MacroMemo, cpi_path
from app.planner.deposits import EPOCH, add_months, day_number
from app.planner.home_data import dwelling_index
from app.planner.inflation import historical_cpi
from app.planner.market import PlanError, TaxBase
from app.planner.paths import Panel, WorldSpec, make_world
from app.planner.scenario_data import asset_key, asset_series, estimate_mix, panel_of
from app.planner.study import effective_samples
from app.planner.withdraw import Grid, Home, Many, Rule, run_many, sample
from app.planner.withdraw_study import (
    checkpoints,
    income_fan,
    left,
    stack,
    stack_homes,
    start_worth,
    survival,
    sustainable,
)

router = APIRouter(tags=["planner"])

#: The dwelling index an apartment's value follows.
DWELLING = "dwelling"


class ManyRequest(WithdrawRequest):
    sustain_pct: float = Field(
        default=95.0, ge=50, le=100, description="The share of realizations an amount must last in"
    )


class WithdrawSimulateRequest(ManyRequest):
    method: Literal["bootstrap", "monte_carlo"] = Field(
        default="bootstrap",
        description="The market: resampled from the mix's history in blocks, or drawn from a model",
    )
    runs: int = Field(default=1000, ge=10, le=5000, description="Simulated worlds")
    seed: int = Field(default=1, ge=0)
    block_months: int = Field(default=12, ge=1, le=120)
    market_mean_pct: float | None = Field(
        default=None, ge=-50, le=100, description="A modelled market; null: estimated from the mix"
    )
    market_sd_pct: float | None = Field(default=None, ge=0, le=200)


class RealizationOut(BaseModel):
    start: dt.date | None = Field(description="A window's first day (null for a world)")
    left: float = Field(description="The balance at the end; with an apartment, the liquidation")
    left_real: float = Field(description="In shekels of the first day")
    taken_real: float
    tax: float
    depleted_month: int | None
    lowest_net_real: float
    drawdown: float = Field(description="The deepest fall of the real net worth from its peak")
    home_sold_month: int | None


class BoundOut(BaseModel):
    """The realizations at one cost share: the share that lasts, and medians."""

    cost_share: float
    lasts: float
    left_real: float
    taken_real: float
    lowest_net_real: float


class CurvePoint(BaseModel):
    month: int
    share: float = Field(description="Still paying, at the cost share entered")
    floor: float
    ceiling: float


class FanYear(BaseModel):
    year: int
    p5: float
    p25: float
    p50: float
    p75: float
    p95: float


class SustainableOut(BaseModel):
    amount: float = Field(description="The largest monthly amount that lasts in the target share")
    target_pct: float


class EvidenceOut(BaseModel):
    independent: float | None = Field(
        description="About how many separate terms the windows, or the resampled history, hold"
    )
    history_months: int | None = Field(description="The history a bootstrap was cut from")


class MarketOut(BaseModel):
    mean_pct: float
    sd_pct: float
    estimated: bool = Field(description="From the mix's history, not typed")


class WithdrawManyResponse(BaseModel):
    method: Literal["windows", "bootstrap", "monte_carlo"]
    months: int
    count: int
    start_worth: float = Field(description="What there was on the first day, as `left` counts it")
    realizations: list[RealizationOut]
    bounds: list[BoundOut] = Field(description="At a cost share of 0, as entered, and of 1")
    survival: list[CurvePoint]
    income: list[FanYear] = Field(description="Each year's mean monthly income, first-day shekels")
    sustainable: SustainableOut | None = Field(description="A fixed rule only")
    evidence: EvidenceOut
    market: MarketOut | None = Field(description="The modelled market (null when resampled)")
    before: str | None = Field(default=None, description="Why no window starts earlier")
    after: str | None = None
    warnings: list[str]


def _date(day: int) -> dt.date:
    return EPOCH + dt.timedelta(days=int(day))


def _report(
    body: ManyRequest,
    account: Account,
    weights: list[float],
    grid: Grid,
    home: Home | None,
    *,
    method: Literal["windows", "bootstrap", "monte_carlo"],
    starts: list[dt.date] | None,
    evidence: EvidenceOut,
    market: MarketOut | None,
    warnings: list[str],
    before: str | None = None,
    after: str | None = None,
) -> WithdrawManyResponse:
    """Run the batch at the three cost shares and say what the realizations show."""
    shares = (0.0, body.cost_share_pct / 100, 1.0)
    plans = [plan_of(body, account, weights, share) for share in shares]
    floor, entered, ceiling = (run_many(plan, grid, home) for plan in plans)
    prices: FloatArray = grid.cpi / grid.cpi[:, :1]
    count = len(prices)

    def real(many: Many) -> FloatArray:
        return many.net[:, 1:] / prices[:, 1:]

    def bound(share: float, many: Many) -> BoundOut:
        return BoundOut(
            cost_share=share,
            lasts=float(np.count_nonzero(many.depleted == 0) / count),
            left_real=float(np.median(left(many, home) / prices[:, -1])),
            taken_real=float(np.median(real(many).sum(axis=1))),
            lowest_net_real=float(np.median(real(many).min(axis=1))),
        )

    curves = [survival(many.depleted, body.months) for many in (floor, entered, ceiling)]
    what_is_left = left(entered, home)
    income = real(entered)
    worth: FloatArray = (entered.balance + entered.home) / prices
    depleted: IntArray = entered.depleted
    fixed = body.rule.kind is Rule.FIXED
    return WithdrawManyResponse(
        method=method,
        months=body.months,
        count=count,
        start_worth=float(start_worth(plans[1], home, count)[0]),
        realizations=[
            RealizationOut(
                start=None if starts is None else starts[i],
                left=float(what_is_left[i]),
                left_real=float(what_is_left[i] / prices[i, -1]),
                taken_real=float(income[i].sum()),
                tax=float(entered.tax[i].sum()),
                depleted_month=int(depleted[i]) or None,
                lowest_net_real=float(income[i].min()),
                drawdown=risk.max_drawdown(worth[i]),
                home_sold_month=int(entered.home_sold[i]) or None,
            )
            for i in range(count)
        ],
        bounds=[
            bound(share, many)
            for share, many in zip(shares, (floor, entered, ceiling), strict=True)
        ],
        survival=[
            CurvePoint(
                month=month,
                share=float(curves[1][k]),
                floor=float(curves[0][k]),
                ceiling=float(curves[2][k]),
            )
            for k, month in enumerate(checkpoints(body.months))
        ],
        income=[
            FanYear(year=year + 1, p5=row[0], p25=row[1], p50=row[2], p75=row[3], p95=row[4])
            for year, row in enumerate(income_fan(entered.net, prices).tolist())
        ],
        sustainable=SustainableOut(
            amount=sustainable(plans[1], grid, home, body.sustain_pct / 100),
            target_pct=body.sustain_pct,
        )
        if fixed
        else None,
        evidence=evidence,
        market=market,
        before=before,
        after=after,
        warnings=list(dict.fromkeys(warnings)),
    )


def _study(
    body: ManyRequest, service: BarService, macro: Macro, universe: Universe
) -> WithdrawManyResponse:
    check(body)
    if body.returns.mode != "mix":
        raise PlanError(
            "Windows of history need the Market tab's mix: on an assumed return every window is "
            "the same"
        )
    account = account_of(body, service, macro, universe, mix=True)
    mix = account.mix or []
    spec = inflation_spec(body.inflation)
    cost, notes = (None, []) if body.home is None else home_cost(body.start, body.home, macro)
    warnings = [*account.warnings, *notes]
    # A start a month, from the earliest a series could have to today.
    shifts = month_shifts(body.start, EARLIEST_START, dt.datetime.now(dt.UTC).date(), 1)

    def window(shift: int) -> tuple[Grid, Home | None]:
        start = add_months(body.start, shift)
        last = day_number(add_months(start, body.months))
        loan = body.home.loan_months if body.home is not None and body.home.loan > 0 else 0
        horizon = day_number(add_months(start, max(body.months, loan)))
        cpi = cpi_path(spec, day_number(start), horizon, macro)
        if spec.mode == "historical" and last > int(cpi.days[-1]) + MONTH_DAYS:
            raise PlanError(f"The CPI is published until {_date(cpi.days[-1])}: end by then")
        grid = sample(mix, start, body.months, account.taxes, cpi)
        if body.home is None:
            return grid, None
        # The linear rule is off, as in H3a's windows, so the purchase day plays no part.
        home, found = apartment(
            body.home, start, body.months, cpi, macro, cost, None, strict=True, linear=False
        )
        warnings.extend(found)
        return grid, home

    ran: list[tuple[int, Grid, Home | None]] = []
    reasons: dict[int, str] = {}
    for shift in shifts:
        try:
            ran.append((shift, *window(shift)))
        except PlanError as exc:
            reasons[shift] = str(exc)
    if not ran:
        # The reason of the start nearest the one entered says the most.
        nearest = min(reasons, key=abs, default=None)
        why = "the range holds no month" if nearest is None else reasons[nearest]
        raise PlanError(f"No start in history fits the plan: {why}")
    if spec.mode != "historical":
        warnings.append(
            "The CPI is assumed: every window has the same inflation, not the one its years had"
        )
    if body.home is not None and body.home.growth == "assumed":
        warnings.append(
            "The apartment's value is assumed: it is the same in every window, so the windows "
            "differ only by the market"
        )
    if cost is not None:
        warnings.append(
            "The betterment tax's linear rule is off in the windows: it depends on the calendar "
            "date 2014-01-01, and would tax them unevenly"
        )
    # The earliest window may run before the market's shekel rate, where the entered start did not.
    earliest = day_number(add_months(body.start, ran[0][0]))
    warnings.extend(official_rate_note(account.fx, earliest))
    homes = [home for _, _, home in ran if home is not None]
    span = ran[-1][0] - ran[0][0]
    return _report(
        body,
        account,
        [a.weight for a in mix],
        stack([grid for _, grid, _ in ran]),
        stack_homes(homes) if homes else None,
        method="windows",
        starts=[add_months(body.start, shift) for shift, _, _ in ran],
        evidence=EvidenceOut(independent=effective_samples(span, body.months), history_months=None),
        market=None,
        warnings=warnings,
        before=reasons.get(ran[0][0] - 1),
        after=reasons.get(ran[-1][0] + 1),
    )


def _model(body: WithdrawSimulateRequest, account: Account) -> MarketOut | None:
    """The modelled market of a request (None: the mix's history is resampled)."""
    assumed = account.mix is None
    if body.method == "bootstrap":
        return None
    mean, sd = body.market_mean_pct, body.market_sd_pct
    if assumed:
        if sd is None:
            raise PlanError("A modelled market on an assumed return needs its volatility")
        return MarketOut(
            mean_pct=body.returns.yearly_pct if mean is None else mean, sd_pct=sd, estimated=False
        )
    if mean is not None and sd is not None:
        return MarketOut(mean_pct=mean, sd_pct=sd, estimated=False)
    found_mean, found_sd = estimate_mix(account.mix or [])
    return MarketOut(
        mean_pct=100 * found_mean if mean is None else mean,
        sd_pct=100 * found_sd if sd is None else sd,
        estimated=True,
    )


def _simulate(
    body: WithdrawSimulateRequest, service: BarService, macro: Macro, universe: Universe
) -> WithdrawManyResponse:
    check(body)
    assumed = body.returns.mode == "assumed"
    if assumed and body.method == "bootstrap":
        raise PlanError(
            "A bootstrap cuts its worlds from the mix's history: on an assumed return there is "
            "none (use the modelled market)"
        )
    account = account_of(body, service, macro, universe, mix=not assumed)
    mix = account.mix or []
    model = _model(body, account)
    spec = inflation_spec(body.inflation)
    indexed_home = body.home is not None and body.home.growth == "index"
    cost, notes = (None, []) if body.home is None else home_cost(body.start, body.home, macro)
    warnings = [*account.warnings, *notes]
    series: dict[str, tuple[IntArray, FloatArray]] = {}
    if model is None:
        for asset in mix:
            series.update(asset_series(asset))
    if spec.mode == "historical":
        cpi = historical_cpi(macro.get("cpi").data)
        series["cpi"] = (cpi.days, cpi.values)
    if indexed_home:
        index = dwelling_index(macro, DWELLING)
        series[DWELLING] = (index.days, index.values)
    panel = Panel(*panel_of(series)) if series else None
    worlds = WorldSpec(
        first=day_number(body.start),
        months=body.months,
        seed=body.seed,
        block=body.block_months,
        panel=panel,
        assets={} if model is not None else {asset_key(a): a for a in mix},
        market=None if model is None else (model.mean_pct / 100, model.sd_pct / 100),
        inflation=spec,
        dwellings=(DWELLING,) if indexed_home else (),
    )
    grids: list[Grid] = []
    homes: list[Home] = []
    for number in range(body.runs):
        world = make_world(worlds, number)
        assets = (
            [replace(world.assets[asset_key(a)], weight=a.weight) for a in mix]
            if world.market is None
            else [world.market]
        )
        grids.append(sample(assets, body.start, body.months, account.taxes, world.cpi))
        if body.home is not None:
            home, found = apartment(
                body.home,
                body.start,
                body.months,
                world.cpi,
                macro,
                cost,
                body.home.bought,
                value=world.dwellings.get(DWELLING),
            )
            homes.append(home)
            warnings.extend(found)
    if body.home is not None and not indexed_home:
        warnings.append("The apartment's value is assumed: it is the same in every world")
    if model is not None and account.taxes.base is TaxBase.CURRENCY:
        warnings.append(NO_CURRENCY_BASE.replace("assumed return", "modelled market"))
    history = None if panel is None else len(panel)
    return _report(
        body,
        account,
        [a.weight for a in mix] if model is None else [1.0],
        stack(grids),
        stack_homes(homes) if homes else None,
        method=body.method,
        starts=None,
        evidence=EvidenceOut(
            independent=None if history is None or model is not None else history / body.months,
            history_months=history if model is None else None,
        ),
        market=model,
        warnings=warnings,
    )


@router.post("/planner/withdraw/study", response_model=WithdrawManyResponse)
def withdraw_study(
    body: ManyRequest,
    service: Annotated[BarService, Depends(get_bar_service)],
    macro: Annotated[MacroService, Depends(get_macro_service)],
    universe: Annotated[Universe, Depends(get_universe)],
) -> WithdrawManyResponse:
    """A withdrawal plan started on every month history allows."""
    try:
        return _study(body, service, MacroMemo(macro), universe)
    except PlanError as exc:
        raise InvalidPlanError(str(exc)) from exc


@router.post("/planner/withdraw/simulate", response_model=WithdrawManyResponse)
def withdraw_simulate(
    body: WithdrawSimulateRequest,
    service: Annotated[BarService, Depends(get_bar_service)],
    macro: Annotated[MacroService, Depends(get_macro_service)],
    universe: Annotated[Universe, Depends(get_universe)],
) -> WithdrawManyResponse:
    """A withdrawal plan on simulated worlds."""
    try:
        return _simulate(body, service, MacroMemo(macro), universe)
    except PlanError as exc:
        raise InvalidPlanError(str(exc)) from exc
