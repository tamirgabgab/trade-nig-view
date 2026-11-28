# ADR 0034 — A shuffled copy of a market symbol

- Status: Accepted (2026-11-28)

## Context
K3 (`docs/ROADMAP.md`, Phase K) is a synthetic symbol made of a real symbol's days in another order: a test of
sequence risk and of a rule fitted to one history. It sits on the frame of K0 to K2 (ADR 0031 to 0033). The user's
answers before K3: blocks of a length in trading days (21 by default), a permutation only, a chosen range that is
frozen, the source's dates, 1h and 4h invented but landing on the real daily bar, the source's first price, whole
bars only, dividend-adjusted prices, a small chart and sequence measures in the dialog, market symbols only as
sources, the copy opening with its source in Compare, and a new part of the `synthetic-symbols` page.

## Decision
- **A fourth kind.** `ShuffleDefinition` (`kind: "shuffle"`): the name, the full name and the seed, `source` (a
  market symbol of the universe, never `SYN:`), `start` and `end` (inclusive, from 1970-01-01, the end before today),
  `block_days` (1 to 1,000, 21 by default). It has no first price: `first_price` moves from the shared base to a
  `_Priced` mixin of the three other kinds (their stored definitions read as before). `currency`, `has_volume` and
  `decimals` are the source's, written by the API when the copy is saved (whatever the body says), with the source
  as the universe names it (a display name such as `SPX` is stored as `^GSPC`) and the range snapped to its first
  and last bars (so `last_date` is a bar's date).
- **The copy** (`app/data/synthetic_shuffle.py`): the source's dividend-adjusted daily bars in the range (100 at
  least, two blocks at least, every price above 0); each bar after the first kept as its ratios to the previous
  close (open, high, low, close) with its volume; bars 1 to n−1 cut in order into blocks of `block_days` (the last
  may be shorter) and the blocks permuted from `default_rng([seed, 5])`, drawn again while the permutation is the
  identity; the copy rebuilt from the source's first bar on the source's dates. So the first bar, the last close,
  the total return and the set of daily bars are the source's; only the order changes. A bar whose open or close
  lies outside its range by the validator's tolerance (1e-6) gets its high and low widened to them, so every hour
  stays valid.
- **Frozen, with one exception**: the range, the order and the returns never change by themselves, but the level
  follows the source's dividend adjustment (a dividend after the range multiplies every earlier adjusted price by
  one factor). It keeps the copy and its source on the same first and last price in Compare. A provider's
  correction of an old bar changes the copy too.
- **The hours** land exactly on the daily bar: a bridge from the open to the close in log price, clipped to the
  day's range; every wick inside the range; one hour (drawn) touches the high and one the low. The rebuilt daily
  bar is the source of truth and the hours' aggregate equals it on open, high, low and close (tested exactly).
- **The data**: `SyntheticProvider` gets `source_daily(symbol)` from `main` (the universe resolves the symbol again
  each time; a synthetic or unknown one is a `ProviderError`), which reads the source through `BarService.daily`
  (its cache and refresh) and passes its stale flag and warnings on to the copy. `BarService` asks the provider
  once per request (`generate`: the bars, the stale flag and the warnings from one read of the index or the
  source), in place of K1's separate `freshness` call. The memo is keyed by the
  definition's JSON and a SHA-256 digest of the source's slice (`_Slice`), so a revised bar or a new adjustment is a
  new key and the key holds no copy of the arrays.
- **The preview**: `POST /api/synthetic/shuffle/preview` with the source, the range (null: from the source's first
  bar, not before 1970, to its last before today; the same checks as saving: from 1970, ending before today), the
  block length and the seed returns the range used, its bars
  and blocks, both closes at up to 400 dates (the ends among them), and both paths' sequence measures: the total
  return, the deepest drawdown of the closes from their running peak, the worst calendar year (from the previous
  year's last close, partial years included) and the longest run of closes below the previous close.
- **The dialog**: the kind "Shuffled copy of a symbol"; the source from the universe's market symbols; picking one
  asks for its whole range and fills the dates (an answer for an earlier pick, range or error, is dropped); the
  block length; the preview (the source against the copy on a log scale, the measures side by side). No first price
  field. After creation the chart opens on the copy with its source alone in Compare (the earlier compares go, so a
  full list leaves room) and dividend adjustment on, so the two share their first and last prices.

## What holds (the tests)
- The order is a permutation of whole blocks, each in its own order, never the identity (two blocks: every seed
  swaps them), the same for a seed.
- Golden model: a scalar loop of the rebuild, `rtol=1e-12`, for block lengths 1, 5, 21 and 250.
- The copy keeps the first bar, the dates, the multiset of ratios and volumes and the last close (`rtol=1e-12`), its
  bars are valid, and a rescaled source gives a rescaled copy with the same ratios.
- The hours land on the daily bar exactly, on directed corner days (open at the high, close at the low, a flat day,
  open at the low and close at the high) and as a property over seeds, block lengths and paths.
- The range checks, the definition's checks, the sequence measures on a hand vector, the chart points, the stale
  flag through the provider, and the learn page's worked example.
- API (the e2e universe): a copy of AAPL with its dates, ends, hours and the source's currency and volume; a copy of
  an index without volume; replay cut at the cursor at 1h, 4h and 1D; 422s; the preview with the default range.
  Dialog tests and an E2E test (range filled, preview, create, Compare, 1h).

## Consequences
- K4 (the open completions) closes Phase K; Phase 4's backtester can run a rule on several copies of a symbol to see
  how much of its result is the order of one history.
- A copy depends on its source's data: without it (offline and not cached) its bars are a data error, as the
  source's would be.
