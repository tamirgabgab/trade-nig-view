"""Generate the deterministic market data the Playwright tests run on (OFFLINE=1).

Synthetic random walks, not real prices: the tests check that the UI shows exactly what the API
serves, so the numbers only need to be stable and realistic in shape. AAPL has more than 5,000
daily bars, so the first page (5,000) leaves older history for the lazy-loading test.

Run from ``backend/`` (re-run only when the data layout changes, then commit the CSVs)::

    uv run python ../frontend/e2e/data/generate.py
"""

from __future__ import annotations

import csv
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np

ROOT = Path(__file__).parent
LAST_DAY = date(2026, 11, 20)  # a Friday
NEW_YORK = ZoneInfo("America/New_York")

# symbol, file stem, daily bars, start price, yearly drift, yearly volatility, dividend date
SPECS = [
    ("AAPL", "AAPL", 6_500, 1.2, 0.20, 0.32, date(2026, 8, 11)),
    ("NVDA", "NVDA", 3_000, 4.0, 0.45, 0.50, date(2026, 9, 3)),
    ("MSFT", "MSFT", 2_000, 60.0, 0.15, 0.25, date(2026, 8, 20)),
    ("^GSPC", "_GSPC", 3_000, 1_400.0, 0.08, 0.17, None),
    ("SPY", "SPY", 1_500, 200.0, 0.08, 0.17, date(2026, 9, 19)),
]
HOURLY_SESSIONS = 40
HOURLY_STARTS = [time(9, 30), *(time(h, 30) for h in range(10, 16))]  # 7 bars a session
# AAPL's minute bases (2m and 10m ... 90m are resampled from them): sessions and bar minutes.
MINUTE_BASES = [("5m", 20, 5), ("1m", 5, 1)]


def business_days(count: int) -> list[date]:
    days: list[date] = []
    day = LAST_DAY
    while len(days) < count:
        if day.weekday() < 5:
            days.append(day)
        day -= timedelta(days=1)
    return days[::-1]


def walk(rng: np.random.Generator, n: int, start: float, drift: float, vol: float) -> np.ndarray:
    steps = rng.normal(drift / 252, vol / np.sqrt(252), n)
    return start * np.exp(np.cumsum(steps))


def ohlc(rng: np.random.Generator, close: np.ndarray, vol: float) -> list[tuple[float, ...]]:
    rows: list[tuple[float, ...]] = []
    previous = close[0]
    for c in close:
        o = previous * float(np.exp(rng.normal(0, vol / 40)))
        spread = abs(rng.normal(0, vol / 25)) * max(o, c)
        h = max(o, c) + spread * float(rng.uniform(0.1, 1))
        lo = max(min(o, c) - spread * float(rng.uniform(0.1, 1)), 0.01)
        rows.append(tuple(round(float(x), 2) for x in (o, h, lo, c)))
        previous = c
    return rows


def write_daily(stem: str, days: list[date], rows: list[tuple[float, ...]], volume: np.ndarray,
                dividend: date | None) -> None:  # fmt: skip
    path = ROOT / "daily" / f"{stem}.csv"
    path.parent.mkdir(exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        out = csv.writer(handle, lineterminator="\n")
        out.writerow(["date", "open", "high", "low", "close", "adj_close", "volume"])
        for day, (o, h, lo, c), v in zip(days, rows, volume, strict=True):
            factor = 0.99 if dividend is not None and day < dividend else 1.0
            out.writerow([day.isoformat(), o, h, lo, c, round(c * factor, 4), float(v)])


def write_hourly(stem: str, days: list[date], rng: np.random.Generator, last_close: float) -> None:
    path = ROOT / "1h" / f"{stem}.csv"
    path.parent.mkdir(exist_ok=True)
    sessions = days[-HOURLY_SESSIONS:]
    close = walk(rng, len(sessions) * len(HOURLY_STARTS), last_close, 0.0, 0.25 / np.sqrt(7))
    rows = ohlc(rng, close, 0.1)
    with path.open("w", newline="", encoding="utf-8") as handle:
        out = csv.writer(handle, lineterminator="\n")
        out.writerow(["time", "open", "high", "low", "close", "volume"])
        i = 0
        for day in sessions:
            for start in HOURLY_STARTS:
                stamp = datetime.combine(day, start, NEW_YORK).astimezone(UTC)
                o, h, lo, c = rows[i]
                out.writerow([stamp.strftime("%Y-%m-%dT%H:%M:%SZ"), o, h, lo, c,
                              float(rng.integers(50_000, 500_000))])  # fmt: skip
                i += 1


def write_minutes(stem: str, days: list[date], last_close: float) -> None:
    """Regular-hours 1m and 5m bars of the last sessions (their own generator: the daily and 1h
    files stay as they are)."""
    rng = np.random.default_rng(20261126)
    for folder, count, minutes in MINUTE_BASES:
        path = ROOT / folder / f"{stem}.csv"
        path.parent.mkdir(exist_ok=True)
        per_session = 390 // minutes
        sessions = days[-count:]
        bars = len(sessions) * per_session
        close = walk(rng, bars, last_close, 0.0, 0.25 / np.sqrt(per_session))
        rows = ohlc(rng, close, 0.05)
        with path.open("w", newline="", encoding="utf-8") as handle:
            out = csv.writer(handle, lineterminator="\n")
            out.writerow(["time", "open", "high", "low", "close", "volume"])
            for i, (o, h, lo, c) in enumerate(rows):
                day, k = sessions[i // per_session], i % per_session
                start = datetime.combine(day, time(9, 30), NEW_YORK) + timedelta(
                    minutes=minutes * k
                )
                out.writerow([start.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"), o, h, lo, c,
                              float(rng.integers(5_000, 50_000))])  # fmt: skip


def write_macro() -> None:
    """The macro series of the planner's comparison (``macro/``; ``usd_ils_boi.csv`` there is a
    recorded snapshot): a dwelling price index and a CPI that grow by a constant monthly rate
    from 1994-01 to 2026-08, and a Bank of Israel rate that moves in three steps."""
    months = [date(1994 + k // 12, k % 12 + 1, 1) for k in range(392)]
    rates = {"1994-01-27": 10.0, "2005-01-01": 4.0, "2015-01-01": 0.25, "2026-11-20": 0.25}
    series = {
        "dwelling": [(d.isoformat(), 100.0 * 1.004**k) for k, d in enumerate(months)],
        "cpi": [(d.isoformat(), 50.0 * 1.002**k) for k, d in enumerate(months)],
        "boi_rate": list(rates.items()),
    }
    for name, rows in series.items():
        with (ROOT / "macro" / f"{name}.csv").open("w", newline="", encoding="utf-8") as handle:
            out = csv.writer(handle, lineterminator="\n")
            out.writerow(["date", "value"])
            out.writerows(rows)


def main() -> None:
    write_macro()
    rng = np.random.default_rng(20261122)
    for symbol, stem, count, start, drift, vol, dividend in SPECS:
        days = business_days(count)
        close = walk(rng, count, start, drift, vol)
        volume = (
            np.zeros(count)
            if symbol.startswith("^")
            else rng.integers(1_000_000, 90_000_000, count).astype(float)
        )
        write_daily(stem, days, ohlc(rng, close, vol), volume, dividend)
        if symbol == "AAPL":
            write_hourly(stem, days, rng, float(close[-1]))
            write_minutes(stem, days, float(close[-1]))


if __name__ == "__main__":
    main()
