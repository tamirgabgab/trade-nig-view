# ADR 0017 — Minute intervals and accumulated intraday history

- Status: Accepted (2026-11-26)

## Context
The user wants bars shorter than an hour (for the Day trader profile of Phase 4), with a note where the history is
short. Yahoo serves 1m bars for the last 30 days (8 days per request), 2m to 90m for the last 60 days and 1h for 730
days; it has no 10m bars. The user chose: only the intervals Yahoo offers (1m, 2m, 5m, 15m, 30m, 90m), downloaded as
two bases and resampled, history accumulated in the cache with a daily collector, and the depth noted in the
interval menu and on the chart.

## Decision
- **Base intervals:** `1m`, `5m`, `1h`, `1D` are downloaded (`BASE_INTERVALS`). `2m` is resampled from `1m`;
  `15m`, `30m`, `90m` from `5m`; `4h` from `1h`. Blocks count from the session's first bar, snapped back onto the
  grid of the usual session open (the most common first-bar time) when a session's opening bars are missing (no
  trades at 09:30), so 2m bars stay at 09:30, 09:32, ... One download per base keeps the intervals consistent with
  each other and halves the calls to Yahoo.
- **Provider contract:** `fetch_hourly` became `fetch_intraday(symbol, base, start, end)` /
  `supports_intraday(symbol, base)`. Yahoo asks for at most `INTRADAY_MAX_DAYS` (1h 729, 5m 59, 1m 29) and splits
  1m requests into 7-day chunks; a chunk without bars (a weekend, before the open) is empty, not an error. Tiingo
  serves no intraday bars; the fixture provider reads `<root>/<base>/`.
- **Accumulation:** the cache never drops a bar it stored. After a split, the bars older than the new download are
  rescaled by the median ratio of the overlapping closes (volume by its inverse) instead of being dropped
  (`rescaled_before`). An overlap whose median close ratio is within 1 % of 1 is a late-print correction, not a
  split: the fresh bars replace the cached ones and nothing is re-downloaded. `OFFLINE=1` ignores the window (a
  fixture snapshot must not age out) and reports no provider window.
- **Freshness:** minute bases refresh after 60 s (re-downloading the last 2 days); outside a replay the frontend
  refreshes only the newest page of a minute chart every minute (`withLatest`), not every loaded page.
- **Collector:** `python -m app.data.collect` refreshes 1m, 5m and 1h for every watchlist symbol;
  `scripts/collect-intraday.ps1` runs it (log in `data/collect-intraday.log`) and `scripts/install-collector.ps1`
  schedules it on weekdays at 23:30 local time (Task Scheduler, runs a missed run when the computer is back on). It
  exits with an error only when nothing could be collected: some symbols never have minute bars.
- **Depth in the UI:** `/api/bars` returns `history_start` and, for intraday, `provider_window_days`. The minutes
  menu shows "~30 days" / "~60 days" per interval; under the legend of an intraday chart a line says "5m data since
  2026-10-01 (56 days); the provider keeps ~60 days". A backend test ties the menu's numbers to
  `INTRADAY_MAX_DAYS`.
- **Range buttons:** 1D → 1m, 5D → 5m, 1M → 30m, 3M → 1h (as TradingView).

## Consequences
- + Every interval Yahoo offers down to a minute; the minute history grows by itself from the first day.
- − Minute history starts today: a year of 5m bars needs a year of collecting (or a paid data source).
- − 1m bars cost about 100,000 rows a symbol a year in `bars.db`: fine for a watchlist, not for the whole market.
- − The rescaling after a split assumes a common factor; a bad Yahoo correction would be rescaled too (the warning
  says the history was re-downloaded).
