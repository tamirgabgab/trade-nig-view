"""``GET /api/quotes`` - last price, daily change, sparkline and ranges for the watchlist."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.api.deps import get_bar_service
from app.data.bar_service import BarService
from app.models.bars import ts_to_date

router = APIRouter(tags=["quotes"])

MAX_SYMBOLS = 100


class QuoteOut(BaseModel):
    symbol: str
    time: str | None
    last: float | None
    change: float | None
    change_pct: float | None
    stale: bool
    error: str | None
    spark: list[float] = Field(description="The last 20 daily closes, oldest first")
    day_low: float | None
    day_high: float | None
    low_52w: float | None = Field(description="Lowest low of the last 365 days of daily bars")
    high_52w: float | None = Field(description="Highest high of the last 365 days of daily bars")


@router.get("/quotes", response_model=list[QuoteOut])
def get_quotes(
    service: Annotated[BarService, Depends(get_bar_service)],
    symbols: Annotated[str, Query(description="Comma-separated, e.g. 'AAPL,^GSPC'")],
) -> list[QuoteOut]:
    """Unadjusted last close vs previous close. Per-symbol failures are reported in ``error``."""
    requested = [s.strip() for s in symbols.split(",") if s.strip()][:MAX_SYMBOLS]
    return [
        QuoteOut(
            symbol=q.symbol.symbol,
            time=None if q.time is None else ts_to_date(q.time).isoformat(),
            last=q.last,
            change=q.change,
            change_pct=q.change_pct,
            stale=q.stale,
            error=q.error,
            spark=list(q.spark),
            day_low=q.day_low,
            day_high=q.day_high,
            low_52w=q.low_52w,
            high_52w=q.high_52w,
        )
        for q in service.quotes(requested)
    ]
