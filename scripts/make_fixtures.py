"""Download the offline/test fixtures for every universe symbol, fixed windows.

Run from ``backend/`` on a machine that can reach Yahoo (``scripts/make-fixtures.ps1`` does this
and commits the result):

    uv run python ../scripts/make_fixtures.py            # all symbols
    uv run python ../scripts/make_fixtures.py AAPL NVDA  # selected symbols

Writes ``backend/fixtures/daily/<symbol>.csv`` (2015-01-01..2026-10-30) and
``backend/fixtures/1h/<symbol>.csv`` (2026-08-01..2026-10-30; Yahoo keeps 1h bars for 730 days
only, so this window must be refreshed before mid-2028). The windows are fixed so the files are
reproducible snapshots; prices are rounded to 6 decimals and volume to whole shares to keep the
repo small.
"""

from __future__ import annotations

import sys
import time
from datetime import date

import numpy as np

from app.config import REPO_ROOT
from app.data.providers.base import ProviderError
from app.data.providers.fixtures import fixture_filename, write_fixture, write_hourly_fixture
from app.data.providers.yahoo import YahooProvider
from app.data.universe import Universe
from app.data.validate import validate_bars
from app.models.bars import BarFrame
from app.models.symbols import SymbolInfo

START = date(2015, 1, 1)
END = date(2026, 10, 30)
HOURLY_START = date(2026, 8, 1)
HOURLY_END = date(2026, 10, 30)
OUT_DIR = REPO_ROOT / "backend" / "fixtures"
UNIVERSE = REPO_ROOT / "backend" / "config" / "universe.toml"
PAUSE_S = 1.0  # be gentle with Yahoo


def rounded(frame: BarFrame) -> BarFrame:
    return BarFrame(
        time=frame.time,
        open=np.round(frame.open, 6),
        high=np.round(frame.high, 6),
        low=np.round(frame.low, 6),
        close=np.round(frame.close, 6),
        adj_close=np.round(frame.adj_close, 6),
        volume=np.round(frame.volume),
    )


def fetch_one(provider: YahooProvider, info: SymbolInfo, interval: str) -> bool:
    """Download, validate, round and write one fixture file. False (and a message) on failure."""
    try:
        if interval == "1D":
            raw = provider.fetch_daily(info, START, END)
        else:
            raw = provider.fetch_hourly(info, HOURLY_START, HOURLY_END)
    except ProviderError as exc:
        print(f"FAIL {info.symbol:10} {interval}: {exc}")
        return False
    clean, report = validate_bars(raw, symbol=info.symbol)
    # Round, then validate again: rounding can break high >= close by 1e-6.
    clean, _ = validate_bars(rounded(clean), symbol=info.symbol)
    if len(clean) == 0:
        print(f"FAIL {info.symbol:10} {interval}: no bars in the window")
        return False
    folder = "daily" if interval == "1D" else "1h"
    path = OUT_DIR / folder / fixture_filename(info.symbol)
    if interval == "1D":
        write_fixture(path, clean)
    else:
        write_hourly_fixture(path, clean)
    notes = "; ".join(report.warnings) or "ok"
    print(f"OK   {info.symbol:10} {interval:2} {len(clean):5} bars -> {folder}/{path.name} {notes}")
    return True


def main(selected: list[str]) -> int:
    universe = Universe.load(UNIVERSE)
    provider = YahooProvider()
    names = selected or [info.symbol for info in universe.symbols]
    failures: list[str] = []
    for name in names:
        info = universe.resolve(name)
        if info is None:
            failures.append(name)
            print(f"FAIL {name}: not in the universe")
            continue
        for interval in ("1D", "1h"):
            if not fetch_one(provider, info, interval):
                failures.append(f"{info.symbol} {interval}")
            time.sleep(PAUSE_S)
    total = 2 * len(names)
    print(f"\n{total - len(failures)}/{total} fixture files written to {OUT_DIR}")
    if failures:
        print("Failed: " + ", ".join(failures))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
