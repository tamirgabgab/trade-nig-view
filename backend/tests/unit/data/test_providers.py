from __future__ import annotations

import json
from datetime import date, timedelta
from itertools import pairwise
from pathlib import Path

import httpx2
import numpy as np
import pandas as pd
import pytest

from app.data.providers.base import ProviderError, RateLimitedError
from app.data.providers.fixtures import (
    FixtureProvider,
    fixture_filename,
    read_fixture,
    read_intraday_fixture,
    write_fixture,
    write_intraday_fixture,
)
from app.data.providers.tiingo import TiingoProvider, frame_from_prices
from app.data.providers.yahoo import (
    INTRADAY_MAX_DAYS,
    YahooProvider,
    frame_from_history,
    frame_from_intraday_history,
)
from app.data.ratelimit import TokenBucket
from app.models.bars import BarFrame, Interval, date_to_ts, ts_to_iso_dates
from app.models.symbols import SymbolInfo
from tests.conftest import FIXTURES_DIR
from tests.unit.data.factories import bars

AAPL = SymbolInfo(
    symbol="AAPL", display="AAPL", name="Apple", type="stock", group="Stocks", exchange="NASDAQ"
)
SPX = SymbolInfo(
    symbol="^GSPC", display="SPX", name="S&P 500", type="index", group="Indices", exchange="SNP"
)
NO_WAIT = TokenBucket(rate=1e9, capacity=1e9)


# ---------------------------------------------------------------- Yahoo


def yahoo_history_frame() -> pd.DataFrame:
    """Shaped like yfinance.Ticker.history(auto_adjust=False): tz-aware midnight NY index."""
    index = pd.DatetimeIndex(
        ["2026-11-19 00:00:00-05:00", "2026-11-20 00:00:00-05:00"], tz="America/New_York"
    )
    return pd.DataFrame(
        {
            "Open": [352.91, 352.865],
            "High": [355.28, 354.34],
            "Low": [346.47, 340.56],
            "Close": [349.21, 342.56],
            "Adj Close": [348.0, 342.56],
            "Volume": [40_906_860, 80_692_545],
        },
        index=index,
    )


def test_yahoo_frame_uses_exchange_session_date() -> None:
    frame = frame_from_history(yahoo_history_frame())
    assert ts_to_iso_dates(frame.time) == ["2026-11-19", "2026-11-20"]
    assert frame.close.tolist() == [349.21, 342.56]
    assert frame.adj_close.tolist() == [348.0, 342.56]
    assert frame.volume.tolist() == [40_906_860.0, 80_692_545.0]


def test_yahoo_frame_without_adj_close_or_volume_falls_back() -> None:
    history = yahoo_history_frame().drop(columns=["Adj Close", "Volume"])
    frame = frame_from_history(history)
    assert frame.adj_close.tolist() == frame.close.tolist()
    assert frame.volume.tolist() == [0.0, 0.0]


def test_yahoo_empty_history() -> None:
    assert len(frame_from_history(pd.DataFrame())) == 0


def test_yahoo_provider_requests_exclusive_end_and_converts() -> None:
    calls: list[tuple[str, date, date]] = []

    def fake_history(ticker: str, start: date, end: date) -> pd.DataFrame:
        calls.append((ticker, start, end))
        return yahoo_history_frame()

    provider = YahooProvider(history=fake_history, bucket=NO_WAIT)
    frame = provider.fetch_daily(SPX, date(2026, 11, 19), date(2026, 11, 20))
    assert calls == [("^GSPC", date(2026, 11, 19), date(2026, 11, 21))]
    assert len(frame) == 2
    assert provider.supports(SPX)


def yahoo_hourly_frame() -> pd.DataFrame:
    """Shaped like yfinance.Ticker.history(interval="1h"): tz-aware bar starts in New York."""
    index = pd.DatetimeIndex(
        ["2026-11-19 15:30:00-05:00", "2026-11-20 09:30:00-05:00", "2026-11-20 10:30:00-05:00"],
        tz="America/New_York",
    )
    return pd.DataFrame(
        {
            "Open": [350.0, 352.865, 351.0],
            "High": [350.5, 354.34, 352.0],
            "Low": [349.0, 350.1, 340.56],
            "Close": [349.21, 351.0, 341.0],
            "Adj Close": [349.21, 351.0, 341.0],
            "Volume": [5_000_000, 12_000_000, 9_000_000],
        },
        index=index,
    )


def test_yahoo_hourly_frame_uses_utc_bar_starts() -> None:
    frame = frame_from_intraday_history(yahoo_hourly_frame())
    # 09:30 New York (EST) is 14:30 UTC.
    assert frame.time[1] == date_to_ts(date(2026, 11, 20)) + 14 * 3600 + 1800
    assert frame.close.tolist() == [349.21, 351.0, 341.0]
    assert frame.adj_close.tolist() == frame.close.tolist()
    assert frame.volume.tolist() == [5e6, 12e6, 9e6]
    assert len(frame_from_intraday_history(pd.DataFrame())) == 0
    no_volume = frame_from_intraday_history(yahoo_hourly_frame().drop(columns=["Volume"]))
    assert no_volume.volume.tolist() == [0.0, 0.0, 0.0]


def test_yahoo_hourly_frame_needs_a_time_zone() -> None:
    history = yahoo_hourly_frame()
    history.index = pd.DatetimeIndex(history.index).tz_localize(None)
    with pytest.raises(ProviderError, match="time zone"):
        frame_from_intraday_history(history)


def test_yahoo_hourly_pads_the_request_and_cuts_to_utc_dates() -> None:
    calls: list[tuple[str, date, date]] = []

    def fake_hourly(ticker: str, start: date, end: date, interval: str) -> pd.DataFrame:
        calls.append((ticker, start, end))
        return yahoo_hourly_frame()

    provider = YahooProvider(
        intraday_history=fake_hourly, bucket=NO_WAIT, today=lambda: date(2026, 11, 22)
    )
    assert provider.supports_intraday(AAPL, Interval.H1)
    frame = provider.fetch_intraday(AAPL, Interval.H1, date(2026, 11, 20), date(2026, 11, 20))
    assert calls == [("AAPL", date(2026, 11, 19), date(2026, 11, 22))]
    assert len(frame) == 2  # the 2026-11-19 bar is outside the requested UTC dates


def test_yahoo_hourly_never_asks_past_the_730_day_limit() -> None:
    calls: list[tuple[str, date, date]] = []

    def fake_hourly(ticker: str, start: date, end: date, interval: str) -> pd.DataFrame:
        calls.append((ticker, start, end))
        return pd.DataFrame()

    today = date(2026, 11, 22)
    provider = YahooProvider(intraday_history=fake_hourly, bucket=NO_WAIT, today=lambda: today)
    oldest = date(2024, 11, 23)
    assert (today - oldest).days == INTRADAY_MAX_DAYS[Interval.H1]
    provider.fetch_intraday(AAPL, Interval.H1, date(2020, 1, 1), today)
    assert calls[0][1] == oldest
    # A range that ends before the limit is not requested at all.
    assert len(provider.fetch_intraday(AAPL, Interval.H1, date(2020, 1, 1), date(2021, 1, 1))) == 0
    assert len(calls) == 1


def test_yahoo_1m_requests_are_split_into_week_chunks_inside_30_days() -> None:
    calls: list[tuple[date, date, str]] = []

    def fake(ticker: str, start: date, end: date, interval: str) -> pd.DataFrame:
        calls.append((start, end, interval))
        return yahoo_hourly_frame()

    today = date(2026, 11, 22)
    provider = YahooProvider(intraday_history=fake, bucket=NO_WAIT, today=lambda: today)
    assert provider.supports_intraday(AAPL, Interval.MIN1)
    assert provider.supports_intraday(AAPL, Interval.MIN5)
    assert not provider.supports_intraday(AAPL, Interval.MIN15)  # resampled, never downloaded
    provider.fetch_intraday(AAPL, Interval.MIN1, date(2026, 1, 1), today)
    oldest = today - timedelta(days=INTRADAY_MAX_DAYS[Interval.MIN1])
    assert calls[0][0] == oldest
    assert all(interval == "1m" for _, _, interval in calls)
    assert all((end - start).days <= 7 for start, end, _ in calls)
    # The chunks tile the padded range without gaps or overlaps.
    assert all(a[1] == b[0] for a, b in pairwise(calls))
    assert calls[-1][1] == today + timedelta(days=2)

    calls.clear()
    provider.fetch_intraday(AAPL, Interval.MIN5, date(2026, 1, 1), today)
    assert calls == [(today - timedelta(days=59), today + timedelta(days=2), "5m")]


# ---------------------------------------------------------------- Tiingo


def recorded_tiingo() -> list[dict[str, object]]:
    """Real Tiingo response for AAPL 2026-11-17..20 (recorded 2026-11-22, no credentials)."""
    return json.loads((FIXTURES_DIR / "tiingo_aapl_2026-11-17.json").read_text())


def test_tiingo_recorded_response_matches_known_values() -> None:
    frame = frame_from_prices(recorded_tiingo())
    assert ts_to_iso_dates(frame.time)[-1] == "2026-11-20"
    # Cross-checked against Yahoo and the TradingView screenshot for 2026-11-20.
    assert frame.open[-1] == 352.865
    assert frame.high[-1] == 354.34
    assert frame.low[-1] == 340.56
    assert frame.close[-1] == 342.56
    assert frame.volume[-1] == 80_692_545.0


def test_tiingo_split_adjusts_raw_prices() -> None:
    rows = [
        {"date": "2020-08-27T00:00:00.000Z", "open": 500.0, "high": 510.0, "low": 490.0,
         "close": 500.0, "volume": 100, "adjClose": 124.0, "splitFactor": 1.0},
        {"date": "2020-08-28T00:00:00.000Z", "open": 504.0, "high": 508.0, "low": 496.0,
         "close": 499.2, "volume": 200, "adjClose": 123.8, "splitFactor": 1.0},
        {"date": "2020-08-31T00:00:00.000Z", "open": 127.0, "high": 131.0, "low": 126.0,
         "close": 129.0, "volume": 800, "adjClose": 128.0, "splitFactor": 4.0},
    ]  # fmt: skip
    frame = frame_from_prices(rows)
    assert frame.close.tolist() == [125.0, 124.8, 129.0]
    assert frame.open.tolist() == [125.0, 126.0, 127.0]
    assert frame.volume.tolist() == [400.0, 800.0, 800.0]
    assert frame.adj_close.tolist() == [124.0, 123.8, 128.0]


def tiingo_with(handler: httpx2.MockTransport) -> TiingoProvider:
    client = httpx2.Client(base_url="https://api.tiingo.com", transport=handler)
    return TiingoProvider("test-key", client=client, bucket=NO_WAIT)


def test_tiingo_sends_token_header_and_date_range() -> None:
    seen: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        seen.append(request)
        return httpx2.Response(200, json=recorded_tiingo())

    frame = tiingo_with(httpx2.MockTransport(handler)).fetch_daily(
        AAPL, date(2026, 11, 17), date(2026, 11, 20)
    )
    assert len(frame) == 4
    assert seen[0].headers["Authorization"] == "Token test-key"
    assert seen[0].url.path == "/tiingo/daily/aapl/prices"
    assert seen[0].url.params["startDate"] == "2026-11-17"
    assert seen[0].url.params["endDate"] == "2026-11-20"


@pytest.mark.parametrize(
    ("status", "error", "message"),
    [
        (429, RateLimitedError, "rate limit"),
        (401, ProviderError, "API key"),
        (404, ProviderError, "does not know"),
        (500, ProviderError, "HTTP 500"),
    ],
)
def test_tiingo_maps_http_errors(status: int, error: type[Exception], message: str) -> None:
    provider = tiingo_with(httpx2.MockTransport(lambda _r: httpx2.Response(status, json={})))
    with pytest.raises(error, match=message):
        provider.fetch_daily(AAPL, date(2026, 1, 1), date(2026, 1, 2))


def test_tiingo_rejects_non_list_payload() -> None:
    provider = tiingo_with(
        httpx2.MockTransport(lambda _r: httpx2.Response(200, json={"detail": "x"}))
    )
    with pytest.raises(ProviderError, match="Unexpected"):
        provider.fetch_daily(AAPL, date(2026, 1, 1), date(2026, 1, 2))


def test_tiingo_supports_only_stocks_and_etfs_and_needs_a_key() -> None:
    provider = tiingo_with(httpx2.MockTransport(lambda _r: httpx2.Response(200, json=[])))
    assert provider.supports(AAPL)
    assert not provider.supports(SPX)
    with pytest.raises(ValueError, match="API key"):
        TiingoProvider("")


# ---------------------------------------------------------------- Fixtures


@pytest.mark.parametrize(
    ("symbol", "filename"),
    [
        ("AAPL", "AAPL.csv"),
        ("^GSPC", "_GSPC.csv"),
        ("CL=F", "CL_F.csv"),
        ("DX-Y.NYB", "DX-Y.NYB.csv"),
    ],
)
def test_fixture_filenames_are_filesystem_safe(symbol: str, filename: str) -> None:
    assert fixture_filename(symbol) == filename


def test_fixture_write_read_roundtrip_is_exact(tmp_path: Path) -> None:
    frame = bars([date(2026, 1, 5), date(2026, 1, 6)], [1 / 3, 2 / 7], adj=[0.1, 0.2])
    write_fixture(tmp_path / "X.csv", frame)
    assert read_fixture(tmp_path / "X.csv").equals(frame)


def test_fixture_provider_filters_inclusive_range() -> None:
    provider = FixtureProvider(FIXTURES_DIR)
    aaa = SymbolInfo(
        symbol="AAA", display="AAA", name="A", type="stock", group="Stocks", exchange="T"
    )
    frame = provider.fetch_daily(aaa, date(2026, 1, 27), date(2026, 1, 29))
    assert ts_to_iso_dates(frame.time) == ["2026-01-27", "2026-01-28", "2026-01-29"]
    assert np.all(frame.adj_close < frame.close)  # dividend factor 0.98 before 2026-02-09


def test_fixture_provider_without_file() -> None:
    provider = FixtureProvider(FIXTURES_DIR)
    assert not provider.supports(AAPL)
    with pytest.raises(ProviderError, match="No offline fixture"):
        provider.fetch_daily(AAPL, date(2026, 1, 1), date(2026, 1, 2))


def test_fixture_with_missing_columns(tmp_path: Path) -> None:
    (tmp_path / "X.csv").write_text("date,close\n2026-01-05,1.0\n")
    with pytest.raises(ProviderError, match="missing columns"):
        read_fixture(tmp_path / "X.csv")


def test_tiingo_has_no_hourly_bars() -> None:
    provider = TiingoProvider("key", bucket=NO_WAIT)
    assert not provider.supports_intraday(AAPL, Interval.H1)
    with pytest.raises(ProviderError, match="1h"):
        provider.fetch_intraday(AAPL, Interval.H1, date(2026, 1, 1), date(2026, 1, 2))


def test_hourly_fixture_write_read_roundtrip_is_exact(tmp_path: Path) -> None:
    frame = BarFrame.from_columns(
        time=[1_770_301_800, 1_770_305_400],
        open=[1 / 3, 2.0],
        high=[1.0, 2.5],
        low=[0.25, 1.5],
        close=[0.5, 2 / 7],
        volume=[10.0, 0.0],
    )
    write_intraday_fixture(tmp_path / "X.csv", frame)
    assert (tmp_path / "X.csv").read_text().splitlines()[1].startswith("2026-02-05T14:30:00Z,")
    assert read_intraday_fixture(tmp_path / "X.csv").equals(frame)


def test_fixture_provider_serves_hourly_bars_by_utc_date() -> None:
    provider = FixtureProvider(FIXTURES_DIR)
    aaa = SymbolInfo(
        symbol="AAA", display="AAA", name="A", type="stock", group="Stocks", exchange="T"
    )
    assert provider.supports_intraday(aaa, Interval.H1)
    frame = provider.fetch_intraday(aaa, Interval.H1, date(2026, 2, 6), date(2026, 2, 9))
    assert len(frame) == 14
    assert ts_to_iso_dates(frame.time)[0] == "2026-02-06"
    assert ts_to_iso_dates(frame.time)[-1] == "2026-02-09"


def test_fixture_provider_serves_each_base_from_its_folder(tmp_path: Path) -> None:
    frame = BarFrame.from_columns(
        time=[1_767_709_800, 1_767_710_100], open=[1, 2], high=[2, 3], low=[0.5, 1], close=[1.5, 2]
    )
    write_intraday_fixture(tmp_path / "5m" / "AAPL.csv", frame)
    provider = FixtureProvider(tmp_path)
    assert provider.supports_intraday(AAPL, Interval.MIN5)
    assert not provider.supports_intraday(AAPL, Interval.MIN1)
    got = provider.fetch_intraday(AAPL, Interval.MIN5, date(2026, 1, 1), date(2026, 1, 31))
    assert got.equals(frame)


def test_fixture_provider_without_hourly_file(tmp_path: Path) -> None:
    provider = FixtureProvider(FIXTURES_DIR)
    assert not provider.supports_intraday(AAPL, Interval.H1)
    with pytest.raises(ProviderError, match="1h fixture"):
        provider.fetch_intraday(AAPL, Interval.H1, date(2026, 1, 1), date(2026, 1, 2))
    (tmp_path / "1h").mkdir()
    (tmp_path / "1h" / "X.csv").write_text("time,close\n2026-01-05T14:30:00Z,1.0\n")
    with pytest.raises(ProviderError, match="missing columns"):
        read_intraday_fixture(tmp_path / "1h" / "X.csv")
    (tmp_path / "1h" / "Y.csv").write_text("")
    assert len(read_intraday_fixture(tmp_path / "1h" / "Y.csv")) == 0
