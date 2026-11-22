"""Download the offline/test fixtures: daily bars for every universe symbol, fixed window.

Run from ``backend/`` on a machine that can reach Yahoo:

    uv run python ../scripts/make_fixtures.py            # all symbols
    uv run python ../scripts/make_fixtures.py AAPL NVDA  # selected symbols

Writes ``backend/fixtures/daily/<symbol>.csv``. The window is fixed so the files are reproducible
snapshots; prices are rounded to 6 decimals and volume to whole shares to keep the repo small.
"""

from __future__ import annotations

import sys
import time
from datetime import date

import numpy as np

from app.config import REPO_ROOT
from app.data.providers.base import ProviderError
from app.data.providers.fixtures import fixture_filename, write_fixture
from app.data.providers.yahoo import YahooProvider
from app.data.universe import Universe
from app.data.validate import validate_bars
from app.models.bars import BarFrame

START = date(2015, 1, 1)
END = date(2026, 10, 30)
OUT_DIR = REPO_ROOT / "backend" / "fixtures" / "daily"
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
        try:
            raw = provider.fetch_daily(info, START, END)
        except ProviderError as exc:
            failures.append(name)
            print(f"FAIL {info.symbol}: {exc}")
            continue
        clean, report = validate_bars(raw, symbol=info.symbol)
        # Round, then validate again: rounding can break high >= close by 1e-6.
        clean, _ = validate_bars(rounded(clean), symbol=info.symbol)
        path = OUT_DIR / fixture_filename(info.symbol)
        write_fixture(path, clean)
        notes = "; ".join(report.warnings) or "ok"
        print(f"OK   {info.symbol:10} {len(clean):5} bars -> {path.name} ({notes})")
        time.sleep(PAUSE_S)
    print(f"\n{len(names) - len(failures)}/{len(names)} symbols written to {OUT_DIR}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
