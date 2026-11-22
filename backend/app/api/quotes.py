"""``GET /api/quotes`` - last price and daily change for the watchlist."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

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
        )
        for q in service.quotes(requested)
    ]
