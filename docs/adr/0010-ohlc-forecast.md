# ADR 0010 — OHLC forecast: direct multi-horizon regressions with an empirical joint distribution

- Status: Accepted (2026-11-24)

## Context
P3 (custom tools designed with the user): a forecast of the next k bars' open, high, low and close as probabilities,
by linear regression on past OHLC, robust across periods. The user chose models A (OLS) and C (ridge + HAR volatility),
direct multi-step forecasts, automatic out-of-sample tuning and OHLC-only inputs.

## Decision
- **Targets** in log ratios against the last close, with the wicks measured from the body
  (`ln(H/max(O,C))`, `ln(min(O,C)/L)`, both ≥ 0): any combination of the four rebuilds a valid candle.
- **Direct** forecasts: one regression per horizon h (no iterated error compounding; each h scored on its own).
- **Model C**: a HAR regression of the horizon's log range gives the scale; ridge (closed form, standardised features,
  unpenalised intercept) on the scaled targets gives the location. **Model A**: OLS (`lstsq`). **Naive**: the window's
  unconditional distribution, the benchmark every score is compared with.
- **Distribution**: all training residual rows (four targets together, so their dependence is kept) added to the
  location; order-statistic quantiles (`inverted_cdf`), which commute with the monotone maps involved, so the
  walk-forward quantiles are computed without building scenarios. Deterministic: no random sampling.
- **Validation and tuning**: walk-forward over the last 500 bars with a refit every 20, data up to each refit origin
  only. Pinball loss at 2.5–97.5 % (tuning criterion), coverage of the 50/80/95 % close intervals, out-of-sample R²
  against a zero-mean walk, hit rate. Tuning grid: window {250, 500, 1000, all} × ridge {1, 10, 100, 1000} × lags
  {1, 3, 5}, at h = 1.
- Backend only (numpy), `GET /api/forecast`, cached per last bar; the chart and the Forecast tab follow in F2.

## Consequences
- + Every number is checkable: golden OLS/ridge, no-lookahead fit test, nominal coverage on a random walk, C beating
  the naive benchmark when volatility clusters.
- + No new dependency (no scipy/statsmodels).
- − The residual distribution is assumed stable within the window (no conditional skew beyond the scale).
- − Auto-tuning costs about a second per symbol and interval (cached).

## Alternatives
- Iterated one-step forecasts: compounding errors and simulated uncertainty. Rejected by the user.
- Gaussian intervals: too thin in the tails. Kept only implicitly (the naive and A residuals are empirical too).
- Linear quantile regression (option D): needs an LP solver and crossing fixes; possible later.
