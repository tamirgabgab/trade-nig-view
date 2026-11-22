from __future__ import annotations

import json
from datetime import date
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
    write_fixture,
)
from app.data.providers.tiingo import TiingoProvider, frame_from_prices
from app.data.providers.yahoo import YahooProvider, frame_from_history
from app.data.ratelimit import TokenBucket
from app.models.bars import ts_to_iso_dates
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
    provider = FixtureProvider(FIXTURES_DIR / "daily")
    aaa = SymbolInfo(
        symbol="AAA", display="AAA", name="A", type="stock", group="Stocks", exchange="T"
    )
    frame = provider.fetch_daily(aaa, date(2026, 1, 27), date(2026, 1, 29))
    assert ts_to_iso_dates(frame.time) == ["2026-01-27", "2026-01-28", "2026-01-29"]
    assert np.all(frame.adj_close < frame.close)  # dividend factor 0.98 before 2026-02-09


def test_fixture_provider_without_file() -> None:
    provider = FixtureProvider(FIXTURES_DIR / "daily")
    assert not provider.supports(AAPL)
    with pytest.raises(ProviderError, match="No offline fixture"):
        provider.fetch_daily(AAPL, date(2026, 1, 1), date(2026, 1, 2))


def test_fixture_with_missing_columns(tmp_path: Path) -> None:
    (tmp_path / "X.csv").write_text("date,close\n2026-01-05,1.0\n")
    with pytest.raises(ProviderError, match="missing columns"):
        read_fixture(tmp_path / "X.csv")
