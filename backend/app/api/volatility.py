"""``GET /api/volatility`` - the volatility cone of a symbol (``app.analysis.volatility``): today's
volatility per calendar horizon against its history, the HAR forecast, the squeeze probability,
the overnight and downside shares and the estimators' scores. A research tool, not advice."""

from __future__ import annotations

import math
from datetime import date
from http import HTTPStatus
from typing import Annotated, Literal

import numpy as np
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.analysis import volatility as vol
from app.api.deps import get_bar_service
from app.data.bar_service import BarService
from app.errors import ChartLabError
from app.indicators.hv import ESTIMATORS
from app.models.bars import BarFrame, Interval, ts_to_iso_dates

router = APIRouter(tags=["volatility"])

Estimator = Literal["yang_zhang", "close", "parkinson", "garman_klass", "rogers_satchell"]
SqueezeHorizon = Literal["week", "month", "quarter"]


class NotEnoughHistoryError(ChartLabError):
    status = HTTPStatus.UNPROCESSABLE_ENTITY
    code = "not_enough_history"


class VolForecast(BaseModel):
    low: float = Field(description="10 % of the per-bar volatility over the next h bars")
    median: float
    high: float = Field(description="90 %")
    coverage: float | None = Field(description="Walk-forward share of outcomes in the 80 % band")
    qlike: float | None = Field(description="Walk-forward QLIKE of the HAR forecast")
    qlike_naive: float | None = Field(description="QLIKE of 'the next h bars as the last h'")


class VolHorizon(BaseModel):
    label: vol.Label
    bars: int
    current: float = Field(description="Per-bar volatility of the last h bars (a fraction)")
    ci: list[float | None] = Field(description="Approximate 95 % interval of `current`")
    percentiles: list[float] = Field(description="At `levels`, over every h-bar window")
    rank: float = Field(description="% of the history's h-bar windows at or below `current`")
    forecast: VolForecast | None = Field(description="Null if the history is too short")


class VolSqueeze(BaseModel):
    horizon: vol.Label
    bars: int
    threshold: float = Field(description="Squeeze: rank among the last year at or below this")
    factor: float = Field(description="Expansion: the next h bars' volatility >= factor x today's")
    rank: float | None = Field(description="Today's rank among the last year's values")
    active: bool
    events: int = Field(description="Past bars in a squeeze (with an outcome)")
    independent: int = Field(description="Events at least h bars apart (used for the interval)")
    p: float | None = Field(description="P(expansion | squeeze)")
    ci: list[float | None] = Field(description="Wilson 95 % interval of p")
    base_rate: float = Field(description="P(expansion) after any bar")
    move_events: list[float | None] = Field(
        description="Median and 80th percentile of |h-bar log return| after a squeeze"
    )
    move_all: list[float | None] = Field(description="The same after any bar")


class VolScore(BaseModel):
    estimator: str = Field(description="An estimator id, 'har' or 'realized' (1h bars)")
    label: str
    n: int
    qlike: float = Field(description="Mean QLIKE over the scored origins (lower is better)")
    bias: float | None = Field(description="Volatility over the 1h realised one (median)")


class VolShares(BaseModel):
    window: float | None = Field(description="Over the last h bars")
    history: float | None = Field(description="Over the whole history")


class VolatilityResponse(BaseModel):
    symbol: str
    interval: Interval
    estimator: Estimator
    last_time: str | int = Field(description="The origin bar, as in /api/bars")
    bars_per_year: float = Field(description="Annualise a per-bar volatility by its square root")
    levels: list[float] = Field(description="Percentile levels of the cone")
    horizons: list[VolHorizon]
    main: vol.Label = Field(description="The horizon of the squeeze, shares and scores")
    squeeze: VolSqueeze | None
    overnight: VolShares = Field(description="Share of the variance from the gaps")
    downside: VolShares = Field(description="Share of the squared returns from falling bars")
    scores: list[VolScore] = Field(description="Best first; empty if the history is too short")
    realized: bool = Field(description="Whether 1h bars gave a realised variance (daily only)")


def _num(x: float) -> float | None:
    return x if math.isfinite(x) else None


def _nums(xs: tuple[float, ...]) -> list[float | None]:
    return [_num(x) for x in xs]


LABELS = {**ESTIMATORS, "har": "HAR forecast", "realized": "Realised (1h)"}


def volatility_response(
    frame: BarFrame,
    interval: Interval,
    symbol: str,
    estimator: Estimator,
    horizon: SqueezeHorizon,
    threshold: float,
    factor: float,
    realised_1h: np.ndarray | None = None,
) -> VolatilityResponse:
    c = vol.cone(frame, estimator, horizon, threshold, factor, realised_1h)
    if c is None:
        raise NotEnoughHistoryError(f"{symbol}: {len(frame)} bars are too few for the cone")
    s = c.squeeze
    last = frame.time[-1:]
    return VolatilityResponse(
        symbol=symbol,
        interval=interval,
        estimator=estimator,
        last_time=int(last[0]) if interval.is_intraday else ts_to_iso_dates(last)[0],
        bars_per_year=c.bars_per_year,
        levels=list(vol.PERCENTILES),
        horizons=[
            VolHorizon(
                label=h.label,
                bars=h.bars,
                current=h.current,
                ci=_nums(h.ci),
                percentiles=list(h.percentiles),
                rank=h.rank,
                forecast=None
                if h.forecast is None
                else VolForecast(
                    low=h.forecast.low,
                    median=h.forecast.median,
                    high=h.forecast.high,
                    coverage=h.forecast.coverage,
                    qlike=h.forecast.qlike,
                    qlike_naive=h.forecast.qlike_naive,
                ),
            )
            for h in c.horizons
        ],
        main=c.main.label,
        squeeze=None
        if s is None
        else VolSqueeze(
            horizon=s.horizon,
            bars=s.bars,
            threshold=s.threshold,
            factor=s.factor,
            rank=_num(s.rank),
            active=s.active,
            events=s.events,
            independent=s.independent,
            p=_num(s.p),
            ci=_nums(s.ci),
            base_rate=s.base_rate,
            move_events=_nums(s.move_events),
            move_all=_nums(s.move_all),
        ),
        overnight=VolShares(window=_num(c.overnight.window), history=_num(c.overnight.history)),
        downside=VolShares(window=_num(c.downside.window), history=_num(c.downside.history)),
        scores=[
            VolScore(
                estimator=sc.estimator,
                label=LABELS[sc.estimator],
                n=sc.n,
                qlike=sc.qlike,
                bias=None if sc.bias is None else _num(sc.bias),
            )
            for sc in c.scores
        ],
        realized=any(sc.estimator == "realized" for sc in c.scores),
    )


def _hourly_realised(
    service: BarService, symbol: str, frame: BarFrame, adjusted: bool, until: date | None
) -> np.ndarray | None:
    """The 1h realised variance per daily bar, or None when there are no 1h bars."""
    try:
        hourly = service.get_bars(
            symbol, Interval.H1, adjusted=adjusted, until=until, limit=1_000_000_000
        ).frame
    except ChartLabError:
        return None
    if hourly.session is None or len(hourly) == 0:
        return None
    hourly = hourly.take(hourly.session <= frame.time[-1] // 86_400)
    return vol.realized_from_hourly(frame, hourly)


@router.get("/volatility", response_model=VolatilityResponse)
def get_volatility(
    service: Annotated[BarService, Depends(get_bar_service)],
    symbol: Annotated[str, Query(min_length=1, max_length=20)],
    interval: Interval = Interval.D1,
    estimator: Estimator = "yang_zhang",
    horizon: Annotated[
        SqueezeHorizon, Query(description="Horizon of the squeeze, the shares and the scores")
    ] = "month",
    threshold: Annotated[float, Query(ge=1, le=50, description="Squeeze rank (%)")] = 10.0,
    factor: Annotated[float, Query(ge=1.05, le=5, description="Expansion factor")] = 1.5,
    adjusted: bool = True,
    until: Annotated[date | None, Query(description="Replay cursor: no bar after it")] = None,
    origin: Annotated[
        int | None, Query(description="The cone at this bar (UTC epoch seconds of its open)")
    ] = None,
) -> VolatilityResponse:
    """The volatility cone from the whole history up to the last bar (``until``, ``origin`` in
    replay); on daily bars, the 1h bars (when there are any) add a realised variance."""
    result = service.get_bars(symbol, interval, adjusted=adjusted, until=until, limit=1_000_000_000)
    frame = result.frame
    if origin is not None:
        frame = frame.take(frame.time <= origin)
    if len(frame) == 0:
        raise NotEnoughHistoryError(f"{symbol}: no bars up to the origin")
    realised = None
    if interval is Interval.D1:
        realised = _hourly_realised(service, symbol, frame, adjusted, until)
    return volatility_response(
        frame, interval, result.symbol.symbol, estimator, horizon, threshold, factor, realised
    )
