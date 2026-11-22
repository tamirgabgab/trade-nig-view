"""Bar orchestration: cache -> providers -> validate -> adjust -> resample -> truncate.

Freshness policy (docs/ARCHITECTURE.md section 8):

* First request for a symbol downloads the full daily history (one provider request).
* Later requests are served from the cache for ``refresh_ttl_s``; after that the last
  ``tail_days`` days are re-downloaded (late corrections, today's still-forming bar).
* If the refreshed overlap disagrees with the cache (a new split or dividend changed the adjusted
  history), the full history is downloaded again and replaces the cache.
* If every provider fails, cached data is served with ``stale=True``; with no cache the request
  fails with ``DataUnavailableError``.

Every derived series honours ``until`` (replay cursor) **before** adjustment and resampling, so no
bar after the cursor can influence a returned value.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta

import numpy as np

from app.data.adjust import dividend_adjust
from app.data.cache.bar_cache import BarCache
from app.data.providers.base import DataProvider, ProviderError, RateLimitedError
from app.data.ratelimit import CircuitBreaker, retry_with_backoff
from app.data.resample import resample
from app.data.universe import Universe
from app.data.validate import validate_bars
from app.errors import DataUnavailableError, SymbolNotFoundError
from app.models.bars import BarFrame, Interval, date_to_ts, ts_to_date
from app.models.symbols import SymbolInfo

BASE_INTERVAL = "1D"
HISTORY_START = date(1970, 1, 1)
OVERLAP_RTOL = 1e-5
QUOTE_WORKERS = 4


def _utc_today() -> date:
    return datetime.now(UTC).date()


@dataclass(frozen=True, slots=True)
class DailyBars:
    """Validated, split-adjusted daily history of one symbol as currently cached."""

    frame: BarFrame
    source: str
    stale: bool
    fetched_at: float
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class BarsResult:
    symbol: SymbolInfo
    interval: Interval
    adjusted: bool
    frame: BarFrame
    has_more_before: bool
    source: str
    stale: bool
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class Quote:
    """Latest daily close vs the previous one (unadjusted)."""

    symbol: SymbolInfo
    time: int | None = None
    last: float | None = None
    change: float | None = None
    change_pct: float | None = None
    stale: bool = False
    error: str | None = None


@dataclass
class _FetchResult:
    frame: BarFrame
    source: str
    warnings: list[str] = field(default_factory=list[str])


def overlap_consistent(cached: BarFrame, fresh: BarFrame, *, rtol: float = OVERLAP_RTOL) -> bool:
    """True if ``fresh`` agrees with ``cached`` on their common dates.

    The newest cached bar is excluded: it may have been a still-forming bar of today's session.
    """
    if len(cached) == 0 or len(fresh) == 0:
        return True
    common, i_cached, i_fresh = np.intersect1d(
        cached.time[cached.time < cached.time[-1]], fresh.time, return_indices=True
    )
    if len(common) == 0:
        return True
    return bool(
        np.allclose(cached.close[i_cached], fresh.close[i_fresh], rtol=rtol, atol=0.0)
        and np.allclose(cached.adj_close[i_cached], fresh.adj_close[i_fresh], rtol=rtol, atol=0.0)
    )


class BarService:
    """Thread-safe facade used by the API (and later by indicators, backtests and replay)."""

    def __init__(
        self,
        universe: Universe,
        cache: BarCache,
        providers: Sequence[DataProvider],
        *,
        clock: Callable[[], float] = time.time,
        today: Callable[[], date] = _utc_today,
        refresh_ttl_s: float = 900.0,
        tail_days: int = 10,
        retry_sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._universe = universe
        self._cache = cache
        self._providers = tuple(providers)
        self._clock = clock
        self._today = today
        self._refresh_ttl_s = refresh_ttl_s
        self._tail_days = tail_days
        self._retry_sleep = retry_sleep
        self._breakers = {p.id: CircuitBreaker() for p in self._providers}
        self._locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()

    @property
    def provider_ids(self) -> tuple[str, ...]:
        return tuple(p.id for p in self._providers)

    def resolve(self, symbol: str) -> SymbolInfo:
        info = self._universe.resolve(symbol)
        if info is None:
            raise SymbolNotFoundError(f"Unknown symbol '{symbol}' (not in the universe)")
        return info

    # ------------------------------------------------------------------ daily history

    def daily(self, info: SymbolInfo) -> DailyBars:
        """Return the cached daily history, downloading or refreshing it when needed."""
        with self._lock_for(info.symbol):
            return self._ensure_daily(info)

    def _lock_for(self, symbol: str) -> threading.Lock:
        with self._locks_guard:
            return self._locks.setdefault(symbol, threading.Lock())

    def _ensure_daily(self, info: SymbolInfo) -> DailyBars:
        coverage = self._cache.coverage(info.symbol, BASE_INTERVAL)
        now = self._clock()
        if coverage is not None and now - coverage.fetched_at < self._refresh_ttl_s:
            return DailyBars(
                self._cache.read(info.symbol, BASE_INTERVAL),
                coverage.source,
                stale=False,
                fetched_at=coverage.fetched_at,
            )

        today = self._today()
        full = coverage is None
        start = (
            HISTORY_START
            if coverage is None
            else min(ts_to_date(coverage.end_ts), today) - timedelta(days=self._tail_days)
        )
        try:
            result = self._fetch(info, start, today, require_data=full)
            if coverage is not None:
                cached = self._cache.read(info.symbol, BASE_INTERVAL)
                if not overlap_consistent(cached, result.frame):
                    result = self._fetch(info, HISTORY_START, today, require_data=True)
                    result.warnings.append(
                        f"{info.symbol}: adjustment changed (split or dividend), "
                        "full history re-downloaded"
                    )
                    full, start = True, HISTORY_START
        except DataUnavailableError as exc:
            if coverage is None:
                raise
            return DailyBars(
                self._cache.read(info.symbol, BASE_INTERVAL),
                coverage.source,
                stale=True,
                fetched_at=coverage.fetched_at,
                warnings=(f"Serving cached data; refresh failed: {exc.detail}",),
            )

        self._cache.store(
            info.symbol,
            BASE_INTERVAL,
            result.frame,
            covered_start_ts=date_to_ts(start),
            covered_end_ts=date_to_ts(today),
            fetched_at=now,
            source=result.source,
            replace_all=full,
        )
        return DailyBars(
            self._cache.read(info.symbol, BASE_INTERVAL),
            result.source,
            stale=False,
            fetched_at=now,
            warnings=tuple(result.warnings),
        )

    def _fetch(
        self, info: SymbolInfo, start: date, end: date, *, require_data: bool
    ) -> _FetchResult:
        """Try each provider in order; validate the first usable answer."""
        errors: list[str] = []
        for provider in self._providers:
            if not provider.supports(info):
                continue
            breaker = self._breakers[provider.id]
            if not breaker.allow():
                errors.append(f"{provider.id}: paused after repeated failures")
                continue
            try:
                raw = retry_with_backoff(
                    lambda p=provider: p.fetch_daily(info, start, end),
                    retry_on=(RateLimitedError,),
                    attempts=3,
                    sleep=self._retry_sleep,
                )
            except ProviderError as exc:
                breaker.record_failure()
                errors.append(f"{provider.id}: {exc}")
                continue
            clean, report = validate_bars(raw, symbol=info.symbol)
            if require_data and len(clean) == 0:
                errors.append(f"{provider.id}: returned no data")
                continue
            breaker.record_success()
            return _FetchResult(clean, provider.id, list(report.warnings))
        detail = "; ".join(errors) or f"no provider supports {info.symbol}"
        raise DataUnavailableError(f"No data for {info.symbol}: {detail}")

    # ------------------------------------------------------------------ public queries

    def get_bars(
        self,
        symbol: str,
        interval: Interval,
        *,
        adjusted: bool = True,
        start: date | None = None,
        end: date | None = None,
        until: date | None = None,
        limit: int = 5000,
    ) -> BarsResult:
        """Bars for the API. ``until`` (replay cursor) is applied before anything else."""
        info = self.resolve(symbol)
        daily = self.daily(info)
        frame = daily.frame
        if until is not None:
            frame = frame.take(frame.time <= date_to_ts(until))
        if adjusted:
            frame = dividend_adjust(frame)
        frame = resample(frame, interval)
        total = len(frame)
        if start is not None:
            frame = frame.take(frame.time >= date_to_ts(start))
        if end is not None:
            frame = frame.take(frame.time <= date_to_ts(end))
        dropped_before = total - len(frame) if start is not None else 0
        if len(frame) > limit:
            dropped_before += len(frame) - limit
            frame = frame.take(slice(len(frame) - limit, None))
        return BarsResult(
            symbol=info,
            interval=interval,
            adjusted=adjusted,
            frame=frame,
            has_more_before=dropped_before > 0,
            source=daily.source,
            stale=daily.stale,
            warnings=daily.warnings,
        )

    def quote(self, symbol: str) -> Quote:
        """Last close and change vs the previous session (never raises)."""
        info = self._universe.resolve(symbol)
        if info is None:
            return Quote(
                symbol=SymbolInfo(
                    symbol=symbol, display=symbol, name=symbol, type="stock", group="", exchange=""
                ),
                error="unknown symbol",
            )
        try:
            daily = self.daily(info)
        except DataUnavailableError as exc:
            return Quote(symbol=info, error=exc.detail)
        frame = daily.frame
        if len(frame) == 0:
            return Quote(symbol=info, error="no data")
        last = float(frame.close[-1])
        if len(frame) == 1:
            return Quote(symbol=info, time=int(frame.time[-1]), last=last, stale=daily.stale)
        previous = float(frame.close[-2])
        return Quote(
            symbol=info,
            time=int(frame.time[-1]),
            last=last,
            change=last - previous,
            change_pct=(last / previous - 1.0) * 100.0,
            stale=daily.stale,
        )

    def quotes(self, symbols: Sequence[str]) -> list[Quote]:
        """Quotes for many symbols, fetched in parallel (each provider rate-limits itself)."""
        with ThreadPoolExecutor(max_workers=QUOTE_WORKERS) as pool:
            return list(pool.map(self.quote, symbols))
