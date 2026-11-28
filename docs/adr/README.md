# Architecture Decision Records

Format: Context → Decision → Consequences → Alternatives considered. One decision per file, numbered, never
rewritten after acceptance — supersede with a new ADR instead.

| # | Title | Status |
|---|---|---|
| [0001](0001-stack.md) | Technology stack | Accepted |
| [0002](0002-charting-library.md) | Charting library: Lightweight Charts v5 | Accepted |
| [0003](0003-indicators-in-backend.md) | Indicators computed in the Python backend | Accepted |
| [0004](0004-own-drawing-framework.md) | Own drawing framework on v5 primitives | Accepted |
| [0005](0005-bar-cache-format.md) | Bar cache in SQLite | Accepted |
| [0006](0006-default-data-provider.md) | yfinance default, Tiingo fallback, fixtures offline | Accepted |
| [0007](0007-styling.md) | Styling: CSS Modules + CSS custom properties | Accepted |
| [0008](0008-openapi-typescript.md) | TypeScript API types generated with openapi-typescript | Accepted |
| [0009](0009-learn-markdown-katex.md) | Learn pages: Markdown + KaTeX via react-markdown | Accepted |
| [0010](0010-ohlc-forecast.md) | OHLC forecast: direct multi-horizon regressions, empirical joint distribution | Accepted |
| [0011](0011-volatility-engine.md) | Volatility engine: OHLC estimators, counted bars per year and the volatility cone | Accepted |
| [0012](0012-trade-plan.md) | Trade plan: chances from normalised historical paths, with the exact Brownian bridge | Accepted |
| [0013](0013-value-at-risk.md) | VaR and ES: standardised real h-bar returns, four methods, backtests with simulated p-values | Accepted |
| [0014](0014-market-regime.md) | Market regime: Chow–Denning variance ratios with a wild bootstrap, DFA, and a background tint | Accepted |
| [0015](0015-appearance.md) | Appearance: theme presets, a transparent chart over a static backdrop | Accepted |
| [0016](0016-chart-tools.md) | Chart tools: compare, patterns, icons, eraser, zoom box, forecast pointer | Accepted |
| [0017](0017-minute-intervals.md) | Minute intervals: base intervals, resampled ones, accumulated history | Accepted |
| [0018](0018-macro-series.md) | Macro series from the Bank of Israel | Accepted |
| [0019](0019-planner-market-account.md) | The planner's market account and fill model | Accepted |
| [0020](0020-planner-mortgage-apartment.md) | The planner's mortgage and apartment | Accepted |
| [0021](0021-planner-scenarios.md) | The planner's scenarios: two options on the same money | Accepted |
| [0022](0022-planner-simulation.md) | The planner's simulation: worlds, block bootstrap and the risk metrics | Accepted |
| [0023](0023-planner-explain.md) | The planner's layer 3: what the answer depends on | Accepted |
| [0024](0024-planner-two-options.md) | The planner's two options, saved scenarios and CSV | Accepted |
| [0025](0025-planner-learn-pages.md) | The planner's learn pages, their notation and the rate stress test | Accepted |
| [0026](0026-planner-withdrawals.md) | The planner's withdrawals: one lot, a cost share, and a month as one event | Accepted |
| [0027](0027-planner-withdrawals-apartment.md) | An owned apartment in a withdrawal plan: cash only, through `run_home` | Accepted |
| [0028](0028-planner-withdrawals-many.md) | A withdrawal plan over many realizations: one engine, a batch at a time | Accepted |
| [0029](0029-planner-withdrawals-lots.md) | Known lots in a withdrawal plan, and two plans side by side | Accepted |
| [0030](0030-planner-withdrawal-learn-pages.md) | The learn pages of the withdrawals, saved scenarios with them, and the Withdraw tab's polish | Accepted |
| [0031](0031-synthetic-symbols.md) | Synthetic symbols: definitions, hourly generation, and a symbol like any other | Accepted |
| [0032](0032-synthetic-dwelling-symbols.md) | Dwelling prices as a synthetic symbol, and two kinds of definition | Accepted |
| [0033](0033-synthetic-parametric-symbols.md) | A parametric synthetic symbol: the user's statistics and distribution | Accepted |
| [0034](0034-synthetic-shuffled-copies.md) | A shuffled copy of a market symbol | Accepted |
| [0035](0035-open-completions.md) | The open completions of Phases H and J (K4) | Accepted |
| [0036](0036-strategy-model-and-signals.md) | Trader profiles, the strategy model and causal signals (B0) | Accepted |
| [0037](0037-backtest-engine.md) | The backtest engine: fills, exits, decisions and metrics (B1) | Accepted |
