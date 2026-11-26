"""BarService scenarios: cache freshness, refresh, adjustment changes, fallbacks, queries."""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pytest

from app.config import REPO_ROOT
from app.data.bar_service import (
    HISTORY_START,
    SPARK_BARS,
    BarService,
    overlap_consistent,
    rescaled_before,
)
from app.data.cache.bar_cache import BarCache
from app.data.providers.base import ProviderError, RateLimitedError
from app.data.providers.yahoo import INTRADAY_MAX_DAYS
from app.data.resample import aggregate, intraday_block_keys
from app.data.sessions import session_days
from app.data.universe import Universe
from app.errors import DataUnavailableError, SymbolNotFoundError
from app.models.bars import BarFrame, Interval, date_to_ts, ts_to_date, ts_to_iso_dates
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
    hourly: BarFrame | None = None
    hourly_calls: list[tuple[str, date, date]] = field(default_factory=list[tuple[str, date, date]])
    #: Bars of the minute bases (1m, 5m), served like ``hourly``.
    minutes: dict[Interval, BarFrame] = field(default_factory=dict[Interval, BarFrame])
    minute_calls: list[tuple[Interval, date, date]] = field(
        default_factory=list[tuple[Interval, date, date]]
    )

    def _intraday(self, base: Interval) -> BarFrame | None:
        return self.hourly if base is Interval.H1 else self.minutes.get(base)

    def supports(self, symbol: SymbolInfo) -> bool:
        return self.only is None or symbol.symbol in self.only

    def supports_intraday(self, symbol: SymbolInfo, base: Interval) -> bool:
        return self._intraday(base) is not None

    def fetch_intraday(
        self, symbol: SymbolInfo, base: Interval, start: date, end: date
    ) -> BarFrame:
        if base is Interval.H1:
            self.hourly_calls.append((symbol.symbol, start, end))
        else:
            self.minute_calls.append((base, start, end))
        if self.fail is not None:
            raise self.fail
        frame = self._intraday(base)
        assert frame is not None
        return frame.take(
            (frame.time >= date_to_ts(start)) & (frame.time < date_to_ts(end) + 86_400)
        )

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


def test_quote_carries_sparkline_day_and_52_week_ranges(make_service: Factory) -> None:
    # A bar 400 days before the last one is outside the 52-week window.
    old = DAYS[-1] - timedelta(days=400)
    service, _ = make_service(FakeProvider("p", bars([old, *DAYS], [1000.0, *CLOSES])))
    quote = service.quote("AAA")
    assert quote.spark == (1000.0, *CLOSES)  # fewer than SPARK_BARS bars: all of them
    assert (quote.day_low, quote.day_high) == (CLOSES[-1] - 1.0, CLOSES[-1] + 1.0)
    assert (quote.low_52w, quote.high_52w) == (CLOSES[0] - 1.0, CLOSES[-1] + 1.0)


def test_sparkline_keeps_the_last_20_closes(make_service: Factory) -> None:
    days = [date(2025, 1, 1) + timedelta(days=i) for i in range(SPARK_BARS + 5)]
    closes = [float(i) for i in range(len(days))]
    service, _ = make_service(FakeProvider("p", bars(days, closes)))
    assert service.quote("AAA").spark == tuple(closes[-SPARK_BARS:])


def test_quote_with_single_bar_has_no_change(make_service: Factory) -> None:
    service, _ = make_service(FakeProvider("p", bars(DAYS[:1], [5.0])))
    quote = service.quote("AAA")
    assert (quote.last, quote.change, quote.change_pct) == (5.0, None, None)


# ---------------------------------------------------------------- intraday (1h, 4h)

NY = ZoneInfo("America/New_York")


def hourly_history(days: list[date] = DAYS) -> BarFrame:
    """Seven regular-hours 1h bars per session; each session's last close is its daily close."""
    times: list[int] = []
    closes: list[float] = []
    for day, close in zip(days, CLOSES, strict=False):
        for k in range(7):
            start = datetime(day.year, day.month, day.day, 9 + k, 30, tzinfo=NY)
            times.append(int(start.timestamp()))
            closes.append(close - 0.6 + 0.1 * k)
    return BarFrame.from_columns(
        time=times,
        open=[c - 0.05 for c in closes],
        high=[c + 0.2 for c in closes],
        low=[c - 0.2 for c in closes],
        close=closes,
        volume=[10.0] * len(times),
    )


def test_first_hourly_request_downloads_the_provider_limit_once(make_service: Factory) -> None:
    provider = FakeProvider("p", history(), hourly=hourly_history())
    service, clock = make_service(provider)

    first = service.history(AAA, Interval.H1)
    service.history(AAA, Interval.H1)
    assert provider.hourly_calls == [
        ("AAA", TODAY - timedelta(days=INTRADAY_MAX_DAYS[Interval.H1]), TODAY)
    ]
    assert first.frame.equals(hourly_history())
    assert provider.calls == []  # daily history untouched

    clock.now += 901.0
    service.history(AAA, Interval.H1)
    assert provider.hourly_calls[1] == ("AAA", TODAY - timedelta(days=5), TODAY)


def test_hourly_refresh_after_a_long_pause_stays_within_the_limit(make_service: Factory) -> None:
    provider = FakeProvider("p", history(), hourly=hourly_history())
    service, clock = make_service(provider)
    service.history(AAA, Interval.H1)
    today = TODAY + timedelta(days=1000)
    service._today = lambda: today  # pyright: ignore[reportPrivateUsage]
    clock.now += 901.0
    service.history(AAA, Interval.H1)
    assert provider.hourly_calls[1] == (
        "AAA",
        today - timedelta(days=INTRADAY_MAX_DAYS[Interval.H1]),
        today,
    )


def test_hourly_bars_skip_providers_without_intraday(make_service: Factory) -> None:
    daily_only = FakeProvider("daily", history())
    service, _ = make_service(daily_only)
    with pytest.raises(DataUnavailableError, match="No 1h data"):
        service.get_bars("AAA", Interval.H1)

    both = FakeProvider("both", history(), hourly=hourly_history())
    service, _ = make_service(daily_only, both)
    result = service.get_bars("AAA", Interval.H1, adjusted=False)
    assert result.source == "both"
    assert len(result.frame) == 7 * len(DAYS)


def test_intraday_adjustment_uses_the_session_daily_factor(make_service: Factory) -> None:
    factors = [0.98] * 5 + [1.0] * (len(DAYS) - 5)  # ex-dividend on the 6th session
    adj = [c * f for c, f in zip(CLOSES, factors, strict=True)]
    service, _ = make_service(FakeProvider("p", history(adj=adj), hourly=hourly_history()))

    raw = service.get_bars("AAA", Interval.H1, adjusted=False)
    adjusted = service.get_bars("AAA", Interval.H1, adjusted=True)
    assert not raw.adjusted
    assert adjusted.adjusted
    expected = raw.frame.close * np.repeat(factors, 7)
    np.testing.assert_allclose(adjusted.frame.close, expected, rtol=1e-12)
    np.testing.assert_allclose(adjusted.frame.open, raw.frame.open * np.repeat(factors, 7))
    # The last 1h close of each session equals that session's adjusted daily close.
    np.testing.assert_allclose(adjusted.frame.close[6::7], adj, rtol=1e-12)


def test_intraday_without_dividends_never_fetches_daily_bars(make_service: Factory) -> None:
    provider = FakeProvider("p", history(), hourly=hourly_history())
    service, _ = make_service(provider)
    result = service.get_bars("IDX", Interval.H1, adjusted=True)
    assert result.adjusted
    assert provider.calls == []


def test_intraday_adjustment_is_skipped_when_daily_bars_fail(make_service: Factory) -> None:
    hourly_only = FakeProvider("h", BarFrame.empty(), hourly=hourly_history())
    service, _ = make_service(hourly_only)
    result = service.get_bars("AAA", Interval.H1, adjusted=True)
    assert not result.adjusted
    assert any("Dividend adjustment skipped" in w for w in result.warnings)
    assert len(result.frame) == 7 * len(DAYS)


def test_4h_bars_through_the_service(make_service: Factory) -> None:
    service, _ = make_service(FakeProvider("p", history(), hourly=hourly_history()))
    result = service.get_bars("AAA", Interval.H4, adjusted=False)
    assert result.interval is Interval.H4
    assert len(result.frame) == 2 * len(DAYS)
    first = datetime.fromtimestamp(int(result.frame.time[0]), NY)
    second = datetime.fromtimestamp(int(result.frame.time[1]), NY)
    assert (first.hour, first.minute, second.hour, second.minute) == (9, 30, 13, 30)
    assert result.frame.close[1] == hourly_history().close[6]


def test_intraday_dates_select_whole_sessions(make_service: Factory) -> None:
    service, _ = make_service(FakeProvider("p", history(), hourly=hourly_history()))
    # Sessions 2026-01-07 .. 2026-01-08; 15:30 New York is 20:30 UTC, still the same session.
    window = service.get_bars(
        "AAA", Interval.H1, adjusted=False, start=date(2026, 1, 7), end=date(2026, 1, 8)
    )
    assert len(window.frame) == 14
    assert window.has_more_before
    cut = service.get_bars("AAA", Interval.H4, adjusted=False, until=date(2026, 1, 6))
    assert len(cut.frame) == 4
    tail = service.get_bars("AAA", Interval.H1, adjusted=False, limit=10)
    assert len(tail.frame) == 10
    assert tail.has_more_before


def test_history_rejects_derived_intervals(make_service: Factory) -> None:
    service, _ = make_service(FakeProvider("p", history()))
    with pytest.raises(ValueError, match="base interval"):
        service.history(AAA, Interval.W1)


def test_intraday_frames_carry_their_sessions_and_daily_frames_do_not(
    make_service: Factory,
) -> None:
    service, _ = make_service(FakeProvider("p", history(), hourly=hourly_history()))
    assert service.get_bars("AAA", Interval.D1, adjusted=False).frame.session is None
    hourly = service.get_bars("AAA", Interval.H1, adjusted=False, limit=10).frame
    four = service.get_bars("AAA", Interval.H4, adjusted=False).frame
    for frame, per_session in ((hourly, 7), (four, 2)):
        assert frame.session is not None
        days = [ts_to_date(int(d) * 86_400) for d in frame.session]
        assert days[-1] == DAYS[-1]
        assert days.count(DAYS[-1]) == per_session


# ---------------------------------------------------------------- minute intervals (1m … 90m)


def five_minute_history(days: list[date] = DAYS) -> BarFrame:
    """78 regular-hours 5m bars per session (09:30 … 15:55); closes rise by 0.01 a bar."""
    times: list[int] = []
    closes: list[float] = []
    for day, close in zip(days, CLOSES, strict=False):
        session_open = int(datetime(day.year, day.month, day.day, 9, 30, tzinfo=NY).timestamp())
        for k in range(78):
            times.append(session_open + 300 * k)
            closes.append(close - 0.78 + 0.01 * (k + 1))
    return BarFrame.from_columns(
        time=times,
        open=[c - 0.005 for c in closes],
        high=[c + 0.02 for c in closes],
        low=[c - 0.02 for c in closes],
        close=closes,
        volume=[5.0] * len(times),
    )


def test_minute_intervals_resample_their_base(make_service: Factory) -> None:
    provider = FakeProvider("p", history(), minutes={Interval.MIN5: five_minute_history()})
    service, _ = make_service(provider)
    five = service.get_bars("AAA", Interval.MIN5, adjusted=False, limit=100_000).frame
    assert len(five) == 78 * len(DAYS)
    for interval, per_session in ((Interval.MIN15, 26), (Interval.MIN30, 13), (Interval.MIN90, 5)):
        out = service.get_bars("AAA", interval, adjusted=False, limit=100_000).frame
        assert len(out) == per_session * len(DAYS)
        assert out.session is not None
        np.testing.assert_allclose(out.volume.sum(), five.volume.sum())
    ninety = service.get_bars("AAA", Interval.MIN90, adjusted=False, limit=5).frame
    starts = [datetime.fromtimestamp(int(t), NY) for t in ninety.time]
    assert [(t.hour, t.minute) for t in starts] == [(9, 30), (11, 0), (12, 30), (14, 0), (15, 30)]
    # The 5m base is downloaded once, for the provider's window only; no 1h request.
    assert provider.minute_calls == [
        (Interval.MIN5, TODAY - timedelta(days=INTRADAY_MAX_DAYS[Interval.MIN5]), TODAY)
    ]
    assert provider.hourly_calls == []


def test_5m_bars_aggregate_to_the_1h_bars() -> None:
    """Resampling the 5m base with 1h blocks gives the 1h bars of the same session."""
    five = five_minute_history()
    days = session_days(five.time, "America/New_York")
    hours = aggregate(five, intraday_block_keys(five.time, days, 3600))
    assert len(hours) == 7 * len(DAYS)
    first = five.take(slice(0, 12))
    assert hours.open[0] == first.open[0]
    assert hours.close[0] == first.close[-1]
    assert hours.high[0] == first.high.max()
    assert hours.volume[0] == first.volume.sum()
    # The session's last 1h bar is the half hour 15:30-16:00 (six 5m bars).
    assert hours.close[6] == five.close[77]


def test_bars_report_the_history_depth(make_service: Factory) -> None:
    provider = FakeProvider(
        "p", history(), hourly=hourly_history(), minutes={Interval.MIN5: five_minute_history()}
    )
    service, _ = make_service(provider)
    fifteen = service.get_bars("AAA", Interval.MIN15, adjusted=False, limit=3)
    assert fifteen.history_start == int(five_minute_history().time[0])
    assert fifteen.provider_window_days == INTRADAY_MAX_DAYS[Interval.MIN5] + 1
    assert service.get_bars("AAA", Interval.H4, adjusted=False).provider_window_days == 730
    daily = service.get_bars("AAA", Interval.D1, limit=2)
    assert daily.history_start == date_to_ts(DAYS[0])
    assert daily.provider_window_days is None


def test_minute_bases_refresh_after_a_minute(make_service: Factory) -> None:
    provider = FakeProvider("p", history(), minutes={Interval.MIN1: five_minute_history()})
    service, clock = make_service(provider)
    service.history(AAA, Interval.MIN1)
    clock.now += 30.0
    service.history(AAA, Interval.MIN1)
    assert len(provider.minute_calls) == 1
    clock.now += 31.0
    service.history(AAA, Interval.MIN1)
    assert provider.minute_calls[1] == (Interval.MIN1, TODAY - timedelta(days=2), TODAY)


def test_a_split_keeps_older_intraday_bars_rescaled(make_service: Factory) -> None:
    """Bars older than the provider's window survive a split, brought to the new prices."""
    five = five_minute_history()
    provider = FakeProvider("p", history(), minutes={Interval.MIN5: five})
    service, clock = make_service(provider)
    service.history(AAA, Interval.MIN5)
    # Later: the provider only has the last two sessions, after a 2:1 split.
    recent = five.take(five.time >= int(five.time[-2 * 78]))
    provider.minutes[Interval.MIN5] = BarFrame(
        recent.time,
        recent.open / 2,
        recent.high / 2,
        recent.low / 2,
        recent.close / 2,
        recent.adj_close / 2,
        recent.volume * 2,
    )
    clock.now += 61.0
    cached = service.history(AAA, Interval.MIN5)
    assert any("adjustment changed" in w for w in cached.warnings)
    assert len(cached.frame) == len(five)
    np.testing.assert_allclose(cached.frame.close, five.close / 2, rtol=1e-12)
    np.testing.assert_allclose(cached.frame.volume, five.volume * 2, rtol=1e-12)


def test_rescaled_before_needs_common_bars() -> None:
    old = five_minute_history().take(slice(0, 10))
    new = five_minute_history().take(slice(20, 30))
    assert len(rescaled_before(old, new)) == 0
    assert len(rescaled_before(BarFrame.empty(), new)) == 0
    assert len(rescaled_before(old, BarFrame.empty())) == 0


def test_offline_snapshots_ignore_the_provider_window(tmp_path: Path) -> None:
    provider = FakeProvider("p", history(), minutes={Interval.MIN5: five_minute_history()})
    service = BarService(
        Universe([AAA]),
        BarCache(tmp_path / "bars.db"),
        [provider],
        today=lambda: TODAY + timedelta(days=400),  # long after the snapshot
        provider_limits=False,
    )
    assert len(service.history(AAA, Interval.MIN5).frame) == len(five_minute_history())
    assert provider.minute_calls[0][1] == HISTORY_START


def test_a_small_intraday_correction_is_not_a_split(make_service: Factory) -> None:
    """A late-print correction of a recent bar replaces that bar; nothing is re-downloaded."""
    five = five_minute_history()
    provider = FakeProvider("p", history(), minutes={Interval.MIN5: five})
    service, clock = make_service(provider)
    service.history(AAA, Interval.MIN5)
    close = five.close.copy()
    close[-3] += 0.01  # 1e-4 of the price: above the overlap tolerance, far below a split
    provider.minutes[Interval.MIN5] = BarFrame(
        five.time, five.open, five.high, five.low, close, close.copy(), five.volume
    )
    clock.now += 61.0
    cached = service.history(AAA, Interval.MIN5)
    assert not any("adjustment changed" in w for w in cached.warnings)
    assert len(provider.minute_calls) == 2  # the tail only
    assert cached.frame.close[-3] == close[-3]
    np.testing.assert_array_equal(cached.frame.close[:-3], five.close[:-3])


def test_offline_reports_no_provider_window(tmp_path: Path) -> None:
    provider = FakeProvider("p", history(), minutes={Interval.MIN5: five_minute_history()})
    service = BarService(
        Universe([AAA]), BarCache(tmp_path / "bars.db"), [provider], provider_limits=False
    )
    assert service.get_bars("AAA", Interval.MIN15, adjusted=False).provider_window_days is None


def test_the_minutes_menu_states_the_provider_windows() -> None:
    """The frontend's "~30 days" hints match INTRADAY_MAX_DAYS (+1: the request stays inside)."""
    text = (REPO_ROOT / "frontend" / "src" / "components" / "intervals.ts").read_text("utf-8")
    menu = {m[0]: int(m[1]) for m in re.findall(r"interval: '(\w+)',.*keepsDays: (\d+)", text)}
    assert len(menu) == 6
    for interval, days in menu.items():
        assert days == INTRADAY_MAX_DAYS[Interval(interval).base] + 1, interval
