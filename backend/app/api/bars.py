"""``GET /api/bars`` - validated OHLCV bars."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.api.deps import get_bar_service
from app.data.bar_service import BarService
from app.models.bars import Interval, ts_to_iso_dates

router = APIRouter(tags=["bars"])


class Bar(BaseModel):
    time: str | int = Field(
        description="Daily and longer: session date 'YYYY-MM-DD'. "
        "Intraday (1h, 4h): UTC epoch seconds of the bar start."
    )
    open: float
    high: float
    low: float
    close: float
    volume: float


class BarsResponse(BaseModel):
    symbol: str
    interval: Interval
    adjusted: bool = Field(description="Dividend adjustment applied (ADJ)")
    timezone: str = Field(description="Exchange time zone (IANA), e.g. 'America/New_York'")
    source: str = Field(description="Provider that delivered the cached data")
    stale: bool = Field(description="True if a refresh failed and cached data is served")
    has_more_before: bool = Field(description="Older bars exist (request with an earlier end)")
    warnings: list[str]
    bars: list[Bar]


@router.get("/bars", response_model=BarsResponse)
def get_bars(
    service: Annotated[BarService, Depends(get_bar_service)],
    symbol: Annotated[str, Query(min_length=1, max_length=20)],
    interval: Interval = Interval.D1,
    start: date | None = None,
    end: date | None = None,
    until: Annotated[date | None, Query(description="Replay cursor: no bar after it")] = None,
    limit: Annotated[int, Query(ge=1, le=50_000)] = 5000,
    adjusted: bool = True,
) -> BarsResponse:
    """The newest ``limit`` bars in ``[start, end]``, never after ``until``.

    For intraday intervals the dates select whole trading sessions (by session date).
    """
    result = service.get_bars(
        symbol, interval, adjusted=adjusted, start=start, end=end, until=until, limit=limit
    )
    frame = result.frame
    times: list[str] | list[int] = (
        [int(t) for t in frame.time] if interval.is_intraday else ts_to_iso_dates(frame.time)
    )
    bars = [
        Bar(
            time=t,
            open=float(frame.open[i]),
            high=float(frame.high[i]),
            low=float(frame.low[i]),
            close=float(frame.close[i]),
            volume=float(frame.volume[i]),
        )
        for i, t in enumerate(times)
    ]
    return BarsResponse(
        symbol=result.symbol.symbol,
        interval=interval,
        adjusted=result.adjusted,
        timezone=result.symbol.timezone,
        source=result.source,
        stale=result.stale,
        has_more_before=result.has_more_before,
        warnings=list(result.warnings),
        bars=bars,
    )
