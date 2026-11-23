# ChartLab — Working Plan (next sessions)

> Written 2026-11-22 after R1b. This file is the **sequencing plan** for the coming sessions: what we do next, in
> which order, with which model and effort. The full per-round spec stays in [docs/ROADMAP.md](docs/ROADMAP.md); the
> live status stays in [HANDOFF.md](HANDOFF.md) (Hebrew). When a session finishes, tick its box here and in ROADMAP.
>
> Focus requested by the user: **moving averages (SMA, EMA and the generalised MA family) with their mathematics**,
> and **UX/UI quality**. The plan therefore splits R3 into three rounds, pulls a slice of Phase 2 (learn pages for the
> MA family) forward, and adds a dedicated UX round.

---

## 1. Where we are (done)

| Round | What it delivered | Evidence |
|---|---|---|
| Stage A | TradingView research, architecture, ADRs 0001–0007 | `docs/` |
| R0 | Monorepo, CI (ubuntu + windows), 9 quality gates, dark shell, scripts for PowerShell 5.1 + bash, desktop shortcut with self-update | CI green, verified on the user's Windows (SAC on) |
| R1a | Data layer: `DataProvider` protocol, Yahoo (default) + Tiingo (fallback) + fixtures, rate limiting (token bucket, backoff + jitter, circuit breaker), SQLite bar cache with tail refresh, validation, dividend adjustment, W/M resampling, `/api/symbols`, `/api/bars`, `/api/quotes`, live watchlist | 141 backend tests, 98 % coverage |
| R2a | `ChartEngine` over lightweight-charts v5: candles + volume, OHLC legend on the crosshair (rAF-throttled), D/W/M switcher, symbol from the watchlist, state in localStorage | first chart in 0.6 s for 3,362 bars |
| R1b | `1h` + session-anchored `4h`, Israel time on the chart (DST-exact), futures shown as `GC1!`/`SI1!`/`CL1!`, OpenAPI → generated TS types (ADR 0008), `make-fixtures.ps1` + universe-wide fixture tests | CI run #24 green; 89 frontend tests |

**Not yet verified on real data** (needs the user's machine, the cloud cannot reach Yahoo): the R1b demo, and
`make-fixtures.ps1`, which has never run on Windows.

---

## 2. Carried-over items

### 2.1 Waiting on the user (no Claude session needed)
- [ ] R1b demo: double-click the ChartLab icon (self-update), then AAPL / GC1! / SPX / GBPUSD on 1h and 4h vs TradingView (Jerusalem time zone).
- [ ] Run `.\scripts\make-fixtures.ps1` once. Real fixtures unblock golden tests on real data (R3a) and `OFFLINE=1` with the real universe.
- [ ] Answer the decisions in §7 (D1–D6).

### 2.2 Tech debt (scheduled below)
| # | Item | Scheduled in |
|---|---|---|
| T1 | ✅ `app = create_app()` at module level created `data/bars.db` on import → `uvicorn --factory` (done in R2b) | R2b (small) |
| T2 | 1h fixture window (2026-08-01 → 2026-10-30) leaves Yahoo's 730-day limit mid-2028 | calendar reminder, not a round |
| T3 | README screenshot is still the R0 shell | U1 |
| T4 | Watchlist Chg% column clips long prices | U1 |
| T5 | EMA seeding vs TradingView unverified against Pine | R3a: TA-Lib agrees at 1e-9 on all bars; TV cross-check template ready, awaiting the user's numbers |
| T6 | jsdom created 5× in Vitest (speed only) | U1 (optional) |

---

## 3. Review findings (2026-11-22)

### 3.1 UX/UI audit
Method: app on the test fixtures (`OFFLINE=1`), Playwright screenshots at 1280×800 and 375×812, scored with the
installed VectorLab UX skills (`ux-audit` and its domain skills: viewports, icon-buttons, loaders, empty-states, errors,
keyboard, colour-palette, typography, motion, reduced-motion). No `.ux-profile.md` exists, so catalog defaults apply
(utilitarian / minimal, WCAG 2.1 AA). Findings are planned, not fixed in this session.

| # | Severity | Finding | Evidence | Fix in |
|---|---|---|---|---|
| X1 | High | ✅ (R2b) **False active state**: range buttons (1Y highlighted) and `auto` / `ADJ` toggles look active but do nothing | screenshot 1280; HANDOFF known issue | R2b (wire them) |
| X2 | High | **Narrow windows break**: at 375 px the watchlist overlays the legend, range buttons stack vertically, document is 820 px wide. A half-screen Windows window (~960 px) is the realistic case | screenshot 375; `scrollWidth` 820 | U1 |
| X3 | Medium | ✅ (R2b: right-aligned tooltips; e2e asserts no overflow at 1280/960) **29 px horizontal overflow at 1280 px** (`scrollWidth` 1309), probably an off-screen tooltip | Playwright `scrollWidth` | R2b (quick) |
| X4 | Medium | ~25 placeholder controls (drawing tools, alert, replay, undo…) are `aria-disabled` with a "coming in Rx" tooltip (good), but look almost as strong as live controls | screenshot | U1 (dim to a clearly disabled style) |
| X5 | Medium | Indicator UX does not exist yet. Needs: searchable dialog with categories and `/` shortcut, legend rows (eye, gear, learn, remove), live settings panel, oscillator panes | — | R3a / R3c |
| X6 | Medium | ✅ (R2b: progress bar after 150 ms, skeleton after 1 s) Long loads (first 1h fetch, several seconds) show only a text overlay. Loaders skill: skeleton or progress beyond 1 s | `ChartArea.tsx` | R2b |
| X7 | Low | Watchlist shows `n/a` for a missing price while other columns use `—` | screenshot | U1 |
| X8 | Low | Up/down colours are red/green only; offer a colour-blind-safe pair (blue/orange) | tokens | R6 settings |
| ✓ | — | Tabular numbers in legend, watchlist and bottom bar; `prefers-reduced-motion` honoured; error and empty states for chart and watchlist; tooltips on icon buttons; TradingView attribution logo kept | code + screenshot | — |

UX rule for every UI round from now on: finish with the `ux-audit` skill (screenshots at 1280 and 960, plus 375 for
overflow), fix hard-gate failures in the same round, and list the rest in HANDOFF.

### 3.2 Engineering findings
| # | Finding | Plan |
|---|---|---|
| E1 | TA-Lib (second reference in the harness) is a **native C extension**; Smart App Control may block it on the user's machine | Optional test extra: runs in CI, skipped with a clear reason locally if the import fails (decision D2) |
| E2 | Several Pine semantics are unconfirmed: `ta.ema` seed, HMA's `length/2` rounding, ALMA `floor` flag, McGinley seed, SMMA seed | Each becomes a written assumption + a TV cross-check row (`tests/golden/tv_crosscheck.json`) |
| E3 | Rolling sums drift in float | One exact FIR kernel (`sliding_window_view(x, n) @ w`, O(N·n), fine for N=10k) for every finite-window MA; IIR filters as a scalar recursion (≈ms for 10k bars). No numba/scipy (native, SAC risk) |
| E4 | Property "min(window) ≤ MA ≤ max(window)" is **false** for lag-compensated MAs (negative weights: DEMA, TEMA, HMA, LSMA, ZLEMA, T3) | Property tests split by filter class (§5.4) |
| E5 | ✅ contract defined in ARCHITECTURE §3.2 (R2b). Lazy history loading (R2b) and indicator warm-up (R3a) interact: prepending bars must recompute indicators with enough lookback | Design the `lookback` contract in R2b, consume it in R3a |

---

## 4. Session sequence

Model and effort are recommendations for the session's model picker. Rule of thumb used here:
**Opus 5.5** for rounds that define architecture or need mathematical precision; **Sonnet 5.5** for rounds that
follow an established pattern; **Haiku 5.5** for chores (docs, a failing script line, a version bump). Effort:
`high` is the default for feature rounds; `medium` for well-scoped pattern work; `xhigh` only for the phase review;
`max` only if a round gets stuck on a hard bug.

| # | Session | Model · effort | Why this model | Size |
|---|---|---|---|---|
| S0 | User: R1b demo, `make-fixtures.ps1`, decisions §7 | — | — | 30 min |
| S1 | **R2b** — chart core completion | Sonnet 5.5 · high | UI wiring on an existing engine; Playwright setup is routine | L |
| S2 | **R3a** — indicator engine + core MAs (SMA, EMA, WMA, RMA) | **Opus 5.5 · high** | Defines registry, API, harness, panes and indicator UX that every later indicator reuses | L |
| S3 | **R3b** — generalised MA family + MA Cross / Ribbon / Envelope | **Opus 5.5 · high** | Pine semantics, seeding and per-class property tests need precision | L |
| S4 | **L1** — Learn v1 for the MA family (math + frequency response) | **Opus 5.5 · high** | Mathematical writing and an analysis endpoint that must agree with the formulas | M |
| S5 | **R3c** — bands & oscillators (BB, RSI, MACD, Stoch, ATR, OBV, VWAP, Vol SMA) | Sonnet 5.5 · high | Same pattern as R3a/b; panes already exist | L |
| S6 | **U1** — UX pass (responsive, disabled states, loaders, keyboard map) | Sonnet 5.5 · medium | Well-specified fixes from §3.1, verified with the ux-audit skill | M |
| S7 | R4 — drawing tools v1 | Opus 5.5 · high | Geometry, hit-testing, interaction state machine | L |
| S8 | R5 — market structure (gaps, pivots, levels) | Sonnet 5.5 · high | Pure functions + primitives, spec is precise | M |
| S9 | R6 — persistence, layouts, undo/redo, settings | Sonnet 5.5 · high (Opus 5.5 · high if undo/redo gets tangled) | Mostly CRUD + state; command pattern is the tricky part | L |
| S10 | R7 — Bar Replay | Opus 5.5 · high | No-lookahead guarantee across every indicator | M |
| S11 | Phase-1 review + Phase-2 plan | Opus 5.5 · xhigh | Whole-repo reasoning, re-verification of versions/limits | S |
| any | Chores: fixture-script errors, doc fixes, dependency bumps | Haiku 5.5 · low (Sonnet 5.5 · low if it touches logic) | Small, local | XS |

### S1 — R2b: chart core completion (Sonnet 5.5 · high) — ✅ done 2026-11-22
Goal: everything visible on the chart chrome actually works, and the e2e harness exists before indicators arrive.
- [x] Wire range buttons (1D 5D 1M 3M 6M YTD 1Y 5Y All) and scale toggles (`auto`, `log`, `%`, `ADJ`) — fixes X1
- [x] `SymbolSearchDialog` (type a letter on the chart, arrow keys, Enter, Esc; grouped by section)
- [x] Chart types: candles, bars, hollow candles, line, area (Heikin Ashi via backend transform = stretch)
- [x] Lazy history on scroll-left, viewport stable; define the `lookback` contract for indicators (E5)
- [x] Loading skeleton/progress for loads > 1 s (X6); fix the 1280 px overflow (X3); `uvicorn --factory` (T1)
- [x] Playwright setup + smoke test (OFFLINE=1): AAPL 1D → NVDA 1W → log → legend values match fixtures
- [x] End: ux-audit at 1280/960

### S2 — R3a: indicator engine + core moving averages (Opus 5.5 · high)
Goal: the pipeline from a Python function to a line on the chart, verified like a DUT; SMA/EMA/WMA/RMA shipped.
Backend
- [x] `app/indicators/core.py`: `fir(x, weights)` (exact sliding window), `ema_recursive(x, alpha, seed)`, `sma`, `ema`, `wma`, `rma`, `source(bars, name)` for close/open/high/low/hl2/hlc3/ohlc4/hlcc4
- [x] `app/indicators/registry.py` (`IndicatorSpec`, `ParamSpec`, `OutputSpec` as in ARCHITECTURE §5.1) + `ma.py` generic dispatcher (`MA_TYPES`) reused later by MA Cross, Ribbon, Envelope, BB basis, MACD
- [x] Indicators: `sma`, `ema`, `wma`, `smma` (RMA) with `source`, `length`, `offset`
- [x] API: `GET /api/indicators`, `POST /api/indicators/compute` (`lookback`, `until`), param validation from `ParamSpec`, problem+json; regenerate TS types
Verification harness (reused by every later indicator)
- [x] `tests/golden/models.py` scalar loops; hand vectors; golden on all bars `rtol=1e-9, atol=1e-12`
- [x] Analytic directed tests from §5: ramp response lag = $\bar k$ exactly, constant in → constant out, impulse response = $h_k$
- [x] hypothesis properties incl. `check_no_lookahead`, shift/scale equivariance, convex-hull bound (non-negative kernels)
- [x] TA-Lib on the converged region (if D2 = yes); scoreboard CSV in `backend/.reports/`
- [x] `tests/golden/tv_crosscheck.json` template + a short instruction for the user (3 AAPL 1D dates × each MA) — values still to be typed in by the user (closes T5 once filled)
Frontend
- [x] `IndicatorsDialog` (search, categories, `/` shortcut, keyboard navigation)
- [x] Legend row per instance: name + params + values under the crosshair; eye / gear / learn / remove
- [x] Settings panel generated from `ParamSpec`/`OutputSpec`, **applies live** (debounced), "Reset to defaults" (decision D6)
- [x] `ChartEngine`: line outputs on the price pane, multiple instances, colours from `OutputSpec`
- [x] Learn-page stubs `docs/indicators/{sma,ema,wma,smma}.md`
- [x] Playwright: add EMA 20, change to 50, hide, remove; ux-audit

### S3 — R3b: the generalised moving-average family (Opus 5.5 · high)
Goal: TradingView's MA set plus three classic adaptive/low-lag filters, all behind the same harness.
- [x] `dema`, `tema`, `hma`, `alma`, `lsma`, `vwma`, `swma`, `mcginley`
- [x] Educational extras (not TV built-ins; decision D4): `kama`, `t3`, `zlema`
- [x] Composite: `ma_cross` (two MA types, crossover **markers** via `createSeriesMarkers`), `ma_ribbon` (k MAs), `envelope` (MA ± p %)
- [x] Generic "Moving Average" indicator with a `type` enum = every MA above (one entry, used by the composites)
- [x] Property tests split by class (§5.4); TV cross-check rows for each
- [x] Learn-page stubs for each MA

### S4 — L1: Learn v1 for the MA family (Opus 5.5 · high) — ✅ done 2026-11-23
Goal: every MA has an in-app page with its mathematics and plots generated **by the same Python implementation**.
- [x] `POST /api/indicators/response` (POST: `params` is a free-form object, as in compute; direct DTFT at 121 log-spaced periods instead of an FFT) — runs the real indicator on synthetic inputs and returns impulse response, step response, ramp lag, magnitude $|H(e^{j\omega})|$ and group delay (FFT of the impulse response), measured $\bar k$ and NRF. For non-linear MAs (VWMA, KAMA, McGinley) it returns step/ramp only and says why.
- [x] Directed test: measured lag/NRF equal the closed forms in §5.3 (this doubles as a verification layer)
- [x] Learn drawer opened from the legend's book icon; Markdown + math rendering (decision D3)
- [x] SVG plots (dataviz skill; + group delay): impulse stems, step response, $|H|$ in dB vs period (log axis, periods 2–200 bars)
- [x] "Compare" mode: pick two MAs, overlay on the chart ("Add … to chart"), side-by-side lag/NRF table
- [x] Full learn pages for every MA in §5 (template in `docs/indicators/README.md` + a "Filter view" section)

### S5 — R3c: bands & oscillators (Sonnet 5.5 · high) — ✅ done 2026-11-23
BB, RSI, MACD, Stochastic, ATR, OBV, VWAP (intraday), Volume SMA, as specified in TRADINGVIEW_RESEARCH §5; oscillator
panes (create/dispose/resize), level lines, histogram colouring, fills; learn stubs; Playwright: add RSI + BB,
change BB length, remove RSI.

### S6 — U1: UX pass, split after the UX/UI review (2026-11-23)
The review (ux-audit + frontend-design, live-demo proposals page) and the user's answers: keep TradingView's colours and
the system font, quiet motion, support from 960 px (phones out of scope), write `.ux-profile.md`, do every proposal in
two rounds.

#### S6a — U1a: polish, motion, half screen (done 2026-11-23)
- [x] `.ux-profile.md`; 12 px minimum font; motion tokens; soft overlay shadows with a top highlight
- [x] Coming-soon buttons dimmed with a dot (X4); key caps in tooltips; verb-first tooltips; ChartTypeMenu focus ring
- [x] Sliding pill (interval, range); exit animations (`usePresence`); price flash in the watchlist and the legend close
- [x] Legend hover dims the other indicators; new indicator drawn thicker; undo toast for removals; short legend labels
- [x] `level_fill` in the registry (RSI, Stochastic); lighter volume; resizable pane separators; jump to the latest bar;
      `auto` follows the price axis (drag / double-click)
- [x] Below 1100 px the watchlist floats (X2 for the supported widths); `?` shortcuts dialog; first-run hint;
      `—` for missing values (X7); Chg% clipping (T4)
- [ ] README screenshot with real data (T3): needs the user's fixtures

#### S6b — U1b: watchlist, palette, theme (done 2026-11-23)
- [x] `/api/quotes` gains the last 20 closes, the day range and the 52-week range; watchlist sparkline column
- [x] Symbol card under the watchlist: big price, change, day and 52-week range bars, market status (trading hours by
      exchange and time zone, no holiday calendar; the tooltip says so)
- [x] `Ctrl+K` command palette (symbols, indicators, actions) next to the existing `type` and `/` shortcuts
- [x] Chart context menu: Reset view, Add indicator, Copy price
- [x] Light/dark toggle (dark default, remembered); the chart re-reads the tokens
- [x] Camera button: menu with Copy image (default, `Alt+S`) and Download PNG (`takeScreenshot`)
- [x] ux-audit at 1280 and 960

S7–S11 follow ROADMAP R4–R7 and the review unchanged.

---

## 5. The moving-average family — mathematics

Notation: bars $t = 0..N-1$, source $x_t$ (default `close`), length $n$. Output is `NaN` during warm-up; the value at
bar $t$ uses only bars $\le t$.

### 5.1 One framework for all of them
Every linear MA is a causal filter with unit DC gain:

$$ y_t = \sum_{k \ge 0} h_k\,x_{t-k}, \qquad \sum_k h_k = 1, \qquad H(z) = \sum_k h_k z^{-k}. $$

- **FIR** MAs (SMA, WMA, LSMA, ALMA, SWMA) have a finite kernel of length $n$; **IIR** MAs (EMA, RMA and their
  combinations) are recursions with exponentially decaying $h_k$.
- **Lag** = centre of mass of the kernel $\bar k = \sum_k k\,h_k$ (the group delay at $\omega = 0$). It is exact for
  trends: for $x_t = a + b\,t$, $\;y_t = a + b\,(t - \bar k)$, so the MA runs $\bar k$ bars behind any straight line.
- **Noise reduction factor** $\mathrm{NRF} = \sum_k h_k^2$: white noise with variance $\sigma^2$ leaves the filter
  with variance $\sigma^2\,\mathrm{NRF}$. Smaller = smoother.
- **Frequency view**: a cycle of period $P$ bars is $\omega = 2\pi/P$ rad/bar; $|H(e^{j\omega})|$ says how much of
  it survives. MAs are low-pass filters; the length trades lag against smoothness.
- **The core trade-off**: with non-negative weights, lag and NRF cannot both be small. "Zero-lag" MAs cancel the
  first moment by using **negative weights**, paying with a larger NRF, overshoot at turns, and outputs that can leave
  the window's [min, max] range.

### 5.2 Formulas
| MA | Formula | Kernel / recursion | Warm-up (first valid $t$) | TV default |
|---|---|---|---|---|
| **SMA** | $\frac1n\sum_{k=0}^{n-1} x_{t-k}$ | $h_k = \frac1n$; $\;|H| = \left|\frac{\sin(n\omega/2)}{n\sin(\omega/2)}\right|$, zeros at periods $n, n/2, \dots$ | $n-1$ | 9 |
| **WMA** | $\frac{\sum_{k=0}^{n-1}(n-k)\,x_{t-k}}{n(n+1)/2}$ | $h_k = \frac{2(n-k)}{n(n+1)}$ | $n-1$ | 9 |
| **EMA** | $E_t = \alpha x_t + (1-\alpha)E_{t-1}$, $\alpha=\frac{2}{n+1}$ | $h_k = \alpha(1-\alpha)^k$, $\;H(z)=\frac{\alpha}{1-(1-\alpha)z^{-1}}$; seed $E_{n-1}=\mathrm{SMA}_{n-1}$ | $n-1$ | 9 |
| **SMMA / RMA** (Wilder) | EMA with $\alpha = \frac1n$ | $\mathrm{RMA}_n \equiv \mathrm{EMA}_{2n-1}$; seed SMA | $n-1$ | 7 |
| **DEMA** | $2E - E(E)$ | first moment cancelled | $2(n-1)$ | 9 |
| **TEMA** | $3E - 3E(E) + E(E(E))$ | first moment cancelled | $3(n-1)$ | 9 |
| **HMA** (Hull) | $\mathrm{WMA}_s\!\left(2\,\mathrm{WMA}_m(x) - \mathrm{WMA}_n(x)\right)$, $m=\lfloor n/2\rfloor$, $s=\lfloor\sqrt n\rfloor$ | linear combination of WMAs | $n+s-2$ | 9 |
| **LSMA** (least squares) | end point of the OLS line over the window $= 3\,\mathrm{WMA}_n - 2\,\mathrm{SMA}_n$ | $h_k = \frac{4n-2-6k}{n(n+1)}$ | $n-1$ | 25, offset 0 |
| **ALMA** (Arnaud Legoux) | $\sum_{j=0}^{n-1} w_j x_{t-n+1+j} / \sum w_j$, $w_j = e^{-(j-m)^2/(2s^2)}$, $m = \text{offset}\,(n-1)$, $s = n/\sigma$ | Gaussian window shifted towards recent bars | $n-1$ | 9, 0.85, 6 |
| **SWMA** | $\frac{x_t + 2x_{t-1} + 2x_{t-2} + x_{t-3}}{6}$ | fixed 4-tap | 3 | — |
| **VWMA** | $\frac{\sum_{k<n} x_{t-k}V_{t-k}}{\sum_{k<n} V_{t-k}}$ | weights = volume (data-dependent, not LTI); $\sum V = 0 \Rightarrow$ `NaN` | $n-1$ | 20 |
| **McGinley Dynamic** | $M_t = M_{t-1} + \frac{x_t - M_{t-1}}{n\,(x_t/M_{t-1})^4}$ | adaptive (slows when price runs away above it, speeds up below); seed per Pine (verify, E2) | $n-1$ | 14 |
| **KAMA** (Kaufman) | $ER_t = \frac{|x_t - x_{t-n}|}{\sum_{i=0}^{n-1}|x_{t-i}-x_{t-i-1}|}$, $c_t = \left(ER_t(f-s)+s\right)^2$, $K_t = K_{t-1} + c_t(x_t - K_{t-1})$, $f=\frac{2}{F+1}$, $s=\frac{2}{S+1}$ | adaptive EMA: trend → fast, chop → slow | $n$ | 10, 2, 30 (Kaufman) |
| **T3** (Tillson) | $GD(x) = (1+v)E(x) - vE(E(x))$, $\;T3 = GD(GD(GD(x)))$ | six cascaded EMAs | $6(n-1)$ | 5, $v=0.7$ |
| **ZLEMA** (Ehlers) | $\mathrm{EMA}_n\!\left(x_t + (x_t - x_{t-d})\right)$, $d = \lfloor (n-1)/2 \rfloor$ | de-lagged input | $n-1+d$ | — |

TV defaults are as recalled from TradingView's settings dialogs and must be re-confirmed in the round that ships each
indicator (E2). KAMA, T3 and ZLEMA are not TradingView built-ins; they are included for the filter-theory comparison.

### 5.3 Closed forms (verified numerically, impulse response over 4,000 bars)
| MA | Lag $\bar k$ | NRF $\sum h_k^2$ | $n=9$: lag / NRF | $n=20$: lag / NRF | Negative weights |
|---|---|---|---|---|---|
| SMA | $\frac{n-1}{2}$ | $\frac1n$ | 4.00 / 0.111 | 9.50 / 0.050 | no |
| EMA | $\frac{1-\alpha}{\alpha} = \frac{n-1}{2}$ | $\frac{\alpha}{2-\alpha} = \frac1n$ | 4.00 / 0.111 | 9.50 / 0.050 | no |
| WMA | $\frac{n-1}{3}$ | $\frac{2(2n+1)}{3n(n+1)}$ | 2.67 / 0.141 | 6.33 / 0.065 | no |
| SMMA/RMA | $n-1$ | $\frac{1}{2n-1}$ | 8.00 / 0.059 | 19.0 / 0.026 | no |
| DEMA | 0 | numeric | 0 / 0.254 | 0 / 0.120 | yes |
| TEMA | 0 | numeric | 0 / 0.382 | 0 / 0.190 | yes |
| HMA | $\frac{s + 2m - n - 2}{3}$ | numeric | 0 / 0.442 | 0.67 / 0.206 | yes |
| LSMA | 0 | $\frac{2(2n-1)}{n(n+1)}$ | 0 / 0.378 | 0 / 0.186 | yes |
| ALMA (0.85, 6) | numeric | numeric | 1.56 / 0.233 | 3.80 / 0.110 | no |
| SWMA | 1.5 | $\frac{5}{18}$ | 1.50 / 0.278 | (fixed) | no |
| T3 ($v$) | $3(1-v)\frac{n-1}{2}$ | numeric | 3.60 / 0.105 | 8.55 / 0.050 | yes (small) |
| ZLEMA | $\frac{n-1}{2} - d$ | numeric | 0 / 0.374 | 0.50 / 0.169 | yes |

Two results worth a learn-page paragraph each:
1. **Why $\alpha = 2/(n+1)$**: it is the unique EMA with the same lag *and* the same noise reduction as an $n$-bar
   SMA. The two differ only in shape: the EMA has an infinite tail and no spectral zeros.
2. **The price of zero lag**: LSMA's NRF is $\frac{2(2n-1)}{n(n+1)} \approx \frac{4}{n}$, about 4× the SMA's. Removing
   lag costs four times the noise variance at the same length.

### 5.4 Verification plan per class (DUT view)
| Layer | All MAs | Non-negative kernels (SMA, EMA, WMA, RMA, ALMA, SWMA, VWMA) | Lag-compensated (DEMA, TEMA, HMA, LSMA, ZLEMA, T3) | Adaptive (KAMA, McGinley) |
|---|---|---|---|---|
| Hand vectors | ✓ (5–30 bars, exact) | | | ✓ incl. seed |
| Golden scalar loop, all bars, `rtol=1e-9, atol=1e-12` | ✓ | | | ✓ |
| Constant in → constant out | ✓ | | | ✓ |
| Ramp in → output $= x_{t-\bar k}$ after warm-up | linear MAs | ✓ | ✓ (lag 0 → $y=x$) | — |
| Impulse response $= h_k$ (closed form) | linear MAs | ✓ | ✓ | — |
| $\min_{\text{window}} \le y_t \le \max_{\text{window}}$ | | ✓ | ✗ (expected to fail; test asserts overshoot exists) | instead: $y_t$ lies between $y_{t-1}$ and $x_t$ (KAMA always, since $c_t \in (0,1]$; McGinley only when $n(x_t/M_{t-1})^4 \ge 1$) |
| Shift/scale equivariance $f(ax+b) = af(x)+b$ | linear MAs | ✓ | ✓ | KAMA ✓ ($a>0$); McGinley not shift-equivariant (ratio term) |
| No lookahead (`check_no_lookahead`) | ✓ | | | ✓ |
| TA-Lib converged region | SMA, EMA, WMA, DEMA, TEMA, KAMA, T3 | | | |
| TV cross-check (3 AAPL 1D dates) | ✓ every TV built-in | | | |

---

## 6. Skills used in each round
| Skill | Use |
|---|---|
| `vectorlab-ux-skills:ux-audit` (+ viewports, icon-buttons, keyboard, loaders, empty-states, errors, surfaces, forms, labels) | end of every UI round (S1, S2, S3, S4, S5, S6) |
| `frontend-design` | Indicators dialog, legend rows, settings panel, learn drawer (S2, S4) |
| `dataviz` | impulse / step / frequency-response plots and the comparison table (S4) |
| `run` | launching the app for screenshots and Playwright checks |
| `ponytail` → `code-review` (high, on the round's commits) → `simplify` (only if needed) | after **every** implementation round, in this order (CLAUDE.md §9, user's standing instruction 2026-11-23); not for review/planning sessions |

---

## 7. Decisions needed from the user
| # | Question | Recommendation |
|---|---|---|
| D1 | Order: R2b first (S1), or jump straight to indicators? | **R2b first**: it removes the false UI states, adds Playwright and the lazy-history contract that indicators need |
| D2 | TA-Lib as an optional test-only dependency (native; may be blocked by SAC locally, runs in CI)? | **Yes**, skipped locally with a clear reason if blocked |
| D3 | Math rendering for learn pages: KaTeX (+ `react-markdown`, `remark-math`, `rehype-katex`; pure JS, ~300 KB) or Temml (lighter, relies on the browser's MathML)? | **KaTeX**: most consistent rendering on Windows Chrome/Edge |
| D4 | Include KAMA, T3 and ZLEMA (not TradingView built-ins) for the filter comparison? | **Yes** |
| D5 | Source of the "Moving average crossover 9/21" from the screenshot (still open) | — |
| D6 | Indicator settings: live side panel (changes apply immediately, Reset button) or TradingView-style modal with OK/Cancel? | **Live side panel** (faster experimentation, surfaces skill) |
