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

### B0 — Strategy model and signals (M)
- A **strategy document** (stored like layouts, `DocumentStore("strategies")`): name, symbol(s), interval, side
  (long, short or both), entry rules and exit rules as groups of conditions (AND within a group, OR between groups),
  filters (regime label, volatility percentile, forecast P(up) above a level), and exits (the opposite signal, a stop
  and a target in % or ATR multiples, a time stop in bars, a trailing stop).
- **Signal evaluation**, vectorised and causal: entry and exit booleans per bar from the same `conditions.py`.
- `POST /strategies/signals` (the booleans and the bars they fire on) and `GET/PUT/DELETE /strategies/{name}`.
- **Tests:** hand vectors; the property that signals are prefix-invariant (`check_no_lookahead` on the signal
  arrays); a strategy round-trips through storage; bad rules are a 422.
- **Output:** signals as markers on the chart (no trades yet).

### B1 — The backtest engine, one symbol (L)
- A **bar loop** in Python (25 years of daily bars is about 6,300 iterations: fast enough; vectorise later only if
  B4's sweeps need it): position state (flat, long, short), pending orders, fills at the next open, stop and target
  and trailing exits inside the bar by the conventions above, mark-to-market at each close.
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
- Learn pages: **Backtesting honestly** (lookahead, survivorship, costs, overfitting, the Deflated Sharpe) and
  **Position sizing** (fixed risk, volatility targeting, the Kelly fraction and why to use less), with live widgets
  on synthetic markets.
- **Replay a backtest:** step through it bar by bar; trades appear as they happen, the equity curve grows with the
  cursor.
- **Practice mode:** the user trades by hand in replay (buy, sell, a stop) with the same accounting and metrics as
  the backtester; the results compare the user with the strategy and with buy-and-hold. This is the bridge to the
  Phase 5 paper agent.

## Order and size
B0 → B1 → B2 is the core (a usable backtester after three rounds). B3 and B4 make the numbers honest; B5 and B6
widen and teach. Sizes: B0 M, B1 L, B2 L, B3 M, B4 L, B5 M, B6 M.

## Architecture notes
- New backend package `app/backtest/` (`strategy.py` models, `signals.py`, `engine.py`, `metrics.py`,
  `evaluation.py`), routers `api/strategies.py` and `api/backtest.py`; ADR 0017 (engine and fill conventions) at B1,
  ADR 0018 (evaluation and overfitting statistics) at B4.
- Frontend: `components/StrategyPanel` and friends, `api/backtest.ts`, a `strategyStore`; trades drawn by a
  `TradeLayer` primitive in `chart/` (the only place that imports the chart library).
- Performance targets: one daily backtest over 25 years under 200 ms on the server; a 100-point sweep under 5 s.

## Questions for the user (asked before B0)
1. **Authoring:** a rule builder only, or also strategies written in Python files (the plugin API deferred from
   Phase 3)?
2. **Side:** long only first, or long and short from B1?
3. **Fills:** next bar's open by default (recommended), or the signal bar's close?
4. **Intervals:** daily first, or 1h and 4h from the start?
5. **Results:** which metrics and views matter most to you (to put first in B2)?
6. **Portfolio (B5):** equal weight, or risk parity (inverse volatility)?
