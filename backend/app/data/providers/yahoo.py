"""Yahoo Finance via ``yfinance`` (unofficial; personal use). The only module importing yfinance.

``Ticker.history(auto_adjust=False)`` returns ``Open/High/Low/Close`` that are split-adjusted and an
``Adj Close`` that is split- and dividend-adjusted, which is exactly the ChartLab convention.

Hourly bars (``interval="1h"``, regular trading hours) are split-adjusted too and limited by Yahoo
to the last 730 days; ChartLab never asks for more than :data:`HOURLY_MAX_DAYS`.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta

import numpy as np
import pandas as pd

from app.data.providers.base import ProviderError, RateLimitedError
from app.data.ratelimit import TokenBucket
from app.models.bars import SECONDS_PER_DAY, BarFrame, date_to_ts
from app.models.symbols import SymbolInfo

HistoryFn = Callable[[str, date, date], pd.DataFrame]
"""(ticker, start, end_exclusive) -> DataFrame shaped like ``yfinance.Ticker.history``."""

HOURLY_MAX_DAYS = 729
"""Oldest hourly bar requested, in days before today (Yahoo rejects anything past 730)."""


def _yfinance_daily(ticker: str, start: date, end_exclusive: date) -> pd.DataFrame:
    return _yfinance_history(ticker, start, end_exclusive, "1d")


def _yfinance_hourly(ticker: str, start: date, end_exclusive: date) -> pd.DataFrame:
    return _yfinance_history(ticker, start, end_exclusive, "1h")


def _yfinance_history(ticker: str, start: date, end_exclusive: date, interval: str) -> pd.DataFrame:
    # Imported lazily: yfinance pulls in curl_cffi and is slow to import; tests never load it.
    # yfinance ships no type information: this function is the typed boundary around it.
    import yfinance  # noqa: PLC0415  # pyright: ignore[reportMissingTypeStubs]
    from yfinance.exceptions import (  # noqa: PLC0415  # pyright: ignore[reportMissingTypeStubs]
        YFRateLimitError,
    )

    try:
        history: pd.DataFrame = yfinance.Ticker(ticker).history(  # pyright: ignore[reportUnknownMemberType]
            start=start.isoformat(),
            end=end_exclusive.isoformat(),
            interval=interval,
            auto_adjust=False,
            prepost=False,
            actions=False,
            raise_errors=True,
        )
    except YFRateLimitError as exc:
        raise RateLimitedError(f"Yahoo rate limit for {ticker}") from exc
    except Exception as exc:  # yfinance raises many ad-hoc exception types
        raise ProviderError(f"Yahoo request for {ticker} failed: {exc}") from exc
    return history


def frame_from_history(history: pd.DataFrame) -> BarFrame:
    """Convert a ``Ticker.history`` DataFrame (tz-aware daily index) to a :class:`BarFrame`."""
    if history.empty:
        return BarFrame.empty()
    index = pd.DatetimeIndex(history.index)
    # The index is midnight in the exchange time zone; the session date is its local date.
    local_dates = index.tz_localize(None) if index.tz is not None else index
    days = local_dates.normalize().to_numpy(dtype="datetime64[D]").astype(np.int64)
    close = history["Close"].to_numpy(dtype=np.float64)
    adj_close = history["Adj Close"].to_numpy(dtype=np.float64) if "Adj Close" in history else close
    volume = (
        history["Volume"].to_numpy(dtype=np.float64)
        if "Volume" in history
        else np.zeros_like(close)
    )
    return BarFrame(
        time=days * SECONDS_PER_DAY,
        open=history["Open"].to_numpy(dtype=np.float64),
        high=history["High"].to_numpy(dtype=np.float64),
        low=history["Low"].to_numpy(dtype=np.float64),
        close=close,
        adj_close=adj_close,
        volume=volume,
    )


def frame_from_hourly_history(history: pd.DataFrame) -> BarFrame:
    """Convert an hourly ``Ticker.history`` DataFrame (tz-aware bar starts) to a :class:`BarFrame`.

    ``adj_close`` is set to ``close``: dividends are applied later from the daily factors.
    """
    if history.empty:
        return BarFrame.empty()
    index = pd.DatetimeIndex(history.index)
    if index.tz is None:
        raise ProviderError("Hourly history without a time zone: cannot place bars in UTC")
    times = index.tz_convert("UTC").as_unit("s").asi8.astype(np.int64)
    close = history["Close"].to_numpy(dtype=np.float64)
    volume = (
        history["Volume"].to_numpy(dtype=np.float64)
        if "Volume" in history
        else np.zeros_like(close)
    )
    return BarFrame(
        time=times,
        open=history["Open"].to_numpy(dtype=np.float64),
        high=history["High"].to_numpy(dtype=np.float64),
        low=history["Low"].to_numpy(dtype=np.float64),
        close=close,
        adj_close=close.copy(),
        volume=volume,
    )


def _utc_today() -> date:
    return datetime.now(UTC).date()


class YahooProvider:
    """Default provider: deepest free history; covers indices, futures and forex."""

    id = "yahoo"

    def __init__(
        self,
        *,
        history: HistoryFn = _yfinance_daily,
        hourly_history: HistoryFn = _yfinance_hourly,
        bucket: TokenBucket | None = None,
        today: Callable[[], date] = _utc_today,
    ) -> None:
        self._history = history
        self._hourly_history = hourly_history
        self._today = today
        # Undocumented limits: stay conservative (2 req/s, bursts of 4).
        self._bucket = bucket or TokenBucket(rate=2.0, capacity=4)

    def supports(self, symbol: SymbolInfo) -> bool:
        return True

    def fetch_daily(self, symbol: SymbolInfo, start: date, end: date) -> BarFrame:
        self._bucket.acquire()
        history = self._history(symbol.symbol, start, end + timedelta(days=1))
        return frame_from_history(history)

    def supports_hourly(self, symbol: SymbolInfo) -> bool:
        return True

    def fetch_hourly(self, symbol: SymbolInfo, start: date, end: date) -> BarFrame:
        oldest = self._today() - timedelta(days=HOURLY_MAX_DAYS)
        if end < oldest:
            return BarFrame.empty()
        self._bucket.acquire()
        # yfinance reads the dates in the exchange time zone: ask for one extra day on each side
        # (never past the 730-day limit) and cut to the requested UTC dates.
        history = self._hourly_history(
            symbol.symbol, max(start - timedelta(days=1), oldest), end + timedelta(days=2)
        )
        frame = frame_from_hourly_history(history)
        mask = (frame.time >= date_to_ts(start)) & (frame.time < date_to_ts(end) + SECONDS_PER_DAY)
        return frame.take(mask)
