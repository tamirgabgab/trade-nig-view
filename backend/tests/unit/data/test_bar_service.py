"""BarService scenarios: cache freshness, refresh, adjustment changes, fallbacks, queries."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pytest

from app.data.bar_service import HISTORY_START, BarService, overlap_consistent
from app.data.cache.bar_cache import BarCache
from app.data.providers.base import ProviderError, RateLimitedError
from app.data.universe import Universe
from app.errors import DataUnavailableError, SymbolNotFoundError
from app.models.bars import BarFrame, Interval, date_to_ts, ts_to_iso_dates
from app.models.symbols import SymbolInfo
from tests.unit.data.factories import bars

TODAY = date(2026, 1, 16)  # Friday
DAYS = [
    date(2026, 1, 5) + timedelta(days=i)
    for i in range(12)
    if (date(2026, 1, 5) + timedelta(days=i)).weekday() < 5
]
CLOSES = [10.0 + i for i in range(len(DAYS))]

AAA = SymbolInfo(symbol="AAA", display="AAA", name="A", type="stock", group="Stocks", exchange="T")
IDX = SymbolInfo(
    symbol="^IDX", display="IDX", name="I", type="index", group="Indices", exchange="T"
)
CCC = SymbolInfo(symbol="CCC", display="CCC", name="C", type="stock", group="Stocks", exchange="T")


@dataclass
class FakeProvider:
    """Serves a fixed history; records calls; can be told to fail."""

    id: str
    history: BarFrame
    fail: Exception | None = None
    only: set[str] | None = None
    calls: list[tuple[str, date, date]] = field(default_factory=list[tuple[str, date, date]])

    def supports(self, symbol: SymbolInfo) -> bool:
        return self.only is None or symbol.symbol in self.only

    def fetch_daily(self, symbol: SymbolInfo, start: date, end: date) -> BarFrame:
        self.calls.append((symbol.symbol, start, end))
        if self.fail is not None:
            raise self.fail
        mask = (self.history.time >= date_to_ts(start)) & (self.history.time <= date_to_ts(end))
        return self.history.take(mask)


class Clock:
    def __init__(self) -> None:
        self.now = 1_000_000.0

    def __call__(self) -> float:
        return self.now


Factory = Callable[..., tuple[BarService, Clock]]


@pytest.fixture
def make_service(tmp_path: Path) -> Factory:
    def factory(*providers: FakeProvider) -> tuple[BarService, Clock]:
        clock = Clock()
        service = BarService(
            Universe([AAA, IDX, CCC]),
            BarCache(tmp_path / "bars.db"),
            providers,
            clock=clock,
            today=lambda: TODAY,
            refresh_ttl_s=900.0,
            tail_days=10,
            retry_sleep=lambda _s: None,
        )
        return service, clock

    return factory


def history(adj: list[float] | None = None) -> BarFrame:
    return bars(DAYS, CLOSES, adj=adj)


# ---------------------------------------------------------------- freshness


def test_first_request_downloads_full_history_once(make_service: Factory) -> None:
    provider = FakeProvider("p", history())
    service, _ = make_service(provider)

    first = service.daily(AAA)
    second = service.daily(AAA)

    assert provider.calls == [("AAA", HISTORY_START, TODAY)]
    assert first.frame.equals(history())
    assert second.frame.equals(history())
    assert (first.source, first.stale) == ("p", False)


def test_after_ttl_only_the_tail_is_refreshed(make_service: Factory) -> None:
    provider = FakeProvider("p", history())
    service, clock = make_service(provider)
    service.daily(AAA)

    clock.now += 901.0
    service.daily(AAA)

    assert provider.calls[1] == ("AAA", TODAY - timedelta(days=10), TODAY)


def test_corrected_last_bar_is_accepted_without_full_reload(make_service: Factory) -> None:
    provider = FakeProvider("p", history())
    service, clock = make_service(provider)
    service.daily(AAA)
    # Today's bar was still forming: the refresh returns a different last close.
    provider.history = bars(DAYS, [*CLOSES[:-1], 99.0])

    clock.now += 901.0
    refreshed = service.daily(AAA)

    assert len(provider.calls) == 2
    assert refreshed.frame.close[-1] == 99.0


def test_changed_adjustment_triggers_full_reload(make_service: Factory) -> None:
    provider = FakeProvider("p", history())
    service, clock = make_service(provider)
    service.daily(AAA)
    # A dividend was paid: every adjusted close in the past changed.
    provider.history = history(adj=[c * 0.99 for c in CLOSES])

    clock.now += 901.0
    refreshed = service.daily(AAA)

    assert [call[1] for call in provider.calls] == [
        HISTORY_START,
        TODAY - timedelta(days=10),
        HISTORY_START,
    ]
    assert np.allclose(refreshed.frame.adj_close, np.array(CLOSES) * 0.99)
    assert "re-downloaded" in refreshed.warnings[0]


def test_overlap_consistency_ignores_newest_cached_bar() -> None:
    cached = history()
    assert overlap_consistent(cached, bars(DAYS, [*CLOSES[:-1], 123.0]))
    assert not overlap_consistent(cached, bars(DAYS, [CLOSES[0] + 1, *CLOSES[1:]]))
    assert overlap_consistent(BarFrame.empty(), cached)
    assert overlap_consistent(cached, bars([date(2030, 1, 1)], [1.0]))


# ---------------------------------------------------------------- failures and fallback


def test_falls_back_to_next_provider(make_service: Factory) -> None:
    broken = FakeProvider("a", history(), fail=ProviderError("down"))
    backup = FakeProvider("b", history())
    service, _ = make_service(broken, backup)

    result = service.daily(AAA)

    assert result.source == "b"
    assert len(broken.calls) == 1


def test_rate_limit_is_retried_before_giving_up(make_service: Factory) -> None:
    limited = FakeProvider("a", history(), fail=RateLimitedError("429"))
    backup = FakeProvider("b", history())
    service, _ = make_service(limited, backup)

    assert service.daily(AAA).source == "b"
    assert len(limited.calls) == 3  # retried with backoff


def test_skips_providers_that_do_not_support_the_symbol(make_service: Factory) -> None:
    stocks_only = FakeProvider("tiingo", history(), only={"AAA"})
    everything = FakeProvider("yahoo", history())
    service, _ = make_service(stocks_only, everything)

    assert service.daily(IDX).source == "yahoo"
    assert stocks_only.calls == []


def test_empty_full_history_counts_as_failure(make_service: Factory) -> None:
    empty = FakeProvider("a", BarFrame.empty())
    backup = FakeProvider("b", history())
    service, _ = make_service(empty, backup)
    assert service.daily(AAA).source == "b"


def test_no_cache_and_all_providers_down_raises(make_service: Factory) -> None:
    service, _ = make_service(FakeProvider("a", history(), fail=ProviderError("down")))
    with pytest.raises(DataUnavailableError, match="a: down"):
        service.daily(AAA)


def test_serves_stale_cache_when_refresh_fails(make_service: Factory) -> None:
    provider = FakeProvider("p", history())
    service, clock = make_service(provider)
    service.daily(AAA)
    provider.fail = ProviderError("down")

    clock.now += 901.0
    result = service.daily(AAA)

    assert result.stale
    assert result.frame.equals(history())
    assert "refresh failed" in result.warnings[0]


def test_breaker_pauses_a_failing_provider(make_service: Factory) -> None:
    broken = FakeProvider("a", history(), fail=ProviderError("down"))
    backup = FakeProvider("b", history())
    service, _ = make_service(broken, backup)
    service.daily(AAA)
    service.daily(IDX)  # second consecutive failure opens the breaker

    service.daily(CCC)

    assert [call[0] for call in broken.calls] == ["AAA", "^IDX"]  # CCC skipped "a"
    assert [call[0] for call in backup.calls] == ["AAA", "^IDX", "CCC"]


# ---------------------------------------------------------------- queries


def test_get_bars_unknown_symbol(make_service: Factory) -> None:
    service, _ = make_service(FakeProvider("p", history()))
    with pytest.raises(SymbolNotFoundError):
        service.get_bars("NOPE", Interval.D1)


def test_get_bars_resolves_display_name_and_resamples(make_service: Factory) -> None:
    service, _ = make_service(FakeProvider("p", history()))
    weekly = service.get_bars("idx", Interval.W1, adjusted=False)
    assert ts_to_iso_dates(weekly.frame.time) == ["2026-01-05", "2026-01-12"]
    assert weekly.frame.close.tolist() == [CLOSES[4], CLOSES[-1]]


def test_get_bars_adjusted_vs_raw(make_service: Factory) -> None:
    service, _ = make_service(FakeProvider("p", history(adj=[c * 0.5 for c in CLOSES])))
    raw = service.get_bars("AAA", Interval.D1, adjusted=False)
    adjusted = service.get_bars("AAA", Interval.D1, adjusted=True)
    assert raw.frame.close.tolist() == CLOSES
    assert adjusted.frame.close.tolist() == [c * 0.5 for c in CLOSES]


def test_until_cuts_before_resampling(make_service: Factory) -> None:
    service, _ = make_service(FakeProvider("p", history()))
    # Cursor on Wednesday of week 2: the weekly bar must only contain Mon..Wed.
    result = service.get_bars("AAA", Interval.W1, adjusted=False, until=date(2026, 1, 14))
    assert result.frame.close[-1] == CLOSES[7]
    assert result.frame.high[-1] == CLOSES[7] + 1.0


def test_start_end_and_limit_with_has_more_before(make_service: Factory) -> None:
    service, _ = make_service(FakeProvider("p", history()))
    window = service.get_bars("AAA", Interval.D1, start=date(2026, 1, 7), end=date(2026, 1, 13))
    assert ts_to_iso_dates(window.frame.time) == [
        "2026-01-07",
        "2026-01-08",
        "2026-01-09",
        "2026-01-12",
        "2026-01-13",
    ]
    assert window.has_more_before

    tail = service.get_bars("AAA", Interval.D1, limit=3)
    assert len(tail.frame) == 3
    assert tail.frame.close[-1] == CLOSES[-1]
    assert tail.has_more_before

    everything = service.get_bars("AAA", Interval.D1)
    assert not everything.has_more_before


def test_quotes_report_change_and_errors(make_service: Factory) -> None:
    service, _ = make_service(FakeProvider("p", history(), only={"AAA"}))
    quotes = service.quotes(["AAA", "^IDX", "NOPE"])

    aaa, idx, nope = quotes
    assert aaa.last == CLOSES[-1]
    assert aaa.change == pytest.approx(1.0)
    assert aaa.change_pct == pytest.approx(100.0 / CLOSES[-2])
    assert idx.error is not None
    assert "no provider" in idx.error
    assert nope.error == "unknown symbol"


def test_quote_with_single_bar_has_no_change(make_service: Factory) -> None:
    service, _ = make_service(FakeProvider("p", bars(DAYS[:1], [5.0])))
    quote = service.quote("AAA")
    assert (quote.last, quote.change, quote.change_pct) == (5.0, None, None)
