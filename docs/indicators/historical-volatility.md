# Historical Volatility and the volatility cone (`hv`)

How much a market moves, measured from all four prices of each bar instead of the closes only, and where today's
[volatility](glossary:volatility) sits against its own history. Two indicators share this page: **HV** (the volatility
itself, in % a year) and **Vol %ile** (`hv_percentile`, its rank among the last year of values). The **Volatility**
tab adds the cone across horizons, a forecast, the chance that a calm spell ends, and where the risk comes from. It
says nothing about direction; it is a research tool, not investment advice.

## What it measures
The question it answers: "how large are the moves now, and is that unusual for this market?" A close-to-close
[standard deviation](glossary:standard-deviation) uses one number per bar; the high and the low say how far price
travelled inside the bar, so the same few weeks give a much sharper estimate. Five estimators are offered; they differ
in what they see (the [gap](glossary:gap) at the open, the drift) and in how noisy they are.

Move the length on the volatility regime: the line steps up when the wilder second half begins, at once with a short
window and over months with a long one.

```lab
{"kind": "param", "indicator": "hv", "vary": "length", "min": 5, "max": 120, "scenario": "volatility_regime"}
```

## Formula
Per bar, with logs of the four prices:

$$
o_t = \ln\frac{O_t}{C_{t-1}}, \qquad c_t = \ln\frac{C_t}{O_t}, \qquad r_t = \ln\frac{C_t}{C_{t-1}} = o_t + c_t, \qquad
\ell_t = \ln\frac{H_t}{L_t}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $o_t$ | the gap: open against the previous close | log return, often 0 on 24-hour markets |
| $c_t$ | the body: close against the open | log return |
| $r_t$ | the bar's [log return](glossary:log-return) | log return |
| $\ell_t$ | the log range of the bar | $\ge 0$, about 1–3 % on daily stocks |

The estimators of the per-bar variance over the last $n$ bars:

$$
\begin{aligned}
\text{Close:}\quad & \hat\sigma^2 = \tfrac1n \textstyle\sum (r - \bar r)^2 \\
\text{Parkinson:}\quad & \hat\sigma^2 = \tfrac1n \textstyle\sum \dfrac{\ell^2}{4\ln 2} \\
\text{Garman–Klass:}\quad & \hat\sigma^2 = \tfrac1n \textstyle\sum \Big(\tfrac12\ell^2 - (2\ln 2 - 1)\,c^2\Big) \\
\text{Rogers–Satchell:}\quad & \hat\sigma^2 = \tfrac1n \textstyle\sum \Big(\ln\tfrac{H}{C}\ln\tfrac{H}{O} + \ln\tfrac{L}{C}\ln\tfrac{L}{O}\Big) \\
\text{Yang–Zhang:}\quad & \hat\sigma^2 = s_o^2 + k\,s_c^2 + (1-k)\,\hat\sigma^2_{RS}, \qquad k = \frac{0.34}{1.34 + \frac{n+1}{n-1}}
\end{aligned}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $n$ | length | bars, 2–5000 (default 21, a month of daily bars) |
| $\bar r$ | mean return of the window | log return |
| $s_o^2,\ s_c^2$ | sample variances ($n - 1$) of the gaps and of the bodies | log return² |
| $\hat\sigma^2_{RS}$ | the Rogers–Satchell estimate of the window | log return² |
| $k$ | Yang–Zhang's weight, the one that minimises the estimator's variance | 0.08 ($n = 2$) to 0.34 |

The line is $\textcolor{#7E57C2}{HV_t} = 100\,\hat\sigma\sqrt{N_t}$ % a year (or $100\,\hat\sigma$ % a bar with
*Annualised* off), with $N_t$ the bars per year counted from the bars themselves: the number of bars that opened in
the calendar year up to $t$.

$$
N_t = \#\{\,s \le t : \tau_s > \tau_t - 365.25\ \text{days}\,\}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\tau_s$ | the open time of bar $s$ | UTC seconds |
| $N_t$ | bars per year | about 252 daily stocks, 52 weekly, 1,764 hourly stocks, 8,766 crypto hours |

Counting the bars instead of fixing 252 makes the same indicator right on every interval and every market (24/7 crypto,
6-hour sessions, holidays), and it uses only bars up to $t$. Before a year of history the bar rate so far is scaled to a
year.

**Vol %ile** ranks today's per-bar variance $v_t$ (same estimator and length) among the previous $m$ values, as Pine's
`ta.percentrank`:

$$
\textcolor{#7E57C2}{\mathrm{rank}_t} = \frac{100}{m}\,\#\{\,1 \le j \le m : v_{t-j} \le v_t\,\}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $m$ | lookback | bars (default 252, a year of daily bars) |
| $\mathrm{rank}_t$ | the share of the last $m$ values at or below today's | 0–100; below 10 = a squeeze |

## Defaults
| Param | Default | Why |
|---|---|---|
| Estimator | Yang–Zhang | sees the gaps and the drift, and is the least noisy of those that do |
| Length | 21 | a trading month of daily bars, the usual "HV 21" |
| Annualised | on | volatility is quoted in % a year (options, risk reports) |
| Lookback (Vol %ile) | 252 | a year of daily bars |

## Warm-up
First valid bar index: $n$ (close, Yang–Zhang: the first return needs a previous close) or $n - 1$ (Parkinson,
Garman–Klass, Rogers–Satchell). Vol %ile adds $m$ bars. The chart loads at least a year of history before the first
bar shown, so the annualisation is exact on daily bars.

## The Volatility tab
Open it from the right toolbar (the Volatility button) or the command palette. Everything is computed from the bars up
to the last one, or up to the [replay](glossary:replay) cursor.

- **The cone.** For a week, a month, a quarter, half a year and a year (turned into bars with $N$), the estimator over
  every window of that length in the history: its minimum, 10th, 25th, median, 75th, 90th percentile and maximum as
  bands, and today's value as a dot with an approximate 95 % interval. Short windows swing far more than long ones,
  hence the cone shape.
- **The forecast.** The HAR line: a regression of the next $h$ bars' variance on the recent bar variances (below).
  Shown only where the history holds at least 30 non-overlapping $h$-bar outcomes.
- **Squeeze.** Today's rank among the last year, and what followed the past squeezes.
- **Sources.** The share of the variance from the overnight gaps, and from the falling bars.
- **Estimators.** Which estimator forecast this symbol's volatility best.

```lab
{"kind": "volatility", "scenario": "accumulation"}
```

## How to read it
- **Level.** HV 30 % means a typical move of $30/\sqrt{252} = 1.9$ % a day, $30/\sqrt{12} = 8.7$ % a month (one
  standard deviation, if the moves were independent).
- **The cone.** A dot near the top band: this market rarely moves this much over that span, and volatility tends to
  come back down. Near the bottom band: unusually calm. A dot outside the interval of the forecast says the model
  expects a change.
- **The term structure.** Short horizons above long ones: a burst that the forecast expects to fade. Below: a calm
  spell inside a wilder history.
- **Vol %ile below 10.** A squeeze. The tab says how often such a calm month was followed by a month at least 1.5
  times wilder, against how often that happens after any bar. If the two intervals overlap there is no evidence.
- **Overnight share.** The fraction of the variance from the gaps. A stop cannot protect against a gap: the price
  opens beyond it. A large share means the realised loss of a stop is often bigger than its distance.
- **Downside share.** Above 50 % the squared moves come mostly from falling bars: in that window the left tail is the
  heavier one.

## Why it works
**More information per bar.** For a Brownian bar (constant volatility, no drift, no gap), the range has
$\mathbb{E}[\ell^2] = 4\ln 2\,\sigma^2$, which gives Parkinson. Garman and Klass combine the range and the body
optimally, Rogers and Satchell make the estimate exact under a drift, and Yang and Zhang add the gaps. The
variance of each estimate, against close-to-close, was measured on 40,000 simulated Brownian bars (78 steps each,
windows of 21, not overlapping):

| Estimator | $\hat\sigma/\sigma$, no gap | efficiency, no gap | $\hat\sigma/\sigma$, 20 % of the variance overnight | $\hat\sigma/\sigma$, drift 1 $\sigma$ a bar |
|---|---|---|---|---|
| Close | 0.96 | 1.0 | 0.97 | 0.97 |
| Parkinson | 0.92 | 5.3 | 0.83 | 1.10 |
| Garman–Klass | 0.90 | 9.1 | 0.80 | 0.96 |
| Rogers–Satchell | 0.89 | 6.9 | 0.80 | 0.88 |
| Yang–Zhang | 0.91 | 8.0 | 0.93 | 0.90 |

- **Efficiency** is the variance of close-to-close over the variance of the estimator. Five to nine times fewer bars
  give the same precision, so a 21-bar Yang–Zhang is about as steady as a 170-bar close-to-close.
- **Discrete trading** biases every range estimator down: the true high and low happen between the trades. With 78
  steps a bar, the ratio is 0.89–0.92. With 390 steps (one-minute bars) it is 0.95–0.96.
- **The gaps.** Parkinson, Garman–Klass and Rogers–Satchell miss them: 0.80–0.83 when a fifth of the variance is
  overnight. Yang–Zhang keeps 0.93.
- **A drift** inflates Parkinson (1.10) but not Rogers–Satchell.

That is why Yang–Zhang is the default. Close-to-close is the least biased, but the noisiest.

**The cone.** Short windows hold few bars, so their estimate scatters widely around the true level. The percentile
bands are wide at a week and narrow at a year. The approximate 95 % interval of today's value follows from the
estimator's per-bar terms $x_i$ (their mean is the estimate):

$$
\ln\hat v \pm 1.96\,\frac{s_x}{\sqrt h\ \hat v}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\hat v$ | today's variance estimate over $h$ bars | log return² |
| $s_x$ | standard deviation of the per-bar terms | log return² |
| $h$ | the horizon in bars | 2 to $N$ |

**The forecast (HAR).** Volatility clusters, so the recent past predicts it. For each horizon, a direct regression of
the log of the next $h$ bars' mean variance on the log mean of the bar variance $q = o^2 + \text{GK}$ over the last 1,
5 and 22 bars. For a longer horizon the last $h$ bars are added too:

$$
\ln y_{t,h} = c + b_1 \ln\bar q_{t,1} + b_5 \ln\bar q_{t,5} + b_{22} \ln\bar q_{t,22} + b_h \ln\bar q_{t,h}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $y_{t,h}$ | the estimator's mean per-bar variance over bars $t+1 \dots t+h$ | log return² |
| $\bar q_{t,m}$ | the mean of $q$ over the last $m$ bars | log return² |
| $b_1, b_5, b_{22}, b_h$ | the coefficients, by least squares on the past | — |

The 10–90 % band adds the residuals' quantiles. The tab checks it walk-forward:
- **The test:** 500 past forecasts, refitted every 20 bars with only the bars before each one.
- **Coverage:** how often the outcome landed inside the band. It should be near 80 %.
- **The score:** the QLIKE loss against the naive "the next $h$ bars will be like the last $h$".

$$
\text{QLIKE}(y, f) = \frac{y}{f} - \ln\frac{y}{f} - 1
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $f$ | a variance forecast | log return² |
| $y$ | the realised variance | log return² |
| QLIKE | 0 for a perfect forecast; it punishes too low forecasts more than too high ones | $\ge 0$ |

QLIKE ranks variance forecasts correctly even when the realised variance is a noisy proxy, such as squared returns
(Patton, 2011).

**The squeeze.** At every past bar $s$ the month's volatility is ranked among the previous year. A squeeze event is
a rank of 10 or less. It "expands" when the volatility of the next month is at least 1.5 times the one at $s$. Two
probabilities are compared:
- **P(expand | squeeze):** the share of squeeze events that expanded.
- **The base rate:** P(expand) after any bar.

The interval is a Wilson 95 % interval over the events at least a month apart. Neighbouring days of one calm spell
are one observation, not twenty. Measured on 2,000 synthetic bars (seeds 1–3):

| Scenario | P(expand \| squeeze) | 95 % interval | base rate | Median \|month move\| after a squeeze / after any bar |
|---|---|---|---|---|
| `accumulation` (calm and wild every 25 bars) | 49–67 % | from 30–48 % to 68–81 % | 6–9 % | 7.6–10.1 % / 4.5–5.3 % |
| `random_walk` (constant volatility) | 0–1 % | 0 % to 14–16 % | 0–0.2 % | 4.7–5.7 % / 4.3–5.2 % |
| `volatility_regime` (one jump) | 0–8 % | 0 % to 16–26 % | 1.6–1.8 % | 4.5–5.6 % / 4.3–5.2 % |

The squeeze predicts expansion only when volatility really cycles. On a constant or once-switching volatility, a calm
month is just noise, and the tab shows an interval that contains the base rate.

**Which estimator.** For the main horizon, each estimator over the last $h$ bars is used as the forecast of the next
$h$ bars' mean squared return, and scored by QLIKE on the last 500 bars. The HAR forecast is scored too. On daily
bars with 1h data the tab adds the realised variance: the sum of the squared hourly returns of each session, the
overnight one included. It is the most accurate estimate of a day's variance, and the *bias* column compares each
daily estimator with it.

## Combine with
- **ATR** ([ATR page](learn:atr)): the same information in price units for stops and sizes; HV is the same in % and
  comparable across assets.
- **Bollinger Bands** ([BB page](learn:bollinger-bands)): their width is a close-to-close volatility; a squeeze in
  Vol %ile and narrow bands usually agree, Vol %ile is the sharper of the two.
- **The forecast** ([Forecasting OHLC](learn:forecasting)): its fan width is the same clustering, applied to the
  next bars' candles.

## Differences vs TradingView
- **The estimator.** TradingView's built-in Historical Volatility is close-to-close only: the population standard
  deviation of the log returns, length 10. Its Pine source annualises with a fixed 365 calendar days on daily and
  intraday charts. Here, close with length 10 gives the same per-bar value; the annualisation uses the counted bars
  per year (about 252 for stocks). So TradingView's number is $\sqrt{365/252} = 1.20$ times this one on daily stock
  bars.
- **Vol %ile** is `ta.percentrank` of the per-bar variance, so it matches a Pine script that ranks the same estimator.

## Pitfalls
- **Annualising assumes independence.** $\sigma\sqrt N$ is right for a random walk. Trends (positive autocorrelation)
  make the real yearly range larger, mean reversion smaller.
- **Events.** Earnings and news are in the history as single huge bars; a 21-bar window holds one for a month and then
  drops it at once (a cliff in the line). Longer windows and the cone's percentiles soften it.
- **Short histories.** The percentiles of a horizon need many windows. A year horizon from three years of data has
  only three independent years, and the HAR forecast is hidden there. Trust the short horizons more.
- **Overlapping windows.** The cone's percentiles use every window, so neighbouring values are nearly equal. They
  describe the history well, but are not independent samples.
- **Intraday bars.** On 1h bars only the first bar of a session has a gap. Yang–Zhang still counts it; the per-bar
  volatility is per hour.

## Exercise
1. In the widget, compare `accumulation` with `random_walk`: where does the squeeze probability leave the base rate,
   and why does the HAR forecast beat the naive one by more on `accumulation`?
2. On a real stock, add HV twice (Yang–Zhang and close, both 21) and Vol %ile. Find the last time Vol %ile fell below
   10: was the next month wilder? Then read the same in the Volatility tab's squeeze line, which counts every such
   month in the history.

```lab
{"kind": "replay", "symbol": "SPY", "date": "2020-01-15",
 "steps": ["Add Historical Volatility (OHLC) and Volatility Percentile; open the Volatility tab.",
           "Note today's month rank and the HAR band for a month ahead.",
           "Step forward 30 bars with Shift+Right and watch the dot leave the cone."],
 "reveal": "In mid-January 2020 SPY was calm: the month sat in the bottom part of the cone and the HAR band was narrow. Six weeks later the month's volatility was far above the old maximum. A volatility model learns from the past, so it widens only after the first violent bars: it is right about uncertainty, never ahead of a shock."}
```
