# ADR 0005 — Bar cache stored in SQLite

- Status: Accepted (2026-11-22)

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
