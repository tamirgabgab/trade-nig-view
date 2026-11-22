"""Symbol metadata (the curated universe in ``backend/config/universe.toml``)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

SymbolType = Literal["index", "etf", "stock", "future", "forex"]

MINUTES_PER_DAY = 1440


def parse_session_start(value: str) -> int:
    """``"HH:MM"`` -> minutes after midnight (``"18:00"`` -> 1080)."""
    hours, sep, minutes = value.partition(":")
    if not sep or not hours.isdigit() or not minutes.isdigit() or len(minutes) != 2:  # noqa: PLR2004
        raise ValueError(f"session_start must look like 'HH:MM', got {value!r}")
    total = int(hours) * 60 + int(minutes)
    if not 0 < total < MINUTES_PER_DAY:
        raise ValueError(f"session_start must be between 00:01 and 23:59, got {value!r}")
    return total


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
    session_start: str | None = Field(
        default=None,
        description="Local 'HH:MM' start of a trading session that spans midnight (CME futures"
        " '18:00', forex '17:00'); null when each session lies within one calendar day",
    )

    @field_validator("session_start")
    @classmethod
    def _check_session_start(cls, value: str | None) -> str | None:
        if value is not None:
            parse_session_start(value)
        return value

    @property
    def session_start_minutes(self) -> int | None:
        """``session_start`` in minutes after local midnight (see ``app.data.sessions``)."""
        return None if self.session_start is None else parse_session_start(self.session_start)
