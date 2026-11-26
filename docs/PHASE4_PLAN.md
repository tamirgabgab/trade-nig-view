# Phase 4 — Strategies and backtesting: the plan

> Written at Review 2 (2026-11-26). One round per session, as in Phases 1–3: a Hebrew plan and questions first, then
> the round, the full suite, the cleanup pipeline (CLAUDE.md §9) and a demo checklist. Every number the backtester
> reports is treated like an indicator: a golden model, directed cases, properties and a stated tolerance.
> **Paper only (CLAUDE.md §10):** nothing here places an order anywhere.

## Goal
Write a trading idea as rules, run it on a symbol's history with realistic fills and costs, and see honestly whether
it worked: trades on the chart, an equity curve against buy-and-hold, the standard metrics, and the tests that tell
skill from luck (out-of-sample, walk-forward, multiple-testing corrections). The same engine later runs on a
watchlist (screener, portfolio) and, in Phase 5, drives a paper agent.

## Trader profiles: the organising principle (user, 2026-11-26)
Every strategy, forecast model, default and report in Phase 4 belongs to one of **four trader profiles**, set by how
often the trader acts. The user picks a profile; the whole Strategy tab (intervals, horizons, costs, constraints,
evaluation windows, metrics) follows it. **The final models of Phase 4 are one honest, validated model set per
profile** (B7).

| Profile | Trades at most | Decision bars | Context bars | Typical hold | Forecast horizon | Overnight |
|---|---|---|---|---|---|---|
| **Day** | 10 a day | 5m (15m) | 1h, the day's open, the previous close | minutes to hours | the next 1–12 bars (≤ 1 hour), the rest of the session | none: flat at the close |
| **Swing** | 10 a week | 1h | 1D | hours to ~10 days | 1–10 daily bars | allowed |
| **Position** | 10 a month | 1D | 1W | days to weeks | 5–20 daily bars | allowed |
| **Long-term** | 12 a year | 1W (1M) | 1M | weeks to months | 1–12 months | allowed |

What a profile fixes (`TraderProfile` in the backend, one object per profile, tested):
- **The trade cap**, enforced by the engine per calendar period in the exchange time zone (a day, an ISO week, a
  month, a year): a signal past the cap is skipped and counted in the report, never silently dropped.
- **Intervals:** the decision interval and the context intervals (a higher interval's values reach a lower one only
  once its bar has closed: no lookahead across intervals).
- **Session rules:** the Day profile is flat at the session close and opens nothing in the last N minutes; the others
  may hold overnight and over weekends (gaps are part of their risk).
- **Default costs:** per-trade costs matter most for Day (spread, commission on every trade), much less for
  Long-term (where turnover and holding time dominate).
- **Forecast horizons and models:** the OHLC forecast (ADR 0010) and the HAR volatility forecast (ADR 0011) are
  refitted per profile on its decision interval with its horizons; features stay causal.
- **Evaluation windows:** walk-forward windows sized to the profile (Day: weeks of 5m bars; Swing: months of 1h;
  Position: years of 1D; Long-term: decades of 1W), and a minimum number of trades before any statistic is shown
  (e.g. 30), with a warning when the history cannot supply it.
- **Metrics in front:** Day: the distribution of daily P&L, the worst day, trades a day, hit rate and average
  win/loss; Swing and Position: Sharpe, max drawdown, profit factor, exposure; Long-term: CAGR, max drawdown and its
  length, the gap to buy-and-hold, turnover.

### Data per profile (the main constraint)
| Profile | Data needed | What Yahoo gives | Consequence |
|---|---|---|---|
| Day | 5m/15m, years | 2m … 90m: only the **last 60 days** (10m built from 5m); 1m: 30 days | not enough history for honest statistics out of the box |
| Swing | 1h, years | 1h: ~730 days | about 2 years: enough for a first evaluation, growing with the cache |
| Position | 1D, decades | full daily history | fine |
| Long-term | 1W/1M, decades | resampled from 1D | fine |

Intraday history (round **D0**, done 2026-11-26, ADR 0017): 1m, 2m, 5m, 10m, 15m, 30m and 90m bars, everything ever
downloaded stays in the cache so history **accumulates**, and a daily collector (a Windows scheduled task that runs
`scripts/collect-intraday.ps1` after the US close) keeps the 30/60-day windows from leaving gaps. After a year of
collecting, the Day profile has a year of minute bars. A paid data source (data only, never a broker) is the other
way, for the user to decide.

## What Phases 1–3 already give us
| Piece | Where | Used for |
|---|---|---|
| Causal bars up to a cursor | `BarService.get_bars(until=...)` | the backtest never sees the future |
| 35 causal indicators, one implementation | `indicators/`, `check_no_lookahead` | signals |
| Rule conditions on indicator outputs and prices (`lt`, `gt`, `crosses_above`, `crosses_below`, `ago`) | `analysis/conditions.py` | entry and exit rules |
| Event studies (forward returns after a signal vs every bar) | `analysis/events.py` | a quick "is there an edge" check before a full backtest |
| Forecast quantiles, HAR volatility, VaR/ES, regime label | `analysis/forecast.py`, `volatility.py`, `risk.py`, `regime.py` | filters and position sizing |
| Synthetic markets with known answers | `analysis/synthetic.py` | known-answer tests and tool calibration |
| Trade plan zones, markers output, background tint | `drawings/render.ts`, `chart/` | trades on the chart |
| Replay clock | `replayStore`, R7 | stepping through a backtest bar by bar |

## Conventions (decided now, open to the user's change in B0)
- **Decision at the close of bar t, fill at the open of bar t+1** (default). A same-bar-close fill is an option,
  marked "optimistic" in the results.
- **Stops and targets inside a bar:** the open first; if the bar gaps through the level, the fill is the open.
  If both the stop and the target are inside one bar, the **stop counts first** (conservative), unless the
  Brownian-bridge option (from the trade plan, ADR 0012) is chosen.
- **Prices:** dividend-adjusted by default (ADJ), so returns include dividends; unadjusted is an option.
- **Known biases, stated in the UI:** the universe is today's (survivorship), Yahoo's history can be revised, and
  1h history is about two years deep.

## Rounds

### D0 — Intraday data for the Day profile (M) — ✅ done 2026-11-26 (ADR 0017)
- 1m and 5m base intervals from Yahoo (30 and 60 days), 2m and 10m/15m/30m/90m resampled from them, cached and
  accumulated (older bars rescaled after a split); sessions and adjustment as for 1h; replay and indicators work on
  them unchanged.
- `scripts/collect-intraday.ps1` + `install-collector.ps1` (a weekday Windows scheduled task) refresh 1m, 5m and 1h
  for every watchlist symbol; the minutes menu and a line under the legend show how far back each interval goes.
- Tests: the 1m request chunks, resampling counts, totals and no lookahead for every minute interval, 5m blocks of an
  hour equal the 1h bars, a split keeps the older bars rescaled, the collector on fixtures, E2E on 15m bars.

### B0 — Trader profiles, strategy model and signals (M)
- **`TraderProfile`** (the four profiles above) in the backend and a profile picker at the top of the Strategy tab;
  the chart opens on the profile's decision interval.
- A **strategy document** (stored like layouts, `DocumentStore("strategies")`): name, **profile**, symbol(s), side
  (long, short or both), entry rules and exit rules as groups of conditions (AND within a group, OR between groups),
  filters (regime label, volatility percentile, forecast P(up) above a level), and exits (the opposite signal, a stop
  and a target in % or ATR multiples, a time stop in bars, a trailing stop).
- **Signal evaluation**, vectorised and causal: entry and exit booleans per bar from the same `conditions.py`.
- `POST /strategies/signals` (the booleans and the bars they fire on) and `GET/PUT/DELETE /strategies/{name}`.
- **Tests:** hand vectors; the property that signals are prefix-invariant (`check_no_lookahead` on the signal
  arrays); a strategy round-trips through storage; bad rules are a 422.
- **Output:** signals as markers on the chart (no trades yet).

### B1 — The backtest engine, one symbol (L)
- A **bar loop** in Python (25 years of daily bars is about 6,300 iterations; a year of 5m bars about 20,000: fast
  enough; vectorise later only if B4's sweeps need it): position state (flat, long, short), pending orders, fills at
  the next open, stop and target and trailing exits inside the bar by the conventions above, mark-to-market at each
  close; **the profile's trade cap and session rules** (the Day profile closes at the session's end).
- **Outputs:** the trade list (entry and exit time and price, reason, P&L in money and %, R multiple, MAE and MFE,
  bars held), the equity and drawdown curves, exposure, and buy-and-hold over the same bars as the benchmark.
- **Metrics:** total return, CAGR, annualised volatility, Sharpe, Sortino, max drawdown and its length, Calmar, win
  rate, profit factor, expectancy, average R, exposure, trade count. Formulas in the docstrings and on a learn page.
- `POST /backtest` (a strategy inline or by name, a date range or `until`).
- **Tests (the engine is the DUT):**
  - a scalar golden model of the same loop, written independently, equal to 1e-9 on every bar of every curve;
  - directed scenarios with hand-computed trades: a gap through the stop, stop and target in one bar, a trailing stop
    that ratchets, a time stop, a signal on the last bar (no fill);
  - properties: no lookahead (a backtest to `until` equals the prefix of the full one); equity = cash + position value
    on every bar; determinism; a strategy that never trades equals cash;
  - metrics checked against known series (a constant return, a single drawdown).

### B2 — The Strategy tab and trades on the chart (L)
- A **Strategy tab** in the side panel: a rule builder (rows of indicator, output, operator, value or another
  output, like the learn lab's "combine rules"), side, exits, Run; save, load and rename strategies.
- **Results:** the metrics table with buy-and-hold beside it; the equity curve (and buy-and-hold) and the drawdown
  under it (SVG, like the volatility cone); the trades table (a click scrolls the chart to the trade); a monthly
  returns heat map.
- **On the chart:** entry and exit markers and each trade as a box (green or red, like the trade plan's zones),
  toggled from the tab.
- **Tests:** Vitest for the pure parts (heat map bins, table formatting), E2E: build a rule, run, see trades on the
  chart and in the table, click one, save and reload.

### B3 — Costs, sizing and risk exits (M)
- **Costs:** a commission (per share, % of value or fixed per trade) and slippage (bps, or a fraction of the bar's
  range), applied on both sides; a borrow cost for shorts (annual %).
- **Position sizing:** fixed units, fixed money, % of equity, **fixed risk** (the % of equity lost at the stop, the
  trade plan's formula), and **volatility targeting** (size by the HAR volatility forecast, V1). Leverage capped at 1
  unless the user raises it.
- **Risk exits:** ATR stop and trailing stop, a VaR-based size cap (R2).
- **Tests:** hand vectors of every cost and sizing rule; properties: a higher cost never raises net P&L; the fixed-risk
  loss at the stop equals the chosen % (before slippage).

### B4 — Honest evaluation (L)
- **In-sample and out-of-sample split**, and **walk-forward optimisation**: optimise the parameters on a rolling
  window, trade the next window with them, stitch the out-of-sample trades (the forecast's walk-forward pattern).
- **Parameter sweep:** a grid over one or two parameters, the metric as a heat map, the chosen point and how flat its
  neighbourhood is (robustness over a single best cell).
- **Luck vs skill:** a bootstrap of trades and of returns (the distribution of CAGR and max drawdown); the
  **Deflated Sharpe Ratio** (Bailey and López de Prado) for the number of variants tried; the **probability of
  backtest overfitting** (combinatorially symmetric cross-validation). The count of variants tried is tracked
  automatically, so the correction is never forgotten.
- **Breakdowns:** results by regime (G1), by volatility percentile (V1), long vs short, by year.
- **Calibration of the tool itself:** on `random_walk` scenarios the Sharpe of a strategy after costs centres on
  zero, and the Deflated Sharpe rejects about 5 % of them; a test checks both.

### B5 — Watchlist runs, portfolio and screener (M)
- Run a strategy over a watchlist: a table per symbol (the metrics), sortable; an equal-weight portfolio of the
  symbols' strategies with its own equity curve and metrics (rebalanced at trades).
- **Screener:** which symbols' rules fire on the last bar, with filters (regime, volatility percentile, forecast
  P(up)); a click opens the chart with the strategy's markers.
- Cache-first and rate-limit aware: a watchlist run reads cached bars and refreshes at most the stale ones.

### B6 — Learn pages and the replay link (M)
(Also per profile: a learn page for each of the four trading styles: what the numbers mean for it, its typical
costs, and the history it needs.)
- Learn pages: **Backtesting honestly** (lookahead, survivorship, costs, overfitting, the Deflated Sharpe) and
  **Position sizing** (fixed risk, volatility targeting, the Kelly fraction and why to use less), with live widgets
  on synthetic markets.
- **Replay a backtest:** step through it bar by bar; trades appear as they happen, the equity curve grows with the
  cursor.
- **Practice mode:** the user trades by hand in replay (buy, sell, a stop) with the same accounting and metrics as
  the backtester; the results compare the user with the strategy and with buy-and-hold. This is the bridge to the
  Phase 5 paper agent.

### B7 — The final models: one validated set per profile (L)
- For each profile, a **model set**: the strategy families that suit it (e.g. Day: opening-range breakout, VWAP
  reversion, momentum bursts; Swing: pullbacks in a trend, RSI and Bollinger reversion by regime; Position: MA and
  breakout trends with volatility sizing; Long-term: trend and momentum on weekly/monthly bars, buy-and-hold with a
  regime or drawdown filter), plus forecast-driven rules (enter when the profile's forecast P(up) and the expected
  move beat the costs).
- Each family is tuned **walk-forward only**, under the profile's trade cap and costs, on several symbols; the
  results go to a **leaderboard per profile** ranked by the out-of-sample Deflated Sharpe, with the trade count, the
  worst drawdown and buy-and-hold beside it. A model that does not beat buy-and-hold after costs says so.
- The chosen model of each profile is saved as a named strategy ("Day — v1", …) the user can open, replay, practise
  against (B6) and, in Phase 5, hand to the paper agent. Re-running the leaderboard later (new data) gives v2.
- Tests: the leaderboard on synthetic markets ranks a planted edge first and finds nothing on a random walk.

## Order and size
D0 can run first or in parallel with B0–B2 (only the Day profile needs it). B0 → B1 → B2 is the core (a usable
backtester for the Swing, Position and Long-term profiles after three rounds). B3 and B4 make the numbers honest; B5
and B6 widen and teach; B7 delivers the final per-profile models. Sizes: D0 M, B0 M, B1 L, B2 L, B3 M, B4 L, B5 M,
B6 M, B7 L.

## Architecture notes
- New backend package `app/backtest/` (`strategy.py` models, `signals.py`, `engine.py`, `metrics.py`,
  `evaluation.py`), routers `api/strategies.py` and `api/backtest.py`; ADR 0018 (engine and fill conventions) at B1,
  ADR 0019 (evaluation and overfitting statistics) at B4.
- Frontend: `components/StrategyPanel` and friends, `api/backtest.ts`, a `strategyStore`; trades drawn by a
  `TradeLayer` primitive in `chart/` (the only place that imports the chart library).
- Performance targets: one daily backtest over 25 years under 200 ms on the server; a 100-point sweep under 5 s.

## Questions for the user (asked before B0)
1. **Authoring:** a rule builder only, or also strategies written in Python files (the plugin API deferred from
   Phase 3)?
2. **Side:** long only first, or long and short from B1?
3. **Fills:** next bar's open by default (recommended), or the signal bar's close?
4. **Profiles first:** which profile to build first (recommended: Position, then Swing and Long-term, Day last once the
   collector has gathered intraday history)?
5. **Day data:** the free daily collection from Yahoo (running since D0), or also a paid data feed?
6. **Results:** which metrics and views matter most to you (to put first in B2)?
7. **Portfolio (B5):** equal weight, or risk parity (inverse volatility)?
