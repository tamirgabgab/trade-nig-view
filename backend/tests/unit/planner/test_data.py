"""The planner's data loading: tickers, the exchange session, Yahoo's unknown tickers."""

from __future__ import annotations

import math
from datetime import UTC, date, datetime
from pathlib import Path

import pandas as pd
import pytest

from app.data.bar_service import BarService
from app.data.cache.bar_cache import BarCache
from app.data.providers import yahoo
from app.data.providers.base import ProviderError, RateLimitedError
from app.data.universe import Universe
from app.errors import DataUnavailableError
from app.models.bars import BarFrame, Interval
from app.models.symbols import SymbolInfo
from app.planner.data import AssetRequest, asset_info, session_fraction
from app.planner.market import PlanError

EMPTY = Universe([])


def test_a_free_ticker_takes_the_stated_currency_and_tel_aviv_is_always_shekels() -> None:
    us = asset_info(EMPTY, AssetRequest(" cost ", currency="USD"))
    assert (us.symbol, us.currency, us.timezone, us.cash_hours) == (
        "COST", "USD", "America/New_York", None,
    )  # fmt: skip
    ta = asset_info(EMPTY, AssetRequest("teva.ta", currency="USD"))
    assert (ta.symbol, ta.currency, ta.timezone) == ("TEVA.TA", "ILS", "Asia/Jerusalem")
    assert (ta.cash_hours, ta.friday_hours) == ("09:59-17:14", "10:00-14:00")
    with pytest.raises(PlanError, match="not a ticker"):
        asset_info(EMPTY, AssetRequest("A B"))


def test_session_fraction_follows_the_bar_the_purchase_lands_on() -> None:
    info = asset_info(EMPTY, AssetRequest("COST"))
    monday = date(2026, 2, 2)

    def at(day: int, hour: int) -> datetime:
        return datetime(2026, 2, day, hour, 0, tzinfo=UTC)

    assert session_fraction(info, monday, at(2, 16)) == pytest.approx(1.5 / 6.5)  # 11:00 New York
    assert session_fraction(info, monday, at(2, 12)) == 0.0  # before the open
    assert session_fraction(info, monday, at(2, 22)) == 1.0  # after the close
    # A Saturday deposit buys on Monday: at its open, whatever Saturday's clock said.
    assert session_fraction(info, monday, datetime(2026, 1, 31, 18, 0, tzinfo=UTC)) == 0.0
    # Tel Aviv on a Friday closes at 14:00 (12:00 UTC in winter).
    ta = asset_info(EMPTY, AssetRequest("TEVA.TA"))
    assert session_fraction(ta, date(2026, 2, 6), at(6, 10)) == pytest.approx(0.5)
    # No cash session (futures, forex): unknown.
    future = SymbolInfo(
        symbol="GC=F", display="GC", name="Gold", type="future", group="", exchange="",
        session_start="18:00",
    )  # fmt: skip
    assert math.isnan(session_fraction(future, monday, at(2, 16)))


class FakeTicker:
    error: Exception | None = None

    def __init__(self, ticker: str) -> None:
        self.ticker = ticker

    def history(self, **_kwargs: object) -> pd.DataFrame:
        assert FakeTicker.error is not None
        raise FakeTicker.error


def test_an_unknown_ticker_is_an_empty_answer_not_a_yahoo_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import yfinance  # noqa: PLC0415  # pyright: ignore[reportMissingTypeStubs]
    from yfinance import exceptions  # noqa: PLC0415  # pyright: ignore[reportMissingTypeStubs]

    monkeypatch.setattr(yfinance, "Ticker", FakeTicker)
    day = date(2026, 1, 5)
    FakeTicker.error = exceptions.YFTzMissingError("SPYY")
    assert yahoo._yfinance_daily("SPYY", day, day).empty  # pyright: ignore[reportPrivateUsage]
    FakeTicker.error = exceptions.YFPricesMissingError("SPY", "no bars")
    assert yahoo._yfinance_daily("SPY", day, day).empty  # pyright: ignore[reportPrivateUsage]
    FakeTicker.error = exceptions.YFRateLimitError()
    with pytest.raises(RateLimitedError):
        yahoo._yfinance_daily("SPY", day, day)  # pyright: ignore[reportPrivateUsage]
    FakeTicker.error = RuntimeError("connection reset")
    with pytest.raises(ProviderError, match="connection reset"):
        yahoo._yfinance_daily("SPY", day, day)  # pyright: ignore[reportPrivateUsage]


class EmptyThenGood:
    """A provider that knows only GOOD (an unknown ticker is an empty answer)."""

    id = "p"

    def supports(self, symbol: SymbolInfo) -> bool:
        return True

    def supports_intraday(self, symbol: SymbolInfo, base: Interval) -> bool:
        return False

    def fetch_intraday(
        self, symbol: SymbolInfo, base: Interval, start: date, end: date
    ) -> BarFrame:
        raise ProviderError("no intraday")

    def fetch_daily(self, symbol: SymbolInfo, start: date, end: date) -> BarFrame:
        if symbol.symbol != "GOOD":
            return BarFrame.empty()
        return BarFrame.from_columns(time=[86_400 * 20_000], open=[1], high=[1], low=[1], close=[1])


def test_mistyped_tickers_do_not_pause_the_provider(tmp_path: Path) -> None:
    service = BarService(EMPTY, BarCache(tmp_path / "bars.db"), [EmptyThenGood()])
    for typo in ("SPYY", "APPL", "MSFTT"):
        with pytest.raises(DataUnavailableError, match="returned no data"):
            service.daily(asset_info(EMPTY, AssetRequest(typo)))
    assert len(service.daily(asset_info(EMPTY, AssetRequest("GOOD"))).frame) == 1
