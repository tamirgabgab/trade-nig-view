# ChartLab Roadmap

> One round per session. A round ends with: full test/lint/typecheck green, HANDOFF.md updated, demo checklist, and
> the user's approval. Checkboxes are updated at the end of each round.

| Round | Title | Size | Status |
|---|---|---|---|
| Stage A | Research, architecture, docs | M | ✅ Done (2026-11-22) |
| R0 | Scaffolding & quality gates | M | ✅ Done (2026-11-22) |
| R1 | Market data layer | L | ✅ R1a + R1b done (2026-11-22); real fixtures pending on the user's machine |
| R2 | Chart core | L | 🔨 R2a done (2026-11-22), R2b next |
| R3 | Indicator engine v1 | L | |
| R4 | Drawing tools v1 | L | |
| R5 | Market structure & reference values | M | |
| R6 | Persistence, layouts & UX polish | L | |
| R7 | Bar Replay | M | |
| Review | Phase-1 review, Phase-2 plan | S | |

---

## R0 — Scaffolding & quality gates

**Goal**: An empty but runnable monorepo with every quality gate wired, so that every later round only adds features.

**In scope**: backend skeleton with `/api/health`; frontend shell layout (static, no chart); scripts; lint/format/type
/test for both sides; CI; `.env.example`; `.editorconfig`; `.gitattributes` (LF in repo, CRLF-safe on Windows).
**Out of scope**: any data, chart or indicator code.

Tasks
- [x] `backend/pyproject.toml` (uv, Python ≥3.12, ruff, pyright strict — replaced mypy, see ADR 0001 am. 2 — pytest, hypothesis config), `uv.lock`, `.python-version` = 3.13
- [x] `backend/app/main.py` (`create_app`), `config.py` (pydantic-settings), `api/health.py`, problem+json error handler
- [x] `backend/tests/api/test_health.py`; pytest plugin/fixture that **blocks network sockets** in all tests
- [x] `frontend/` via Vite React-TS template: TS 6.0.x strict, ESLint flat config + typescript-eslint + react-hooks, Prettier, Vitest + RTL (jsdom)
- [x] Shell components with CSS Modules + `tokens.css` dark theme: `TopToolbar`, `DrawingToolbar`, `ChartArea` (placeholder), `RightSidebar`, `BottomBar`; icon buttons with tooltips, keyboard focusable
- [x] Health badge in the bottom bar (calls `/api/health` via TanStack Query; Vite dev proxy `/api → :8000`)
- [x] `scripts/dev.ps1` + `dev.sh` (backend + frontend together, Ctrl+C stops both), `test.ps1`/`test.sh`, `lint.ps1`/`lint.sh`, `setup.ps1`/`setup.sh`
- [x] `.github/workflows/ci.yml`: backend (ruff, pyright, pytest) + frontend (eslint, prettier --check, tsc, vitest, build) on ubuntu + windows
- [x] README quick start verified on Windows (CI `windows-latest` runs `setup.ps1` + `test.ps1` under PowerShell 5.1 — green)

DoD
- `scripts/setup.ps1` then `scripts/dev.ps1` brings up both apps; `http://localhost:5173` shows the shell; health badge green.
- `scripts/test.ps1` green (≥1 backend test, ≥1 frontend component test); lint + typecheck clean; CI green.

Demo: run setup → dev → open browser → see the 5-region dark shell → hover icons for tooltips → Tab through the toolbar → stop backend, badge turns red.

Risks: PowerShell execution policy (`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`), running two processes from one PowerShell script (use `Start-Process`/jobs), CRLF issues (`.gitattributes`).

---

## R1 — Market data layer

**Goal**: Validated, cached daily (and best-effort hourly) bars for the whole universe, offline-capable.

In scope: `DataProvider` protocol; `YahooProvider` (yfinance, throttling, retry/backoff, circuit breaker, clear errors);
`TiingoProvider` (key); `FixtureProvider`; SQLite `BarCache` with coverage tracking and incremental fetch; validation;
dividend adjustment; `1W`/`1M` resampling; `1h` best effort (730-day limit enforced with a clear error);
`config/universe.yaml` + `/api/symbols`; `/api/bars` with `limit`/`end` paging; fixtures + `OFFLINE=1`.
Out of scope: UI, Twelve Data/Massive/Stooq providers (optional stretch), intraday < 1h.

Tasks
- [x] Domain models: `Interval`, `BarFrame` (numpy-backed columns), `SymbolInfo`
- [x] `backend/config/universe.toml` (stdlib `tomllib`, no YAML dependency): Indices / ETFs / Stocks / Futures / Forex with name, exchange, type, timezone, `has_volume`, `decimals`
- [x] `providers/base.py` protocol, `TokenBucket`, `retry_with_backoff` (exp. + full jitter), `CircuitBreaker`
- [x] `providers/yahoo.py` (only module importing yfinance), `providers/tiingo.py` (httpx2; split-adjusts raw OHLC), `providers/fixtures.py`
- [x] `cache/bar_cache.py` (SQLite WAL, upsert, coverage, schema version); refresh = tail re-download + full reload when a split/dividend changes adjusted history
- [x] `validate.py` (OHLC sanity, duplicates, monotonic, negative volume) — calendar-gap warnings moved to R5 (needs an exchange calendar)
- [x] `resample.py` (W: ISO week, keyed by first trading day; M: calendar month; O=first, H=max, L=min, C=last, V=sum)
- [x] `adjust.py` (adjusted OHLC = raw × adjClose/close)
- [x] `bar_service.py` orchestrating the chain + `until` truncation (applied before adjust/resample)
- [x] `scripts/make_fixtures.py` → `backend/fixtures/daily/<SYMBOL>.csv` (2015-01-01 → 2026-10-30)
- [ ] Fixtures generated on the user's machine (the cloud sandbox cannot reach Yahoo) and committed
- [x] API: `/api/symbols`, `/api/bars`, `/api/quotes` (moved forward from R2); problem+json errors
- [x] Watchlist shows live last / change / change % from `/api/quotes` (moved forward from R2)
- [x] R1b: `1h` interval (Yahoo, 730-day limit: first fetch 729 days back, the cache keeps older history) and `4h`
  resampled per trading session (`app/data/sessions.py`); intraday dividend adjustment from the session's daily bar
- [x] R1b: OpenAPI → generated TS types (`frontend/src/api/schema.ts`, ADR 0008) with freshness gates
- [x] R1b: GOLD/SILVER/USOIL shown as what they are: continuous futures `GC1!`, `SI1!`, `CL1!`
- [x] R1b: `scripts/make-fixtures.ps1` (download daily + 1h, test, commit, push) and universe-wide fixture tests
- [x] Tests: recorded Tiingo response + fake Yahoo history (no network), cache and refresh scenarios, resampling (hand vectors incl. holidays, year boundary, partial weeks + hypothesis no-lookahead), validation, adjustment, API tests in offline mode

DoD: `/api/bars` returns validated data for every universe symbol (live and `OFFLINE=1`); tests cover cache, resampling,
validation; network socket blocker proves no test touches the network; coverage ≥ 90% for `data/`.

Demo: `OFFLINE=1` → `curl /api/bars?symbol=AAPL&interval=1W` → JSON; delete `data/bars.db`, run live, request twice → second call served from cache (log shows no fetch).

Risks: Yahoo 429 during fixture generation (mitigate: throttle, retry later, commit partial set); yfinance API change
(pin version); adjusted-price semantics differ per provider (normalise in provider layer, test with recorded samples).

---

## R2 — Chart core

**Goal**: A TradingView-like chart for any universe symbol with smooth interaction.

In scope: `ChartEngine` wrapper; candles + volume (overlay with own scale, direction colored); OHLC legend synced to
crosshair; symbol search dialog (also opened by typing a letter on the chart); interval switcher (`1h`, `1D`, `1W`, `1M`);
chart types (candles, bars, hollow candles, line, area, Heikin Ashi via backend transform, baseline stretch); range
buttons (1D 5D 1M 3M 6M YTD 1Y 5Y All) + fit content; scale modes (normal/log/percent) + ADJ toggle; watchlist with
sections, last price, change % (`/api/quotes`); lazy loading of older history on scroll left; dark theme; time-zone
shift for intraday.
Out of scope: indicators, drawings, saving layouts.

R2a (basic candlestick chart) — delivered 2026-11-22
- [x] `chart/ChartEngine.ts` (create/dispose, `setBars`, volume on its own scale, crosshair → bar index once per frame), `chart/theme.ts` (reads `tokens.css`)
- [x] `LegendOHLC` synced to the crosshair (O/H/L/C, change vs previous close, volume)
- [x] Interval switcher `1D`/`1W`/`1M`; watchlist row click/Enter selects the symbol; Zustand `chartStore` remembered in localStorage
- [x] Unit tests: series mapping, volume coloring, initial visible range, crosshair index, price format, rAF throttle, `ChartEngine` against a mocked lightweight-charts
- [x] Measured: first chart in 0.6 s (3,362 daily bars, headless Chromium, local backend)

R2b (remaining)

Tasks
- [ ] `chart/ChartEngine.ts`: setChartType, setScaleMode, panes (create/dispose, setBars, crosshair done in R2a; intraday time conversion done in R1b)
- [ ] Unit tests for pure helpers (hollow-candle coloring, range-button → visible range math; time conversion done in R1b)
- [ ] `SymbolSearchDialog`, `ChartTypeMenu`, `RangeBar`, `ScaleToggles` (`LegendOHLC`, interval switcher with 1h/4h/D/W/M and `Watchlist` done)
- [ ] `analysis/transforms.py` Heikin Ashi + tests; expose via `/api/bars?transform=heikin_ashi`
- [ ] Lazy loading: `subscribeVisibleLogicalRangeChange` → fetch `end=<first bar>` page, prepend, keep viewport stable
- [ ] Playwright setup + smoke test
- [ ] Perf check: 10k bars pan/zoom; initial render < 1 s for 5k daily bars (measured, recorded in HANDOFF)

DoD: Playwright smoke test opens AAPL 1D, switches to NVDA 1W, toggles log scale, checks legend values against the
fixture data (runs with `OFFLINE=1`). Unit + lint + typecheck green.

Demo: open AAPL → hover candles (legend updates) → type "nv" → NVDA → 1W → log → 5Y → change to Heikin Ashi → scroll far left (older bars load).

Risks: legend re-render cost on crosshair move (throttle to rAF, keep legend state outside React tree hot paths if needed); lazy-load viewport jumps.

---

## R3 — Indicator engine v1

**Goal**: Correct, verified indicators rendered TradingView-style; adding one requires no frontend change.

In scope: core primitives (`sma`, `ema`, `rma`, `wma`, rolling `stdev`, `highest`, `lowest`, `true_range`); indicators
SMA, EMA, WMA, MA Cross (markers), Bollinger Bands, VWAP (intraday), RSI, MACD, Stochastic, ATR, OBV, Volume SMA;
registry + `/api/indicators` + `/api/indicators/compute` (lookback + `until`); frontend Indicators dialog (search,
categories), legend rows (values under crosshair, show/hide, settings, remove), generated settings dialog (inputs +
style), oscillator panes (resizable) with level lines, multiple instances; golden harness; learn-page stubs.
Out of scope: learn-page content (P2), user plugins (P3).

Tasks
- [ ] `indicators/core.py` primitives with docstring formulas; `registry.py`; one file per indicator
- [ ] `tests/golden/models.py` scalar-loop reference models; TA-Lib comparison tests (converged region); hand vectors; hypothesis properties incl. `check_no_lookahead`
- [ ] Scoreboard report writer (CSV in `backend/.reports/`, uploaded by CI)
- [ ] API + tests (param validation from `ParamSpec`, unknown id → 404, `until` truncation)
- [ ] Frontend: `IndicatorsDialog`, `LegendRow`, `IndicatorSettingsDialog` (generated), pane management in `ChartEngine`, markers via `createSeriesMarkers`
- [ ] `docs/indicators/<slug>.md` stub per indicator (formula, defaults, warm-up, TV differences)
- [ ] TV manual cross-check list (3 AAPL 1D dates) → `tests/golden/tv_crosscheck.json` filled with the user's numbers

DoD: all indicators pass golden + property tests at `rtol=1e-9` (deviations documented); adding a new indicator = 1
Python file + 1 registry entry + tests; Playwright: add RSI + BB, change BB length, remove RSI.

Demo: Indicators → search "rsi" → add → pane with 70/30 → hover → legend values → gear → length 21 → OK → add a second BB with 2.5σ → hide/show → remove.

Risks: EMA seeding vs TradingView on short histories (documented; cross-check decides); float drift in rolling sums; pane layout jitter when adding/removing panes.

---

## R4 — Drawing tools v1

**Goal**: Persistent, data-anchored drawings with TradingView-like interaction.

In scope: `DrawingManager` on series primitives: create (click-click / drag), hover, select, handles, drag
move/resize, `Del`, `Esc`, double-click properties dialog, `Shift` angle snap. Tools: horizontal line, horizontal ray,
vertical line, trend line, ray, extended line, parallel channel, rectangle, text label, price range, date range,
date & price range, Fib retracement, trend-based Fib extension. Magnet (weak/strong snap to O/H/L/C), stay-in-drawing
mode, lock all, hide all, remove all. Persistence per symbol (`/api/drawings/{symbol}`, versioned schema, revision).
Out of scope: undo/redo (R6), the other ~70 TradingView tools.

Tasks
- [ ] `drawings/geometry.ts` (projection, distance-to-segment/ray/line, rect hit, channel), `snap.ts`, `fib.ts` (levels math) — pure + unit tests
- [ ] `DrawingManager`, `DrawingPrimitive` base, one class per tool, tool registry for the toolbar
- [ ] Properties dialog (style + tool props, Fib level table)
- [ ] Backend `storage/drawings.py` + API + pydantic models per tool type + migration scaffold + tests
- [ ] Anchor mapping across intervals (time → logical index, interpolation/extrapolation) + tests

DoD: draw a Fib from a swing low to a swing high on AAPL 1D, reload → still there with the same levels; switch to 1W → anchors at the same time/price; geometry/hit-test unit tests; Playwright: draw, move, delete a trend line.

Risks: hit-testing performance with many drawings (spatial pre-filter by visible range); anchor mapping on non-trading days.

---

## R5 — Market structure & reference values

**Goal**: Objective structure annotations computed and tested in the backend.

In scope: gap detection (full + optional partial, min size %, fill tracking) drawn as zones (pane primitive) with
filled/unfilled styling + a gap list panel (click → scroll to gap); previous day/week/month H/L/C lines; 52-week high/low;
pivot highs/lows (N-bar fractals, confirmed `R` bars later) as markers; data window panel.
Out of scope: auto trendlines, auto Fib, volume profile.

Tasks
- [ ] `analysis/gaps.py`, `pivots.py`, `levels.py` + hand vectors + properties (no lookahead, fill monotonicity)
- [ ] API endpoints + tests
- [ ] Frontend: `GapZonesPrimitive`, `GapsPanel`, level lines (price lines), pivot markers, `DataWindow`
- [ ] Hand-checked NVDA 1D gap list for a fixture window → `tests/golden/nvda_gaps.json`

DoD: gaps on NVDA 1D match the hand-checked list; all analysis functions tested; toggles in a "Structure" menu.

Demo: NVDA 1D → enable Gaps (min 1%) → zones appear, filled ones end at fill bar → open Gaps panel → click a gap → chart scrolls.

Risks: split-day artifacts in unadjusted data (use split-adjusted always); index symbols show few meaningful gaps.

---

## R6 — Persistence, layouts & UX polish

**Goal**: Closing and reopening restores the exact workspace; the app feels finished.

In scope: named layouts (symbol, interval, chart type, scale, indicators with params/style, pane sizes, visible range);
autosave of the current layout; multiple watchlists (CRUD, add/remove symbols, sections); undo/redo (command pattern)
for drawings and indicator changes; keyboard shortcuts (table below); settings dialog (theme dark/light, time zone,
candle colors); loading/empty/error states everywhere; PNG snapshot; simple object tree.
Out of scope: multi-chart grids, cloud sync.

Proposed shortcuts (TradingView-like): typing a letter → symbol search; `Alt+H` horizontal line; `Alt+V` vertical line;
`Alt+T` trend line; `Alt+F` Fib retracement; `Alt+R` reset chart view; `Ctrl+Z`/`Ctrl+Y` undo/redo; `Del` delete
selection; `Esc` cancel/deselect; `/` indicators dialog; `Shift+→` replay step (R7); `Alt+Shift+H` hide all drawings.

DoD: Playwright: configure a workspace (symbol, interval, 2 indicators, 3 drawings, pane resize), reload → identical; undo/redo round-trip tests.

Risks: schema drift between layout versions (migration functions + tests).

---

## R7 — Bar Replay (foundation for Phase 4)

**Goal**: Step through history with zero information leakage.

In scope: Replay button → pick start bar (click or date picker) → step (`Shift+→`), play/pause, speeds (0.5/1/2/5/10
bars/s), jump to end/exit; single `replay.cursor` in the store; all bar/indicator/analysis requests carry `until`;
drawings stay visible and editable; replay HUD showing the cursor date.
Out of scope: paper trading during replay (P4/P5).

Tasks
- [ ] Backend: `until` honored everywhere (bars, indicators, analysis, quotes); `replay/` helpers
- [ ] Parametrised test over **every registered indicator and analysis function**: value at bar k in replay == value computed on `bars[:k+1]`
- [ ] Frontend replay store/controller, controls bar, efficient incremental append (`series.update`) for stepping
- [ ] Playwright: start replay on AAPL 2024-01-02, step 5 bars, legend shows bar 5 values, no bar after cursor rendered

DoD: no-lookahead test passes for every registered indicator and analysis function.

Risks: per-step recompute latency at 10 bars/s (cache + compute only the tail; measure).

---

## Phase-1 review session
Update all docs, re-verify provider limits and library versions, re-evaluate ADR 0004 (drawing library), propose the
Phase-2 plan.

---

## Later phases (epics)

### Phase 2 — Education
- Learn page per indicator (`docs/indicators/<slug>.md` → rendered in-app with KaTeX): math, what it measures, why the
  defaults, pitfalls (e.g. OBV level depends on start date, EMA seed, BB population σ).
- Interactive sliders on real data (debounced `/indicators/compute`), side-by-side parameter comparison, "frequency
  response" view for linear filters (SMA/EMA/WMA as FIR/IIR: $|H(e^{j\omega})|$, group delay/lag).
- Glossary, guided exercises using Replay.

### Phase 3 — Custom indicators (Python plugin API)
- `plugins/` folder, `IndicatorSpec` entry point, hot reload (watchfiles), sandboxing level appropriate for a local
  single-user app, same golden-test harness (`chartlab test-indicator <id>` CLI), learn-page template.

### Phase 4 — Strategies & backtesting
- Strategy API (on_bar with only past data), event-driven backtester sharing the replay clock, fills at next open by
  default, commissions/slippage models, position sizing, trade list, equity/drawdown curves, metrics (CAGR, Sharpe,
  Sortino, max DD, win rate, profit factor, exposure), walk-forward and out-of-sample splits, simple screener.

### Phase 5 — Paper trading agent
- Rule-based agent first (strategies from P4) running on replay windows and delayed data; later ML/LLM-assisted
  research assistant. Evaluated only with P4 tooling. **Paper only — no broker adapter exists.** Real trading would be a
  separate, newly designed phase that the user must explicitly start.
