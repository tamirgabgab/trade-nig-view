"""Provider of the synthetic symbols' bars (no network, deterministic by the definition's seed).

``BarService`` asks it directly for symbols whose type is ``synthetic`` and never stores the bars in
``bars.db``: they are generated from the definition (memoised in memory by the whole definition),
so an edited definition is served at once.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, date, datetime

from app.data.adjust import dividend_adjust
from app.data.providers.base import ProviderError
from app.data.synthetic import (
    PLACEHOLDER_PREFIX,
    daily_bars,
    dwelling_daily,
    dwelling_hourly,
    hourly_bars,
    parametric_daily,
    parametric_hourly,
    placeholder_daily,
    placeholder_hourly,
    shuffle_daily,
    shuffle_hourly,
)
from app.data.synthetic_shuffle import source_slice
from app.errors import DataUnavailableError
from app.macro.service import CachedSeries
from app.models.bars import SECONDS_PER_DAY, BarFrame, Interval, date_to_ts
from app.models.symbols import SymbolInfo
from app.models.synthetic import (
    DwellingDefinition,
    ParametricDefinition,
    ScenarioDefinition,
    ShuffleDefinition,
    SyntheticDefinition,
    is_synthetic,
)

#: A market symbol's cached daily history (split-adjusted, with ``adj_close``) and its freshness.
SourceDaily = Callable[[str], tuple[BarFrame, bool, tuple[str, ...]]]


class SyntheticProvider:
    """``DataProvider`` for ``SYN:`` symbols: daily and 1h bars from their saved definitions (and,
    for a dwelling symbol, its index from the macro service; for a shuffled copy, its source's
    daily bars from the bar service)."""

    id = "synthetic"

    def __init__(
        self,
        definition: Callable[[str], SyntheticDefinition | None],
        index: Callable[[str], CachedSeries],
        source_daily: SourceDaily,
        today: Callable[[], date] = lambda: datetime.now(UTC).date(),
    ) -> None:
        self._definition = definition
        self._index = index
        self._source_daily = source_daily
        self._today = today

    def supports(self, symbol: SymbolInfo) -> bool:
        return is_synthetic(symbol)

    def supports_intraday(self, symbol: SymbolInfo, base: Interval) -> bool:
        return is_synthetic(symbol) and base is Interval.H1

    def fetch_daily(self, symbol: SymbolInfo, start: date, end: date) -> BarFrame:
        return self.generate(symbol, Interval.D1, start, end)[0]

    def fetch_intraday(
        self, symbol: SymbolInfo, base: Interval, start: date, end: date
    ) -> BarFrame:
        if not self.supports_intraday(symbol, base):
            raise ProviderError(f"{symbol.symbol} has no {base} bars")
        return self.generate(symbol, base, start, end)[0]

    def generate(
        self, symbol: SymbolInfo, base: Interval, start: date, end: date
    ) -> tuple[BarFrame, bool, tuple[str, ...]]:
        """The 1D or 1h bars of ``symbol`` between the dates, and whether the data behind them is
        a stale copy and why (a dwelling symbol's index, a shuffled copy's source, when its
        refresh failed), from one read of that data."""
        frame, stale, warnings = self._bars(self._lookup(symbol), hourly=base.is_intraday)
        return _between(frame, start, end), stale, warnings

    def _bars(
        self, definition: SyntheticDefinition, *, hourly: bool
    ) -> tuple[BarFrame, bool, tuple[str, ...]]:
        match definition:
            case ScenarioDefinition():
                return (hourly_bars if hourly else daily_bars)(definition), False, ()
            case DwellingDefinition():
                cached = self._index(definition.series)
                bars = dwelling_hourly if hourly else dwelling_daily
                return bars(definition, cached.data, self._today()), cached.stale, cached.warnings
            case ParametricDefinition():
                return (parametric_hourly if hourly else parametric_daily)(definition), False, ()
            case ShuffleDefinition():
                return self._shuffle_bars(definition, hourly=hourly)

    def _shuffle_bars(
        self, definition: ShuffleDefinition, *, hourly: bool
    ) -> tuple[BarFrame, bool, tuple[str, ...]]:
        """A copy's bars from its source's, or its placeholder when they cannot be read."""
        try:
            frame, stale, warnings = self._source_daily(definition.source)
        except DataUnavailableError as exc:
            return _placeholder(definition, hourly, f"until it can be fetched ({exc})")
        except ProviderError as exc:  # no longer in the universe
            return _placeholder(definition, hourly, f"it cannot be rebuilt ({exc})")
        try:
            source = source_slice(definition, dividend_adjust(frame))
        except ValueError as exc:  # the range's checks
            return _placeholder(definition, hourly, f"it cannot be rebuilt ({exc})")
        bars = (shuffle_hourly if hourly else shuffle_daily)(definition, source)
        return bars, stale, warnings

    def _lookup(self, symbol: SymbolInfo) -> SyntheticDefinition:
        definition = self._definition(symbol.symbol)
        if definition is None:
            raise ProviderError(f"{symbol.symbol} is no longer defined")
        return definition


def _placeholder(
    definition: ShuffleDefinition, hourly: bool, why: str
) -> tuple[BarFrame, bool, tuple[str, ...]]:
    """A copy with no source bars to shuffle: flat at 100, stale, and the warning that says so
    (``why``: waiting for a fetch, or to be edited or deleted)."""
    flat = (placeholder_hourly if hourly else placeholder_daily)(definition)
    warning = f"{PLACEHOLDER_PREFIX}{definition.source}: a flat placeholder at 100, {why}"
    return flat, True, (warning,)


def _between(frame: BarFrame, start: date, end: date) -> BarFrame:
    days = frame.time // SECONDS_PER_DAY
    return frame.take((days >= _day(start)) & (days <= _day(end)))


def _day(day: date) -> int:
    return date_to_ts(day) // SECONDS_PER_DAY
