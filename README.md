# ChartLab

A personal, local, TradingView-style charting, analysis and research platform: candles, indicators, drawing tools,
gap detection and bar replay — built so that education pages, custom indicators, backtesting and a **paper-only**
trading agent can plug in later.

> **Status:** R3a complete — indicator engine (Python registry, verified like a DUT against scalar golden models and
> TA-Lib), SMA/EMA/WMA/SMMA on the chart with a `/` indicators dialog, legend rows and a live settings panel.
> Next: R3b (the generalised moving-average family).
> See [HANDOFF.md](HANDOFF.md) for the live status, [PLAN.md](PLAN.md) for the next sessions and
> [docs/ROADMAP.md](docs/ROADMAP.md) for the full round specs.

![ChartLab shell (R0)](docs/img/shell-r0.png)
<!-- Replaced with a chart screenshot (real data) after the R2a demo. -->

## Features

| Feature | Status |
|---|---|
| Research, architecture, ADRs | ✅ Done |
| Scaffolding, CI, quality gates, dark app shell (R0) | ✅ Done |
| Market data: yfinance + Tiingo fallback, SQLite cache, validated daily/weekly/monthly bars, live watchlist prices (R1a) | ✅ Done |
| 1h and 4h intervals (session-aware, Israel time on the chart), generated API types, fixture download script (R1b) | ✅ Done |
| Chart: candles + volume, OHLC legend on the crosshair, D/W/M intervals, symbol from the watchlist, pan/zoom (R2a) | ✅ Done |
| Chart types (bars/hollow/line/area/Heikin Ashi), log/% scale, range buttons, symbol search, lazy history (R2b) | ✅ Done |
| Indicator engine + SMA, EMA, WMA, SMMA: `/` dialog, legend values under the crosshair, live settings, saved between visits (R3a) | ✅ Done |
| Generalised MAs (DEMA, TEMA, HMA, ALMA, LSMA, VWMA, SWMA, McGinley, KAMA, T3, ZLEMA), MA Cross/Ribbon/Envelope (R3b) | ⏳ Planned |
| Learn pages for the MA family: formulas, lag, noise reduction, frequency response (L1) | ⏳ Planned |
| Indicators: BB, VWAP, RSI, MACD, Stochastic, ATR, OBV, Volume SMA — golden-tested (R3c) | ⏳ Planned |
| UX pass: narrow windows, disabled states, loaders, keyboard map (U1) | ⏳ Planned |
| Drawing tools: lines, rays, channel, rectangle, text, measure, Fibonacci (R4) | ⏳ Planned |
| Gaps, pivots, previous-period levels, 52-week high/low, data window (R5) | ⏳ Planned |
| Layouts, watchlists, undo/redo, shortcuts, settings (R6) | ⏳ Planned |
| Bar Replay with no-lookahead guarantee (R7) | ⏳ Planned |
| Learn pages, custom indicators, backtesting, paper agent (Phases 2–5) | 🗺️ Roadmap |

## Quick start

Prerequisites: [uv](https://docs.astral.sh/uv/) (installs Python 3.13 for you), Node.js 22+, Git.

### Windows (PowerShell)

```powershell
# one-time: allow local scripts
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
# install uv if needed
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"

# reload PATH so this window sees uv (or open a new, non-admin PowerShell window)
$env:Path = "$env:USERPROFILE\.local\bin;$env:Path"

# clone into your user folder - never inside C:\Windows\System32 (no write access there)
cd $HOME
git clone https://github.com/tamirgabgab/trade-nig-view.git chartlab; cd chartlab
Copy-Item .env.example .env        # optional API keys
.\scripts\setup.ps1                # backend + frontend dependencies
.\scripts\dev.ps1                  # backend :8000 + frontend :5173
.\scripts\test.ps1                 # all tests, lint, typecheck
.\scripts\install-shortcut.ps1     # optional: "ChartLab" icon on the Desktop and in Start
```

After `install-shortcut.ps1`, double-click **ChartLab** on the Desktop: it downloads the latest version
(`git pull --ff-only`, libraries reinstalled only if they changed), starts the backend and the frontend and
opens the app in your browser. Offline or if the pull fails, it starts the version already on disk. Close the
black ChartLab window to stop it. To update without starting: `.\scripts\update.ps1`.

Maintenance scripts:

```powershell
.\scripts\make-fixtures.ps1        # download daily + 1h fixtures from Yahoo, test, commit and push them
.\scripts\gen-api.ps1              # after a backend API model change: regenerate openapi.json + schema.ts
```

> **Windows with Smart App Control on:** use the official, signed Python from python.org instead of uv's
> downloaded Python (SAC blocks its unsigned `.pyd` files):
> `winget install -e --id Python.Python.3.13`, then
> `[Environment]::SetEnvironmentVariable('UV_PYTHON_PREFERENCE','only-system','User')`, open a new PowerShell,
> delete `backend\.venv` and run `.\scripts\setup.ps1` again.

### macOS / Linux

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
git clone <repo-url> chartlab && cd chartlab
cp .env.example .env
./scripts/setup.sh
./scripts/dev.sh
./scripts/test.sh
```

Pip fallback (no uv): `cd backend; python -m venv .venv; .venv\Scripts\Activate.ps1; pip install -e . httpx2 pyright pytest pytest-cov hypothesis ruff`.

Then open http://localhost:5173 (app) and http://127.0.0.1:8000/api/docs (API docs).

Offline mode: set `OFFLINE=1` in `.env` to serve committed fixture data only (no network).

End-to-end tests (Playwright + Chromium; they start their own backend on synthetic data, ports 8010/5183):

```bash
cd frontend
npx playwright install chromium   # once
npm run e2e -- --trace off
```

On the chart: type any letter to search symbols; press `/` to add an indicator (gear icon on its legend row = live
settings); range buttons (1D … All) pick a fitting interval; scrolling to the left edge loads older history.

Indicator verification: `cd backend; uv run python -m pytest tests/golden` writes a scoreboard to
`backend/.reports/indicator_scoreboard.csv`. To cross-check against TradingView, type three values per indicator into
`backend/tests/golden/tv_crosscheck.json` (instructions inside) and run the tests.

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
