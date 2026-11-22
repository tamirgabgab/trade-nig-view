"""The provider contract.

A provider returns **raw bars for an inclusive date range**, already converted to the ChartLab
conventions (see ``app.models.bars``): split-adjusted OHLC, split+dividend adjusted ``adj_close``.

* daily bars: session-date timestamps;
* hourly bars: UTC start time of each bar, regular trading hours only, ``adj_close == close``
  (intraday bars are dividend-adjusted later with the daily factors, ``app.data.sessions``).

Validation, caching and resampling happen elsewhere.
"""

from __future__ import annotations

from datetime import date
from typing import Protocol

from app.models.bars import BarFrame
from app.models.symbols import SymbolInfo


class ProviderError(Exception):
    """A provider failed for a reason other than rate limiting."""


class RateLimitedError(ProviderError):
    """The provider refused the request because of rate limiting (HTTP 429 or equivalent)."""


class DataProvider(Protocol):
    """Interface implemented by Yahoo, Tiingo and the offline fixture provider."""

    @property
    def id(self) -> str: ...

    def supports(self, symbol: SymbolInfo) -> bool:
        """Whether this provider can serve ``symbol`` at all (e.g. Tiingo has no indices)."""
        ...

    def fetch_daily(self, symbol: SymbolInfo, start: date, end: date) -> BarFrame:
        """Daily bars with ``start <= session date <= end``. Raise ProviderError on failure."""
        ...

    def supports_hourly(self, symbol: SymbolInfo) -> bool:
        """Whether this provider can serve ``1h`` bars for ``symbol``."""
        ...

    def fetch_hourly(self, symbol: SymbolInfo, start: date, end: date) -> BarFrame:
        """``1h`` bars starting on UTC dates ``start..end`` (inclusive). Raise ProviderError."""
        ...
