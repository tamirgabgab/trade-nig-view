"""``/api/planner/simulate``: a scenario over many simulated worlds (Phase H, H3b)."""

from __future__ import annotations

import datetime as dt
from collections.abc import Sequence
from typing import Annotated, Literal

import numpy as np
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import get_bar_service, get_macro_service, get_universe
from app.api.planner import InvalidPlanError, Percent
from app.api.scenario import ScenarioRequest, scenario_spec
from app.data.bar_service import BarService
from app.data.universe import Universe
from app.macro.service import MacroService
from app.models.bars import FloatArray
from app.planner import risk, study
from app.planner.data import Macro, MacroMemo
from app.planner.deposits import EPOCH
from app.planner.market import PlanError, TaxBase
from app.planner.paths import make_world
from app.planner.scenario import run_pair
from app.planner.scenario_data import (
    Change,
    ScenarioSpec,
    build,
    estimate_market,
    term_months,
    world_spec,
)

router = APIRouter(tags=["planner"])

#: The shares of the money in x that the split is shown for.
SPLITS = (0.0, 0.25, 0.5, 0.75, 1.0)


class SimulateRequest(ScenarioRequest):
    method: Literal["bootstrap", "monte_carlo"] = Field(
        default="bootstrap",
        description="The market: resampled from history in blocks, or drawn from a model",
    )
    runs: int = Field(default=1000, ge=10, le=10_000, description="Simulated worlds")
    seed: int = Field(default=1, ge=0)
    block_months: int = Field(default=12, ge=1, le=120)
    market_mean_pct: float | None = Field(
        default=None, ge=-50, le=100, description="Monte Carlo; null: estimated from the mix"
    )
    market_sd_pct: float | None = Field(default=None, ge=0, le=200)
    correlation: float = Field(
        default=0.0, ge=-1, le=1, description="A modelled apartment value with a modelled market"
    )
    follow_rates: bool = True
    income: float | None = Field(
        default=None, gt=0, description="Monthly net income on the first day; rises with the CPI"
    )
    stress_share_pct: Percent = Field(default=40.0, description="Of the income, for a payment")
    risk_aversion: float = Field(default=2.0, ge=0, le=20, description="CRRA gamma")


class Distribution(BaseModel):
    p5: float
    p25: float
    p50: float
    p75: float
    p95: float
    mean: float
    cvar5: float = Field(description="The mean of the worst 5 %")


class OptionRisk(BaseModel):
    wealth: Distribution
    wealth_real: Distribution
    xirr: Distribution
    xirr_real: Distribution
    shortfall: float = Field(description="P(the end value is below the money put in)")
    regret_mean: float = Field(description="Real shekels the other option would have added")
    regret_p95: float
    certainty_equivalent: float | None = Field(description="Of the real end value; null: ruin")
    ruin: float = Field(description="P(the end value is zero or less)")
    negative_equity: float | None = Field(description="P(worth less than its loan in a month)")
    stress: float | None = Field(description="P(a payment above the share of the income)")
    stress_median: float | None = Field(description="Median of the worst payment over income")
    under_water: float | None = Field(description="Mean share of months below its deposits")
    drawdown_median: float
    drawdown_p95: float
    sharpe: float | None
    sortino: float | None


class MarketModel(BaseModel):
    mean: float
    sd: float
    estimated: bool = Field(description="From the mix's history, not from the request")


class HistoryUsed(BaseModel):
    first: dt.date
    last: dt.date
    months: int
    effective: float = Field(description="About how many independent terms it holds")


class Samples(BaseModel):
    """The end values of every world, x and y world by world."""

    x_wealth: list[float]
    y_wealth: list[float]
    x_wealth_real: list[float]
    y_wealth_real: list[float]
    x_xirr: list[float]
    y_xirr: list[float]
    x_xirr_real: list[float]
    y_xirr_real: list[float]


class SplitOut(BaseModel):
    """The real end value with the share ``weight`` of the money in x and the rest in y."""

    weight: float
    p50: float
    p5: float
    cvar5: float


class SimulateResponse(BaseModel):
    method: str
    runs: int
    months: int
    market: MarketModel | None = Field(description="The modelled market (Monte Carlo)")
    history: HistoryUsed | None = Field(description="The months that are resampled")
    p_win: float
    median_difference: float
    median_difference_real: float
    dominance: risk.Dominance = Field(description="Between the real end values")
    x: OptionRisk
    y: OptionRisk
    split: list[SplitOut] = Field(description="The same money split between x and y")
    samples: Samples
    warnings: list[str]


def _distribution(values: FloatArray) -> Distribution:
    p5, p25, p50, p75, p95 = risk.percentiles(values)
    return Distribution(
        p5=p5,
        p25=p25,
        p50=p50,
        p75=p75,
        p95=p95,
        mean=float(values.mean()),
        cvar5=risk.cvar(values),
    )


def _share(flags: Sequence[bool | None]) -> float | None:
    known = [f for f in flags if f is not None]
    return float(np.mean(known)) if known else None


def _option(
    own: Sequence[study.SideOutcome],
    other: Sequence[study.SideOutcome],
    spent: FloatArray,
    body: SimulateRequest,
) -> tuple[OptionRisk, dict[str, FloatArray]]:
    """An option's risk numbers, and its samples by measure."""
    sample = {
        "wealth": np.array([o.wealth for o in own]),
        "wealth_real": np.array([o.wealth_real for o in own]),
        # A world where no money went in has no return: counted as zero.
        "xirr": np.array([o.xirr or 0.0 for o in own]),
        "xirr_real": np.array([o.xirr_real or 0.0 for o in own]),
    }
    real = sample["wealth_real"]
    regret_mean, regret_p95 = risk.regret(real, np.array([o.wealth_real for o in other]))
    stress = [o.stress for o in own if o.stress is not None]
    under = [o.under_water for o in own if o.under_water is not None]
    drawdowns = np.array([o.drawdown for o in own])
    returns = np.concatenate([o.returns for o in own])
    return (
        OptionRisk(
            **{name: _distribution(values) for name, values in sample.items()},
            shortfall=risk.shortfall_probability(sample["wealth"], spent),
            regret_mean=regret_mean,
            regret_p95=regret_p95,
            certainty_equivalent=risk.certainty_equivalent(real, body.risk_aversion),
            ruin=float(np.mean(real <= 0)),
            negative_equity=_share([o.negative_equity for o in own]),
            stress=float(np.mean(np.array(stress) > body.stress_share_pct / 100))
            if stress
            else None,
            stress_median=float(np.median(stress)) if stress else None,
            under_water=float(np.mean(under)) if under else None,
            drawdown_median=float(np.median(drawdowns)),
            drawdown_p95=float(np.percentile(drawdowns, 95)),
            sharpe=risk.sharpe(returns),
            sortino=risk.sortino(returns),
        ),
        sample,
    )


def _warnings(body: SimulateRequest, spec: ScenarioSpec) -> list[str]:
    homes = [o.home for o in (spec.x, spec.y) if o.home is not None]
    accounts = [o.account for o in (spec.x, spec.y) if o.account is not None]
    notes: list[str] = []
    if body.follow_rates and homes and all(h.rates_mode != "historical" for h in homes):
        notes.append(
            "The tracks' rates do not follow the Bank of Israel rate: the apartment's rates are "
            "assumed, so every world has the rates as entered"
        )
    if any(h.value_mode == "assumed" and h.value_sd == 0 for h in homes):
        notes.append(
            "The apartment's value has no volatility: it is the same in every world. Set a "
            "standard deviation, or use the dwelling price index"
        )
    if spec.inflation.mode == "assumed" and spec.inflation.sd == 0:
        notes.append("Inflation has no spread: it is the same in every world")
    if body.method == "bootstrap" and body.correlation != 0:
        notes.append("The correlation applies only to a modelled market (Monte Carlo)")
    elif body.correlation != 0 and all(h.value_mode != "assumed" for h in homes):
        notes.append(
            "The correlation has no effect: no apartment has an assumed value for it to tie "
            "to the market"
        )
    if body.method == "monte_carlo" and any(a.taxes.dividend > 0 for a in accounts):
        notes.append("A modelled market pays no dividend tax: its growth is the mix's total return")
    if body.method == "monte_carlo" and any(a.taxes.base is TaxBase.CURRENCY for a in accounts):
        notes.append(
            "A modelled market is priced in shekels: the tax base 'currency' taxes the "
            "nominal gain there"
        )
    return notes


def _simulate(
    body: SimulateRequest, service: BarService, macro: Macro, universe: Universe
) -> SimulateResponse:
    spec, warnings, _ = scenario_spec(body, service, macro, universe)
    term = term_months(spec)
    model = None
    if body.method == "monte_carlo":
        mean, sd = body.market_mean_pct, body.market_sd_pct
        if mean is None and sd is None:
            mean, sd = estimate_market(spec)
            model = MarketModel(mean=mean, sd=sd, estimated=True)
        elif mean is None or sd is None:
            raise PlanError("Give both the market's mean and its volatility, or neither")
        else:
            model = MarketModel(mean=mean / 100, sd=sd / 100, estimated=False)
    worlds = world_spec(
        spec,
        macro,
        market=None if model is None else (model.mean, model.sd),
        seed=body.seed,
        block=body.block_months,
        correlation=body.correlation,
    )
    notes: dict[str, None] = dict.fromkeys([*warnings, *_warnings(body, spec)])
    outcomes: list[study.Outcome] = []
    for index in range(body.runs):
        change = Change(world=make_world(worlds, index), follow_rates=body.follow_rates)
        x, y, end, cpi, found = build(spec, macro, change)
        notes.update(dict.fromkeys(found))
        outcomes.append(study.outcome(run_pair(x, y, end, cpi), cpi, body.income))
    spent = np.array([o.spent for o in outcomes])
    xs, ys = [o.x for o in outcomes], [o.y for o in outcomes]
    x_risk, x_sample = _option(xs, ys, spent, body)
    y_risk, y_sample = _option(ys, xs, spent, body)
    panel = worlds.panel
    return SimulateResponse(
        method=body.method,
        runs=body.runs,
        months=term,
        market=model,
        history=None
        if panel is None
        else HistoryUsed(
            first=EPOCH + dt.timedelta(days=int(panel.months[0])),
            last=EPOCH + dt.timedelta(days=int(panel.months[-1])),
            months=len(panel),
            effective=len(panel) / max(term, 1),
        ),
        p_win=study.win_probability(x_sample["wealth"], y_sample["wealth"]),
        median_difference=float(np.median(x_sample["wealth"] - y_sample["wealth"])),
        median_difference_real=float(np.median(x_sample["wealth_real"] - y_sample["wealth_real"])),
        dominance=risk.dominance(x_sample["wealth_real"], y_sample["wealth_real"]),
        x=x_risk,
        y=y_risk,
        split=[
            SplitOut(weight=row.weight, p50=row.p50, p5=row.p5, cvar5=row.cvar5)
            for row in risk.split(x_sample["wealth_real"], y_sample["wealth_real"], SPLITS)
        ],
        samples=Samples(
            **{f"x_{name}": _rounded(name, values) for name, values in x_sample.items()},
            **{f"y_{name}": _rounded(name, values) for name, values in y_sample.items()},
        ),
        warnings=list(notes),
    )


def _rounded(measure: str, values: FloatArray) -> list[float]:
    """Shekels to the agora, returns to a millionth: the page needs no more."""
    return [float(v) for v in np.round(values, 6 if measure.startswith("xirr") else 2)]


@router.post("/planner/simulate", response_model=SimulateResponse)
def simulate_scenario(
    body: SimulateRequest,
    service: Annotated[BarService, Depends(get_bar_service)],
    macro: Annotated[MacroService, Depends(get_macro_service)],
    universe: Annotated[Universe, Depends(get_universe)],
) -> SimulateResponse:
    """The scenario in many simulated worlds: the distribution of each option's end value and
    return, and how risky each is."""
    try:
        return _simulate(body, service, MacroMemo(macro), universe)
    except PlanError as exc:
        raise InvalidPlanError(str(exc)) from exc
