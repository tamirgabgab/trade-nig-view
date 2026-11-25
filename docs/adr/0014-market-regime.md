# ADR 0014 — Market regime: Chow–Denning variance ratios with a wild bootstrap, DFA, and a background tint

- Status: Accepted (2026-11-25)

## Context
P3 round G1 (designed with the user): is a market trending, random or mean-reverting, with significance, and does it
change which rules work? The user chose a pane, a background tint and a tab; a calendar-year window; two pairs of rules
in the event study; MF-DFA in the tab.

## Decision
- **Variance ratio** (`variance_ratio`): Lo–MacKinlay's heteroskedasticity-robust $z^*(q)$ for q = 2, 4, 8, 16 over the
  last W returns, the pane showing the signed $\max_q |z^*|$ against the Chow–Denning 5 % value 2.49. Exact sliding
  windows (blocked), so the lookback contract holds.
- **DFA Hurst** (`hurst_dfa`): boxes counted back from the bar, a line fitted per box by a two-pass regression on
  sliding windows of the *global* cumulative returns. Within a window it differs from the window's own profile by a
  straight line, which each box's fit removes, so one profile serves every bar (checked against the scalar model).
- **Background tint** (`regime`): +1 / −1 / 0 from the variance-ratio test. A new plot style `background`, drawn by a
  `BackgroundLayer` series primitive (runs of equal values, half a bar beyond each end), so a future indicator can tint
  the chart without frontend changes.
- **The tab** (`GET /api/regime`): the window is a calendar year in bars; the Chow–Denning p-value by wild bootstrap
  (999 Rademacher sign flips of the demeaned returns: keeps volatility, removes order), with the Šidák asymptotic one
  beside it; Hurst against 199 shuffles; MF-DFA $H(q)$, q = −2…4, and its width; the regime × volatility (percentile
  ≥ 50) map; an event study of EMA 20/50 and upper-band breakouts (trend) and RSI < 30 and lower-band breaks
  (reversion), all long, by the regime of the signal bar, 10-bar forward returns, edge against the same regime's
  bars.
- **A `regimes` scenario** (AR(1) returns, φ = +0.25 then −0.25) to show and test both regimes.

## Consequences
- + Significance with the market's own volatility pattern; a joint test across q; the regime used for the event study
  is causal (the rolling indicator).
- − A year of returns detects only autocorrelations of about 0.15 and more; false alarms come in weeks-long stretches.
- − The event study is long-only and small-sample: a hint, read with its t-statistics.

## Alternatives
- Rescaled-range Hurst: biased by drifts; rejected for DFA.
- A per-bar bootstrap for the tint: too slow per request; the tint uses the asymptotic critical value, the tab the
  bootstrap.
- HMM regimes: need an optimiser and are harder to test; a candidate for later.
