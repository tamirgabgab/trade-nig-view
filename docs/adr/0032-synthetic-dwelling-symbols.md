# ADR 0032 — Dwelling prices as a synthetic symbol, and two kinds of definition

- Status: Accepted (2026-11-27)

## Context
K1 (`docs/ROADMAP.md`, Phase K) puts the CBS dwelling price index on the chart as a symbol, on the frame of K0 (ADR
0031). The user's answers before K1: a causality field (interpolated by default, causal from an assumed publication
lag of two months), noise 0.2 % a day by default, bars Monday to Friday, a first price to choose (100), the national
index and the six districts now, 1h and 4h bars too (invented like K0's), and a learn page linked from the dialog.

## Decision
- **Two kinds, one union.** A definition is `ScenarioDefinition` (`kind: "scenario"`, K0) or `DwellingDefinition`
  (`kind: "dwelling"`): the name, the full name, the seed and the first price are shared (a base model); the API,
  the store and the client parse the union by `kind`. Stored K0 definitions read as before. A stored symbol keeps
  its kind as it keeps its name (Save as copy changes both); the API still accepts an edit of the kind.
- **A dwelling definition**: `series` (`dwelling`, or `dwelling_<district>` for Tel Aviv, Center, Haifa,
  Jerusalem, North and South, from 2017-10), `noise_pct` (0 to 5, 0.2 by default), `causal` (false by default),
  `lag_months` (0 to 12, 2 by default), `first_price`. Prices in shekels, no volume; its dates come from the index,
  so it has no first date or length and the API's `last_date` is null for it.
- **The close** (`app/data/synthetic.py`, `dwelling_closes`). The index's first value is put at the first price.
  Between anchors the log close runs linearly from one level to the next, plus a Brownian bridge of daily step
  σ that is zero on every anchor, so the close lands exactly on the index there:
  - interpolated: anchors on the month dates, from one month's value to the next (geometric, as the Planner reads
    the index); a day uses the next month's value, so the series looks ahead;
  - causal: anchors on each value's assumed publication (its month date + `lag_months`), each value held to the
    next; no bar on or after today; past the last value in the data, one assumed publication a month holds it
    until yesterday. A value changes no bar before its publication (tested).
  Each segment draws its normals from `default_rng([seed, j])`, so a new month leaves every earlier bar as it was.
- **Shared hours.** K0's hours and daily aggregation become `_sessions` and `_aggregate`, used by both kinds: seven
  1h bars a day (09:30–16:00 New York) along a bridge from the open (the last close moved by `η σ / 4`) to the
  close, wicks scaled to the hour, the daily bar their aggregate. With σ = 0 a dwelling bar is a flat line or a step.
- **The data and the memo.** The provider reads the index from `MacroService` (the Bank of Israel online, the
  committed fixtures with `OFFLINE=1`). The in-memory memo's key is the definition's JSON, the index's month dates
  and values, and, for a causal series only, today: a new month, a CBS revision or an edit is a new key at once.
- **The dialog** has a Kind selector and each kind's fields; the index is a list of seven. The learn page
  `synthetic-symbols` (both kinds' formulas, the bridge, a worked example checked against the engine, the limits)
  opens **inside** the dialog with a button back to the form, which keeps what was typed (a modal covers the learn
  drawer).

## What holds (the tests)
- Without noise, the closes equal a scalar loop of the geometric interpolation (`rtol=1e-9`) for the national index
  and two districts; with noise, every anchor (month date or publication) that is a weekday lands exactly.
- The bridge's variance at the k-th weekday of a segment of τ is σ² k (τ − k) / τ over 600 seeds (20 %).
- Causal: raising the last value changes no bar before its publication, and shows from it on. Interpolated: it moves
  the month before it (the documented lookahead), and nothing earlier.
- A new month changes no earlier bar, in both modes; bars are valid, deterministic, without volume, and the daily
  bar is the aggregate of its hours (properties over mode, seed, noise, lag and first price).
- A new index value (not a rescaling: the first value is the first price) is a new series at once.
- API: a dwelling symbol's bars at 1D, 1h and 4h, a causal one ending yesterday, a district, an edit across kinds,
  invalid definitions as 422, and a dwelling symbol in a Planner mix with a timed deposit.

## Consequences
- K2 (a parametric symbol with the user's choice of distribution) and K3 (a shuffled copy) are a third and fourth
  `kind` on the same union and the same shared hours.
- A dwelling symbol's last bars change when the CBS revises its latest months or when a new month arrives; the
  learn page says so.
