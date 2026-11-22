"""Symbol metadata (the curated universe in ``backend/config/universe.toml``)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SymbolType = Literal["index", "etf", "stock", "future", "forex"]


class SymbolInfo(BaseModel):
    """One tradable or reference instrument."""

    model_config = ConfigDict(frozen=True)

    symbol: str = Field(description="Provider symbol, e.g. 'AAPL', '^GSPC', 'GC=F'")
    display: str = Field(description="Short display name, e.g. 'SPX'")
    name: str
    type: SymbolType
    group: str = Field(description="Watchlist section, e.g. 'Indices'")
    exchange: str
    currency: str = "USD"
    timezone: str = "America/New_York"
    has_volume: bool = True
    decimals: int = Field(default=2, ge=0, le=8, description="Price display precision")
