"""Bar orchestration: cache -> providers -> validate -> adjust -> resample -> truncate.

Two **base** intervals are downloaded and cached: ``1D`` (full history) and ``1h`` (the last
:data:`~app.data.providers.yahoo.HOURLY_MAX_DAYS` days the provider allows; the cache keeps older
hours it already has, so local 1h history grows over time). ``1W``/``1M`` are resampled from
``1D`` and ``4h`` from ``1h``.

Freshness policy (docs/ARCHITECTURE.md section 8), per symbol and base interval:

* First request downloads the full available history (one provider request).
* Later requests are served from the cache for ``refresh_ttl_s``; after that the last
  ``tail_days`` days (daily) or ``hourly_tail_days`` days (hourly) are re-downloaded (late
  corrections, the still-forming bar).
* If the refreshed overlap disagrees with the cache (a new split or dividend changed the adjusted
  history), the full history is downloaded again and replaces the cache.
* If every provider fails, cached data is served with ``stale=True``; with no cache the request
  fails with ``DataUnavailableError``.

Every derived series honours ``until`` (replay cursor) **before** adjustment and resampling, so no
bar after the cursor can influence a returned value. For intraday intervals ``start``, ``end`` and
``until`` select whole trading sessions by session date (``app.data.sessions``).

Intraday bars are dividend-adjusted with the factor of their session's daily bar, so with ADJ on the
last 1h close of a session equals that session's adjusted daily close.
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
from app.data.providers.yahoo import HOURLY_MAX_DAYS
from app.data.ratelimit import CircuitBreaker, retry_with_backoff
from app.data.resample import resample, resample_intraday
from app.data.sessions import daily_factor_per_session, session_days
from app.data.universe import Universe
from app.data.validate import validate_bars
from app.errors import DataUnavailableError, SymbolNotFoundError
from app.models.bars import SECONDS_PER_DAY, BarFrame, IntArray, Interval, date_to_ts, ts_to_date
from app.models.symbols import SymbolInfo

HISTORY_START = date(1970, 1, 1)
OVERLAP_RTOL = 1e-5
QUOTE_WORKERS = 4
DIVIDEND_TYPES = frozenset({"stock", "etf"})
"""Symbol types whose adjusted close can differ from the close (pay dividends)."""


def _utc_today() -> date:
    return datetime.now(UTC).date()


@dataclass(frozen=True, slots=True)
class CachedBars:
    """Validated, split-adjusted history of one symbol and base interval as currently cached."""

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
        hourly_tail_days: int = 5,
        retry_sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._universe = universe
        self._cache = cache
        self._providers = tuple(providers)
        self._clock = clock
        self._today = today
        self._refresh_ttl_s = refresh_ttl_s
        self._tail_days = {Interval.D1: tail_days, Interval.H1: hourly_tail_days}
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

    # ------------------------------------------------------------------ cached history

    def daily(self, info: SymbolInfo) -> CachedBars:
        """Return the cached daily history, downloading or refreshing it when needed."""
        return self.history(info, Interval.D1)

    def hourly(self, info: SymbolInfo) -> CachedBars:
        """Return the cached 1h history, downloading or refreshing it when needed."""
        return self.history(info, Interval.H1)

    def history(self, info: SymbolInfo, base: Interval) -> CachedBars:
        if base not in (Interval.D1, Interval.H1):
            raise ValueError(f"{base} is not a base interval")
        with self._lock_for(f"{info.symbol}|{base}"):
            return self._ensure(info, base)

    def _lock_for(self, key: str) -> threading.Lock:
        with self._locks_guard:
            return self._locks.setdefault(key, threading.Lock())

    def _history_start(self, base: Interval, today: date) -> date:
        if base is Interval.H1:
            return today - timedelta(days=HOURLY_MAX_DAYS)
        return HISTORY_START

    def _ensure(self, info: SymbolInfo, base: Interval) -> CachedBars:
        coverage = self._cache.coverage(info.symbol, base)
        now = self._clock()
        if coverage is not None and now - coverage.fetched_at < self._refresh_ttl_s:
            return CachedBars(
                self._cache.read(info.symbol, base),
                coverage.source,
                stale=False,
                fetched_at=coverage.fetched_at,
            )

        today = self._today()
        earliest = self._history_start(base, today)
        full = coverage is None
        start = (
            earliest
            if coverage is None
            else max(
                min(ts_to_date(coverage.end_ts), today) - timedelta(days=self._tail_days[base]),
                earliest,
            )
        )
        try:
            result = self._fetch(info, base, start, today, require_data=full)
            if coverage is not None:
                cached = self._cache.read(info.symbol, base)
                if not overlap_consistent(cached, result.frame):
                    result = self._fetch(info, base, earliest, today, require_data=True)
                    result.warnings.append(
                        f"{info.symbol}: adjustment changed (split or dividend), "
                        f"full {base} history re-downloaded"
                    )
                    full, start = True, earliest
        except DataUnavailableError as exc:
            if coverage is None:
                raise
            return CachedBars(
                self._cache.read(info.symbol, base),
                coverage.source,
                stale=True,
                fetched_at=coverage.fetched_at,
                warnings=(f"Serving cached data; refresh failed: {exc.detail}",),
            )

        self._cache.store(
            info.symbol,
            base,
            result.frame,
            covered_start_ts=date_to_ts(start),
            covered_end_ts=date_to_ts(today),
            fetched_at=now,
            source=result.source,
            replace_all=full,
        )
        return CachedBars(
            self._cache.read(info.symbol, base),
            result.source,
            stale=False,
            fetched_at=now,
            warnings=tuple(result.warnings),
        )

    def _fetch(
        self, info: SymbolInfo, base: Interval, start: date, end: date, *, require_data: bool
    ) -> _FetchResult:
        """Try each provider in order; validate the first usable answer."""
        hourly = base is Interval.H1
        errors: list[str] = []
        for provider in self._providers:
            if not provider.supports(info) or (hourly and not provider.supports_hourly(info)):
                continue
            breaker = self._breakers[provider.id]
            if not breaker.allow():
                errors.append(f"{provider.id}: paused after repeated failures")
                continue
            try:
                raw = retry_with_backoff(
                    lambda p=provider: (
                        p.fetch_hourly(info, start, end)
                        if hourly
                        else p.fetch_daily(info, start, end)
                    ),
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
        detail = "; ".join(errors) or f"no provider has {base} bars for {info.symbol}"
        raise DataUnavailableError(f"No {base} data for {info.symbol}: {detail}")

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
        if interval.is_intraday:
            return self._intraday_bars(info, interval, adjusted, start, end, until, limit)
        daily = self.daily(info)
        frame = daily.frame
        if until is not None:
            frame = frame.take(frame.time <= date_to_ts(until))
        if adjusted:
            frame = dividend_adjust(frame)
        frame = resample(frame, interval)
        frame, has_more_before = _window(frame, frame.time // SECONDS_PER_DAY, start, end, limit)
        return BarsResult(
            symbol=info,
            interval=interval,
            adjusted=adjusted,
            frame=frame,
            has_more_before=has_more_before,
            source=daily.source,
            stale=daily.stale,
            warnings=daily.warnings,
        )

    def _intraday_bars(
        self,
        info: SymbolInfo,
        interval: Interval,
        adjusted: bool,
        start: date | None,
        end: date | None,
        until: date | None,
        limit: int,
    ) -> BarsResult:
        hourly = self.hourly(info)
        frame = hourly.frame
        warnings = list(hourly.warnings)
        sessions = session_days(frame.time, info.timezone, info.session_start_minutes)
        if until is not None:
            keep = sessions <= date_to_ts(until) // SECONDS_PER_DAY
            frame, sessions = frame.take(keep), sessions[keep]
        applied = False
        if adjusted:
            frame, applied = self._adjust_intraday(info, frame, sessions, warnings)
        frame_sessions = sessions
        if interval is not Interval.H1:
            frame = resample_intraday(frame, sessions, interval)
            frame_sessions = session_days(frame.time, info.timezone, info.session_start_minutes)
        frame, has_more_before = _window(frame, frame_sessions, start, end, limit)
        return BarsResult(
            symbol=info,
            interval=interval,
            adjusted=applied,
            frame=frame,
            has_more_before=has_more_before,
            source=hourly.source,
            stale=hourly.stale,
            warnings=tuple(warnings),
        )

    def _adjust_intraday(
        self, info: SymbolInfo, frame: BarFrame, sessions: IntArray, warnings: list[str]
    ) -> tuple[BarFrame, bool]:
        """Dividend-adjust 1h bars with their session's daily factor (returns whether applied)."""
        if info.type not in DIVIDEND_TYPES:
            return frame, True  # no dividends: adjusted == raw
        try:
            daily = self.daily(info).frame
        except DataUnavailableError as exc:
            warnings.append(f"Dividend adjustment skipped (no daily bars): {exc.detail}")
            return frame, False
        factor = daily_factor_per_session(sessions, daily.time, daily.adj_close / daily.close)
        with_factor = BarFrame(
            frame.time,
            frame.open,
            frame.high,
            frame.low,
            frame.close,
            frame.close * factor,
            frame.volume,
        )
        return dividend_adjust(with_factor), True

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


def _window(
    frame: BarFrame, days: IntArray, start: date | None, end: date | None, limit: int
) -> tuple[BarFrame, bool]:
    """Bars whose (session) day is in ``[start, end]``, the newest ``limit`` of them.

    Also returns whether older bars exist (before ``start`` or cut by ``limit``).
    """
    keep = np.ones(len(frame), dtype=np.bool_)
    older = False
    if start is not None:
        after_start = days >= date_to_ts(start) // SECONDS_PER_DAY
        older = not bool(after_start.all())
        keep &= after_start
    if end is not None:
        keep &= days <= date_to_ts(end) // SECONDS_PER_DAY
    frame = frame.take(keep)
    if len(frame) > limit:
        older = True
        frame = frame.take(slice(len(frame) - limit, None))
    return frame, older
