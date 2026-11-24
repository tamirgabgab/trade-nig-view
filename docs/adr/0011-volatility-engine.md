# ADR 0011 — Volatility engine: OHLC estimators, counted bars per year and the volatility cone

- Status: Accepted (2026-11-24)

## Context
P3 round V1 (designed with the user): a volatility cone from OHLC estimators, as the shared volatility engine the
next tools build on (VaR/ES, the trade plan, the regime test). The user chose a side-panel tab plus two pane
indicators, % a year with a per-bar toggle, calendar horizons, and a squeeze at rank 10 with a 1.5× expansion; and
all the proposed generalisations (estimator choice by QLIKE, a forward HAR term structure, the conditional squeeze
with its event study, the overnight and downside shares, an interval for today's value, the 1h realised variance).

## Decision
- **One implementation.** The five estimators (close, Parkinson, Garman–Klass, Rogers–Satchell, Yang–Zhang) live in
  `app/indicators/hv.py`; the indicators `hv` and `hv_percentile` and `app/analysis/volatility.py` all use it.
- **Close-to-close is Pine's** population `ta.stdev` of the log returns (TradingView's HV, per bar); Yang–Zhang uses
  the paper's sample variances and minimum-variance weight.
- **Annualisation by counted bars.** $N_t$ = the bars that opened in the calendar year up to bar t (before a year: the
  rate so far). Causal, right on every interval and market (252 daily stocks, 52 weekly, ~1,764 hourly stocks,
  8,766 crypto hours) without knowing the interval. `hv`'s lookback is a year of daily bars plus the window, so the
  windowed values equal a full-history computation (the windows are exact, no recursion).
- **Calendar horizons** (week, month, quarter, half, year) turned into bars with $N$; spans under two bars dropped.
- **HAR forecast** per horizon: a direct regression of the log of the estimator's next-h mean per-bar term on the log
  mean of $q = o^2 + \text{GK}$ over 1, 5, 22 and (if longer) h bars; band from residual quantiles; only with at least
  30 non-overlapping training targets (shorter histories extrapolated one regime into the next and lost to the naive
  forecast by an order of magnitude at a year). Walk-forward check: 500 origins, refit every 20.
- **QLIKE** with the next h bars' mean squared return as the proxy (robust ranking, Patton 2011); the 1h realised
  variance joins as an estimator and as the bias reference only when enough days have 1h bars (else the daily table).
- **Squeeze**: rank among the previous year (as `hv_percentile`), expansion = next-h volatility ≥ factor × today's;
  Wilson interval over events at least h bars apart (overlapping ones are one observation).
- **No cache.** A response takes 0.1–0.6 s (24,000 bars: 0.6 s after reusing each refit's quantiles).

## Consequences
- + The chart line, the tab and future tools share one estimator and one bar count.
- + Every number is checkable: golden scalar loops, TA-Lib STDDEV, hand vectors, properties, calibrated coverage on
  a random walk, the squeeze edge only where volatility cycles.
- − Range estimators are biased low by discrete trading (0.89–0.92 with 78 steps a bar); documented, not corrected.
- − Long-horizon forecasts need long histories (year: about 7,600 daily bars).

## Alternatives
- Fixed 252 / 365 annualisation: wrong on other intervals and markets.
- GARCH: needs an optimiser (scipy) and is not better than HAR at these horizons; rejected for now.
- Bootstrap intervals for today's value: the per-bar-term interval is cheap and adequate.
