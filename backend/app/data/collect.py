"""Collect intraday history: ``uv run python -m app.data.collect`` (``scripts/collect-intraday``).

Yahoo keeps ``1m`` bars for 30 days, ``5m`` for 60 and ``1h`` for 730; the cache keeps every bar
it ever stored. Run once a day (``scripts/install-collector.ps1`` schedules it after the US close),
this refreshes those base intervals for every symbol of every saved watchlist (the whole universe
while none is saved), so local history grows without gaps even when the app stays closed.
"""

from __future__ import annotations

import sys

from app.api.watchlists import WatchlistNotFoundError, list_watchlists
from app.config import get_settings
from app.data.bar_service import BarService
from app.data.cache.bar_cache import BarCache
from app.data.universe import Universe
from app.errors import DataUnavailableError
from app.main import build_providers
from app.models.bars import Interval, ts_to_date
from app.storage.documents import DocumentStore

COLLECTED = (Interval.MIN1, Interval.MIN5, Interval.H1)


def main() -> int:
    settings = get_settings()
    if settings.offline:
        print("OFFLINE=1 serves fixtures only: nothing to collect.")
        return 1
    universe = Universe.load(settings.universe_file)
    service = BarService(
        universe,
        BarCache(settings.chartlab_data_dir / "bars.db"),
        build_providers(settings),
        refresh_ttl_s=0.0,
        minute_ttl_s=0.0,
    )
    store = DocumentStore(
        settings.chartlab_data_dir / "app.db", "watchlists", WatchlistNotFoundError
    )
    lists = list_watchlists(universe, store).watchlists
    store.close()
    symbols = list(
        dict.fromkeys(s for w in lists for section in w.sections for s in section.symbols)
    )

    failures = 0
    for symbol in symbols:
        info = universe.resolve(symbol)
        if info is None:
            continue
        for base in COLLECTED:
            try:
                frame = service.history(info, base).frame
            except DataUnavailableError as exc:
                failures += 1
                print(f"FAIL {symbol:10} {base:3} {exc.detail}")
                continue
            since = ts_to_date(int(frame.time[0])) if len(frame) else "-"
            print(f"OK   {symbol:10} {base:3} {len(frame):7} bars since {since}")
    print(f"\n{len(symbols)} symbols, {failures} failures")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
