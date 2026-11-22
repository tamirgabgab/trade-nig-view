"""SQLite bar cache (ADR 0005).

Tables::

    bars(symbol, interval, ts, open, high, low, close, adj_close, volume, source)
        primary key (symbol, interval, ts)
    coverage(symbol, interval, start_ts, end_ts, fetched_at, source)
        primary key (symbol, interval)

``coverage`` records the inclusive date range that has been requested from a provider, even if
the provider returned no bars for part of it (weekends, before an IPO), so we never re-request it.
The cache is disposable: deleting the file is always safe.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from app.models.bars import BarFrame

SCHEMA_VERSION = 1

_SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bars (
    symbol TEXT NOT NULL, interval TEXT NOT NULL, ts INTEGER NOT NULL,
    open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL,
    adj_close REAL NOT NULL, volume REAL NOT NULL, source TEXT NOT NULL,
    PRIMARY KEY (symbol, interval, ts)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS coverage (
    symbol TEXT NOT NULL, interval TEXT NOT NULL,
    start_ts INTEGER NOT NULL, end_ts INTEGER NOT NULL,
    fetched_at REAL NOT NULL, source TEXT NOT NULL,
    PRIMARY KEY (symbol, interval)
);
"""


@dataclass(frozen=True, slots=True)
class Coverage:
    start_ts: int
    end_ts: int
    fetched_at: float
    source: str


class BarCache:
    """Thread-safe by construction: one short-lived connection per operation (WAL mode)."""

    def __init__(self, path: Path) -> None:
        self._path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(_SCHEMA)
            conn.execute(
                "INSERT OR REPLACE INTO meta(key, value) VALUES ('schema_version', ?)",
                (str(SCHEMA_VERSION),),
            )

    @contextmanager
    def _connect(self) -> Generator[sqlite3.Connection]:
        conn = sqlite3.connect(self._path, timeout=30.0)
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA synchronous=NORMAL")
            with conn:  # commits on success, rolls back on error
                yield conn
        finally:
            conn.close()

    def coverage(self, symbol: str, interval: str) -> Coverage | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT start_ts, end_ts, fetched_at, source FROM coverage"
                " WHERE symbol = ? AND interval = ?",
                (symbol, interval),
            ).fetchone()
        if row is None:
            return None
        return Coverage(int(row[0]), int(row[1]), float(row[2]), str(row[3]))

    def read(self, symbol: str, interval: str) -> BarFrame:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT ts, open, high, low, close, adj_close, volume FROM bars"
                " WHERE symbol = ? AND interval = ? ORDER BY ts",
                (symbol, interval),
            ).fetchall()
        if not rows:
            return BarFrame.empty()
        data = np.array(rows, dtype=np.float64)
        return BarFrame(
            time=data[:, 0].astype(np.int64),
            open=data[:, 1].copy(),
            high=data[:, 2].copy(),
            low=data[:, 3].copy(),
            close=data[:, 4].copy(),
            adj_close=data[:, 5].copy(),
            volume=data[:, 6].copy(),
        )

    def store(
        self,
        symbol: str,
        interval: str,
        frame: BarFrame,
        *,
        covered_start_ts: int,
        covered_end_ts: int,
        fetched_at: float,
        source: str,
        replace_all: bool = False,
    ) -> None:
        """Upsert ``frame`` and extend coverage to include ``[covered_start_ts, covered_end_ts]``.

        ``replace_all`` drops every cached bar of the symbol first (used after a split or
        dividend changed the adjustment of history).
        """
        rows = [
            (
                symbol,
                interval,
                int(frame.time[i]),
                float(frame.open[i]),
                float(frame.high[i]),
                float(frame.low[i]),
                float(frame.close[i]),
                float(frame.adj_close[i]),
                float(frame.volume[i]),
                source,
            )
            for i in range(len(frame))
        ]
        with self._connect() as conn:
            if replace_all:
                conn.execute(
                    "DELETE FROM bars WHERE symbol = ? AND interval = ?", (symbol, interval)
                )
                conn.execute(
                    "DELETE FROM coverage WHERE symbol = ? AND interval = ?", (symbol, interval)
                )
            conn.executemany(
                "INSERT OR REPLACE INTO bars VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", rows
            )
            existing = conn.execute(
                "SELECT start_ts, end_ts FROM coverage WHERE symbol = ? AND interval = ?",
                (symbol, interval),
            ).fetchone()
            start = covered_start_ts if existing is None else min(existing[0], covered_start_ts)
            end = covered_end_ts if existing is None else max(existing[1], covered_end_ts)
            conn.execute(
                "INSERT OR REPLACE INTO coverage VALUES (?, ?, ?, ?, ?, ?)",
                (symbol, interval, start, end, fetched_at, source),
            )
