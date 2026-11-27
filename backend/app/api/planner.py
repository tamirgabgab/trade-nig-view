"""``/api/planner`` - the home-vs-market planner (Phase H). H1: the market account."""

from __future__ import annotations

import datetime as dt
import zoneinfo
from dataclasses import dataclass
from http import HTTPStatus
from typing import Annotated, Literal

import numpy as np
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator

from app.api.deps import get_bar_service, get_macro_service, get_universe
from app.data.bar_service import BarService
from app.data.universe import Universe
from app.errors import ChartLabError, DataUnavailableError
from app.macro.service import MacroService
from app.planner.data import (
    AssetRequest,
    FxSeries,
    InflationSpec,
    LoadedAsset,
    Macro,
    cpi_path,
    first_day,
    last_day,
    load_asset,
    timed_fills,
    usd_ils,
)
from app.planner.deposits import Deposit, Recurring, day_number, expand
from app.planner.fills import FillMode, Granularity
from app.planner.inflation import CpiPath
from app.planner.market import (
    Fees,
    FillSpec,
    MarketResult,
    PlanError,
    TaxBase,
    Taxes,
    run_market,
)

router = APIRouter(tags=["planner"])

Percent = Annotated[float, Field(ge=0, le=100)]
Currency = Literal["USD", "ILS"]


class InvalidPlanError(ChartLabError):
    """The plan cannot run as asked (unknown ticker, a deposit before the data, ...)."""

    status = HTTPStatus.UNPROCESSABLE_ENTITY
    code = "invalid_plan"


class AssetIn(BaseModel):
    symbol: str = Field(min_length=1, max_length=20, description="Any Yahoo ticker")
    weight: float = Field(default=1.0, gt=0, description="Relative weight in the mix")
    currency: Currency = Field(
        default="USD", description="Of a ticker outside the universe (the universe knows its own)"
    )
    dividend_yield_pct: Percent = Field(
        default=0.0, description="Assumed yearly dividend yield, for price-only series"
    )


class DepositIn(BaseModel):
    date: dt.date
    amount: float = Field(gt=0, description="Shekels")
    time: dt.time | None = Field(default=None, description="Local time of the purchase, if known")


class RecurringIn(BaseModel):
    start: dt.date
    amount: float = Field(gt=0, description="Shekels per deposit")
    every_months: int = Field(default=1, ge=1, le=12)
    count: int = Field(default=12, ge=1, le=1200)
    indexed: bool = Field(default=False, description="Raise the amount yearly with the CPI")
    time: dt.time | None = None


class FeesIn(BaseModel):
    deposit_pct: Percent = 0.0
    buy_pct: Percent = 0.0
    sell_pct: Percent = 0.0
    management_pct: Percent = Field(default=0.0, description="Of the account's value, a year")
    monthly_fee: float = Field(default=0.0, ge=0, description="Shekels a month, from the account")


class TaxesIn(BaseModel):
    gains_pct: Percent = 25.0
    dividend_pct: Percent = 25.0
    base: TaxBase = TaxBase.NOMINAL


class FillIn(BaseModel):
    mode: FillMode = FillMode.CLOSE
    granularity: Granularity = Granularity.MEDIUM
    seed: int | None = Field(
        default=None,
        description="Draw the unknown times (and prices) with this seed; null: expected",
    )


class InflationIn(BaseModel):
    mode: Literal["assumed", "historical"] = "assumed"
    mean_pct: float = Field(default=2.5, ge=-20, le=100)
    sd_pct: float = Field(default=0.0, ge=0, le=100)
    persistence: float = Field(
        default=0.0, ge=0, lt=1, description="AR(1) coefficient of the years"
    )
    seed: int | None = Field(default=None, description="Draw a path; null: the mean path")


class AssetsRequest(BaseModel):
    assets: list[AssetIn] = Field(min_length=1, max_length=60)


class MarketOptionIn(AssetsRequest):
    """A market account: its mix, its deposits and its costs."""

    use_fx: bool = Field(default=True, description="Convert dollar assets by the USD/ILS rate")
    deposits: list[DepositIn] = Field(default_factory=list[DepositIn], max_length=2000)
    recurring: list[RecurringIn] = Field(default_factory=list[RecurringIn], max_length=20)
    fees: FeesIn = FeesIn()
    taxes: TaxesIn = TaxesIn()
    fill: FillIn = FillIn()


class MarketRequest(MarketOptionIn):
    end: dt.date
    inflation: InflationIn = InflationIn()
    timezone: str = Field(default="Asia/Jerusalem", description="Of the deposit times")

    @field_validator("timezone")
    @classmethod
    def _known_zone(cls, value: str) -> str:
        try:
            zoneinfo.ZoneInfo(value)
        except (zoneinfo.ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError(f"unknown time zone {value!r}") from exc
        return value


class AssetDepth(BaseModel):
    symbol: str
    currency: str | None = None
    first: dt.date | None = Field(default=None, description="The first daily bar")
    last: dt.date | None = None
    bars: int = 0
    has_dividends: bool = Field(default=False, description="The adjusted close differs from it")
    sell_date: dt.date | None = Field(default=None, description="The bar a plan is sold on")
    sell_price: float | None = None
    sell_fx: float | None = Field(default=None, description="Shekels per unit of its currency")
    error: str | None = None


class LotOut(BaseModel):
    symbol: str
    date: dt.date
    price: float
    fx: float
    units: float
    cost: float
    value: float


class DepositOut(BaseModel):
    date: dt.date
    amount: float
    value: float = Field(description="Market value at the end")
    proceeds: float = Field(description="After the sell commission")
    gross_gain: float = Field(description="Proceeds minus the deposit")
    tax: float = Field(description="Its share of the capital-gains tax (negative: it offsets)")
    net_gain: float
    lots: list[LotOut]


class PathPoint(BaseModel):
    date: dt.date
    value: float
    deposited: float


class Summary(BaseModel):
    deposited: float
    value: float
    proceeds: float
    gross_gain: float
    taxable_gain: float
    tax: float
    net_value: float
    net_gain: float
    deposit_fees: float
    commissions: float
    account_fees: float
    dividend_tax: float
    xirr_gross: float | None
    xirr_net: float | None
    net_value_real: float = Field(description="In shekels of the first deposit's day")
    xirr_net_real: float | None
    inflation_yearly: float = Field(description="The CPI's average yearly rate over the plan")


class MarketResponse(BaseModel):
    assets: list[AssetDepth]
    earliest_start: dt.date = Field(description="The first day every asset of the mix has data")
    fx_market_from: dt.date | None = Field(
        description="USD/ILS: Yahoo's rate from this day, the Bank of Israel's before; null when "
        "only the Bank of Israel's rate (or none) is used"
    )
    summary: Summary
    deposits: list[DepositOut]
    path: list[PathPoint]
    warnings: list[str]


def _to_date(day: int) -> dt.date:
    return dt.date(1970, 1, 1) + dt.timedelta(days=int(day))


def _depth(asset: LoadedAsset, end: int | None = None) -> AssetDepth:
    """The asset's history; with ``end`` (a day number), also the bar a plan sells on."""
    data = asset.data
    t = None if end is None else int(np.searchsorted(data.days, end, side="right")) - 1
    return AssetDepth(
        symbol=asset.info.symbol,
        currency=asset.info.currency,
        first=first_day(asset),
        last=last_day(asset),
        bars=len(data.days),
        has_dividends=asset.has_dividends,
        sell_date=None if t is None else _to_date(data.days[t]),
        sell_price=None if t is None else float(data.close[t]),
        sell_fx=None if t is None else float(data.fx[t]),
    )


def _request(asset: AssetIn) -> AssetRequest:
    return AssetRequest(asset.symbol, asset.weight, asset.currency, asset.dividend_yield_pct / 100)


@router.post("/planner/assets", response_model=list[AssetDepth])
def asset_depths(
    body: AssetsRequest,
    service: Annotated[BarService, Depends(get_bar_service)],
    universe: Annotated[Universe, Depends(get_universe)],
) -> list[AssetDepth]:
    """How far back each ticker's daily history goes (a row with ``error`` for one that fails)."""
    out: list[AssetDepth] = []
    for asset in body.assets:
        try:
            out.append(_depth(load_asset(service, universe, _request(asset), None)))
        except (PlanError, DataUnavailableError) as exc:
            detail = exc.detail if isinstance(exc, DataUnavailableError) else str(exc)
            out.append(AssetDepth(symbol=asset.symbol.upper(), error=detail))
    return out


def inflation_spec(spec: InflationIn) -> InflationSpec:
    return InflationSpec(
        spec.mode, spec.mean_pct / 100, spec.sd_pct / 100, spec.persistence, spec.seed
    )


def schedule(body: MarketOptionIn) -> tuple[list[Deposit], list[Recurring]]:
    """The one-off and the recurring deposits of a request."""
    return (
        [Deposit(d.date, d.amount, d.time) for d in body.deposits],
        [
            Recurring(r.start, r.amount, r.every_months, r.count, r.indexed, r.time)
            for r in body.recurring
        ],
    )


def fees_of(body: MarketOptionIn) -> Fees:
    f = body.fees
    return Fees(
        f.deposit_pct / 100,
        f.buy_pct / 100,
        f.sell_pct / 100,
        f.management_pct / 100,
        f.monthly_fee,
    )


def taxes_of(body: MarketOptionIn) -> Taxes:
    return Taxes(body.taxes.gains_pct / 100, body.taxes.dividend_pct / 100, body.taxes.base)


def official_rate_note(fx: FxSeries | None, first: int) -> list[str]:
    """A warning when a plan that starts on day ``first`` runs before Yahoo's market rate."""
    if fx is None or fx.market_from is None or first >= fx.market_from:
        return []
    return [
        f"USD/ILS before {_to_date(fx.market_from)} is the Bank of Israel's official rate, "
        "not Yahoo's market rate"
    ]


def load_mix(
    body: MarketOptionIn,
    service: BarService,
    macro: Macro,
    universe: Universe,
    first: int,
) -> tuple[list[LoadedAsset], FxSeries | None, list[str]]:
    """The assets of a request with their shekel rates, the rate series when a dollar asset
    uses it, and warnings (``first`` is the plan's first day)."""
    warnings: list[str] = []
    fx: FxSeries | None = usd_ils(service, macro, universe) if body.use_fx else None
    assets = [load_asset(service, universe, _request(a), fx) for a in body.assets]
    if fx is not None and not any(a.info.currency == "USD" for a in assets):
        fx = None
    if fx is not None:
        warnings.extend(fx.warnings)
        warnings.extend(official_rate_note(fx, first))
    warnings.extend(
        f"{a.info.symbol} has no dividends in its prices: its return leaves them out "
        "(set an assumed dividend yield, or use a fund such as SPY)"
        for a in assets
        if not a.has_dividends and a.info.type == "index" and a.data.dividend_yield == 0
    )
    return assets, fx, warnings


@router.post("/planner/market", response_model=MarketResponse)
def run_market_plan(
    body: MarketRequest,
    service: Annotated[BarService, Depends(get_bar_service)],
    macro: Annotated[MacroService, Depends(get_macro_service)],
    universe: Annotated[Universe, Depends(get_universe)],
) -> MarketResponse:
    """Deposits into a mix of assets, sold on ``end``: a row per deposit and the totals."""
    try:
        return _run(body, service, macro, universe)
    except PlanError as exc:
        raise InvalidPlanError(str(exc)) from exc


@dataclass(frozen=True, slots=True)
class Accumulated:
    """A market plan that was run: its account at the end, and what it was run on."""

    result: MarketResult
    assets: list[LoadedAsset]
    fx: FxSeries | None
    warnings: list[str]
    cpi: CpiPath
    first: int
    last: int


def accumulate(
    body: MarketRequest, service: BarService, macro: Macro, universe: Universe
) -> Accumulated:
    """Run the deposits of a request into its mix until its end date."""
    one_off, recurring = schedule(body)
    if not one_off and not recurring:
        raise PlanError("A plan needs at least one deposit")
    starts = [d.day for d in one_off] + [r.start for r in recurring]
    if body.end <= min(starts):
        raise PlanError("The end date must be after the first deposit")
    first, last = day_number(min(starts)), day_number(body.end)
    cpi = cpi_path(inflation_spec(body.inflation), first, last, macro)
    deposits = [d for d in expand(one_off, recurring, cpi) if d.day < body.end]

    assets, fx, warnings = load_mix(body, service, macro, universe, first)
    rng = None if body.fill.seed is None else np.random.default_rng(body.fill.seed)
    fill = FillSpec(body.fill.mode, body.fill.granularity, rng)
    session_t, override = timed_fills(service, assets, deposits, body.timezone, fill)
    result = run_market(
        [a.data for a in assets],
        deposits,
        body.end,
        fees=fees_of(body),
        taxes=taxes_of(body),
        fill=fill,
        cpi=cpi,
        session_t=session_t,
        fill_override=override,
    )
    return Accumulated(result, assets, fx, warnings, cpi, first, last)


def _run(
    body: MarketRequest, service: BarService, macro: MacroService, universe: Universe
) -> MarketResponse:
    ran = accumulate(body, service, macro, universe)
    result, assets, fx, warnings, cpi = ran.result, ran.assets, ran.fx, ran.warnings, ran.cpi
    first, last = ran.first, ran.last
    lots: dict[int, list[LotOut]] = {}
    for lot in result.lots:
        lots.setdefault(lot.deposit, []).append(
            LotOut(
                symbol=lot.symbol,
                date=_to_date(lot.day),
                price=lot.price,
                fx=lot.fx,
                units=lot.units,
                cost=lot.cost,
                value=lot.value,
            )
        )
    years = (last - first) / 365.25
    growth = float(cpi.at(last) / cpi.at(first))
    return MarketResponse(
        assets=[_depth(a, last) for a in assets],
        earliest_start=max(first_day(a) for a in assets),
        fx_market_from=None if fx is None or fx.market_from is None else _to_date(fx.market_from),
        summary=Summary(
            deposited=result.deposited,
            value=result.value,
            proceeds=result.proceeds,
            gross_gain=result.proceeds - result.deposited,
            taxable_gain=result.taxable_gain,
            tax=result.tax,
            net_value=result.net_value,
            net_gain=result.net_value - result.deposited,
            deposit_fees=result.deposit_fees,
            commissions=result.commissions,
            account_fees=result.account_fees,
            dividend_tax=result.dividend_tax,
            xirr_gross=result.xirr_gross,
            xirr_net=result.xirr_net,
            net_value_real=result.net_value_real,
            xirr_net_real=result.xirr_net_real,
            inflation_yearly=growth ** (1 / years) - 1 if years > 0 else 0.0,
        ),
        deposits=[
            DepositOut(
                date=row.day,
                amount=row.amount,
                value=row.value,
                proceeds=row.proceeds,
                gross_gain=row.gross_gain,
                tax=row.tax,
                net_gain=row.net_gain,
                lots=lots.get(j, []),
            )
            for j, row in enumerate(result.deposits)
        ],
        path=[
            PathPoint(date=_to_date(d), value=v, deposited=p)
            for d, v, p in zip(
                result.path_days, result.path_value, result.path_deposited, strict=True
            )
        ],
        warnings=warnings,
    )
