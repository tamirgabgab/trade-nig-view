# ADR 0018 — Macro series from the Bank of Israel

- Status: Accepted (2026-11-26)

## Context
The home-vs-market planner (Phase H) needs series that are not OHLC bars:
- the dwelling price index;
- the consumer price index (the optional "actual CPI from 1994" mode);
- the Bank of Israel rate (prime = BoI rate + 1.5);
- mortgage rates;
- an official USD/ILS rate.

The `DataProvider` contract is about bars (open, high, low, close, volume, split and dividend adjustment), and
forcing one value a day through it would break that contract. The BoI's SDMX API is public (no key), reachable from
the cloud sessions as well, and republishes the CBS series.

## Decision
- **A separate package, `app/macro`.**
  - `SERIES` is the registry: an id, a name, a unit, a frequency, and the BoI `dataflow/code`.
  - `MacroSeries` holds the values: day numbers and values. A monthly value is dated the first of its month, and
    callers that need causality must allow for the CBS publication lag.
- **The source.** `BoiSource` downloads a whole series per request (`format=csv`, `startperiod=1950-01-01`). It is
  rate-limited (1 request a second, bursts of 2), and a 429 is retried with backoff. Every source sits behind a
  circuit breaker. `MacroFixtureSource` reads `<fixtures>/macro/<id>.csv` (`date,value`) and serves `OFFLINE=1` and
  the tests.
- **The cache.** `MacroService` keeps the series in `bars.db` (tables `macro`, `macro_fetch`).
  - A series is served from the cache for 6 hours. After that the whole series is downloaded again, so revisions
    arrive.
  - When every source fails, the cached copy is served with `stale: true`; with no copy at all the request is a 503.
- **The API.** `GET /api/macro/series` lists the series; `GET /api/macro/series/{id}?start&end` returns one series.
  An unknown id is a 404 (`series_not_found`).
- **Snapshots.** Real snapshots are committed in `backend/fixtures/macro/`, refreshed by
  `scripts/make_macro_fixtures.py`.
- **The series (2026-11-26):**

  | id | from | note |
  |---|---|---|
  | `usd_ils_boi` | daily from 1976 | sparse before; new-shekel units, so the 1970s values are tiny |
  | `cpi` | monthly from 1951 | |
  | `dwelling` | monthly from 1994 | |
  | `dwelling_<district>` | from 2017-10 | |
  | `boi_rate` | daily from 1994 | |
  | `mortgage_fixed_unlinked`, `mortgage_fixed_cpi` | monthly from 2011-07 | average rate of new housing loans |

  The variable-rate mortgage series are not mapped: their codes are ambiguous without the BoI's names.
- **USD/ILS for the planner** is Yahoo's market rate, `ILS=X`, now in the universe (the user's choice): one source
  with the stock prices, and intraday bars where they exist. The BoI rate is the documented fallback before Yahoo's
  first bar. The planner decides this in H1.
- **The universe** gains a Benchmarks group:
  - `^SP500TR` and `^XNDX`: total return, so dividends are reinvested;
  - `^TA125.TA`: Tel Aviv 125.

  Their depth on Yahoo is checked on the user's machine.

## Consequences
- + The planner's Israeli data is real and offline-testable. The tests never touch the network: a recorded BoI
  answer tests the parser.
- + Adding a series is one registry line plus a snapshot.
- − The CBS's own API did not answer from the cloud; everything relies on the BoI republishing it.
- − Monthly series need a publication-lag rule wherever causality matters (H3).
