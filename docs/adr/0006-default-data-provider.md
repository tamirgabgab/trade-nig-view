# ADR 0006 — Default data provider: yfinance; Tiingo fallback; fixtures offline

- Status: Accepted (2026-11-22)

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
