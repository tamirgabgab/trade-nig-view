# ChartLab Roadmap

> One round per session. A round ends with: full test/lint/typecheck green, HANDOFF.md updated, demo checklist, and
> the user's approval. Checkboxes are updated at the end of each round.
>
> **Session order, model/effort per session and the moving-average maths: [PLAN.md](../PLAN.md)** (2026-11-22). R3 is
> split into R3a (engine + SMA/EMA/WMA/RMA), R3b (generalised MA family), R3c (bands & oscillators); L1 (learn pages
> for the MA family, pulled forward from Phase 2) and U1 (UX pass) are inserted before R4.

| Round | Title | Size | Status |
|---|---|---|---|
| Stage A | Research, architecture, docs | M | ✅ Done (2026-11-22) |
| R0 | Scaffolding & quality gates | M | ✅ Done (2026-11-22) |
| R1 | Market data layer | L | ✅ R1a + R1b done (2026-11-22); real fixtures pending on the user's machine |
| R2 | Chart core | L | ✅ R2a + R2b done (2026-11-22) |
| R3 | Indicator engine v1 (R3a, R3b, R3c — see PLAN.md) | L | ✅ R3a, R3b, R3c (2026-11-23) |
| L1 | Learn v1 for the MA family (from Phase 2) | M | ✅ (2026-11-23) |
| U1 | UX pass (U1a polish + motion + half screen; U1b watchlist, palette, theme; U1c structural cleanup) | L | ✅ U1a + U1b + U1c (2026-11-23) |
| R4 | Drawing tools v1 (R4a core + lines/shapes/text; R4b Fib, channel, ranges) | L | ✅ R4a + R4b (2026-11-23) |
| R5 | Market structure & reference values | M | ✅ (2026-11-23) |
| R6 | Persistence, layouts & UX polish | L | ✅ (2026-11-23) |
| R7 | Bar Replay | M | ✅ (2026-11-23) |
| Review | Phase-1 review, Phase-2 plan | S | ✅ (2026-11-23) |
| P2 | Education: a learn page for every indicator, labs, glossary, exercises | L | ✅ P2a–P2d (2026-11-24) |
| P3 | Built-in indicators and tools designed with the user (Return, Statistics, Forecast, Volatility, Trade plan, VaR/ES, Regime) | L | ✅ (2026-11-24 – 2026-11-25) |
| U2 | Appearance: theme presets, accent, text size, chart backgrounds, heatmap (ADR 0015) | M | ✅ (2026-11-25) |
| U3 | Chart tools: compare, patterns, icons, eraser, zoom box, Go to date, forecast pointer, animated backgrounds (ADR 0016) | L | ✅ (2026-11-26) |
| Review 2 | Docs refresh after Phases 2–3, versions and limits, the Phase-4 plan | S | ✅ (2026-11-26) |
| D0 | Minute intervals 1m–90m, accumulated intraday history, daily collector (ADR 0017) | M | ✅ (2026-11-26) |
| PH | Home vs Market: apartment (mortgage tracks, rent, dwelling index) vs the stock market, A/B and A+B, history and statistics, rounds H0–H5 ([HOME_VS_MARKET_PLAN.md](HOME_VS_MARKET_PLAN.md)); before P4 | XL | H0–H5 ✅ (2026-11-26) |
| PJ | Withdrawals: a starting capital (an account, an apartment or both), a fixed or a percent withdrawal rule, what is left over time, the unknown-basis tax bounds, history and simulated worlds, rounds J0–J4 ([WITHDRAWAL_PLAN.md](WITHDRAWAL_PLAN.md)) | L | ✅ J0–J4 (2026-11-27): Phase J closed |
| PK | Synthetic symbols (a dwelling-price symbol, a parametric one, a shuffled copy of a real one) and the open completions of Phases H and J, rounds K0–K4 (below); after PJ, before P4 | L | K0 ✅, K1 ✅, K2 ✅ (2026-11-27), K3 ✅, K4 ✅ (2026-11-28, approved; ADR 0031 to 0035): Phase K closed; open for the user: the run on real data, regulation 5 |
| PA | Market data from Alpaca (data only): years of minute bars, bars to the second from trades, quotes and spreads, live prices; rounds A0–A4 ([ALPACA_PLAN.md](ALPACA_PLAN.md)); recommended before P4 | XL | planned (2026-11-28); A0 is a gate: the probe decides the feed, the user approves the §10 amendment |
| P4 | Strategies and backtesting by trader profile (Day, Swing, Position, Long-term), rounds B0–B7 ([PHASE4_PLAN.md](PHASE4_PLAN.md)) | XL | planned |

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
`config/universe.toml` + `/api/symbols`; `/api/bars` with `limit`/`before` paging; fixtures + `OFFLINE=1`.
Out of scope: UI, Twelve Data/Massive/Stooq providers (optional stretch), intraday < 1h.

Tasks
- [x] Domain models: `Interval`, `BarFrame` (numpy-backed columns), `SymbolInfo`
- [x] `backend/config/universe.toml` (stdlib `tomllib`, no YAML dependency): Indices / ETFs / Stocks / Futures / Forex with name, exchange, type, timezone, `has_volume`, `decimals`
- [x] `providers/base.py` protocol, `TokenBucket`, `retry_with_backoff` (exp. + full jitter), `CircuitBreaker`
- [x] `providers/yahoo.py` (only module importing yfinance), `providers/tiingo.py` (httpx2; split-adjusts raw OHLC), `providers/fixtures.py`
- [x] `cache/bar_cache.py` (SQLite WAL, upsert, coverage, schema version); refresh = tail re-download + full reload when a split/dividend changes adjusted history
- [x] `validate.py` (OHLC sanity, duplicates, monotonic, negative volume) — calendar-gap warnings were planned for R5 but not implemented there; moved to the Phase 2 backlog (needs an exchange calendar)
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
crosshair; symbol search dialog (also opened by typing a letter on the chart); interval switcher (`1h`, `4h`, `1D`, `1W`, `1M`);
chart types (candles, bars, hollow candles, line, area, Heikin Ashi via backend transform; the baseline stretch was dropped, not built); range
buttons (1D 5D 1M 3M 6M YTD 1Y 5Y All) + fit content; scale modes (normal/log/percent) + ADJ toggle; watchlist with
sections, last price, change % (`/api/quotes`); lazy loading of older history on scroll left; dark theme (light theme
added in U1b); time-zone
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
- [x] `chart/ChartEngine.ts`: setChartType, setScale (normal/log/%, auto-fit), setVisibleRange, visible-range events, viewport kept when older bars are prepended (panes move to R3c with the first oscillator)
- [x] Unit tests for pure helpers (hollow-candle coloring, range-button → visible range math in `chart/visibleRange.ts`, `prependedCount`)
- [x] `SymbolSearchDialog` (type on the chart, arrows, Enter, Esc, grouped), `ChartTypeMenu`, range buttons and scale toggles wired in `BottomBar`
- [x] `analysis/transforms.py` Heikin Ashi + tests; exposed via `/api/bars?transform=heikin_ashi` (computed on full history before paging)
- [x] Lazy loading: `subscribeVisibleLogicalRangeChange` → fetch `before=<first bar>` page, prepend, keep viewport stable
- [x] Playwright setup + smoke test (`frontend/e2e`, synthetic fixtures in `frontend/e2e/data`, CI job `e2e`)
- [x] Perf check (headless Chromium, dev build): 5,000 daily bars painted 0.36–0.85 s after the response; 60 zoom steps over 5,000 bars in ~2 s incl. test-driver round trips (recorded in HANDOFF)

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
- [x] `indicators/core.py` primitives with docstring formulas; `registry.py`; one file per indicator (R3a: sma/ema/wma/rma + registry ✅; R3b: 11 more MAs, generic MA, MA Cross/Ribbon/Envelope ✅; R3c: stdev/highest/lowest/true_range, BB, RSI, MACD, Stoch, ATR, OBV, VWAP, Vol SMA ✅)
- [x] `tests/golden/models.py` scalar-loop reference models; TA-Lib comparison tests (converged region); hand vectors; hypothesis properties incl. `check_no_lookahead` (R3a)
- [x] Scoreboard report writer (CSV in `backend/.reports/`, uploaded by CI) (R3a)
- [x] API + tests (param validation from `ParamSpec`, unknown id → 404, `until` truncation) (R3a)
- [x] Frontend: `IndicatorsDialog`, `IndicatorLegend`, `IndicatorSettingsPanel` (generated), pane management in `ChartEngine`, markers via `createSeriesMarkers` (R3a: dialog, legend rows, live settings panel, price-pane lines ✅; R3b: markers ✅; R3c: panes with legends and level lines, band fills, coloured histograms, volume scale ✅; pane drag-resize is lightweight-charts' own)
- [x] `docs/indicators/<slug>.md` stub per indicator (formula, defaults, warm-up, TV differences); full pages for the MA family (L1)
- [ ] TV manual cross-check list (3 AAPL 1D dates) → `tests/golden/tv_crosscheck.json` filled with the user's numbers (template + test ✅, numbers pending)

DoD: all indicators pass golden + property tests at `rtol=1e-9` (deviations documented); adding a new indicator = 1
Python file + 1 registry entry + tests; Playwright: add RSI + BB, change BB length, remove RSI.

Demo: Indicators → search "rsi" → add → pane with 70/30 → hover → legend values → gear → length 21 → OK → add a second BB with 2.5σ → hide/show → remove.

Risks: EMA seeding vs TradingView on short histories (documented; cross-check decides); float drift in rolling sums; pane layout jitter when adding/removing panes.

---

## R4 — Drawing tools v1

**Goal**: Persistent, data-anchored drawings with TradingView-like interaction.

In scope: `DrawingManager` on series primitives: create (click-click / drag), hover, select, handles, drag
move/resize, `Del`, `Esc`, double-click opens the live settings side panel (`DrawingSettingsPanel`; a floating
toolbar sits on the selected drawing), `Shift` angle snap. Tools: horizontal line, horizontal ray,
vertical line, trend line, ray, extended line, parallel channel, rectangle, text label, price range, date range,
date & price range, Fib retracement, trend-based Fib extension. Magnet (weak/strong snap to O/H/L/C), stay-in-drawing
mode, lock all, hide all, remove all. Persistence per symbol (`/api/drawings/{symbol}`, versioned schema, revision).
Out of scope: undo/redo (R6), the other ~70 TradingView tools.

Tasks
- [x] `drawings/geometry.ts` (distance-to-segment/ray/line, rect hit, clipping, 45° snap), `snap.ts` — pure + unit tests (R4a); `fib.ts`, `measure.ts`, channel in `shapes.ts` (R4b)
- [x] `DrawingManager`, one `DrawingLayer` primitive, shape module per tool (`shapes.ts`), tool registry for the toolbar (R4a)
- [x] Properties: floating toolbar + live side panel (R4a); Fib level table (R4b)
- [x] Tools: Fib retracement + trend-based extension, parallel channel, price/date/date-and-price range, trash menu (remove drawings / indicators / all, confirm + undo) (R4b)
- [x] Playwright: draw a Fib, reload, switch to 1W (same saved anchors, drawn on the weekly bars), remove it from the trash menu (R4b)
- [x] Backend `storage/drawings.py` + API + pydantic models per tool type + migration scaffold + tests (R4a)
- [x] Anchor mapping across intervals (time → logical index, interpolation/extrapolation) + tests (R4a)

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
- [x] `analysis/gaps.py` + hand vectors, golden scalar model, properties (no lookahead, fill monotonicity); previous-period levels and pivots are **registry indicators** (`prev_hlc`, `pivots`) so they get the indicator harness, legend, settings and replay for free
- [x] `GET /api/analysis/gaps` + tests; `display_shift` on `/indicators/compute` (pivots are stored at the confirming bar, drawn on the pivot bar)
- [x] Frontend: `GapLayer` primitive, Gaps panel, step lines, dot markers, Data window; right-sidebar tabs (Watchlist / Data window / Gaps); "Structure" menu
- [ ] NVDA 1D gap list → `tests/golden/nvda_gaps.json`: generated from the committed (synthetic) e2e fixture; the hand check against TradingView needs the real fixture from `make-fixtures.ps1` (user)
- User decision: no 52-week high/low lines (the symbol card already shows the 52-week range)

DoD: gaps on NVDA 1D match the hand-checked list; all analysis functions tested; toggles in a "Structure" menu.

Demo: NVDA 1D → enable Gaps (min 1%) → zones appear, filled ones end at fill bar → open Gaps panel → click a gap → chart scrolls.

Risks: split-day artifacts in unadjusted data (use split-adjusted always); index symbols show few meaningful gaps.

---

## R6 — Persistence, layouts & UX polish

**Goal**: Closing and reopening restores the exact workspace; the app feels finished.

In scope: named layouts (symbol, interval, chart type, scale, indicators with params/style, pane sizes, visible range);
autosave of the current layout; multiple watchlists (CRUD, add/remove symbols, sections); undo/redo (built as one
history of snapshots, not the planned command pattern) for chart, drawings and indicator changes; keyboard shortcuts (table below); settings dialog (theme dark/light, time zone,
candle colors); loading/empty/error states everywhere; PNG snapshot; simple object tree.
Out of scope: multi-chart grids, cloud sync.

Proposed shortcuts (TradingView-like): typing a letter → symbol search; `Alt+H` horizontal line; `Alt+V` vertical line;
`Alt+T` trend line; `Alt+F` Fib retracement; `Alt+R` reset chart view; `Ctrl+Z`/`Ctrl+Y` undo/redo; `Del` delete
selection; `Esc` cancel/deselect; `/` indicators dialog; `Shift+→` replay step (R7); `Alt+Shift+H` hide all drawings.

DoD: Playwright: configure a workspace (symbol, interval, 2 indicators, 3 drawings, pane resize), reload → identical; undo/redo round-trip tests.

Done (2026-11-23, one round by the user's choice):
- [x] Backend `storage/documents.py` (one SQLite table per kind, revisions) + `/api/layouts`, `/api/watchlists` + tests
- [x] Layout menu with autosave (debounced, flushed on page hide), rename / copy / open / delete, `Ctrl+S`; pane sizes and visible bars restored once the bars are in
- [x] Watchlists: lists, sections, add via search, drag to reorder, right-click menu; a built-in Default until one is saved
- [x] Undo/redo: one history of snapshots (user's choice: symbol and interval switches included), quick changes of one kind merged; `store/historyStore.ts`
- [x] Settings dialog (time zone incl. "exchange", candle colours, last-price line, volume); theme toggle and PNG snapshot came in U1
- [x] Object tree tab; fullscreen; `Alt+R`
- [x] Playwright `e2e/workspace.spec.ts`; every e2e test starts from an empty backend workspace (`freshStart`)

Risks: schema drift between layout versions (migration functions + tests).

---

## R7 — Bar Replay (foundation for Phase 4)

**Goal**: Step through history with zero information leakage.

In scope: Replay button → pick start bar (click or date picker) → step (`Shift+→`), play/pause, speeds (0.5/1/2/5/10
bars/s), jump to end/exit; single `replay.cursor` in the store; values computed over the loaded history are cut at the
cursor (no `until` per request, exact by the no-lookahead test);
drawings stay visible and editable; replay HUD showing the cursor date.
Out of scope: paper trading during replay (P4/P5).

Tasks
- [x] Backend: `until` on bars, indicators and gaps (done earlier). Quotes stay live by the user's choice (only the chart replays). No `replay/` helpers needed: see below
- [x] Parametrised test over **every registered indicator and the gap analysis**, 1D and 1h: value at bar k == value on `bars[:k+1]` (`tests/golden/test_replay_no_lookahead.py`)
- [x] Frontend `replayStore`, controls bar, start by click / date / random; instead of recomputing per step, the full-history values are cut at the cursor, which the test above makes exact (a gap filled after the cursor shows open). Stepping re-sends the series data (fast enough at 10 bars/s); `series.update` not needed
- [x] Playwright: start replay on AAPL 2024-01-02, step 5 bars, legend shows bar 5 values (`e2e/replay.spec.ts`)
- User choices: interval locked during replay; drawings made in replay are saved as usual

DoD: no-lookahead test passes for every registered indicator and analysis function.

Risks: per-step recompute latency at 10 bars/s — moot: nothing is recomputed per step (values are cut at the cursor).

---

## Phase-1 review session
Update all docs, re-verify provider limits and library versions, re-evaluate ADR 0004 (drawing library), propose the
Phase-2 plan.

---

## Later phases (epics)

### Phase 2 — Education
- Already delivered by L1 (Phase 1): in-app learn pages (`docs/indicators/<slug>.md` rendered with KaTeX in the learn
  drawer), a "frequency response" view for linear filters ($|H(e^{j\omega})|$, group delay/lag, step and impulse) and
  an MA-vs-MA compare.
- P2a (learn platform): learn index, interactive widgets inside the pages on a random stock (scenarios) or any symbol
  (move a parameter, event studies, combine rules), a Try it tab, exercise cards that start the replay, template v2 and
  the MA family's pages rewritten to it.
- P2b (oscillators): full pages for RSI, Stochastic and MACD (MACD's measured band-pass response as a figure inside
  the page) and the "Combining indicators" concept page.
- P2c (bands, volatility, volume): Bollinger Bands, ATR, OBV, VWAP and Volume SMA pages; hourly lab data in sessions,
  an accumulation scenario where volume leads price, rules on past values.
- P2d (structure, concepts, exercises): pivots, previous-period levels and gaps; concept pages (bars and sessions,
  adjusted prices, warm-up, lookahead and replay, lag and noise); a glossary with definitions on hover, linked from
  every page; links between pages; guided Replay exercises. **Phase 2 is complete.**
- Backlog: calendar-gap warnings (need an exchange holiday calendar).

### Phase 3 — Custom indicators and tools (designed with the user)
- Reframed (user, 2026-11-24): instead of a plugin API the user writes in, each new indicator or tool is specified in a
  discussion with the user (written spec: formulas, params, edge cases, a hand example), then implemented as a built-in
  with the full test harness, a learn page where it fits, and a demo.
- [x] Return tool: two points, the change and the equivalent compound return per year (default), month, week, day or
  bar.
- [x] Statistics tool: a dragged range; the Statistics tab shows the histograms of the bar returns and of their change
  (curvature) with the normal curve, mean, standard deviation, annualised mean and volatility.
- [x] F1: OHLC forecast backend (ADR 0010): k bars ahead as probabilities, models A (OLS) and C (ridge + HAR),
  walk-forward validation and auto-tuning. [x] F2: on the chart (fan, median candles), the Forecast tab, the replay
  freeze, the Forecasting OHLC learn page with a live widget.
- [x] V1: volatility engine (ADR 0011): Historical Volatility (OHLC) with five estimators and Volatility Percentile;
  the Volatility tab (cone per calendar horizon, HAR forecast, squeeze probability, overnight and downside shares,
  estimator scores); the Historical Volatility learn page with a live widget.
- [x] T1: Trade plan tool (ADR 0012): target / stop / fill probabilities from normalised historical paths with the
  Brownian bridge, EV and position size, EV heat map, walk-forward calibration; the Trade plan learn page.
- [x] R2: VaR and ES (ADR 0013): four methods, three levels, three horizons, both tails, backtests; VaR Bands on
  the chart with breach markers; the Risk tab and the Value at Risk learn page.
- [x] G1: market regime (ADR 0014): Variance Ratio (Chow-Denning), Hurst (DFA) and a regime tint on the chart;
  the Regime tab with the wild bootstrap, MF-DFA, the regime map and an event study by regime; the learn page.
- Deferred: the Python plugin API (`plugins/` folder, hot reload, `chartlab test-indicator`), if ever needed.

### Phase H — Home vs Market (before Phase 4)
- Compare buying an apartment with investing in the market on the same money: deposit schedules with or without
  USD/ILS, a table per deposit with gross and net gain, a mortgage mix of up to three tracks (Spitzer, equal
  principal, grace, balloon; fixed, CPI-linked or prime), the rent switch (live in it or rent it out), the dwelling
  index or an assumed appreciation, net worth = assets − liabilities, modes A, B and A+B.
- Statistics over rolling historical windows, block bootstrap and Monte Carlo: histograms of the final net worth or
  the net XIRR, P(a ≤ X ≤ b), P(A > B), CVaR, drawdown, certainty equivalent.
- Data from the Bank of Israel (USD/ILS daily from 1976, CPI from 1951, the CBS dwelling index from 1994, mortgage
  rates by track). The round plan is in [HOME_VS_MARKET_PLAN.md](HOME_VS_MARKET_PLAN.md) (H0–H5).
- [x] H5: eight learn pages for the planner (ADR 0025), each formula with its symbol table and a worked example
  pinned to the engine by a test; one notation for all of them; a learn link in every section of the planner; the
  interest stress test of the apartment (the Bank of Israel rate 1, 2 and 3 points higher); and a UX pass
  (2026-11-26).
- [x] H4: two options with forms of their own (ADR 0024): one set of forms until "Option B is the same as option A"
  is unticked, what each option contains set in the Compare tab, scenarios saved by the backend
  (`/api/planner/scenarios`), every results table as CSV, and an apartment's own volatility in a simulation
  (2026-11-26).
- [x] H3c: what the answer depends on (ADR 0023): the apartment's return by source (Shapley), a sensitivity tornado,
  who leads over the exit months with a chart, liquidity and a forced sale, the correlation of dwelling prices with
  the market, and the same money split between the two options (2026-11-26).
- [x] H3b: the simulation (ADR 0022): worlds by block bootstrap of the shared history or with a modelled market,
  layer 2 of the metrics (the bad tail, regret, risks along the path, stochastic dominance, the certainty
  equivalent), `/api/planner/simulate`, and a histogram with two handles in the Compare tab (2026-11-26).
- [x] H3a: scenarios (ADR 0021): two options on the same money (an apartment, a market account or both on each
  side), rolling windows of history with the effective-sample count, layer 1 of the metrics (P(A > B), XIRR,
  breakeven rates, the win map, time-averaged net worth), `/api/planner/run` and `/api/planner/study`, and the
  Compare tab of the Planner (2026-11-26).
- [x] H2: the mortgage and the apartment (ADR 0020): tracks and amortization tables, the purchase, owner and sale
  costs, rent, the value path, purchase and betterment taxes with saved tables, `/api/planner/home`, and the
  Apartment tab of the Planner (2026-11-26).
- [x] H1: the market account (ADR 0019): fill models and their table, the CPI model, deposit schedules, XIRR, the
  account with fees, dividend tax and three tax bases, `/api/planner`, and a basic Planner page (2026-11-26).
- [x] H0: macro series from the Bank of Israel (`app/macro`, `/api/macro`, ADR 0018), the Benchmarks group and
  USD/ILS in the universe (2026-11-26).

### Phase 4 — Strategies & backtesting
- Organised by **four trader profiles** set by trade frequency (Day ≤ 10 a day, Swing ≤ 10 a week, Position ≤ 10 a
  month, Long-term ≤ 12 a year); the final models are one validated set per profile (B7).
- [x] D0: minute intervals (1m, 2m, 5m, 10m, 15m, 30m, 90m), accumulated intraday history and the daily collector
  (ADR 0017, 2026-11-26).
- The round-by-round plan is in [PHASE4_PLAN.md](PHASE4_PLAN.md) (2026-11-26): intraday data for the Day profile (D0),
  profiles, strategy model and signals (B0),
  the backtest engine (B1), the results tab and trades on the chart (B2), costs, sizing and risk exits (B3), honest
  evaluation: walk-forward, parameter sweeps and multiple-testing corrections (B4), portfolio and screener (B5), the
  strategy learn pages and the replay link (B6).

### Phase J — Withdrawals (done)
- The plan is in [WITHDRAWAL_PLAN.md](WITHDRAWAL_PLAN.md) (2026-11-27): a Withdraw tab in the Planner, rounds J0–J4.
- [x] J0: the withdrawal engine for an account and the Withdraw tab (ADR 0026): a starting capital with a cost
  share, a fixed net amount or a percent sold, the Market tab's mix or an assumed yearly return, the plan at the two
  tax bounds, `/api/planner/withdraw` (2026-11-27).
- [x] J1: an owned apartment in the balance (ADR 0027): its cash and its worth through `run_home`, kept, sold on a
  date, sold when the account runs out, or a forced sale; one mortgage track; betterment tax on its own cost and
  purchase day (2026-11-27).
- [x] J2: the plan over many realizations (ADR 0028): every start of history and simulated worlds through one
  vectorised engine; the histogram of what is left, the share still paying, the income fan, the sustainable
  amount, the months in reverse; `/api/planner/withdraw/study` and `/simulate` (2026-11-27).
- [x] J4: lot-exact tax from the Market tab's plan, first in first out, and two plans side by side (ADR 0029;
  2026-11-27, before J3 at the user's request).
- [x] J3: three learn pages (`withdrawals`, `cost-basis`, `sustainable-withdrawals`), both options' Withdraw
  settings in saved scenarios, and the tab's polish: learn links, folded sections, the order of the results, framed
  results tables (ADR 0030; 2026-11-27). Phase J is closed.

### Phase K — Synthetic symbols and open completions (after Phase J, before Phase 4)
Asked for by the user on 2026-11-27. **The order he set: Phase J, then Phase K, then Phase 4.** A note of scope,
not yet a round-by-round plan; his answers to the first questions are under "Decided" below.

**Three kinds of symbol that are not market data.** Each is a symbol like any other, so the chart, the indicators,
Compare, the Planner's mix and (later) the backtester use it with no change of their own.
- [x] **K0: the frame.** A `SyntheticProvider` behind the `DataProvider` interface (no network, deterministic by a
  seed), a naming scheme, the definitions saved in `app.db`, and a "synthetic" mark wherever the symbol is shown, so
  an invented series is never read as a market. Done with the lab's scenarios as the first kind (ADR 0031,
  2026-11-27): 1h bars that aggregate to the scenario's daily bars, `/api/synthetic`, the dialog.
- **Decided by the user before K1 (2026-11-27):** K0 approved. A **causality** field: interpolated between the
  month dates (the default, as the Planner does, not causal) or causal (each value held from its publication,
  an assumed lag, default two months, since the data carries no publication dates); **noise** 0.2 % a day by
  default; bars **Monday to Friday**; a **first price** to choose (default 100); the **national index and the six
  districts** now (the districts from 2017-10); **1h and 4h too**, invented like K0's; a **learn page** on the
  synthetic symbols, linked from the dialog.
- [x] **K1: dwelling prices as a symbol** (ADR 0032, 2026-11-27: interpolated or causal, the national index and six
  districts, the `synthetic-symbols` learn page). The **close** is the CBS dwelling price index (national and by district),
  scaled to 1 on its first date. The index is monthly: on its month dates the close is the index exactly; between
  them it is interpolated geometrically, as the Planner already does, with optional noise that returns to the index
  on every month date. Open, high and low are drawn around the close (the recipe of `app/analysis/synthetic.py`);
  no volume.
  - To say on the page: only the close carries information. The range inside a day is invented, and the index is
    smoothed, so its volatility is far below a single apartment's.
- **Decided by the user before K2 (2026-11-27):** K1 approved. **μ is the expected simple yearly return**
  (E[P₁/P₀] = 1 + μ; the median path grows about σ²/2 slower). **Exactness is a field**: in the distribution (the
  default: one path wanders around μ and σ) or exact in the path (the drawn returns shifted and scaled so the path's
  own mean and standard deviation are the targets). The skewed family is **skew-normal** (Azzalini) only. Beyond the
  family: **memory (AR(1))**, **Merton jumps** and **volatility clustering (GARCH(1,1))**, μ and σ kept in each; the
  overnight gap and the range stay K0's. A **preview** in the dialog: the histogram of the drawn daily returns under
  the family's density, and the realized mean, standard deviation, skewness and kurtosis. The formulas in a **new
  part of the `synthetic-symbols` page**. Hours **as in K0** (a bridge from the open to the close, so the daily
  return is exactly the family's). Defaults **μ 7 %, σ 18 %, normal**.
- [x] **K2: an independent synthetic symbol** (ADR 0033, 2026-11-27: five families, in the distribution or exact in
  the path, AR(1) memory, Merton jumps and GARCH(1,1) keeping μ and σ, a preview in the dialog, the formulas on the
  `synthetic-symbols` page). The user sets its statistics: expected yearly return, yearly
  volatility, and what shapes the bars: the overnight gap's share, the day's range, fat tails, memory (trend or
  mean reversion), jumps; plus the seed, the first price, the first date and the length.
  - Open, high, low and close cannot each have a distribution of their own: a bar needs low ≤ open, close ≤ high.
    So the parameters describe the close-to-close return, the gap and the range, from which the four are built.
    `app/analysis/synthetic.py` already does this for the lab's fixed scenarios; K2 opens its parameters.
- **Decided by the user before K3 (2026-11-28):** K2 approved. **Blocks of a length in trading days** (21 by
  default; the last block may be shorter), **a permutation only** (each block exactly once: the total return and the
  set of daily returns are the source's). **A chosen range, frozen**: a first and a last date (by default the whole
  history up to the creation day), stored, so the copy never changes by itself. **The source's dates**: the same
  trading days, so the copy and the source line up in Compare bar for bar. **1h and 4h invented** and landing
  exactly on the real daily open, high, low and close. The copy **starts at the source's first price**. **Whole bars
  only** (no separate shuffle of open, high, low and close). **Dividend-adjusted** prices (total return; splits are
  always adjusted). The dialog shows **a small chart of the source against the copy and sequence measures** (total
  return, the deepest drawdown, the worst calendar year, the longest losing streak, in both). **Market symbols
  only** as sources. After creation, **the copy opens with the source in Compare**. A **new part of the
  `synthetic-symbols` page**, with a worked example.
- [x] **K3: a shuffled copy of a real symbol** (ADR 0034, 2026-11-28: blocks of a length in days, a permutation,
  a frozen range on the source's dates, hours that land on the real daily bar, a preview with sequence measures).
  The bars are cut into k blocks, the blocks are put in a random order (a seed) and joined again.
  - The join is on **returns**, not on prices, or every joint would be a jump: each bar is kept as its ratios to
    the previous close, and the path is rebuilt from the first price.
  - It is a permutation, so the whole period's return and the set of daily returns are the real ones; only their
    order changes. That makes it a test of sequence risk and of a strategy fitted to one history. (The Planner's
    block bootstrap, `paths.block_index`, is the same idea with replacement.)
  - Shuffling open, high, low and close each in its own order is possible only with a repair (high = the largest
    of the four, low = the smallest), and it breaks what the four have in common inside a bar. Offered as an
    option, marked as such.

**Open completions gathered here** (K4, each small).
- **Decided before K4 (2026-11-28):** K3 approved. The user asked for K4 without questions, each choice the
  recommended one: **each apartment sold on its own "Sold on"** (the comparison ends on the later sale; an earlier
  sale's proceeds go into that option's mix until then); **loading a scenario reruns the basic comparison**; **a
  chart of both options' net worth along the plan**, month by month (two market accounts included), next to the
  lead chart's exit values; **the Planner charts' text at a fixed size** (the chart measures its width); **the
  flaky `U3: compare` end-to-end test fixed**; **the tax facts checked against official sources**; the run on real
  data **prepared as a guide** for the user's machine (it cannot run in the cloud).
- [x] From H4 (K4, ADR 0035, 2026-11-28): the second apartment sold on its own day (today both must be bought on
  the same day of the month); loading a saved scenario reruns the comparison; a chart of the net-worth paths of two
  market accounts.
- [ ] A run of Phase H on real data on the user's machine (`make-fixtures.ps1`, `make_macro_fixtures.py`), and a
  pass over anything it shows. *K4: the steps are in `HANDOFF.md`; open until the user runs them.*
- [ ] Tax facts still read from secondary sources, to check against the Tax Authority: the order of sale of
  identical securities (first in, first out), the surtax threshold, the rent exemption ceiling. *K4 (2026-11-28):
  the surtax (3 % above ILS 721,560 a year, plus 2 % on capital income) and the rent ceiling (ILS 5,654 a month)
  verified in the Tax Authority's 2026 withholding booklet, unchanged; the regulation behind first in, first out
  could not be read from the cloud session (its hosts are blocked): still secondary sources, now five that agree
  (docs/WITHDRAWAL_PLAN.md). Open: read regulation 5 itself.*
- [x] From the J3 UX audit (K4, 2026-11-28): the Planner's SVG charts scale their text with the chart, so in the
  narrow results column at 960 px it reads at about 8 px. Draw their text at a fixed size (measure the chart's
  width).

**Decided by the user (2026-11-27):**
- **The dwelling symbol** is the national index first; the districts later, where a series exists.
- **Noise around the dwelling close:** a small one by default (a field; 0 gives the plain interpolation).
- **A synthetic symbol is a symbol like any other:** it enters a watchlist and a saved layout. It also carries
  **its own parameters**, which a market symbol does not have (the seed and, by kind: the noise; the return,
  volatility and bar-shape parameters; the source symbol and the number of blocks). So a definition is stored with
  the symbol and can be opened and edited from wherever the symbol is shown.
- **Before Phase 4.** The shuffled symbol (K3) is then there for the backtester's honest evaluation (B4).

**Decided by the user before K0 (2026-11-27):**
- **No plan document** for Phase K: K0 starts directly. **K0's first kind** is the learn lab's scenarios
  (`random_walk`, `uptrend`, ... from `app/analysis/synthetic.py`), to prove the frame end to end.
- **Editing:** a dialog opened from the symbol search, from a pencil in the legend and from the watchlist row's
  context menu (Edit, Delete). It edits the definition **in place**, with a warning that lists what points at the
  symbol (layouts, compared symbols, watchlists, drawings, Planner scenarios), plus a "Save as copy" button.
- **Name:** a fixed `SYN:` prefix and a ticker-like part the user chooses (A–Z, digits, `.`, `-`, `_`, 1–12
  characters, starting with a letter, upper-cased, unique), so it can never shadow a real ticker (the Planner
  accepts any Yahoo ticker, not only the universe); plus a free full name. Definitions persist in `app.db`.
- **Dates:** a fixed first date, a first price and a length in bars (100–10,000, default 2,500); the dialog
  pre-fills a first date so the series ends on the last trading day before today; the last bar is never after
  today. No series that moves with the calendar.
- **Intervals:** 1h and 4h too. The hourly bars are the base (US stock hours, 09:30–16:00 New York, seven bars a
  session, 4h at 09:30 and 13:30) and the daily bar is built from them, so the two agree; 1W and 1M by resample;
  minute intervals stay disabled. The lab keeps its own generator unchanged (the same seed gives a different path).
- **Currency:** a field, USD or ILS, default ILS (the Planner then adds no real exchange-rate noise).
- **Deleting:** a confirmation that lists what points at the symbol; then it leaves every watchlist, its
  drawings are deleted, a layout on it opens on AAPL (a compared one is dropped), a Planner scenario shows an error.
- **The mark:** the `SYN:` prefix, a muted "SYN" badge in the watchlist, the search, the legend and Compare, and a
  "Synthetic" watermark on the chart.
- **Watchlists:** synthetic symbols get their own "Synthetic" group in the search; after creating one the chart
  opens on it; adding it to a watchlist is manual (the search's "+").
- **Defaults:** the scenario's volume is kept (OBV, VWAP); bars are generated on each request, not cached; no
  market status, exchange "Synthetic", the intraday collector skips them; at most 100 definitions.
- **K2's bar-shape defaults** start from the recipe in `app/analysis/synthetic.py` (asked again at K2).
- **K2's return distributions** (user, 2026-11-27): the user picks the family of the daily return, and the yearly
  mean and standard deviation they set hold exactly whatever the family: **normal, Student-t** (degrees of freedom
  set the tails), **uniform, Laplace**, and a **skewed** one (skew-normal or a skewed t), each with its formulas on
  the page. (Mixtures and Merton jumps were not picked as families; the roadmap's jumps are asked again at K2.)
- **Refined while building K0 (ADR 0031):** the bars are never stored in `bars.db` but are memoised in memory by
  the whole definition (an edit still applies at once); the last bar must be *before* today (today's hours are not
  over); the first date is 1970-01-01 or later; a stored symbol keeps its name (Save as copy gives another); in the
  watchlist the SYN badge stands for the prefix, under a name cut to the column's width.

### Phase A — Market data from Alpaca (planned)
Asked for by the user on 2026-11-28: deeper and finer US data than Yahoo, historical and live. The plan, the facts
with their sources and the questions are in [ALPACA_PLAN.md](ALPACA_PLAN.md). **Data only**: it needs the user's
approval of an amendment to CLAUDE.md §10 ("no broker APIs or credentials") before A0.
- [ ] A0 — keys, the probe on the user's machine, recorded fixtures, the safety rule and its hosts test (the gate:
  which feed the account may use)
- [ ] A1 — 1m/5m/1h bars from Alpaca since 2016, one source per series (no splice into Yahoo's bars), backfill, a
  scoreboard against Yahoo
- [ ] A2 — trades and quotes: bars to the second (1s–30s, on demand by day), the spread
- [ ] A3 — live trades and bars over one stream connection, passed on to the chart and the watchlist
- [ ] A4 — corporate actions, a data-quality page, Phase 4's Day data and spread

### Phase 5 — Paper trading agent
- Rule-based agent first (strategies from P4) running on replay windows and delayed data; later ML/LLM-assisted
  research assistant. Evaluated only with P4 tooling. **Paper only — no broker adapter exists.** Real trading would be a
  separate, newly designed phase that the user must explicitly start.
