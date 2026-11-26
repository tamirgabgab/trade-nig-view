# ADR 0006 — Default data provider: yfinance; Tiingo fallback; fixtures offline

- Status: Accepted (2026-11-22), amended at the Phase-1 review (2026-11-23)

## Context
Free data sources (verified 2026-11-22, see TRADINGVIEW_RESEARCH §3): yfinance has the deepest free history and covers
indices, futures and forex, but is unofficial and rate-limited without documented limits. Stooq now needs a
captcha-issued key. Tiingo free: 50 req/h, 1,000/day, adjusted EOD for stocks/ETFs (no indices). Twelve Data free:
8/min, 800/day, internal non-display use only. Massive: 5/min, 2 years.

## Decision
- `DataProvider` protocol: `id`, `supports(symbol, interval) -> bool`, `fetch(symbol, interval, start, end) -> RawBars`,
  `rate_limit: RateLimitSpec`.
- Default chain `DATA_PROVIDERS=yahoo,tiingo,twelvedata`; key-based providers auto-disable without a key.
- R1 implements `YahooProvider`, `TiingoProvider` (fallback for stocks/ETFs) and `FixtureProvider`. Twelve Data/Massive/Stooq are optional later.
- Committed CSV fixtures (~10–20 symbols, daily, fixed window, both raw and adjusted close + dividends/splits) generated
  once by `scripts/make_fixtures.py`; tests use only fixtures; `OFFLINE=1` serves only fixtures.
- Aggressive caching and conservative throttling (1 req/s to Yahoo) — see ARCHITECTURE §8.

## Consequences
- Indices (`^GSPC`, `^VIX`) have a single live source (Yahoo); if Yahoo blocks us, they fall back to cached/fixture data.
- yfinance breakage is a known operational risk: pin the version, wrap it in our provider (never call yfinance elsewhere),
  and keep the fixture path working.
- Terms: Yahoo data for personal use only; Twelve Data Basic is non-display — ChartLab is a private, local tool. README states this.

## Alternatives
- Twelve Data as default: official API but 800 credits/day is tight for 30 symbols × refresh + indicators. Rejected as default.
- Paid feeds (Massive Starter, EODHD, Tiingo Power): better reliability; can be added later as providers without architectural change.

## Amendment (Phase-1 review, 2026-11-23)
The Decision above is kept as written; the code differs as follows:
- Protocol as built (`app/data/providers/base.py`): `id`, `supports(symbol) -> bool`,
  `fetch_daily(symbol, start, end) -> BarFrame`, `supports_hourly(symbol) -> bool`, `fetch_hourly(symbol, start, end)
  -> BarFrame` (`symbol` is a `SymbolInfo`). There is no `rate_limit` spec: each provider owns its `TokenBucket`.
  (2026-11-26, ADR 0017: the hourly pair became `supports_intraday(symbol, base)` and
  `fetch_intraday(symbol, base, start, end)` for the `1m`, `5m` and `1h` bases.)
- Default chain `DATA_PROVIDERS=yahoo,tiingo`; Twelve Data is not implemented.
- Yahoo throttling: `TokenBucket(rate=2.0, capacity=4)` (2 req/s, burst 4), not 1 req/s. Tiingo: 50/h, burst 10.
- Fixtures: `scripts/make_fixtures.py` (run by `scripts/make-fixtures.ps1`) downloads the whole universe (25 symbols),
  daily (2015-01-01 → 2026-10-30, columns `date,open,high,low,close,adj_close,volume`) and 1h (2026-08-01 → 2026-10-30,
  columns `time,open,high,low,close,volume`). No separate raw-close or dividend/split columns. These real fixtures are
  not committed yet (they need the user's machine); tests run on small synthetic fixtures in `backend/tests/fixtures/`.
