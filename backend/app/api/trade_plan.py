"""``GET /api/trade-plan`` - the chances of an entry, a target and a stop over the next h bars
(``app.analysis.trade_plan``): the Trade plan drawing's numbers. A research tool, not advice."""

from __future__ import annotations

import math
from http import HTTPStatus
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.analysis import trade_plan as tp
from app.api.deps import get_bar_service
from app.data.bar_service import BarService
from app.errors import ChartLabError
from app.models.bars import Interval, ts_to_iso_dates

router = APIRouter(tags=["trade-plan"])

MAX_HORIZON = 250


class InvalidPlanError(ChartLabError):
    status = HTTPStatus.UNPROCESSABLE_ENTITY
    code = "invalid_plan"


class NotEnoughHistoryError(ChartLabError):
    status = HTTPStatus.UNPROCESSABLE_ENTITY
    code = "not_enough_history"


def _num(x: float) -> float | None:
    return x if math.isfinite(x) else None


class PlanSummary(BaseModel):
    paths: int = Field(description="Historical paths simulated")
    p_fill: float = Field(description="P(the entry is reached within h bars); 1 at the close")
    p_target: float = Field(description="P(target first | filled)")
    p_stop: float = Field(description="P(stop first | filled)")
    p_neither: float = Field(description="P(neither by the h-th bar | filled)")
    p_target_bounds: list[float] = Field(
        description="P(target) with every two-level bar given to the stop / to the target"
    )
    bars: float = Field(description="Mean bars from the origin to the exit")
    ev_r: float = Field(description="Expected result in R (planned risk) given the fill")
    ev_return: float = Field(description="Expected result as a fraction of the entry price")
    loss_r: float | None = Field(description="Mean R when stopped (gaps make it below -1)")
    kelly: float | None = Field(description="E[R] / E[R^2]: Kelly's fraction of capital at risk")


class Calibration(BaseModel):
    n: int = Field(description="Scored forecasts (36 plans x the last origins)")
    forecast: list[float | None] = Field(description="Per 10 % bin: the mean forecast P(target)")
    observed: list[float | None] = Field(description="Per bin: the share that hit the target")
    count: list[int]
    brier: float
    brier_base: float = Field(description="Brier score of the base rate (no model)")


class TradePlanResponse(BaseModel):
    symbol: str
    interval: Interval
    side: Literal["long", "short"]
    h: int
    origin_time: str | int = Field(description="The bar the plan is made at, as in /api/bars")
    origin_close: float
    sigma: float = Field(description="Today's per-bar volatility (Yang-Zhang, a month)")
    summary: PlanSummary | None = Field(description="Null if no path reached the entry")
    multiples: list[float] = Field(description="Heat map distances in sigma x sqrt(h)")
    heat: list[list[float | None]] = Field(
        description="EV in R: rows = stop distance, columns = target distance (multiples)"
    )
    reference: float | None = Field(
        description="Brownian P(target first), drift from the history, no horizon"
    )
    calibration: Calibration | None
    actual: Literal["target", "stop", "neither", "open", "not_filled"] | None = Field(
        description="What the bars after the origin did (null if there are none)"
    )
    actual_r: float | None


@router.get("/trade-plan", response_model=TradePlanResponse)
def get_trade_plan(
    service: Annotated[BarService, Depends(get_bar_service)],
    symbol: Annotated[str, Query(min_length=1, max_length=20)],
    time: Annotated[int, Query(description="The entry anchor (UTC epoch seconds)")],
    entry: Annotated[float, Query(gt=0)],
    target: Annotated[float, Query(gt=0)],
    stop: Annotated[float, Query(gt=0)],
    h: Annotated[int, Query(ge=1, le=MAX_HORIZON, description="Bars to hold at most")],
    interval: Interval = Interval.D1,
    adjusted: bool = True,
    cursor: Annotated[
        int | None, Query(description="Replay cursor (a bar's open, UTC seconds): no later bar")
    ] = None,
) -> TradePlanResponse:
    """The plan made at the bar of ``time`` from the history up to it; long when the target is
    above the entry, short when below; the stop must be on the other side."""
    if not (min(target, stop) < entry < max(target, stop)):
        raise InvalidPlanError("the entry must lie between the target and the stop")
    result = service.get_bars(symbol, interval, adjusted=adjusted, limit=1_000_000_000)
    frame = result.frame
    if cursor is not None:
        frame = frame.take(frame.time <= cursor)
    origin = int((frame.time <= time).sum()) - 1
    if origin < 0:
        raise NotEnoughHistoryError(f"{symbol}: no bar at or before the entry")
    p = tp.plan(frame, origin, entry, target, stop, h)
    if p is None:
        raise NotEnoughHistoryError(
            f"{symbol}: too few past paths of {h} bars before the entry for a plan"
        )
    s, cal = p.summary, p.calibration
    times = frame.time[origin : origin + 1]
    return TradePlanResponse(
        symbol=result.symbol.symbol,
        interval=interval,
        side=p.side,
        h=p.h,
        origin_time=int(times[0]) if interval.is_intraday else ts_to_iso_dates(times)[0],
        origin_close=float(frame.close[origin]),
        sigma=p.sigma,
        summary=None
        if s is None
        else PlanSummary(
            paths=s.paths,
            p_fill=s.p_fill,
            p_target=s.p_target,
            p_stop=s.p_stop,
            p_neither=s.p_neither,
            p_target_bounds=list(s.p_target_bounds),
            bars=s.bars,
            ev_r=s.ev_r,
            ev_return=s.ev_return,
            loss_r=_num(s.loss_r),
            kelly=_num(s.kelly),
        ),
        multiples=list(p.multiples),
        heat=[list(row) for row in p.heat],
        reference=_num(p.reference),
        calibration=None
        if cal is None
        else Calibration(
            n=cal.n,
            forecast=[_num(v) for v in cal.forecast],
            observed=[_num(v) for v in cal.observed],
            count=list(cal.count),
            brier=cal.brier,
            brier_base=cal.brier_base,
        ),
        actual=p.actual,
        actual_r=p.actual_r,
    )
