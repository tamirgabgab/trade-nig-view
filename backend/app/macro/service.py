"""Macro series: cache -> sources -> cache, with the bar data's freshness and failure rules.

* A series is served from the cache for ``ttl_s`` (6 h: the BoI publishes once a day or a month).
* After that the **whole** series is downloaded again (one request; BoI revisions are picked up)
  and replaces the cached copy.
* Each source is rate-limited by itself, retried with backoff on rate limiting, and skipped for a
  while after repeated failures (circuit breaker).
* If every source fails, the cached copy is served with ``stale=True``; with no copy the request
  fails with ``DataUnavailableError``.

The cache lives in ``bars.db`` (tables ``macro`` and ``macro_fetch``); like the bars, it is
disposable.
"""

from __future__ import annotations

import sqlite3
import threading
import time
from collections.abc import Callable, Generator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np

from app.data.providers.base import ProviderError, RateLimitedError
from app.data.ratelimit import CircuitBreaker, retry_with_backoff
from app.errors import DataUnavailableError, SeriesNotFoundError
from app.macro.series import SERIES, MacroSeries, SeriesSpec

_SCHEMA = """
CREATE TABLE IF NOT EXISTS macro (
    series TEXT NOT NULL, day INTEGER NOT NULL, value REAL NOT NULL,
    PRIMARY KEY (series, day)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS macro_fetch (
    series TEXT PRIMARY KEY, fetched_at REAL NOT NULL, source TEXT NOT NULL
);
"""


class MacroSource(Protocol):
    @property
    def id(self) -> str: ...

    def fetch(self, spec: SeriesSpec) -> MacroSeries:
        """The whole series. Raise ProviderError (RateLimitedError when throttled)."""
        ...


@dataclass(frozen=True, slots=True)
class CachedSeries:
    spec: SeriesSpec
    data: MacroSeries
    source: str
    stale: bool
    fetched_at: float
    warnings: tuple[str, ...] = ()


class MacroCache:
    """One short-lived SQLite connection per operation (WAL), like ``BarCache``."""

    def __init__(self, path: Path) -> None:
        self._path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(_SCHEMA)

    @contextmanager
    def _connect(self) -> Generator[sqlite3.Connection]:
        conn = sqlite3.connect(self._path, timeout=30.0)
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            with conn:
                yield conn
        finally:
            conn.close()

    def read(self, series: str) -> tuple[MacroSeries, float, str] | None:
        """The cached series, when it was fetched and from where; None if never fetched."""
        with self._connect() as conn:
            meta = conn.execute(
                "SELECT fetched_at, source FROM macro_fetch WHERE series = ?", (series,)
            ).fetchone()
            if meta is None:
                return None
            rows = conn.execute(
                "SELECT day, value FROM macro WHERE series = ? ORDER BY day", (series,)
            ).fetchall()
        data = np.array(rows, dtype=np.float64).reshape(-1, 2)
        return (
            MacroSeries(data[:, 0].astype(np.int64), data[:, 1].copy()),
            float(meta[0]),
            str(meta[1]),
        )

    def store(self, series: str, data: MacroSeries, *, fetched_at: float, source: str) -> None:
        """Replace the cached copy of ``series``."""
        rows = [(series, int(d), float(v)) for d, v in zip(data.days, data.values, strict=True)]
        with self._connect() as conn:
            conn.execute("DELETE FROM macro WHERE series = ?", (series,))
            conn.executemany("INSERT INTO macro VALUES (?, ?, ?)", rows)
            conn.execute(
                "INSERT OR REPLACE INTO macro_fetch VALUES (?, ?, ?)", (series, fetched_at, source)
            )


class MacroService:
    """Thread-safe access to the macro series for the API and the planner."""

    def __init__(
        self,
        cache: MacroCache,
        sources: Sequence[MacroSource],
        *,
        clock: Callable[[], float] = time.time,
        ttl_s: float = 6 * 3600.0,
        retry_sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._cache = cache
        self._sources = tuple(sources)
        self._clock = clock
        self._ttl_s = ttl_s
        self._retry_sleep = retry_sleep
        # Per source and series: one broken series (a renamed code) must not pause the others.
        self._breakers = {
            (s.id, series): CircuitBreaker() for s in self._sources for series in SERIES
        }
        self._locks = {series: threading.Lock() for series in SERIES}

    def get(self, series: str) -> CachedSeries:
        spec = SERIES.get(series)
        if spec is None:
            raise SeriesNotFoundError(f"Unknown macro series '{series}'")
        with self._locks[series]:
            return self._ensure(spec)

    def _ensure(self, spec: SeriesSpec) -> CachedSeries:
        cached = self._cache.read(spec.id)
        now = self._clock()
        # A copy from a source not in use (cached before OFFLINE changed) is never fresh.
        own = cached is not None and cached[2] in {s.id for s in self._sources}
        if cached is not None and own and now - cached[1] < self._ttl_s:
            return CachedSeries(spec, cached[0], cached[2], stale=False, fetched_at=cached[1])
        errors: list[str] = []
        for source in self._sources:
            breaker = self._breakers[source.id, spec.id]
            if not breaker.allow():
                errors.append(f"{source.id}: paused after repeated failures")
                continue
            try:
                data = retry_with_backoff(
                    lambda s=source: s.fetch(spec),
                    retry_on=(RateLimitedError,),
                    attempts=3,
                    sleep=self._retry_sleep,
                )
            except ProviderError as exc:
                breaker.record_failure()
                errors.append(f"{source.id}: {exc}")
                continue
            breaker.record_success()
            self._cache.store(spec.id, data, fetched_at=now, source=source.id)
            return CachedSeries(spec, data, source.id, stale=False, fetched_at=now)
        detail = "; ".join(errors) or "no source configured"
        if cached is None:
            raise DataUnavailableError(f"No data for macro series {spec.id}: {detail}")
        return CachedSeries(
            spec,
            cached[0],
            cached[2],
            stale=True,
            fetched_at=cached[1],
            warnings=(f"Serving cached data; refresh failed: {detail}",),
        )
