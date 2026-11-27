"""Bar orchestration: cache -> providers -> validate -> adjust -> resample -> truncate.

Four **base** intervals are downloaded and cached: ``1D`` (full history) and ``1h``, ``5m``,
``1m`` (the last :data:`~app.data.providers.yahoo.INTRADAY_MAX_DAYS` days the provider allows; the
cache keeps older bars it already has, so local intraday history grows over time). ``1W``/``1M``
are resampled from ``1D``, ``4h`` from ``1h``, ``10m``/``15m``/``30m``/``90m`` from ``5m`` and
``2m`` from ``1m``.

Freshness policy (docs/ARCHITECTURE.md section 8), per symbol and base interval:

* First request downloads the full available history (one provider request).
* Later requests are served from the cache for ``refresh_ttl_s`` (``minute_ttl_s`` for ``1m`` and
  ``5m``); after that the last ``tail_days`` days (daily), ``hourly_tail_days`` (1h) or
  ``minute_tail_days`` (1m, 5m) are re-downloaded (late corrections, the still-forming bar).
* If the refreshed overlap disagrees with the cache (a new split or dividend changed the adjusted
  history), the full history is downloaded again and replaces the cache. Intraday bars older than
  the provider's window are kept, rescaled to the new adjustment (:func:`rescaled_before`).
* If every provider fails, cached data is served with ``stale=True``; with no cache the request
  fails with ``DataUnavailableError``.

Every derived series honours ``until`` (replay cursor) **before** adjustment and resampling, so no
bar after the cursor can influence a returned value. For intraday intervals ``start``, ``end`` and
``until`` select whole trading sessions by session date (``app.data.sessions``).

Intraday bars are dividend-adjusted with the factor of their session's daily bar, so with ADJ on the
last 1h close of a session equals that session's adjusted daily close. Intraday frames carry their
session day numbers (``BarFrame.session``) for session-anchored indicators such as VWAP.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field, replace
from datetime import UTC, date, datetime, timedelta
from typing import Protocol

import numpy as np

from app.analysis.transforms import Transform, apply_transform
from app.data.adjust import dividend_adjust
from app.data.cache.bar_cache import BarCache
from app.data.providers.base import DataProvider, ProviderError, RateLimitedError
from app.data.providers.yahoo import INTRADAY_MAX_DAYS
from app.data.ratelimit import CircuitBreaker, retry_with_backoff
from app.data.resample import resample, resample_intraday
from app.data.sessions import daily_factor_per_session, session_days, session_offsets
from app.data.universe import Universe
from app.data.validate import validate_bars
from app.errors import DataUnavailableError, IntervalUnavailableError, SymbolNotFoundError
from app.models.bars import (
    BASE_INTERVALS,
    SECONDS_PER_DAY,
    BarFrame,
    IntArray,
    Interval,
    date_to_ts,
    ts_to_date,
)
from app.models.symbols import SymbolInfo
from app.models.synthetic import is_synthetic

HISTORY_START = date(1970, 1, 1)
OVERLAP_RTOL = 1e-5
#: Intraday closes that moved less than this on the overlap are late-print corrections (the fresh
#: bars simply replace them), not a split (a full re-download and rescale).
SPLIT_MIN_CHANGE = 0.01
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
    #: Start (UTC epoch seconds) of the oldest bar of this interval that exists, before paging.
    history_start: int | None = None
    #: Days of this interval the provider keeps (intraday only): older bars exist only if the
    #: cache collected them.
    provider_window_days: int | None = None


#: Daily closes in a watchlist sparkline.
SPARK_BARS = 20
YEAR_SECONDS = 365 * 86_400


@dataclass(frozen=True, slots=True)
class Quote:
    """Latest daily close vs the previous one (unadjusted), with the ranges the watchlist shows."""

    symbol: SymbolInfo
    time: int | None = None
    last: float | None = None
    change: float | None = None
    change_pct: float | None = None
    stale: bool = False
    error: str | None = None
    #: The last ``SPARK_BARS`` daily closes, oldest first (sparkline).
    spark: tuple[float, ...] = ()
    day_low: float | None = None
    day_high: float | None = None
    #: Lowest low and highest high of the daily bars in the 365 days up to the last bar.
    low_52w: float | None = None
    high_52w: float | None = None


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


def overlap_ratio(cached: BarFrame, fresh: BarFrame) -> float | None:
    """:math:`\\operatorname{median}(C^{fresh}_t / C^{cached}_t)` over the common bars (the newest
    cached bar excluded, as in :func:`overlap_consistent`); None without common bars."""
    if len(cached) == 0 or len(fresh) == 0:
        return None
    _, i_cached, i_fresh = np.intersect1d(cached.time[:-1], fresh.time, return_indices=True)
    if len(i_cached) == 0:
        return None
    return float(np.median(fresh.close[i_fresh] / cached.close[i_cached]))


def rescaled_before(cached: BarFrame, fresh: BarFrame) -> BarFrame:
    """The cached bars older than ``fresh``, brought to ``fresh``'s adjustment (a split since).

    With :math:`r` = :func:`overlap_ratio`, prices are multiplied by :math:`r` and volume divided
    by it, so price times volume is unchanged. Without common bars the two cannot be linked and
    nothing is kept.
    """
    r = overlap_ratio(cached, fresh)
    old = cached.take(cached.time < fresh.time[0]) if len(fresh) else BarFrame.empty()
    if r is None or len(old) == 0:
        return BarFrame.empty()
    return BarFrame(
        old.time,
        old.open * r,
        old.high * r,
        old.low * r,
        old.close * r,
        old.adj_close * r,
        old.volume / r,
    )


class SyntheticSource(DataProvider, Protocol):
    """The synthetic symbols' provider: bars, and whether the data behind them is stale."""

    def freshness(self, symbol: SymbolInfo) -> tuple[bool, tuple[str, ...]]: ...


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
        minute_ttl_s: float = 60.0,
        tail_days: int = 10,
        hourly_tail_days: int = 5,
        minute_tail_days: int = 2,
        provider_limits: bool = True,
        retry_sleep: Callable[[float], None] = time.sleep,
        synthetic: SyntheticSource | None = None,
    ) -> None:
        self._universe = universe
        self._cache = cache
        self._providers = tuple(providers)
        # Serves the synthetic symbols, uncached, whatever the provider chain (OFFLINE=1 too).
        self._synthetic = synthetic
        self._clock = clock
        self._today = today
        self._ttl_s = {Interval.MIN1: minute_ttl_s, Interval.MIN5: minute_ttl_s}
        # Off for OFFLINE=1: a fixture snapshot has no "last N days" (they would age out).
        self._provider_limits = provider_limits
        self._refresh_ttl_s = refresh_ttl_s
        self._tail_days = {
            Interval.D1: tail_days,
            Interval.H1: hourly_tail_days,
            Interval.MIN5: minute_tail_days,
            Interval.MIN1: minute_tail_days,
        }
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

    def history(self, info: SymbolInfo, base: Interval) -> CachedBars:
        if base not in BASE_INTERVALS:
            raise ValueError(f"{base} is not a base interval")
        if is_synthetic(info):
            return self._synthetic_history(info, base)
        with self._lock_for(f"{info.symbol}|{base}"):
            return self._ensure(info, base)

    def _synthetic_history(self, info: SymbolInfo, base: Interval) -> CachedBars:
        """Generated on every call: no cache, no refresh, nothing stale."""
        provider = self._synthetic
        if provider is None or (base.is_intraday and not provider.supports_intraday(info, base)):
            raise IntervalUnavailableError(
                f"{info.symbol} is synthetic: it has 1h, 4h, 1D, 1W and 1M bars, no minute bars"
            )
        today = self._today()
        try:
            frame = (
                provider.fetch_intraday(info, base, HISTORY_START, today)
                if base.is_intraday
                else provider.fetch_daily(info, HISTORY_START, today)
            )
            stale, warnings = provider.freshness(info)
        except ProviderError as exc:
            raise DataUnavailableError(str(exc)) from exc
        return CachedBars(
            frame, provider.id, stale=stale, fetched_at=self._clock(), warnings=warnings
        )

    def _lock_for(self, key: str) -> threading.Lock:
        with self._locks_guard:
            return self._locks.setdefault(key, threading.Lock())

    def _history_start(self, base: Interval, today: date) -> date:
        if base.is_intraday and self._provider_limits:
            return today - timedelta(days=INTRADAY_MAX_DAYS[base])
        return HISTORY_START

    def _ensure(self, info: SymbolInfo, base: Interval) -> CachedBars:
        coverage = self._cache.coverage(info.symbol, base)
        now = self._clock()
        ttl = self._ttl_s.get(base, self._refresh_ttl_s)
        if coverage is not None and now - coverage.fetched_at < ttl:
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
                ratio = overlap_ratio(cached, result.frame)
                corrected = (
                    base.is_intraday and ratio is not None and abs(ratio - 1.0) < SPLIT_MIN_CHANGE
                )
                if not corrected and not overlap_consistent(cached, result.frame):
                    result = self._fetch(info, base, earliest, today, require_data=True)
                    kept = rescaled_before(cached, result.frame) if base.is_intraday else None
                    if kept is not None and len(kept):
                        result.frame = BarFrame.concat([kept, result.frame])
                        start = ts_to_date(coverage.start_ts)
                    else:
                        start = earliest
                    result.warnings.append(
                        f"{info.symbol}: adjustment changed (split or dividend), "
                        f"full {base} history re-downloaded"
                    )
                    full = True
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
        errors: list[str] = []
        for provider in self._providers:
            if not provider.supports(info) or (
                base.is_intraday and not provider.supports_intraday(info, base)
            ):
                continue
            breaker = self._breakers[provider.id]
            if not breaker.allow():
                errors.append(f"{provider.id}: paused after repeated failures")
                continue
            try:
                raw = retry_with_backoff(
                    lambda p=provider: (
                        p.fetch_intraday(info, base, start, end)
                        if base.is_intraday
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
        before: int | None = None,
        transform: Transform = Transform.NONE,
    ) -> BarsResult:
        """Bars for the API. ``until`` (replay cursor) is applied before anything else.

        ``before`` (UTC epoch seconds, exclusive) pages backwards: pass the time of the oldest bar
        already loaded. ``transform`` (e.g. Heikin Ashi) runs on the whole history before the
        window is cut, so every page agrees with a full-history computation.
        """
        info = self.resolve(symbol)
        if interval.is_intraday:
            return self._intraday_bars(
                info, interval, adjusted, start, end, until, limit, before, transform
            )
        daily = self.daily(info)
        frame = daily.frame
        if until is not None:
            frame = frame.take(frame.time <= date_to_ts(until))
        if adjusted:
            frame = dividend_adjust(frame)
        frame = apply_transform(resample(frame, interval), transform)
        history_start = int(frame.time[0]) if len(frame) else None
        frame, has_more_before = _window(
            frame, frame.time // SECONDS_PER_DAY, start, end, limit, before
        )
        return BarsResult(
            symbol=info,
            interval=interval,
            adjusted=adjusted,
            frame=frame,
            has_more_before=has_more_before,
            source=daily.source,
            stale=daily.stale,
            warnings=daily.warnings,
            history_start=history_start,
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
        before: int | None,
        transform: Transform,
    ) -> BarsResult:
        base = self.history(info, interval.base)
        frame = base.frame
        warnings = list(base.warnings)
        sessions = session_days(frame.time, info.timezone, info.session_start_minutes)
        if until is not None:
            keep = sessions <= date_to_ts(until) // SECONDS_PER_DAY
            frame, sessions = frame.take(keep), sessions[keep]
        applied = False
        if adjusted:
            frame, applied = self._adjust_intraday(info, frame, sessions, warnings)
        frame_sessions = sessions
        if interval is not interval.base:
            offsets = session_offsets(frame.time, info.timezone, info.session_start_minutes)
            frame = resample_intraday(frame, sessions, interval, offsets)
            frame_sessions = session_days(frame.time, info.timezone, info.session_start_minutes)
        frame = apply_transform(frame, transform).with_session(frame_sessions)
        history_start = int(frame.time[0]) if len(frame) else None
        frame, has_more_before = _window(frame, frame_sessions, start, end, limit, before)
        return BarsResult(
            symbol=info,
            interval=interval,
            adjusted=applied,
            frame=frame,
            has_more_before=has_more_before,
            source=base.source,
            stale=base.stale,
            warnings=tuple(warnings),
            history_start=history_start,
            provider_window_days=INTRADAY_MAX_DAYS[interval.base] + 1
            if self._provider_limits and not is_synthetic(info)
            else None,
        )

    def _adjust_intraday(
        self, info: SymbolInfo, frame: BarFrame, sessions: IntArray, warnings: list[str]
    ) -> tuple[BarFrame, bool]:
        """Dividend-adjust intraday bars with their session's daily factor (returns whether
        applied)."""
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
        # Bars are sorted by time: the 52-week window is a suffix (a view, no mask or copy).
        year = int(np.searchsorted(frame.time, int(frame.time[-1]) - YEAR_SECONDS))
        ranges = Quote(
            symbol=info,
            time=int(frame.time[-1]),
            last=last,
            stale=daily.stale,
            spark=tuple(float(c) for c in frame.close[-SPARK_BARS:]),
            day_low=float(frame.low[-1]),
            day_high=float(frame.high[-1]),
            low_52w=float(frame.low[year:].min()),
            high_52w=float(frame.high[year:].max()),
        )
        if len(frame) == 1:
            return ranges
        previous = float(frame.close[-2])
        return replace(ranges, change=last - previous, change_pct=(last / previous - 1.0) * 100.0)

    def quotes(self, symbols: Sequence[str]) -> list[Quote]:
        """Quotes for many symbols, fetched in parallel (each provider rate-limits itself)."""
        with ThreadPoolExecutor(max_workers=QUOTE_WORKERS) as pool:
            return list(pool.map(self.quote, symbols))


def _window(
    frame: BarFrame,
    days: IntArray,
    start: date | None,
    end: date | None,
    limit: int,
    before: int | None = None,
) -> tuple[BarFrame, bool]:
    """Bars whose (session) day is in ``[start, end]`` and that start before ``before`` (UTC
    epoch seconds, exclusive), the newest ``limit`` of them.

    Also returns whether older bars exist (before ``start`` or cut by ``limit``).
    """
    keep = np.ones(len(frame), dtype=np.bool_)
    if before is not None:
        keep &= frame.time < before
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
