# ADR 0031 — Synthetic symbols: definitions, hourly generation, and a symbol like any other

- Status: Accepted (2026-11-27)

## Context
Phase K (`docs/ROADMAP.md`) adds symbols that are not market data: a dwelling-price symbol (K1), a parametric
one (K2) and a shuffled copy of a real one (K3). K0 is the frame they plug into, proved with the learn lab's
scenarios (`app/analysis/synthetic.py`) as the first kind. The user's answers before K0 are listed under
"Decided by the user before K0" in the roadmap: a `SYN:` prefix, a fixed first date, 1h and 4h bars too, a
currency field, editing in place with Save as copy, a delete that cleans up, a badge and a watermark.

## Decision
- **A definition** (`app/models/synthetic.py`, `ScenarioDefinition`) holds `kind` (`scenario` for now), `name`
  (the part after `SYN:`: 1 to 12 of A–Z, 0–9, `.`, `-`, `_`, starting with a letter, upper-cased), a free
  `full_name`, the scenario, the seed, the first date, the first price, the number of daily bars (100 to
  10,000) and the currency (USD or ILS, default ILS). The symbol is `SYN:` + name, so it can never shadow a real
  ticker: the Planner accepts any Yahoo ticker, not only the universe's. Its last bar may not be after today
  (checked when saved), so the series never moves with the calendar.
- **Storage.** `app.db` table `synthetic` (a `DocumentStore`, revisions for optimistic locking), behind
  `SyntheticSymbols`, which keeps every definition in memory: symbol lookups never touch SQLite. At most 100.
- **A symbol like any other.** `Universe.with_extra(...)` makes `resolve` and `search` see the synthetic
  symbols after the curated ones; `Universe.symbols` stays the curated list (the default watchlist), so a
  synthetic symbol enters a watchlist only when the user adds it. Every caller of `resolve` (bars, quotes,
  indicators, layouts, watchlists, drawings, the Planner) works unchanged. `SymbolInfo.type` gets the value
  `synthetic`; `is_synthetic` (backend) and `isSynthetic` (frontend) are the one test of it. Group and exchange
  are "Synthetic"; the hours are a US stock's (09:30–16:00 New York).
- **Generation, no cache.** `BarService.history` sends a synthetic symbol to the `SyntheticProvider` (a
  `DataProvider`, so later kinds plug in the same way), whatever the provider chain and with `OFFLINE=1` too;
  the bars are generated on every request (10,000 sessions take milliseconds) and never written to `bars.db`,
  so an edited definition is served at once. 1h is the base, 4h is resampled from it as for a stock, 1D is
  generated as the aggregate of the hours, 1W and 1M are resampled from 1D. Minute intervals are a 422
  (`interval_unavailable`); the minutes menu is off on a synthetic symbol, and a chart on a minute interval
  moves to 1h. No provider window is reported, the source is `synthetic`.
- **The hourly generator** (`app/data/synthetic.py`). Each day draws its own row of normals, so a day's draws do
  not depend on the length. The daily close and open follow the lab scenario's own daily recursion
  (`log_path`) with the first price in place of 100, so each scenario keeps its documented drift, volatility,
  mean reversion and regimes exactly; the seven hours run from the open to the close along a Brownian bridge
  scaled by the day's σ, with the lab's wicks scaled to each hour and the day's volume spread by the lab's
  U-shaped profile. The daily bar is the aggregate of its hours (first open, highest high, lowest low, last
  close, summed volume). The lab keeps its own generator unchanged: the same seed gives another path there.
- **Editing in place** (`PUT /api/synthetic/{symbol}` with the stored revision) changes the bars everywhere at
  once; the dialog first lists what points at the symbol (`GET …/references`: layouts charting or comparing it,
  watchlists, its drawings, Planner scenarios that mention it) and offers Save as copy (a new name). The name of
  a stored symbol does not change.
- **Deleting** (`DELETE …?revision=`) removes the symbol from every saved watchlist and deletes its drawings
  first, then the definition, so a failure never leaves a watchlist holding an unknown symbol. Layouts and
  Planner scenarios keep their text: a layout on a deleted symbol opens on the default symbol (the chart's
  existing fallback for a symbol it does not list), a compared one is dropped, and the Planner says the
  synthetic symbol was deleted.
- **The mark.** The `SYN:` prefix, a "SYN" badge in the watchlist, the symbol search, the legend, Compare and the
  symbol card, and "Synthetic" written on the chart (whatever the symbol watermark setting says). No market
  status, and the Market pulse tape leaves synthetic symbols out. The intraday collector loads the curated
  universe alone, so it never sees them.

## What holds (the tests)
- The daily opens and closes of every scenario equal a scalar loop written from the lab's formulas
  (`rtol=1e-9`); the daily bar equals the aggregate of its hours exactly; the hours start at 09:30 New York
  through both DST changes and their sessions are the daily dates; 4h equals the aggregate of the hours.
- Over scenario × seed × length (up to 10,000) × first price: `validate_bars` drops nothing, the bars are
  deterministic, and the first price only scales prices.
- A longer series starts with the shorter one **only** for the scenarios without a half-way switch
  (`random_walk`, `uptrend`, `range`, `accumulation`); `reversal`, `shock`, `volatility_regime` and `regimes`
  switch at ⌊n/2⌋, so another length is another series. Replay's guarantee is the other one, and it holds for
  every scenario: bars to a cursor equal the prefix of the full series (1h, 4h, 1D; 1W and 1M up to the
  forming bar).

## Consequences
- K1–K3 add kinds: a `kind` value with its own fields and a generator behind the same provider.
- `bars.db` never holds synthetic bars; deleting it remains safe.
- A synthetic symbol cannot be renamed in place; a copy under a new name and a delete do it.
