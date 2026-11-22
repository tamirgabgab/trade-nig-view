# TradingView Research & Feature Map

> Status: Stage A research, verified **2026-11-22**. Provider limits and library versions change often;
> every number below carries the date it was checked. Re-verify before relying on it in code.

Legend for **Phase/Round**: `R0`–`R7` = Phase 1 rounds (see [ROADMAP.md](ROADMAP.md)), `P2`–`P5` = later
phases, `—` = out of scope. **Difficulty**: S (≤ 1 day), M (a few days), L (a week or more).

---

## 1. Corrections to the original project brief

Things in the original prompt that turned out wrong or outdated during research:

| # | Brief said | Finding (2026-11-22) | Action |
|---|-----------|----------------------|--------|
| 1 | Stooq: "free CSV daily data, a useful fallback" | Since ~March 2026 Stooq CSV downloads require an **API key obtained via a captcha**; without it you get an HTML page. `pandas-datareader` removed its Stooq reader. | Stooq is demoted to an *optional, key-based* provider. Default fallback becomes **Tiingo** (key). |
| 2 | yfinance intraday "minute bars only for recent weeks" | yfinance docs: `1m` → max 7 days per request, only within the last ~30 days; `2m`–`90m` → last 60 days; `60m/1h` → last 730 days. Yahoo publishes no rate limits; IP blocks/429 (`YFRateLimitError`) are common. Current version **yfinance 1.8.0**. | Recorded below. 1h is "best effort", minute data is out of scope for Phase 1. |
| 3 | Tiingo "500 unique symbols/month" | Current Tiingo pricing pages list the free tier as **50 req/hour, 1,000 req/day, 1 GB/month bandwidth**. A symbol cap only appears in old (2020) sources. | Treat symbol cap as unknown; our universe is ~20–30 symbols anyway. |
| 4 | Python 3.12 | Fine, but **numpy 2.5 requires ≥ 3.12, pandas 3.x requires ≥ 3.11**. Python 3.13 is the most mature current target. | `requires-python = ">=3.12"`, develop and CI on **3.13** (installed by `uv`). |
| 5 | TypeScript (latest) | npm `latest` is **TypeScript 7.0** (native Go port). `typescript-eslint` 8.73 peer range is `typescript >=4.8.4 <6.1.0`. | **Pin TypeScript 6.0.x** until typescript-eslint supports 7. Revisit in R6. |
| 6 | pandas-ta as reference model | Last PyPI release `0.4.71b0` (2025-09); the project announced it may be **archived** for lack of funding (deadline 2026-07-01). | Don't depend on it. Reference models = **TA-Lib** (now ships wheels for Windows/macOS/Linux, `ta-lib 0.8.3`) + our own hand-written loop models. |
| 7 | Alpha Vantage 25 req/day | Confirmed 25/day (+ 5/min). `TIME_SERIES_DAILY_ADJUSTED` is a premium endpoint; free daily output is compact (last 100 points) unless premium. | Not implemented. |
| 8 | Lightweight Charts v5.x | Confirmed. Latest **5.3.0** (2026-11-10). v5 API exactly as described (see §4). | Pin `^5.3.0`. |
| 9 | Volume as a separate pane or overlay | Both possible in v5. | Overlay with its own price scale (TradingView default look), optional move to its own pane. |
| 10 | Screenshot universe has **Futures** (USOIL, SILVER, GOLD) and **Forex** (USDJPY, GBPUSD), and DXY | Brief's universe had neither. Yahoo has `CL=F`, `SI=F`, `GC=F`, `DX-Y.NYB`, `JPY=X`, `GBPUSD=X`. Continuous futures have roll gaps. | Proposed as optional watchlist groups (open question in HANDOFF). |

---

## 2. Feature inventory

### 2.1 Layout & shell

| Feature | TradingView behavior | Phase/Round | Implementation approach | Diff. | Notes |
|---|---|---|---|---|---|
| Top toolbar | Symbol search, interval, chart type, Indicators, Alert, Replay, undo/redo, layout name/save | R0 shell, R2 controls, R6 undo/layout | React `TopToolbar` component; buttons dispatch store actions | M | Alert button: hidden until a later phase |
| Left drawing toolbar | Vertical toolbar, 8 tool groups as flyouts, favorites, magnet, stay-in-drawing, lock, hide, remove | R0 shell, R4 tools | `DrawingToolbar` with flyout groups from a tool registry | M | Tooltips + keyboard reachability required |
| Chart area | One or more panes; OHLC legend + indicator legend rows top-left | R2 | `ChartEngine` wrapper over lightweight-charts | L | |
| Right sidebar | Watchlist grouped by sections (Indices/Stocks/Futures/Forex) with Last/Chg/Chg%; symbol details below (name, exchange, sector, key stats) | R2 (watchlist), R6 (multiple lists) | `Watchlist`, `SymbolDetails` components; quotes from latest daily bars | M | Key stats (market cap, P/E, dividend yield, next earnings) need fundamentals → out of scope for Phase 1, show what yfinance gives cheaply, cached |
| Bottom bar | Range buttons 1D 5D 1M 3M 6M YTD 1Y 5Y All, go-to-date picker, clock + timezone, `%` / `log` / `auto`, `ADJ` toggle | R2 (ranges, scales, ADJ), R6 (timezone setting, go-to-date) | `BottomBar` component | M | Range buttons change visible range *and* interval like TradingView (1D→1m bars, 5D→5m...) — we only change visible range in Phase 1 |
| Multi-chart layouts (grids) | 2–16 charts per layout, sync symbol/crosshair | — | — | L | Out of Phase 1 |
| Dark theme | Default dark palette, green `#089981` / red `#F23645` candles | R0 tokens, R2 | CSS custom properties + a JS theme object passed to the chart | S | Colors similar, not copied assets |

### 2.2 Chart types

| Type | Phase/Round | Approach | Diff. |
|---|---|---|---|
| Candles | R2 | `CandlestickSeries` | S |
| Bars (OHLC) | R2 | `BarSeries` | S |
| Hollow candles | R2 | `CandlestickSeries` with per-bar colors (up = transparent body, border colored by close vs prev close) | S |
| Line | R2 | `LineSeries` on close | S |
| Area | R2 | `AreaSeries` on close | S |
| Baseline | R2 (stretch) | `BaselineSeries` | S |
| Heikin Ashi | R2 | Transform computed in **backend** `analysis/transforms.py` (tested), rendered as candles; legend shows HA values | S |
| Line with markers / step line / columns / high-low | P2+ | built-in series options | S |
| Renko, Line break, Kagi, Point & Figure, Range | P2+ | Non-time-based → custom horz scale (`createChartEx`) or custom series; bars no longer map 1:1 to time | L |
| Volume footprint, TPO | — | Needs tick/order-flow data | L |

### 2.3 Intervals, scales, time

| Feature | TradingView behavior | Phase/Round | Approach | Diff. |
|---|---|---|---|---|
| Intervals | Seconds…months, custom | R1/R2: `1D`, `1W`, `1M` full; `1h` best-effort | W/M resampled from daily locally (week = Mon-anchored, month = calendar); 1h from yfinance (730 days) | M |
| Price scale modes | Auto, log, percent, indexed-to-100, invert, lock price/bar ratio | R2: normal/log/percent; P2: indexed, invert | `priceScale().applyOptions({ mode })` | S |
| Time zone | Exchange or user-selected | R2: exchange time (America/New_York); R6: user setting | Lightweight Charts has no TZ support: we shift UTC timestamps by the TZ offset before passing them (official recommendation) | M |
| Dividend adjustment (`ADJ`) | Toggle adjusts history for dividends | R1/R2 | Provider returns both raw OHLC and adjusted close; adjusted OHLC = raw × (adjClose/close). Split adjustment is always on | M |
| Extended hours | Pre/post-market for intraday | — | Phase 1 regular session only | M |

### 2.4 Crosshair, legend, data window

| Feature | TradingView behavior | Phase/Round | Approach | Diff. |
|---|---|---|---|---|
| OHLC legend | `O H L C`, abs change and %, volume; follows crosshair, else last bar | R2 | `subscribeCrosshairMove` → store → React legend (no DOM writes onto the canvas) | S |
| Indicator legend rows | Name + params + values; eye (hide), gear (settings), source code, delete, "more" menu | R3 | `LegendRow` component per indicator instance | M |
| Data window | All series values under crosshair in a side panel | R5 | Reads same crosshair state | S |
| Crosshair modes | Cross, dot, arrow; magnet | R2 normal/magnet, R4 cursors | `crosshair.mode` | S |
| Price/time axis labels | Last price label, countdown to bar close, high/low labels | R2 last price; P2 countdown | series `lastValueVisible`, price lines | S |

### 2.5 Indicators (TradingView built-ins, ~100+)

Phase-1 subset marked **P1 (Rn)**. Everything else is a candidate for Phase 3 (plugin API) or later.

| Category | Indicators |
|---|---|
| Moving averages | **SMA P1(R3)**, **EMA P1(R3)**, **WMA P1(R3)**, **MA Cross P1(R3)**, Smoothed MA (RMA) *(internal P1)*, DEMA, TEMA, Hull MA, ALMA, Least Squares MA, VWMA, McGinley Dynamic, MA Ribbon, Envelope, Williams Alligator |
| Bands & channels | **Bollinger Bands P1(R3)**, BB %B, BB Width, Keltner Channels, Donchian Channels, Linear Regression Channel, Chande Kroll Stop, Supertrend, Parabolic SAR, Ichimoku Cloud |
| Momentum / oscillators | **RSI P1(R3)**, **MACD P1(R3)**, **Stochastic P1(R3)**, Stochastic RSI, CCI, Williams %R, Momentum, Rate of Change, Awesome Oscillator, Ultimate Oscillator, TRIX, True Strength Index, SMI Ergodic, Know Sure Thing, Coppock Curve, Connors RSI, Fisher Transform, Relative Vigor Index, Detrended Price Oscillator, Price Oscillator, Chande Momentum, Balance of Power, Bull Bear Power |
| Trend strength | ADX / Directional Movement (DMI), Aroon, Vortex, Choppiness Index, Chop Zone, Mass Index |
| Volatility | **ATR P1(R3)**, Historical Volatility, Relative Volatility Index, Average Day Range, Standard Deviation |
| Volume | **Volume (+ Volume SMA) P1(R2/R3)**, **OBV P1(R3)**, **VWAP P1(R3, intraday)**, Accumulation/Distribution, Chaikin Money Flow, Chaikin Oscillator, Money Flow Index, Elder Force Index, Ease of Movement, Klinger Oscillator, Net Volume, Price Volume Trend, Volume Oscillator, Up/Down Volume, Cumulative Volume Delta, Anchored VWAP, Volume Profile (visible range / fixed / session / anchored) |
| Market structure | **Pivot highs/lows (fractals) P1(R5)**, **52-Week High/Low P1(R5)**, **Prev D/W/M HLC P1(R5)**, **Gaps P1(R5)**, Pivot Points Standard, Zig Zag, Williams Fractals, Auto Fib Retracement, Auto Trendlines |
| Breadth / statistics | Advance/Decline Line, Correlation Coefficient, Median, Seasonality, Technical Ratings |

### 2.6 Drawing tools (50+ tools, 8 groups)

| Group | TradingView tools | Phase/Round |
|---|---|---|
| Cursors | Cross, Dot, Arrow, Demonstration, Eraser | R4: cross/arrow/eraser |
| Trend-line tools | Trend Line, Ray, Info Line, Extended Line, Trend Angle, Horizontal Line, Horizontal Ray, Vertical Line, Cross Line; Parallel Channel, Regression Trend, Flat Top/Bottom, Disjoint Channel; Pitchfork, Schiff / Modified Schiff / Inside Pitchfork | **R4**: trend line, ray, extended line, horizontal line, horizontal ray, vertical line, parallel channel. P2+: rest |
| Gann & Fibonacci | Fib Retracement, Trend-Based Fib Extension, Fib Channel, Fib Time Zone, Fib Speed Resistance Fan/Arcs, Trend-Based Fib Time, Fib Circles, Fib Spiral, Fib Wedge, Pitchfan; Gann Box, Gann Square (fixed), Gann Fan | **R4**: Fib retracement, trend-based Fib extension. P2+: rest |
| Patterns | XABCD, Cypher, ABCD, Head & Shoulders, Triangle, Three Drives; Elliott Impulse/Correction/Triangle/Double/Triple Combo; Cyclic Lines, Time Cycles, Sine Line | P2+ |
| Forecasting & measurement | Long Position, Short Position, Forecast, Bars Pattern, Ghost Feed, Projection, Anchored VWAP, Fixed-Range / Anchored Volume Profile; Price Range, Date Range, Date & Price Range | **R4**: price range, date range (date & price range = both). Long/Short position → P4 |
| Geometric shapes | Brush, Highlighter, Arrow (marker/up/down), Rectangle, Rotated Rectangle, Path, Circle, Ellipse, Polyline, Triangle, Arc, Curve, Double Curve | **R4**: rectangle. P2+: rest |
| Annotations | Text, Anchored Text, Note, Price Note, Pin, Table, Callout, Comment, Price Label, Signpost, Flag Mark, Image | **R4**: text label. P2+: rest |
| Icons | Emoji, stickers, icons | — |
| Actions | Measure (Shift+click), Zoom in, Magnet weak/strong, Stay in drawing mode, Lock all, Hide all (drawings/indicators), Remove all, Object tree, Favorites bar | **R4**: magnet, stay-in-drawing, lock all, hide all, remove all. R6: object tree (simple list) |

Drawing behavior to emulate (R4): click-click placement (or drag), hover highlight, select shows handles, drag handle/body, `Del` removes, double-click opens properties, `Esc` cancels, `Shift` constrains angle, drawings anchored to **time/price** (survive zoom/pan/interval change), per-symbol storage ("sync drawings across layouts" is TradingView's default for the same symbol).

### 2.7 Bar Replay

| Aspect | TradingView behavior (support article 43000712747) | Our plan (R7) |
|---|---|---|
| Start | Click Replay on top bar, then pick the start bar on the chart (or "select date", "random bar") | Same + date picker |
| Controls | Play/Pause, Forward one step (`Shift+→`), speed (bars/sec presets: 10×…0.1×), "jump to real time" (exit) | Same; speeds 0.5, 1, 2, 5, 10 bars/s |
| Indicators | Recomputed only on revealed bars | Backend compute takes `until=cursor`; no-lookahead test for every indicator |
| Drawings | Visible, and new ones are kept after exit | Same |
| Restrictions | Not for Renko/Kagi/PnF/Range/Line break; intraday depth by plan | We only support time-based series |
| Trading panel | Paper trades during replay | Phase 4/5 |

### 2.8 Other platform features

| Feature | TradingView behavior | Phase | Notes |
|---|---|---|---|
| Alerts | Price/indicator/drawing alerts, server-side, notifications | — (maybe P5 paper agent notifications) | Needs a running server with live data |
| Screener | Filter universe by fundamentals/technicals | P4 (simple technical screener over the cached universe) | |
| Strategy Tester | Pine strategies → List of trades, Performance summary (net profit, gross P/L, max drawdown, profit factor, Sharpe, Sortino, win rate…), equity curve, properties (commission, slippage, initial capital, pyramiding, fill on bar close vs next open) | **P4** | Our backtester: event-driven, fills at next bar open by default, no lookahead |
| Pine Script editor | Proprietary language, cloud compiled | — | Our equivalent = Python plugin API (P3). **No Pine compatibility.** |
| Object tree / Data window | Lists all objects; data window values | R5/R6 | |
| Symbol details / fundamentals / news / ideas | Earnings, dividends, financials, news feed, social ideas | — / partial | Only earnings & dividend markers (`E`, `D` on the time axis) as stretch in R5 if yfinance provides them cheaply |
| Snapshot / share | PNG snapshot, publish idea | R6 (PNG via `chart.takeScreenshot()`) | No publishing |
| Trading panel / broker | Buy/Sell buttons, broker integration | **Never** in this project scope | Paper only |

### 2.9 Out of scope / won't build

- Social network features: ideas, publishing, comments, followers, chat, streams.
- Real broker connections, real-money order entry, broker credentials of any kind.
- Pine Script compatibility or a Pine interpreter.
- Real-time streaming tick data, Level 2 / DOM, footprint, TPO.
- Server-side alerts and push/SMS/email notifications.
- Fundamentals database, news feed, economic calendar.
- Multi-user accounts, auth, cloud sync (single-user local app).
- Mobile layout (desktop browser only; must not break at 1280px).
- TradingView branding, logo, names or proprietary assets.

---

## 3. Market-data providers (verified 2026-11-22)

| Provider | Key | Free limits | History depth (free) | Intraday (free) | Adjusted data | Indices (^GSPC, ^VIX) | License / terms | Our use |
|---|---|---|---|---|---|---|---|---|
| **Yahoo via yfinance 1.8.0** | No | Undocumented; IP throttling, HTTP 429 → `YFRateLimitError` | Decades (daily) | `1m`: 7 days/request within last 30 days; `2m`–`90m`: last 60 days; `1h`: last 730 days | Yes (`auto_adjust`, `Adj Close`, dividends, splits) | Yes | Unofficial, reverse-engineered; Yahoo ToS: personal use only. Can break when Yahoo changes | **Default provider** (personal research) |
| **Tiingo** | Yes | 50 req/hour, 1,000 req/day, 1 GB/month (symbol cap: unconfirmed) | EOD back decades | IEX intraday (limited, not used) | Yes (`adjOpen/adjHigh/adjLow/adjClose`, `divCash`, `splitFactor`) | **No** (stocks/ETFs/funds only) | Free tier for personal use | **Fallback for stocks/ETFs** (R1) |
| **Twelve Data** | Yes | 8 credits/min, 800 credits/day ("Basic") | Varies by symbol | Yes, credit-costly | Partially (dividend-adjusted option on paid) | Some (as index symbols, coverage limited on Basic) | Basic = **internal, non-display use** only | Optional (R1 stretch / later) |
| **Massive (formerly Polygon.io)** | Yes | 5 calls/min | 2 years, EOD | No (paid) | Yes (`adjusted=true` split adjustment) | No on Basic | Free personal | Optional, low priority |
| **Stooq** | **Yes (since 2026, captcha)** | Daily hit limit (undisclosed) | Decades | Limited | Split-adjusted | Yes (`^spx`) | Personal use | Optional key-based provider, low priority |
| **Alpha Vantage** | Yes | 25 req/day, 5/min | Compact (100 pts) on free daily | Limited | Premium only | Limited | — | **Not implemented** |
| **Committed CSV fixtures** | No | — | A fixed window (e.g. 2015-01-01 → 2026-10-30) | No | Yes (both columns stored) | Yes | Generated once from yfinance; for tests/offline only | Tests + `OFFLINE=1` |

Architecture consequences (see [ADR 0006](adr/0006-default-data-provider.md)): `DataProvider` protocol; yfinance default;
key-based fallbacks enabled only when the key is present; **aggressive local cache with incremental updates**;
**tests never touch the network**.

---

## 4. Lightweight Charts v5 (verified against `lightweight-charts@5.3.0` typings)

- License Apache-2.0. Package ships ESM only (`.mjs`) plus a standalone bundle. No CommonJS.
- `createChart(container, options)`; series via `chart.addSeries(CandlestickSeries, opts, paneIndex?)`
  (v4's `addCandlestickSeries` is gone). Series types: `Candlestick`, `Bar`, `Line`, `Area`, `Baseline`, `Histogram`,
  plus custom series.
- **Panes**: `chart.addPane()`, `chart.removePane(i)`, `chart.swapPanes(a, b)`, `chart.panes()`,
  `series.moveToPane(i)`, `pane.setStretchFactor(f)`, `chart.paneSize(i)`. Panes are resizable by the user via separators.
- **Plugins / primitives**: `series.attachPrimitive(ISeriesPrimitive)` and `pane.attachPrimitive(IPanePrimitive)`.
  A primitive provides `paneViews()`, `priceAxisViews()`, `timeAxisViews()`, optional `hitTest(x, y)`, `autoscaleInfo()`,
  and gets `attached({ chart, series, requestUpdate })`. This is the foundation for our drawing framework.
- **Markers**: separate plugin `createSeriesMarkers(series, markers, options)`; also `createUpDownMarkers`.
- **Watermarks**: `createTextWatermark(pane, opts)`, `createImageWatermark(pane, url, opts)`.
- **Attribution**: `layout.attributionLogo` (default `true`) shows the TradingView logo link. **Must stay enabled** (license
  NOTICE requirement); README credits TradingView Lightweight Charts™.
- 5.3.0 additions: `PriceLineOptions.hitTestTolerance`. 5.1/5.2 were incremental. No breaking change since 5.0.
- Time: `Time = UTCTimestamp | BusinessDay | 'YYYY-MM-DD' string`. No time-zone support — shift timestamps ourselves.
- Screenshots: `chart.takeScreenshot()`.
- Community drawing plugins: `lightweight-charts-drawing` (MIT, v0.11.1, 86 tools, very active, single author) and
  `difurious/lightweight-charts-line-tools-core` (GitHub only, not on npm). Both young. See [ADR 0004](adr/0004-own-drawing-framework.md).

---

## 5. Indicator conventions for the Phase-1 set

Notation: bars $t = 0..N-1$, source $x_t$ (default `close`), length $n$. All outputs are `NaN` during warm-up — never
fabricated. Every indicator value at bar $t$ uses only bars $\le t$ (no lookahead).
"TV default" = value in TradingView's settings dialog as of 2026-11; to be re-confirmed during the R3 manual cross-check.

| Indicator | Formula | TV defaults | Warm-up (first valid index) | Notes / TradingView differences |
|---|---|---|---|---|
| **SMA** | $\mathrm{SMA}_t = \frac{1}{n}\sum_{i=0}^{n-1} x_{t-i}$ | length 9, source close, offset 0 | $n-1$ | Rolling sum with periodic re-summation (Kahan or exact recompute) to bound float drift |
| **EMA** | $\alpha = \frac{2}{n+1}$, $E_t = \alpha x_t + (1-\alpha) E_{t-1}$ | length 9, close | $n-1$ | **Seeding**: we use $E_{n-1} = \mathrm{SMA}_{n-1}$ (TA-Lib convention, and the same seed Pine uses for `ta.rma`). The Pine manual's illustrative `pine_ema` seeds with the first value ($E_0 = x_0$). The seed error decays as $(1-\alpha)^k$: for $n=9$ after 100 bars it is $0.8^{100}\approx 2\times10^{-10}$ of the initial difference, so the two conventions agree to display precision except in the first few dozen bars. Option `seed="first"` available for experiments. Verify against TV on a fresh symbol in R3 |
| **RMA** (Wilder/SMMA) | $\alpha = 1/n$, seed $R_{n-1}=\mathrm{SMA}_{n-1}$ | — (internal) | $n-1$ | Same as Pine `ta.rma` |
| **WMA** | $\frac{\sum_{i=0}^{n-1}(n-i)\,x_{t-i}}{n(n+1)/2}$ | length 9 | $n-1$ | |
| **MA Cross** | two MAs (type SMA/EMA), crossover events where $\operatorname{sign}(f_t-s_t)\ne\operatorname{sign}(f_{t-1}-s_{t-1})$ | 9 / 21 | $\max(n_f,n_s)$ | Outputs two lines + event markers (up/down). Exercises the "markers" output type needed by Phase 4 |
| **Bollinger Bands** | mid $=\mathrm{SMA}_n$, $\sigma_t=\sqrt{\frac1n\sum (x_{t-i}-\mathrm{mid}_t)^2}$, upper/lower $=\mathrm{mid}\pm k\sigma$ | 20, basis SMA, StdDev 2, close, offset 0 | $n-1$ | **Population** σ (Pine `ta.stdev` default `biased=true`, divides by $n$). Computed with a two-pass/Welford per window, not $E[x^2]-E[x]^2$ (catastrophic cancellation) |
| **RSI** | $U_t=\max(\Delta x_t,0)$, $D_t=\max(-\Delta x_t,0)$, $RS=\frac{\mathrm{RMA}_n(U)}{\mathrm{RMA}_n(D)}$, $RSI=100-\frac{100}{1+RS}$ | 14, close; levels 70 / 50 / 30; optional smoothing MA off | $n$ (first $\Delta$ needs one prior bar) | Edge cases (Pine order): $\mathrm{RMA}(D)=0 \Rightarrow 100$; else $\mathrm{RMA}(U)=0 \Rightarrow 0$. A perfectly flat window therefore gives 100 in Pine but 0 in TA-Lib — we follow Pine, test it, and exclude flat windows from the TA-Lib comparison |
| **MACD** | $\mathrm{MACD}=\mathrm{EMA}_{f}-\mathrm{EMA}_{s}$, signal $=\mathrm{EMA}_{g}(\mathrm{MACD})$, hist $=\mathrm{MACD}-\text{signal}$ | 12, 26, 9; close; osc & signal MA type EMA | MACD: $s-1$; signal: $s+g-2$ | TA-Lib's `MACD` aligns the fast EMA start to the slow one → early values differ from a naive composition; compare only after convergence, golden model is our loop reference |
| **Stochastic** | $\%K_{raw}=100\frac{C_t-LL_n}{HH_n-LL_n}$, $\%K=\mathrm{SMA}_{s_k}(\%K_{raw})$, $\%D=\mathrm{SMA}_{s_d}(\%K)$ | %K length 14, %K smoothing 1, %D smoothing 3; levels 80 / 20 | $\%K$: $n+s_k-2$; $\%D$: $n+s_k+s_d-3$ | $HH=LL$ → division by zero: Pine yields `na`; we output `NaN` and test it |
| **ATR** | $TR_t=\max(H_t-L_t,\ |H_t-C_{t-1}|,\ |L_t-C_{t-1}|)$, $TR_0=H_0-L_0$; $\mathrm{ATR}=\mathrm{RMA}_n(TR)$ | 14, smoothing RMA | $n-1$ | Pine `ta.tr(true)` uses $H-L$ on the first bar; TA-Lib drops bar 0 → TA-Lib ATR is shifted one bar at warm-up; compare after convergence |
| **OBV** | $OBV_t = OBV_{t-1} + \operatorname{sign}(C_t-C_{t-1})\,V_t$, $OBV_0=0$ | — | 0 | Pine `ta.obv` starts from 0 at the first bar. Absolute level depends on the start date (only shape is meaningful) — documented pitfall |
| **VWAP** | per session $s$: $\frac{\sum_{i\in s, i\le t} p_i V_i}{\sum_{i\in s, i\le t} V_i}$, $p=\text{hlc3}$ | anchor Session, source hlc3, bands off | first bar of each session | Intraday only (anchor resets at session open in exchange TZ). Hidden on daily+ intervals in Phase 1 |
| **Volume SMA** | SMA of volume | 20 (TV "Volume" MA length) | $n-1$ | |
| **Heikin Ashi** (transform) | $C^{HA}=\frac{O+H+L+C}{4}$, $O^{HA}_t=\frac{O^{HA}_{t-1}+C^{HA}_{t-1}}{2}$, $O^{HA}_0=\frac{O_0+C_0}{2}$, $H^{HA}=\max(H,O^{HA},C^{HA})$, $L^{HA}=\min(L,O^{HA},C^{HA})$ | — | 0 | Depends on the full history start → values near the start differ from TV if TV loaded more history |

**Verification strategy** (details in [ARCHITECTURE.md §7](ARCHITECTURE.md#7-indicator-verification-harness)):
1. Hand-computed tiny vectors (5–30 bars) with exact expected values.
2. Golden model: independent scalar-loop implementation that follows the Pine semantics above — compared on **all**
   bars, tolerance `rtol=1e-9, atol=1e-12`.
3. Second reference: TA-Lib — compared on the converged region only (documented per indicator).
4. Property tests (hypothesis): invariants such as SMA(const)=const, RSI∈[0,100], BB upper ≥ mid ≥ lower,
   min(window) ≤ SMA ≤ max(window), EMA(const)=const, OBV increments ∈ {−V, 0, +V}, no-lookahead (prefix invariance).
5. Manual TV cross-check: 3 dates on AAPL 1D for each indicator, values typed in by the user, tolerance = display precision.

---

## 6. Gaps, levels, Fibonacci (definitions)

- **Full gap up**: $L_t > H_{t-1}$, zone $[H_{t-1}, L_t]$. **Full gap down**: $H_t < L_{t-1}$, zone $[H_t, L_{t-1}]$.
- **Partial gap** (toggle): $O_t > C_{t-1}$ (or $<$) but ranges overlap; zone $[C_{t-1}, O_t]$.
- **Size filter**: $\frac{\text{zone height}}{C_{t-1}} \ge$ `min_pct`.
- **Fill**: gap up filled at first $k>t$ with $L_k \le H_{t-1}$ (gap down: $H_k \ge L_{t-1}$). Track partial fill level
  (deepest penetration). Unfilled zones extend to the right edge; filled zones end at the fill bar.
- On W/M intervals gaps are computed on the resampled bars (weekly gaps are rarer — expected).
- Index symbols (`^GSPC`) open near previous close by construction; gaps are meaningful mainly on stocks/ETFs.
- **Fibonacci retracement** levels (each toggleable/editable/colorable, optional price labels):
  0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, and extensions 1.618, 2.618, 3.618, 4.236.
  Price at level $r$ for anchors $(p_0 \to p_1)$: $p(r) = p_1 - r\,(p_1 - p_0)$ (TV draws 0 at the second anchor).
  **Trend-based Fib extension** (3 anchors A, B, C): $p(r) = C + r\,(B - A)$.
- **Pivot highs/lows** (fractals, $L$ left / $R$ right bars): bar $t$ is a pivot high if $H_t > H_{t\pm i}$ for
  $i=1..L$ left and $1..R$ right. **Confirmed only at $t+R$** — in replay a pivot appears $R$ bars late (no lookahead).

---

## 7. Sources

- Lightweight Charts: [release notes](https://tradingview.github.io/lightweight-charts/docs/release-notes),
  [v5 announcement](https://www.tradingview.com/blog/en/tradingview-lightweight-charts-version-5-50837),
  `lightweight-charts@5.3.0` `typings.d.ts` (inspected locally), [5.3.0 notes mirror](https://newreleases.io/project/npm/lightweight-charts/release/5.3.0)
- yfinance: [price history reference](https://ranaroussi.github.io/yfinance/reference/yfinance.price_history.html),
  [rate-limit discussion #2431](https://github.com/ranaroussi/yfinance/discussions/2431), [issue #2422](https://github.com/ranaroussi/yfinance/issues/2422)
- Stooq: [pandas-datareader issue #1012](https://github.com/pydata/pandas-datareader/issues/1012),
  [pandas-datareader what's new](https://pandas-datareader.readthedocs.io/en/latest/whatsnew.html)
- Tiingo: [API documentation](https://api.tiingo.com/documentation), [pricing table](https://api.tiingo.com/products/fundamental-data-api)
- Twelve Data: [pricing](https://twelvedata.com/pricing), [API credit limits](https://support.twelvedata.com/en/articles/5194820-api-credits-limits)
- Massive: [stocks plans](https://massive.com/stocks), [pricing](https://massive.com/pricing)
- Alpha Vantage: [API key / limits](https://www.alphavantage.co/support/), [premium](https://www.alphavantage.co/premium)
- pandas-ta status: [pandas-ta-openbb README on PyPI](https://pypi.org/project/pandas-ta-openbb/), [pandas-ta-classic](https://github.com/TheNeuroDeveloper/pandas-ta-classic)
- TA-Lib Python wheels: PyPI `ta-lib 0.8.3.post1` file list (win_amd64 / win_arm64 / macOS / manylinux)
- TradingView: [drawing tools](https://tradingview.com/support/solutions/43000703396-drawing-tools),
  [Bar Replay](https://www.tradingview.com/support/solutions/43000712747-bar-replay-how-and-why-to-test-a-strategy-in-the-past/),
  [Charting Library drawings list](https://www.tradingview.com/charting-library-docs/v27/ui_elements/drawings/Drawings-List/)
- Pine: `ta.stdev(source, length, biased=true)` (population), `ta.rma` SMA seed —
  [third-party reference](https://pineify.app/pine-script/reference/ta/stdev); official Pine v6 reference to be re-checked in R3
- Versions: npm registry and PyPI JSON API queried 2026-11-22.
