# ChartLab

A personal, local, TradingView-style charting, analysis and research platform: candles, indicators, drawing tools,
gap detection and bar replay — built so that education pages, custom indicators, backtesting and a **paper-only**
trading agent can plug in later.

> **Status:** Stage A (research & architecture) complete. Implementation starts with Round 0.
> See [HANDOFF.md](HANDOFF.md) for the live status and [docs/ROADMAP.md](docs/ROADMAP.md) for the plan.

![ChartLab screenshot](docs/img/screenshot.png)
<!-- Screenshot placeholder: added in R2. -->

## Features

| Feature | Status |
|---|---|
| Research, architecture, ADRs | ✅ Done |
| Scaffolding, CI, quality gates (R0) | ⏳ Planned |
| Market data: yfinance + Tiingo fallback, SQLite cache, offline fixtures (R1) | ⏳ Planned |
| Chart: candles/bars/hollow/line/area/Heikin Ashi, volume, legend, log/% scale, watchlist (R2) | ⏳ Planned |
| Indicators: SMA, EMA, WMA, MA Cross, BB, VWAP, RSI, MACD, Stochastic, ATR, OBV, Volume SMA — golden-tested (R3) | ⏳ Planned |
| Drawing tools: lines, rays, channel, rectangle, text, measure, Fibonacci (R4) | ⏳ Planned |
| Gaps, pivots, previous-period levels, 52-week high/low, data window (R5) | ⏳ Planned |
| Layouts, watchlists, undo/redo, shortcuts, settings (R6) | ⏳ Planned |
| Bar Replay with no-lookahead guarantee (R7) | ⏳ Planned |
| Learn pages, custom indicators, backtesting, paper agent (Phases 2–5) | 🗺️ Roadmap |

## Quick start

> The commands below become available in Round 0.

Prerequisites: [uv](https://docs.astral.sh/uv/) (installs Python 3.13 for you), Node.js 22+, Git.

### Windows (PowerShell)

```powershell
# one-time: allow local scripts
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
# install uv if needed
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"

git clone <repo-url> chartlab; cd chartlab
Copy-Item .env.example .env        # optional API keys
.\scripts\setup.ps1                # backend + frontend dependencies
.\scripts\dev.ps1                  # backend :8000 + frontend :5173
.\scripts\test.ps1                 # all tests, lint, typecheck
```

### macOS / Linux

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
git clone <repo-url> chartlab && cd chartlab
cp .env.example .env
./scripts/setup.sh
./scripts/dev.sh
./scripts/test.sh
```

Pip fallback (no uv): `cd backend; python -m venv .venv; .venv\Scripts\Activate.ps1; pip install -e ".[dev]"`.

Offline mode: set `OFFLINE=1` in `.env` to serve committed fixture data only (no network).

## Project layout

```
backend/    FastAPI app, data providers + cache, indicators, analysis, storage, tests
frontend/   React + TypeScript + Vite app, ChartEngine wrapper, drawings, UI components
docs/       ROADMAP, ARCHITECTURE, TRADINGVIEW_RESEARCH, ADRs, indicator learn pages
scripts/    setup / dev / test / lint scripts (PowerShell + bash)
```

## Documentation

- [Roadmap](docs/ROADMAP.md) · [Architecture](docs/ARCHITECTURE.md) · [TradingView research](docs/TRADINGVIEW_RESEARCH.md)
- [Architecture decision records](docs/adr/README.md)
- [CLAUDE.md](CLAUDE.md) — operating manual for AI-assisted development sessions

## Data sources and terms

ChartLab is a private, local research tool. Market data comes from:

- **Yahoo Finance via [yfinance](https://github.com/ranaroussi/yfinance)** (default, no key). Unofficial API; Yahoo's
  data is intended for personal use. Rate limits are undocumented — ChartLab throttles and caches aggressively.
- **[Tiingo](https://www.tiingo.com/)** (optional key, free tier) — fallback for stocks and ETFs.
- Optional key-based providers (later): Twelve Data (free tier is internal, non-display use only), Massive (formerly
  Polygon.io), Stooq.
- Committed CSV fixtures for tests and offline use.

Respect each provider's terms. Do not redistribute downloaded data.

## Disclaimer

ChartLab is for education and research only. **Nothing in this project is financial advice.** Indicator values,
backtests and any agent output may be wrong. The project contains no real-money trading functionality and never will
without a separately designed phase.

## Attribution

Charts are rendered with [TradingView Lightweight Charts™](https://github.com/tradingview/lightweight-charts)
(Apache License 2.0), Copyright © TradingView, Inc. The TradingView attribution logo on the chart is kept enabled.
ChartLab is not affiliated with TradingView; "TradingView" is a trademark of TradingView, Inc.
