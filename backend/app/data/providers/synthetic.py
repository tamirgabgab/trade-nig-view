"""Provider of the synthetic symbols' bars (no network, deterministic by the definition's seed).

``BarService`` asks it directly for symbols whose type is ``synthetic`` and never stores the bars in
``bars.db``: they are generated from the definition (memoised in memory by the whole definition),
so an edited definition is served at once.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date

from app.data.providers.base import ProviderError
from app.data.synthetic import daily_bars, hourly_bars
from app.models.bars import SECONDS_PER_DAY, BarFrame, Interval, date_to_ts
from app.models.symbols import SymbolInfo
from app.models.synthetic import ScenarioDefinition, is_synthetic


class SyntheticProvider:
    """``DataProvider`` for ``SYN:`` symbols: daily and 1h bars from their saved definitions."""

    id = "synthetic"

    def __init__(self, definition: Callable[[str], ScenarioDefinition | None]) -> None:
        self._definition = definition

    def supports(self, symbol: SymbolInfo) -> bool:
        return is_synthetic(symbol)

    def supports_intraday(self, symbol: SymbolInfo, base: Interval) -> bool:
        return is_synthetic(symbol) and base is Interval.H1

    def fetch_daily(self, symbol: SymbolInfo, start: date, end: date) -> BarFrame:
        frame = daily_bars(self._lookup(symbol))
        days = frame.time // SECONDS_PER_DAY
        return frame.take((days >= _day(start)) & (days <= _day(end)))

    def fetch_intraday(
        self, symbol: SymbolInfo, base: Interval, start: date, end: date
    ) -> BarFrame:
        if not self.supports_intraday(symbol, base):
            raise ProviderError(f"{symbol.symbol} has no {base} bars")
        frame = hourly_bars(self._lookup(symbol))
        days = frame.time // SECONDS_PER_DAY
        return frame.take((days >= _day(start)) & (days <= _day(end)))

    def _lookup(self, symbol: SymbolInfo) -> ScenarioDefinition:
        definition = self._definition(symbol.symbol)
        if definition is None:
            raise ProviderError(f"{symbol.symbol} is no longer defined")
        return definition


def _day(day: date) -> int:
    return date_to_ts(day) // SECONDS_PER_DAY
