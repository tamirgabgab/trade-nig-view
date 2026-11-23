# ChartLab Architecture

> Status: design baseline from Stage A (2026-11-22). Changes require an ADR in [`docs/adr/`](adr/).

## 1. Goals that drive the design

1. **One indicator implementation** (Python) used by the chart, learn pages (P2), plugins (P3), the backtester (P4)
   and the paper agent (P5).
2. **No lookahead anywhere**: every computation can be truncated at a cursor `until`, and the result at bar `k` equals
   the result computed on `bars[:k+1]`.
3. **Correctness is testable**: every number on screen comes from a pure, tested function.
4. **The chart library is replaceable**: all `lightweight-charts` calls live behind `ChartEngine`.
5. **Works offline and in tests without network**: committed fixtures + `OFFLINE=1`.
6. **Windows-first developer experience**: PowerShell scripts, `uv`, no native build steps.

## 2. Components

```mermaid
flowchart LR
  subgraph Browser["Frontend (React + TS + Vite)"]
    UI["Components<br/>Toolbar · Watchlist · Legend · Dialogs"]
    Store["Zustand stores<br/>workspace · chart · drawings · replay"]
    Query["TanStack Query<br/>server-state cache"]
    Engine["ChartEngine<br/>(only module importing lightweight-charts)"]
    Draw["DrawingManager<br/>series/pane primitives"]
    API["api/ client<br/>(typed from OpenAPI)"]
    UI <--> Store
    UI --> Query --> API
    Store --> Engine
    Draw --> Engine
    Store <--> Draw
  end

  subgraph Backend["Backend (FastAPI, Python 3.13)"]
    Routes["api/ routers<br/>/bars /indicators /analysis /drawings /layouts"]
    BarSvc["data/BarService<br/>validate · resample · adjust · truncate(until)"]
    Cache["data/cache<br/>SQLite bars.db"]
    Prov["data/providers<br/>Yahoo · Tiingo · TwelveData · Fixtures"]
    Ind["indicators/<br/>pure functions + registry"]
    Ana["analysis/<br/>gaps · pivots · levels · transforms"]
    Store2["storage/<br/>SQLite app.db (watchlists, layouts, drawings)"]
    Routes --> BarSvc --> Cache
    BarSvc --> Prov
    Routes --> Ind
    Routes --> Ana
    Ind --> BarSvc
    Ana --> BarSvc
    Routes --> Store2
  end

  subgraph Future["Later phases (plug into the same core)"]
    Learn["P2 Learn pages<br/>(KaTeX + sliders → /indicators/compute)"]
    Plug["P3 Plugin loader<br/>(user indicators → same registry)"]
    BT["P4 Backtester<br/>(BarService + indicators, event loop)"]
    Agent["P5 Paper agent<br/>(replay cursor + backtester)"]
  end

  API -->|HTTP JSON| Routes
  Prov -->|HTTPS, throttled| Internet[(Yahoo / Tiingo / ...)]
  Learn --> Routes
  Plug --> Ind
  BT --> BarSvc
  BT --> Ind
  Agent --> BT
```

### Backend modules (`backend/app/`)

| Module | Responsibility |
|---|---|
| `main.py` | App factory `create_app(settings)`, CORS, error handlers, router registration |
| `config.py` | `Settings` (pydantic-settings) from env / `.env` |
| `api/` | Thin routers: parse/validate, call services, map to response models. No business logic |
| `models/` | Pydantic v2 request/response models and domain dataclasses (`Bar`, `BarFrame`, `Interval`, `Symbol`) |
| `data/providers/` | `DataProvider` protocol + implementations (`yahoo.py`, `tiingo.py`, `fixtures.py`) |
| `data/cache/` | `BarCache` (SQLite), range bookkeeping, incremental fetch planning |
| `data/` (`bar_service.py`, `resample.py`, `validate.py`, `adjust.py`, `ratelimit.py`, `universe.py`) | Orchestration: cache → provider → validate; per request: truncate(`until`) → adjust → resample → window/limit |
| `indicators/` | One file per indicator (pure function) + `registry.py` + `core.py` (sma/ema/rma/stdev primitives) |
| `analysis/` | Filter response of an indicator (`response.py`, L1); later gaps, pivots, prev-period levels, 52w high/low, Heikin Ashi transform |
| `replay/` | Cursor semantics helpers (`truncate_until`), later the event clock shared with the backtester |
| `storage/` | SQLite repositories for watchlists, layouts, drawings (`app.db`), schema migrations |

### Frontend modules (`frontend/src/`)

| Module | Responsibility |
|---|---|
| `api/` | Fetch client, generated TS types from the backend OpenAPI schema (`openapi-typescript`), query hooks |
| `chart/` | `ChartEngine` (create/destroy chart, panes, series, scale modes, crosshair events, time conversion), `theme.ts` |
| `indicators/` | Indicators dialog, legend rows, settings dialog generated from the registry `params` schema |
| `drawings/` | `DrawingManager`, tool definitions, geometry & hit-testing (pure TS, unit-tested), properties dialog |
| `components/` | Shell: `TopToolbar`, `DrawingToolbar`, `RightSidebar`, `Watchlist`, `BottomBar`, `SymbolSearch`, dialogs; `LearnDrawer` (lazy-loaded: `LearnPage` renders Markdown + KaTeX, `FilterView` + `ResponsePlot` draw the measured response as SVG) |
| `store/` | Zustand stores: `chartStore` (symbol, interval; chart type and scale in R2b; persisted to localStorage), later `indicators`, `drawings`, `replay`, `settings` |
| `styles/` | CSS custom properties (design tokens), global reset; component styles are CSS Modules |

## 3. Data flow

### 3.1 Loading a chart

```mermaid
sequenceDiagram
  participant UI as React UI
  participant Q as TanStack Query
  participant B as GET /api/bars
  participant S as BarService
  participant C as BarCache (SQLite)
  participant P as Provider (yfinance)
  UI->>Q: useBarHistory(AAPL, 1D, adjusted, transform)
  Q->>B: /api/bars?symbol=AAPL&interval=1D&limit=5000
  B->>S: get_bars(...)
  S->>C: covered ranges for (AAPL, 1D-base)?
  alt cache stale or missing range
    S->>P: fetch(missing range only)   (throttled, retry/backoff)
    P-->>S: raw daily bars
    S->>S: validate → upsert into cache
  end
  S->>C: read range
  S->>S: adjust (if adjusted) → resample (1W/1M) → transform (Heikin Ashi) → truncate(until) → window(before, limit)
  S-->>B: BarFrame
  B-->>Q: {symbol, interval, bars:[...], meta}
  Q-->>UI: data → store → ChartEngine.setBars()
```

**Lazy history (R2b).** The first page is the newest `limit` bars. When the visible range comes within 50 bars of the
oldest loaded bar, the frontend asks for the next page with `before=<epoch seconds of the oldest bar>` (a daily bar
counts as 00:00 UTC of its date) and prepends it; `ChartEngine.setBars` shifts the logical range by the number of
prepended bars, so the same candles stay under the mouse. Pages are TanStack `useInfiniteQuery` pages keyed by
`(symbol, interval, adjusted, transform)`. Transforms (Heikin Ashi) run on the full history **before** windowing, so a
page equals the same slice of the full-history result (tested).

**Range buttons.** Each button switches to an interval that fits the span (1D/5D/1M/3M → 1h, 6M → 4h, YTD/1Y → 1D,
5Y → 1W, All → 1M), loads older pages until the span's start is covered (or history ends), then sets the visible
range once (`chart/visibleRange.ts`, pure and unit-tested).

### 3.2 Indicator compute

`POST /api/indicators/compute` → BarService loads bars for `[start - lookback(params), end]` ∩ `≤ until` →
registry function runs on the full loaded window → response is clipped to `[start, end]`.
The lookback guarantees that values inside the requested range are fully warmed-up and identical to a full-history
computation (verified by test). For recursive filters the seed influence after $k$ bars is $(1-\alpha)^k$: EMA
($\alpha=\frac{2}{n+1}$) gives $\approx e^{-2k/n}$, RMA ($\alpha=\frac1n$) gives $\approx e^{-k/n}$. Lookback = `max(25·n, 250)` bars
→ RMA residual $\approx e^{-25}\approx 1.4\times10^{-11}$, below the $10^{-9}$ test tolerance. When the data start is reached,
the true series start is used (identical to full history by construction).

The lookback is **per spec** (`IndicatorSpec.lookback(params)`, R3b); the default is `max(25·n, 250)` with n = the
longest `*length*` parameter. Filters whose seed fades more slowly define their own:

| Indicator / MA type | Lookback | Why |
|---|---|---|
| T3 | `max(50·n, 250)` | six cascaded EMAs |
| KAMA | `max(25·n, 25·((S+1)/2)² + n, 250)`, S = `slow` (`fast > slow` is rejected) | the slowest smoothing is $s^2$, seed fades like $(1-s^2)^k$ (≈ 6,000 bars for S = 30) |
| Composites (MA Cross, Ribbon, Envelope, generic MA, Bollinger basis, ATR) | max over their averages' lookbacks | |
| MACD, RSI with smoothing (R3c) | lookback of the first stage + lookback of the average applied to it | the second average is seeded on the first stage's not-yet-converged values |
| OBV (R3c) | `10**9` (whole history) | a running sum from the first bar: any later start shifts every value |

On top of that, `IndicatorSpec.total_lookback` adds the spec's plot shift (`IndicatorSpec.shift`, the `offset`
param of MAs that call `core.shift`; LSMA's regression `offset` is not a shift): a shift of k bars shows the value of bar
t − k at bar t, so k more bars are needed. The API reports and uses `total_lookback`. A test computes every registered
indicator over a window with large offsets and compares it with the full history.

**Lookback contract with lazy history (E5, defined in R2b, consumed in R3a).** The chart asks for indicator values over
exactly the bars it has loaded: `start = time of the oldest loaded bar`, `end = time of the newest`. The backend, not
the frontend, adds the warm-up: it loads `lookback` extra bars before `start` (per spec, see above; at least
`max(25·n, 250)` with n = the longest length parameter, plus the plot offset). When older history is prepended, the frontend recomputes the indicator for the new
`[start, end]` and replaces its series (no client-side stitching of two computations). Values for bars that were
already shown therefore do not change, except within floating-point tolerance, which the R3a harness asserts.

### 3.3 Replay

The frontend holds a single `replay.cursor` (bar time). Every data request carries `until=cursor`; the backend truncates
**before** any computation. The frontend never filters future bars itself (it never receives them).

## 4. API contract (v1, JSON, prefix `/api`)

General: JSON only; snake_case fields; times as described in §6; errors as RFC 9457 `application/problem+json`;
OpenAPI at `/api/openapi.json`, docs at `/api/docs`. The same schema is committed as `frontend/src/api/openapi.json` and
turned into `frontend/src/api/schema.ts` (`scripts/gen-api.ps1`); tests fail when either file is stale (ADR 0008).

| Method & path | Query / body | Response | Round |
|---|---|---|---|
| `GET /health` | — | `{status:"ok", version, offline, providers:[{id, enabled}]}` | R0 |
| `GET /symbols` | `query?`, `group?` | `[{symbol, display, name, exchange, type: "index"\|"etf"\|"stock"\|"future"\|"forex", group, timezone, currency, has_volume, decimals, session_start}]` | R1 |
| `GET /bars` | `symbol`, `interval` (`1h`\|`4h`\|`1D`\|`1W`\|`1M`), `start?`, `end?`, `limit?` (default 5000, from the end), `before?` (epoch seconds, exclusive: only bars starting earlier; paging cursor), `adjusted=true`, `transform=none`\|`heikin_ashi`, `until?` | `{symbol, interval, adjusted, transform, timezone, bars:[{time, open, high, low, close, volume}], has_more_before, source, stale, warnings}`; intraday `time` is UTC epoch seconds, daily+ `'YYYY-MM-DD'`; for intraday `start`/`end`/`until` select whole sessions | R1 (1h/4h R1b, `before`/`transform` R2b) |
| `GET /quotes` | `symbols=AAPL,NVDA,...` | `[{symbol, time, last, change, change_pct, stale, error, spark, day_low, day_high, low_52w, high_52w}]` from the unadjusted daily bars (`spark` = last 20 closes; 52-week range = 365 days up to the last bar); per-symbol `error` instead of failing the request | R1a, U1b |
| `GET /indicators` | — | Registry metadata list (schema §5) | R3 |
| `POST /indicators/compute` | `{symbol, interval, id, params, start?, end?, until?, adjusted, transform}` (`start`/`end` = epoch seconds of bar starts, inclusive) | `{id, version, params (resolved), time:[t], outputs:{<name>:[value\|null]}, warmup, lookback}` — column arrays aligned with `time`; `null` = warm-up/NaN. A `markers` output holds `+1` (up) / `-1` (down) / `null`. `warmup` = first valid bar of the output that starts **last** (a composite's faster outputs start earlier); `lookback` = `total_lookback` (incl. offset). Cross-parameter errors (e.g. KAMA `fast > slow`, HMA length 1) are 422 `invalid_params` | R3 |
| `POST /indicators/response` | `{id, params}` | Filter view: `{id, outputs:[{name, label, linear, reason, step, ramp_lag, impulse, dc_gain, lag, nrf, frequency:{period, magnitude_db, group_delay}, truncated}]}` measured by running the indicator on synthetic bars (`app/analysis/response.py`). Linearity is tested (superposition + volume independence); a non-linear output gets `step`/`ramp_lag` and a `reason`, its other fields `null`. Only outputs that follow the price (a fixed non-zero multiple of it on flat bars) are listed, so oscillators and volume lines (RSI, MACD, OBV, ...) return an empty list (R3c). POST (not the PLAN's GET) because `params` is a free-form object, as in `/indicators/compute` | L1 |
| `GET /learn/{slug}` | — | `{slug, markdown}` from `docs/indicators/<slug>.md`; only slugs a registered indicator names are served (404 `learn_page_not_found` otherwise) | L1 |
| `GET /analysis/gaps` | `symbol`, `interval`, `min_pct=0`, `include_partial=false`, `until?` | `[{start_time, direction, top, bottom, size_pct, filled, fill_time?, max_fill_pct}]` | R5 |
| `GET /analysis/pivots` | `symbol`, `interval`, `left=5`, `right=5`, `until?` | `[{time, kind:"high"\|"low", price, confirmed_time}]` | R5 |
| `GET /analysis/levels` | `symbol`, `interval`, `until?` | `{prev_day, prev_week, prev_month:{high, low, close}, high_52w, low_52w}` | R5 |
| `GET /drawings/{symbol}` / `PUT` | body = drawings document (§5.2) | document with `revision` | R4 |
| `GET /layouts` · `GET/PUT/DELETE /layouts/{name}` | layout document | | R6 |
| `GET /watchlists` · `GET/PUT/DELETE /watchlists/{name}` | `{name, sections:[{title, symbols:[...]}]}` | | R2 (read default) / R6 (edit) |

Concurrency for PUT documents: optimistic, `revision` integer; a stale `revision` → `409 Conflict`.

## 5. Schemas

### 5.1 Indicator registry entry

```python
@dataclass(frozen=True)
class ParamSpec:
    name: str                    # "length"
    type: Literal["int", "float", "bool", "enum", "source"]
    default: int | float | bool | str
    min: float | None = None
    max: float | None = None
    step: float | None = None
    options: tuple[str, ...] = ()  # for enum/source: ("close","open","high","low","hl2","hlc3","ohlc4")
    option_labels: tuple[str, ...] = ()  # R3b: display names of `options`, e.g. "HMA (Hull)"; empty = ids
    label: str = ""

@dataclass(frozen=True)
class OutputSpec:
    name: str                    # "upper"
    plot: Literal["line", "histogram", "area", "markers"]
    color: str                   # default color token, e.g. "#2962FF"
    line_width: int = 1
    # histogram may color by sign: positive/negative colors in `style`
    style: Mapping[str, str] = field(default_factory=dict)

@dataclass(frozen=True)
class IndicatorSpec:
    id: str                      # "bb" — stable, used in layouts & tests
    version: int                 # bump when output semantics change
    name: str                    # "Bollinger Bands"
    short_name: str              # "BB"
    category: Literal["moving_averages", "bands", "oscillators", "volatility", "volume", "structure"]
    overlay: bool                # True: price pane; False: own pane
    inputs: tuple[Literal["open","high","low","close","volume"], ...]
    params: tuple[ParamSpec, ...]
    outputs: tuple[OutputSpec, ...]
    levels: tuple[float, ...] = ()        # e.g. (70, 50, 30)
    level_fill: tuple[float, float] | None = None  # U1a: shade between two levels, e.g. (30, 70)
    warmup: Callable[[Mapping[str, Any]], int]  # NaN bars at the start of the output that starts last
    lookback: Callable[[Mapping[str, Any]], int] = length_lookback  # R3a/R3b, see section 3.2
    compute: Callable[..., Mapping[str, np.ndarray]]  # pure: (BarFrame, **params) -> {output: ndarray}
    learn_slug: str              # "bollinger-bands" -> docs/indicators/bollinger-bands.md
```

`GET /indicators` serialises everything except `warmup`/`compute`/`lookback` (R3a: `ParamSpec` also has `label`, `step`,
`options`; `OutputSpec` has `label`; `offset` is limited to `>= 0` so a plotted value never reads a later bar; R3b: `ParamSpec.option_labels`). Moving-average types live in one dispatcher, `app/indicators/ma.py` `MA_TYPES` (15 types with warm-up, lookback and minimum length), used by every MA indicator and composite. A `markers` output is drawn by `ChartEngine` as arrows on the main price series (`createSeriesMarkers`: +1 = `arrowUp` below the bar, −1 = `arrowDown` above it); legends skip it. The frontend builds the settings dialog purely from
`params` + `outputs` → adding an indicator needs no frontend change.

R3c adds the output `style` keys the frontend reads: `fill_to` + `fill` (shade between this output and the named one,
a `BandFill` series primitive: BB, RSI bands); histogram colours `up` / `up_weak` / `down` / `down_weak` (MACD: rising or
falling, above or below zero); `price_scale: "volume"` (drawn on the volume histogram's scale: Volume SMA) and
`format: "volume"` (legend in K/M/B: OBV). `overlay: false` gives each instance its own pane below the price (stretch
0.3, removed with its last series), with `levels` as dashed price lines and a legend at the top of the pane.
U1a: `level_fill` (RSI 30–70, Stochastic 20–80) is shaded in the line's colour at 8% by the same `BandFill` primitive.
Pane separators are resizable (`layout.panes`); auto-fit changed on the price axis is reported back to the UI.
`ParamSpec.requires` / `OutputSpec.requires` name the bool or enum param that switches them on (true, or not `"none"`):
the settings panel greys such inputs out, and the legend and chart leave such inputs and lines out (RSI smoothing and
its Bollinger Bands). VWAP needs the bar's `session` (`BarFrame.session`, intraday only) and is NaN on daily bars.

### 5.2 Drawings document (schema version 1)

```jsonc
{
  "schema_version": 1,
  "symbol": "AAPL",
  "revision": 7,
  "drawings": [
    {
      "id": "01JD3...",                 // ULID, client-generated
      "type": "fib_retracement",        // tool id from the frontend tool registry
      "points": [                        // anchors in data space, never pixels
        { "time": 1730073600, "price": 226.15 },   // UTC epoch seconds of the anchor bar's open
        { "time": 1732579200, "price": 237.81 }
      ],
      "style": { "line_color": "#787B86", "line_width": 1, "line_style": "solid" },
      "props": {                         // tool-specific, validated per type
        "levels": [ { "value": 0.618, "visible": true, "color": "#089981" } ],
        "show_prices": true, "extend_right": false
      },
      "locked": false, "hidden": false, "z": 3,
      "created_at": "2026-11-22T19:00:00Z", "updated_at": "2026-11-22T19:05:00Z"
    }
  ]
}
```

Rules: anchors store the **UTC epoch second of the bar open**; when rendered on another interval the anchor maps to the
bar containing that instant (logical index), with fractional interpolation inside the bar and linear extrapolation beyond
the last bar using the bar spacing. Each tool type has a JSON-schema (pydantic model on the backend) for `props`.
Migrations: `schema_version` bump + a pure migration function `v1 → v2`, tested.

### 5.3 Layout document

`{schema_version, name, symbol, interval, chart_type, scale_mode, adjusted, indicators:[{instance_id, id, version,
params, style, pane, visible}], pane_stretch:[...], visible_range?, drawings_ref: symbol}`.

## 6. Time conventions

- **Storage**: bars stored with `ts` = UTC epoch seconds of the bar open; daily bars use the session date at 00:00 UTC
  as the key (`date` column) plus the symbol's exchange timezone (`America/New_York` for US) in the symbol metadata.
- **API → chart**: daily and above → business-day string `"YYYY-MM-DD"` (session date; week bars keyed by the first
  trading day of the week, month bars by the first trading day of the month). Intraday → UTC epoch seconds.
- **Sessions (R1b)**: every intraday bar belongs to a trading session identified by its session date, the same date as
  that session's daily bar: `date(wall + 24h - session_start)` when the symbol has `session_start` (CME futures
  `18:00`, ICE DXY `20:00`, forex `17:00`, all New York time), else the exchange-local calendar date
  (`app/data/sessions.py`). 4h bars are anchored to the session's first bar (US stocks 09:30/13:30; futures
  18/22/02/06/10/14). Intraday dividend adjustment uses the factor of the session's daily bar.
  `BarService` puts these session day numbers on intraday frames as the optional `BarFrame.session` column (R3c; kept
  by `take`/slicing, `None` for daily+ and synthetic frames); session-anchored indicators (VWAP) read it and return
  all-`NaN` without it.
- **Display**: Lightweight Charts has no time-zone support. `ChartEngine` converts intraday UTC timestamps to
  "wall-clock seconds" in the display TZ (`utc + offset(tz, utc)`, `chart/timeZone.ts`) before `setData`. The display
  TZ is `Asia/Jerusalem` (a setting arrives in R6); offsets come from `Intl.DateTimeFormat`, cached per UTC day and
  computed per bar on DST days, so the shift is exact. The crosshair reports a bar index, never a shifted time, so no
  reverse conversion is needed. Only the chart layer knows about this shift; the bottom-bar clock shows the same zone.
- `until` / `start` / `end` query params are ISO dates (`2026-11-20`), interpreted as **inclusive**. For intraday
  intervals they are session dates and select whole sessions.

## 7. Indicator verification harness

Treat every indicator like a DUT:

| Layer | What | Where | Tolerance |
|---|---|---|---|
| Directed tests | Hand-computed vectors (5–30 bars), edge cases: constant series, `n=1`, `n > len`, NaN in input, zero volume, flat high=low | `tests/unit/indicators/test_<id>.py` | exact or `1e-12` |
| Golden model | Independent scalar loop implementation of the Pine semantics (`tests/golden/models.py`), compared on all fixture symbols, **every bar** including warm-up NaN positions | `tests/golden/test_golden_<id>.py` | `rtol=1e-9, atol=1e-12` |
| Second reference | TA-Lib on the converged region (per-indicator documented offset) | `tests/golden/test_talib_<id>.py` | `rtol=1e-9` (looser only with a written reason) |
| Properties | hypothesis-generated OHLCV (valid by construction): bounds, monotonicity, constant-input, scale/shift equivariance (SMA(a·x+b)=a·SMA(x)+b), **prefix invariance (no lookahead)** | `tests/property/` | `1e-9` relative |
| Scoreboard | Golden runs write a CSV report (max abs/rel error per indicator×symbol) to `backend/.reports/` | CI artifact | — |
| Manual cross-check | 3 AAPL 1D dates per indicator vs TradingView values typed by the user | `tests/golden/tv_crosscheck.json` | display precision (2 decimals) |

A shared `check_no_lookahead(spec, bars, k)` helper asserts `compute(bars)[k] == compute(bars[:k+1])[k]` for random `k` —
used by R3 property tests and the R7 replay DoD.

## 8. Caching & rate-limit policy

- **Bar cache** (`data/bars.db`, SQLite, WAL): table `bars(symbol, interval_base, date_or_ts, open, high, low, close,
  adj_close, volume, dividend, split, source, fetched_at)`, PK `(symbol, interval_base, date_or_ts)`; table
  `coverage(symbol, interval_base, start, end, fetched_at)`. Only base intervals are stored (`1D`, `1h`); `1W`/`1M` are
  resampled on read (cheap, always consistent).
- **Incremental fetch**: compute missing ranges against `coverage`; fetch only those. Daily data refreshed if the last
  bar is older than the last completed session; the last 5 bars are always re-fetched on refresh (late corrections,
  dividends). Full re-fetch if a new split/dividend changes the adjustment factor history (detected via `adj_close/close`
  ratio change on overlapping bars).
- **Throttling**: per-provider token bucket (Yahoo: conservative 1 req/s, burst 3; Tiingo: 50/h; Twelve Data: 8/min) +
  exponential backoff with jitter on 429/5xx (base 2 s, max 60 s, 4 tries) + a circuit breaker (provider disabled for
  10 min after repeated 429s; next provider in `DATA_PROVIDERS` is tried).
- **Stale-while-error**: if every provider fails, serve cached data with `meta.stale=true` and a warning header.
- **Frontend**: TanStack Query `staleTime` 60 s for bars/quotes, `Infinity` for registry metadata.
- **Offline**: `OFFLINE=1` → only the `fixtures` provider (CSV snapshots in `backend/fixtures/daily/`) is registered.
- **Symbol universe**: `backend/config/universe.toml` (order = watchlist order; `group` = section).

## 9. Error handling

- Backend raises typed domain errors (`SymbolNotFound`, `IntervalNotSupported`, `ProviderRateLimited`,
  `ProviderUnavailable`, `DataValidationError`, `RevisionConflict`); one exception handler maps them to problem+json
  (`type`, `title`, `status`, `detail`, `instance`, plus `code`). Unexpected errors → 500 with a correlation id logged.
- Validation errors from pydantic → 422 problem+json.
- Data validation (R1): duplicates, `high < max(open, close)`, `low > min(open, close)`, negative volume, non-monotonic
  time → bar rejected and logged; date gaps beyond the exchange calendar reported in `meta.warnings`.
- Frontend: every query has loading / empty / error states; errors shown as non-blocking toasts with a retry action.

## 10. Security & safety

- Single-user local app, binds to `127.0.0.1` by default. No auth in Phase 1.
- API keys only via `.env` (never committed, never sent to the frontend, never logged).
- No broker integration, no order routing, no real money — the P5 agent is paper-only by construction (no broker
  adapter interface exists).

## 11. Extensibility hooks for Phases 2–5

| Phase | Hook already present in Phase 1 |
|---|---|
| P2 Learn pages | `IndicatorSpec.learn_slug`, `docs/indicators/<slug>.md` pages served by `GET /learn/{slug}`, the learn drawer and `POST /indicators/response` (L1), compute endpoint with arbitrary params |
| P3 Custom indicators | Registry accepts entries from a plugin loader; same `IndicatorSpec` + same golden harness |
| P4 Backtester | `BarService.get_bars(until=...)`, pure indicator functions over numpy arrays, `markers` output type, prefix-invariance tests |
| P5 Paper agent | Replay cursor semantics shared with the backtester clock; no broker interface by design |
