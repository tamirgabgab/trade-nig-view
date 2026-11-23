"""``GET /api/analysis/gaps`` - price gaps and their fill status."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.analysis.gaps import GapDirection, GapKind, find_gaps
from app.api.deps import get_bar_service
from app.data.bar_service import BarService
from app.models.bars import Interval, ts_to_iso_dates

router = APIRouter(tags=["analysis"])

BarTime = str | int


class GapInfo(BaseModel):
    time: BarTime = Field(
        description="Bar after the gap, as in /api/bars ('YYYY-MM-DD' or UTC epoch seconds)"
    )
    filled_time: BarTime | None = Field(description="Bar that filled the gap; null while open")
    direction: GapDirection
    kind: GapKind = Field(description="full: the ranges do not overlap; partial: only the open")
    top: float = Field(description="Upper edge of the gap zone")
    bottom: float = Field(description="Lower edge of the gap zone")
    size_pct: float = Field(description="(top - bottom) / previous close * 100")
    fill_price: float | None = Field(
        description="Deepest price reached inside the zone so far (bottom for a filled gap up, "
        "top for a filled gap down); null if no bar has entered it"
    )


class GapsResponse(BaseModel):
    symbol: str
    interval: Interval
    gaps: list[GapInfo] = Field(description="Sorted by time, oldest first")


@router.get("/analysis/gaps", response_model=GapsResponse)
def get_gaps(
    service: Annotated[BarService, Depends(get_bar_service)],
    symbol: Annotated[str, Query(min_length=1, max_length=20)],
    interval: Interval = Interval.D1,
    min_pct: Annotated[float, Query(ge=0, le=50, description="Minimum gap size in %")] = 1.0,
    partial: Annotated[bool, Query(description="Also report open-only (partial) gaps")] = False,
    adjusted: bool = True,
    until: Annotated[date | None, Query(description="Replay cursor: no bar after it")] = None,
) -> GapsResponse:
    """Gaps over the whole available history of ``interval``, never after ``until``."""
    result = service.get_bars(symbol, interval, adjusted=adjusted, until=until, limit=1_000_000_000)
    frame = result.frame
    times: list[str] | list[int] = (
        [int(t) for t in frame.time] if interval.is_intraday else ts_to_iso_dates(frame.time)
    )
    return GapsResponse(
        symbol=result.symbol.symbol,
        interval=interval,
        gaps=[
            GapInfo(
                time=times[g.index],
                filled_time=None if g.filled_index is None else times[g.filled_index],
                direction=g.direction,
                kind=g.kind,
                top=g.top,
                bottom=g.bottom,
                size_pct=g.size_pct,
                fill_price=g.fill_price,
            )
            for g in find_gaps(frame, min_pct, partial)
        ],
    )
