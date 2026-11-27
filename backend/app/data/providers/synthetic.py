"""Provider of the synthetic symbols' bars (no network, deterministic by the definition's seed).

``BarService`` asks it directly for symbols whose type is ``synthetic`` and never stores the bars in
``bars.db``: they are generated from the definition (memoised in memory by the whole definition),
so an edited definition is served at once.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date

from app.data.providers.base import ProviderError
from app.data.synthetic import daily_bars, dwelling_daily, dwelling_hourly, hourly_bars
from app.macro.series import MacroSeries
from app.models.bars import SECONDS_PER_DAY, BarFrame, Interval, date_to_ts
from app.models.symbols import SymbolInfo
from app.models.synthetic import ScenarioDefinition, SyntheticDefinition, is_synthetic


class SyntheticProvider:
    """``DataProvider`` for ``SYN:`` symbols: daily and 1h bars from their saved definitions (and,
    for a dwelling symbol, its index from the macro service)."""

    id = "synthetic"

    def __init__(
        self,
        definition: Callable[[str], SyntheticDefinition | None],
        index: Callable[[str], MacroSeries],
    ) -> None:
        self._definition = definition
        self._index = index

    def supports(self, symbol: SymbolInfo) -> bool:
        return is_synthetic(symbol)

    def supports_intraday(self, symbol: SymbolInfo, base: Interval) -> bool:
        return is_synthetic(symbol) and base is Interval.H1

    def fetch_daily(self, symbol: SymbolInfo, start: date, end: date) -> BarFrame:
        return _between(self._bars(symbol, hourly=False, today=end), start, end)

    def fetch_intraday(
        self, symbol: SymbolInfo, base: Interval, start: date, end: date
    ) -> BarFrame:
        if not self.supports_intraday(symbol, base):
            raise ProviderError(f"{symbol.symbol} has no {base} bars")
        return _between(self._bars(symbol, hourly=True, today=end), start, end)

    def _bars(self, symbol: SymbolInfo, *, hourly: bool, today: date) -> BarFrame:
        definition = self._definition(symbol.symbol)
        if definition is None:
            raise ProviderError(f"{symbol.symbol} is no longer defined")
        if isinstance(definition, ScenarioDefinition):
            return hourly_bars(definition) if hourly else daily_bars(definition)
        index = self._index(definition.series)
        bars = dwelling_hourly if hourly else dwelling_daily
        return bars(definition, index, today)


def _between(frame: BarFrame, start: date, end: date) -> BarFrame:
    days = frame.time // SECONDS_PER_DAY
    return frame.take((days >= _day(start)) & (days <= _day(end)))


def _day(day: date) -> int:
    return date_to_ts(day) // SECONDS_PER_DAY
