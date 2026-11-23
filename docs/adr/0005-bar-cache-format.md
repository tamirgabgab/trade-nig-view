# ADR 0005 — Bar cache stored in SQLite

- Status: Accepted (2026-11-22); re-confirmed at the Phase-1 review (2026-11-23)

## Context
We cache provider bars locally with incremental updates (fetch only missing ranges), range queries by time, and
replacement of the last few bars on refresh. Volume of data in Phase 1: ~30 symbols × ~10k daily bars + ~3.5k hourly
bars each ≈ < 1M rows.

## Decision
SQLite database `data/bars.db` (WAL mode), separate from the metadata DB `data/app.db`. Tables `bars` and `coverage`
(see ARCHITECTURE §8). Only base intervals (`1D`, `1h`) are stored; `1W`/`1M` are resampled on read. The cache is
disposable: deleting `bars.db` is always safe.

## Consequences
- + Zero extra dependency (stdlib `sqlite3`), transactional upserts, easy range queries, one file to inspect.
- + Incremental updates are a natural `INSERT ... ON CONFLICT DO UPDATE`.
- − Reading 10k rows into numpy costs a few ms more than Parquet — irrelevant at this scale.
- Phase 4 bulk research may add a Parquet export (`pyarrow`) as a separate ADR.

## Alternatives
- Parquet file per symbol/interval: great columnar reads, but upserts require rewriting files, concurrent writes need
  locking, and `pyarrow` is a ~40 MB dependency. Rejected for Phase 1.
- DuckDB: excellent, but another engine for little gain at this size. Revisit for P4 analytics.

## Amendment (Phase-1 review, 2026-11-23)
Decision holds. The schema as built is described in the corrected ARCHITECTURE §8 (`app/data/cache/bar_cache.py`):
`bars(symbol, interval, ts, ...)`, `coverage(symbol, interval, start_ts, end_ts, fetched_at, source)` and a `meta`
table for the schema version. The refresh does not fetch "missing ranges": the first request downloads the full
history, later ones re-download a recent tail (10 days daily, 5 days 1h) after `refresh_ttl_s`, and a mismatch on the
overlap triggers a full reload (ARCHITECTURE §8). `4h` is resampled from `1h` on read, like `1W`/`1M` from `1D`.
