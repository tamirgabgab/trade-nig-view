"""``GET /api/regime`` - is the market trending, random or mean-reverting over the last year,
with significance, and did trend or reversion rules work better in each regime
(``app.analysis.regime``). A research tool, not advice."""

from __future__ import annotations

import math
from http import HTTPStatus
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.analysis import regime as rg
from app.api.deps import get_bar_service
from app.data.bar_service import BarService
from app.errors import ChartLabError
from app.models.bars import BarFrame, Interval, ts_to_iso_dates

router = APIRouter(tags=["regime"])

Label = Literal["trend", "random", "reversion"]


class NotEnoughHistoryError(ChartLabError):
    status = HTTPStatus.UNPROCESSABLE_ENTITY
    code = "not_enough_history"


def _num(x: float) -> float | None:
    return x if math.isfinite(x) else None


class RegimeRatio(BaseModel):
    q: int
    vr: float | None = Field(
        description="Variance ratio: 1 = random walk, > 1 trend, < 1 reversion"
    )
    z: float | None = Field(description="Heteroskedasticity-robust z*")


class RegimeSpectrum(BaseModel):
    qs: list[float]
    h: list[float | None] = Field(description="Generalised Hurst exponent H(q)")
    width: float | None = Field(description="H(-2) - H(4): the multifractal width")


class RegimeRule(BaseModel):
    rule: str
    family: Literal["trend", "reversion"]
    regime: Label
    n: int = Field(description="Signals in that regime")
    mean: float = Field(description="Mean forward log return after the signals")
    edge: float = Field(description="Minus the mean after every bar of that regime")
    t: float | None = Field(description="t-statistic of the edge")
    hit_rate: float


class RegimeCell(BaseModel):
    regime: Label
    high_volatility: bool
    share: float = Field(description="Share of the history's bars in this cell")


class RegimeResponse(BaseModel):
    symbol: str
    interval: Interval
    last_time: str | int
    window: int = Field(description="Bars in the tested window (a calendar year)")
    ratios: list[RegimeRatio]
    cd: float | None = Field(description="Signed Chow-Denning statistic: the z* of largest modulus")
    p_bootstrap: float = Field(description="Wild-bootstrap p-value of max |z*| (999 runs)")
    p_asymptotic: float = Field(description="Sidak p-value of max |z*| (normal)")
    hurst_window: float | None
    hurst_null: list[float | None] = Field(description="5 and 95 % of H on 199 shuffles")
    hurst_history: float | None
    spectrum_window: RegimeSpectrum | None
    spectrum_history: RegimeSpectrum | None
    label: Label = Field(description="By the bootstrap test")
    tint: Label | None = Field(
        description="By the 2.49 test of the chart's tint, the map and the event study"
    )
    high_volatility: bool | None = Field(description="Volatility percentile >= 50 now")
    cells: list[RegimeCell]
    forward: int = Field(description="Bars of the event study's forward return")
    rules: list[RegimeRule]


def _spectrum(s: rg.Spectrum | None) -> RegimeSpectrum | None:
    if s is None:
        return None
    return RegimeSpectrum(qs=list(s.qs), h=[_num(x) for x in s.h], width=_num(s.width))


def regime_response(frame: BarFrame, interval: Interval, symbol: str) -> RegimeResponse:
    r = rg.report(frame)
    if r is None:
        raise NotEnoughHistoryError(
            f"{symbol}: a regime needs a year of bars with price changes, got {len(frame)} bars"
        )
    last = frame.time[-1:]
    return RegimeResponse(
        symbol=symbol,
        interval=interval,
        last_time=int(last[0]) if interval.is_intraday else ts_to_iso_dates(last)[0],
        window=r.window,
        ratios=[RegimeRatio(q=x.q, vr=_num(x.vr), z=_num(x.z)) for x in r.ratios],
        cd=_num(r.cd),
        p_bootstrap=r.p_bootstrap,
        p_asymptotic=r.p_asymptotic,
        hurst_window=_num(r.hurst_window),
        hurst_null=[_num(x) for x in r.hurst_null],
        hurst_history=_num(r.hurst_history),
        spectrum_window=_spectrum(r.spectrum_window),
        spectrum_history=_spectrum(r.spectrum_history),
        label=r.label,
        tint=r.tint,
        high_volatility=r.high_volatility,
        cells=[
            RegimeCell(regime=name, high_volatility=vol, share=share)
            for (name, vol), share in r.cells.items()
        ],
        forward=rg.FORWARD,
        rules=[
            RegimeRule(
                rule=x.rule,
                family=x.family,
                regime=x.regime,
                n=x.n,
                mean=x.mean,
                edge=x.edge,
                t=_num(x.t),
                hit_rate=x.hit_rate,
            )
            for x in r.rules
        ],
    )


@router.get("/regime", response_model=RegimeResponse)
def get_regime(
    service: Annotated[BarService, Depends(get_bar_service)],
    symbol: Annotated[str, Query(min_length=1, max_length=20)],
    interval: Interval = Interval.D1,
    adjusted: bool = True,
    origin: Annotated[
        int | None, Query(description="At this bar (UTC epoch seconds of its open; replay)")
    ] = None,
) -> RegimeResponse:
    """The regime of the last year up to the last bar (``origin`` in replay)."""
    result = service.get_bars(symbol, interval, adjusted=adjusted, limit=1_000_000_000)
    frame = result.frame
    if origin is not None:
        frame = frame.take(frame.time <= origin)
    return regime_response(frame, interval, result.symbol.symbol)
