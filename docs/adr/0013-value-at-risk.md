# ADR 0013 — VaR and ES: standardised real h-bar returns, four methods, backtests with simulated p-values

- Status: Accepted (2026-11-25)

## Context
P3 round R2 (designed with the user): Value at Risk and Expected Shortfall at 90, 95 and 99 %, for the next bar, a
week and a month, for both tails, as a Risk tab, chart bands and breach markers, with backtests.

## Decision
- **Standardised real returns.** The h-bar log returns divided by $\sigma_t\sqrt h$ (Yang–Zhang over a month at t,
  the V1 engine, now `volatility.unit_volatility` shared with the trade plan). The distribution is measured on the real
  h-bar returns, so $\sqrt h$ is only a unit; the quantile is scaled back by today's $\sigma_T\sqrt h$ and turned into
  a price fall (long) or rise (short).
- **Four methods on one fitted sample** (sorted once, moments once, the GPD once): normal, Cornish–Fisher, FHS, and
  EVT with a generalised Pareto tail over the 90th percentile fitted by probability-weighted moments (closed form,
  no optimiser).
- **Backtests** of the 1-bar VaR over the last 1,000 bars, refitted every 20 on the past only: Kupiec, Christoffersen
  (χ²₁ p-values via erfc), Acerbi–Székely Z2 with its p-value from 500 seeded simulations of each method's own
  distribution. A vectorised normal quantile (Acklam, error < 1e-8) and a sorted-sample quantile keep a report at
  about 0.5 s (from 5.5 s).
- **Chart.** `var_bands`: the FHS 1-bar bands over the last W standardised returns, drawn on the bar they forecast (a
  plot offset of one), with ±1 breach markers; exact windows, so the lookback contract holds.
- **Replay.** `origin` like the volatility cone; the tab keeps the previous result on a step forward only
  (`keepsPrevious`, shared).

## Consequences
- + The methods are compared on the same history and scored out of sample: one shock breaks Cornish–Fisher (no 99 %
  breach at all), calm and wild phases break the normal ES, FHS and EVT pass both.
- − The overlapping week and month returns hold far fewer independent observations than they number.
- − EVT's threshold is fixed at the 90th percentile; the 90 % level therefore equals the threshold.

## Alternatives
- √h scaling of the 1-bar VaR: wrong with fat tails and autocorrelation; rejected.
- GPD by maximum likelihood: needs an optimiser (scipy); PWM is closed form and adequate for ξ < 0.5.
- Tabulated Z2 critical values: depend on the tail; simulation under each model is exact for it.
