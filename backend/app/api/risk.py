"""``GET /api/risk`` - Value at Risk and Expected Shortfall of the next bar, week and month by
four methods, both tails, with the 1-bar backtests (``app.analysis.risk``). A research tool, not
advice."""

from __future__ import annotations

import math
from http import HTTPStatus
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.analysis import risk as rk
from app.api.deps import get_bar_service
from app.data.bar_service import BarService
from app.errors import ChartLabError
from app.models.bars import BarFrame, Interval, ts_to_iso_dates

router = APIRouter(tags=["risk"])

Method = Literal["normal", "cornish_fisher", "fhs", "evt"]
Tail = Literal["long", "short"]


class NotEnoughHistoryError(ChartLabError):
    status = HTTPStatus.UNPROCESSABLE_ENTITY
    code = "not_enough_history"


def _num(x: float) -> float | None:
    return x if math.isfinite(x) else None


class RiskEstimate(BaseModel):
    horizon: Literal["bar", "week", "month"]
    bars: int
    method: Method
    level: float
    tail: Tail = Field(description="long: the loss of a fall; short: the loss of a rise")
    var: float = Field(description="Value at Risk as a fraction of the price (a loss)")
    es: float = Field(description="Expected Shortfall: the mean loss beyond the VaR")


class RiskTail(BaseModel):
    tail: Tail
    threshold: float = Field(description="u: the 90th percentile of the standardised losses")
    xi: float = Field(description="GPD shape: > 0 a fat (power-law) tail, < 0 a bounded one")
    beta: float = Field(description="GPD scale (standardised units)")
    exceedances: int


class RiskBacktest(BaseModel):
    method: Method
    level: float
    tail: Tail
    n: int = Field(description="Out-of-sample 1-bar forecasts scored")
    breaches: int
    expected: float = Field(description="n x (1 - level)")
    kupiec: float | None = Field(description="p-value: is the breach rate right?")
    christoffersen: float | None = Field(description="p-value: are the breaches independent?")
    z2: float = Field(description="Acerbi-Szekely Z2: 0 if the ES is right, < 0 if too small")
    z2_p: float = Field(description="P(Z2 <= the observed one) under the model (500 runs)")


class RiskBreaches(BaseModel):
    tail: Tail
    level: float
    times: list[str | int] = Field(description="Bars whose close broke the FHS 1-bar VaR")


class RiskResponse(BaseModel):
    symbol: str
    interval: Interval
    last_time: str | int
    last_close: float
    sigma: float = Field(description="Today's per-bar volatility (Yang-Zhang, a month)")
    estimates: list[RiskEstimate]
    tails: list[RiskTail]
    backtests: list[RiskBacktest]
    breaches: list[RiskBreaches]


def risk_response(frame: BarFrame, interval: Interval, symbol: str) -> RiskResponse:
    r = rk.report(frame)
    if r is None:
        raise NotEnoughHistoryError(f"{symbol}: {len(frame)} bars are too few for VaR and ES")

    def times(index: list[int]) -> list[str | int]:
        t = frame.time[index]
        return [int(x) for x in t] if interval.is_intraday else list(ts_to_iso_dates(t))

    last = frame.time[-1:]
    return RiskResponse(
        symbol=symbol,
        interval=interval,
        last_time=int(last[0]) if interval.is_intraday else ts_to_iso_dates(last)[0],
        last_close=float(frame.close[-1]),
        sigma=r.sigma,
        estimates=[
            RiskEstimate(
                horizon=e.horizon,
                bars=e.bars,
                method=e.method,
                level=e.level,
                tail=e.tail,
                var=e.var,
                es=e.es,
            )
            for e in r.estimates
        ],
        tails=[
            RiskTail(tail=t.tail, threshold=t.u, xi=t.xi, beta=t.beta, exceedances=t.exceedances)
            for t in r.tails
        ],
        backtests=[
            RiskBacktest(
                method=b.method,
                level=b.level,
                tail=b.tail,
                n=b.n,
                breaches=b.breaches,
                expected=b.expected,
                kupiec=_num(b.kupiec),
                christoffersen=_num(b.christoffersen),
                z2=b.z2,
                z2_p=b.z2_p,
            )
            for b in r.backtests
        ],
        breaches=[
            RiskBreaches(tail=tail, level=level, times=times(hits.tolist()))
            for (tail, level), hits in r.breaches.items()
        ],
    )


@router.get("/risk", response_model=RiskResponse)
def get_risk(
    service: Annotated[BarService, Depends(get_bar_service)],
    symbol: Annotated[str, Query(min_length=1, max_length=20)],
    interval: Interval = Interval.D1,
    adjusted: bool = True,
    origin: Annotated[
        int | None, Query(description="At this bar (UTC epoch seconds of its open; replay)")
    ] = None,
) -> RiskResponse:
    """VaR and ES at the last bar (``origin`` in replay) from the whole history up to it."""
    result = service.get_bars(symbol, interval, adjusted=adjusted, limit=1_000_000_000)
    frame = result.frame
    if origin is not None:
        frame = frame.take(frame.time <= origin)
    return risk_response(frame, interval, result.symbol.symbol)
