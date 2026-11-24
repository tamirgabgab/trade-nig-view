# Forecasting OHLC

ChartLab's forecast gives the next k bars of a chart as probabilities: where each bar's open, high, low and close are
likely to fall, with 50, 80 and 95 % intervals, the chance that the close is higher than today's, and how well that
forecast has done out of sample. Turn it on in **Structure → Forecast (next bars)**; the **Forecast** tab in the side
panel holds its settings and numbers. It is a research tool built from past bars only, not investment advice.

## What it forecasts

A bar ahead, $t+h$, is described by four [log returns](glossary:log-return) against the last close $C_t$. Any
combination of the four rebuilds a valid candle ($L \le O, C \le H$), so the forecast is always a candle.

$$
g_h = \ln\frac{O_{t+h}}{C_t}, \qquad
\textcolor{#2962FF}{r_h} = \ln\frac{C_{t+h}}{C_t}, \qquad
u_h = \ln\frac{H_{t+h}}{\max(O_{t+h}, C_{t+h})}, \qquad
d_h = \ln\frac{\min(O_{t+h}, C_{t+h})}{L_{t+h}}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $t$ | the bar the forecast is made at (the last one, or the replay origin) | bar index |
| $h$ | bars ahead | 1 to 20 |
| $O, H, L, C$ | open, high, low, close of a bar | price |
| $g_h$ | the opening gap of bar $t+h$ against $C_t$ | log return, about $\pm$ a few % |
| $\textcolor{#2962FF}{r_h}$ | the close's return over $h$ bars | log return |
| $u_h,\ d_h$ | the upper and lower wick, from the body | $\ge 0$ |

The inputs, all from bars up to $t$: the same four ratios for each of the last $p$ bars (so the close is forecast
from the past of the open, high and low too), and the bar's log range $\ell = \ln\ln(H/L)$ averaged over 1, 5 and 22
bars.

## Two models and a benchmark

**A — OLS.** For each horizon and each target, a linear regression on the inputs over a training window of $N$
bars:

$$
y = \beta_0 + \beta^\top x + \varepsilon
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $y$ | one target ($g$, $r$, $u$ or $d$) at horizon $h$ | log return |
| $x$ | the inputs at the forecast bar | log returns and log ranges |
| $\beta_0,\ \beta$ | the intercept and the coefficients, by least squares | — |
| $\varepsilon$ | what the regression does not explain | log return |

**C — Ridge + HAR.** [Volatility](glossary:volatility) is far more predictable than direction, so model C first
forecasts the size of the moves with a HAR regression of the log range,

$$
\ln \bar R_{t,h} = c + b_1\,\ell_t + b_5\,\bar\ell_{t,5} + b_{22}\,\bar\ell_{t,22},
\qquad
\hat s_{t,h} = e^{\widehat{\ln \bar R}_{t,h}}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\bar R_{t,h}$ | the mean range $\ln(H/L)$ of bars $t+1 \dots t+h$ | log, about 1–3 % on daily bars |
| $\ell_t,\ \bar\ell_{t,5},\ \bar\ell_{t,22}$ | the log range of the last bar, and its mean over 5 and 22 bars | log of a log |
| $\hat s_{t,h}$ | the forecast scale | like $\bar R$ |

then divides the targets by $\hat s$ and fits them by ridge regression, which shrinks the coefficients towards zero:

$$
\hat\beta = (X^\top X + \alpha I)^{-1} X^\top z, \qquad z = y / \hat s
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $X$ | the inputs of the training bars, standardised | — |
| $z$ | the scaled targets | about $\pm$ 1 |
| $\alpha$ | the ridge penalty: larger = coefficients closer to 0 | 1 to 1000 |

The shrinkage matters because the signal in direction is tiny: an unpenalised fit mostly learns noise
([overfitting](glossary:overfitting)).

**Naive.** No inputs at all: the window's own distribution of the targets. Every score is measured against it; a
model that cannot beat the naive one has learned nothing useful.

**The distribution.** Each training bar leaves a residual row (all four targets together). Adding every row to the
forecast (model C: in scaled units, times $\hat s$) gives as many scenario candles; their quantiles are the bands, and
the share of scenarios with $r_h > 0$ is P(up). Using whole rows keeps the dependence between the targets (a big gap
tends to come with long wicks), and using the residuals themselves keeps fat tails and skew that a normal curve would
miss.

## Reading the forecast

- **The fan** on the chart is the close's 50, 80 and 95 % intervals for each bar ahead; it widens with $h$, roughly
  like $\sqrt h$ for a [random walk](glossary:random-walk).
- **The candles** are the median bar; the dashed whiskers reach the 80 % high and low.
- **P(up)** near 50 % is the normal, honest answer: past prices say very little about the direction.
- **The width** is where the information is. After a calm stretch the fan narrows, after violent bars it widens: that
  is the HAR scale at work, and it is what a stop distance or a position size can use (see the
  [ATR page](learn:atr)).

## Is it any good? The validation

The Forecast tab shows a **walk-forward** test: the model is refitted every 20 bars with only the bars before each
forecast, and 500 forecasts are scored against what happened. Nothing after a forecast's own date is used
([lookahead](glossary:lookahead) is impossible by construction).

$$
\text{pinball}_\tau(y, q) = \max\bigl(\tau (y - q),\ (\tau - 1)(y - q)\bigr)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\tau$ | a quantile level | 0.025 to 0.975 |
| $q$ | the forecast quantile at level $\tau$ | log return |
| $y$ | what happened | log return |

- **vs naive:** the mean pinball loss over all levels and targets, in % of the naive model's (negative = better).
- **In 50/80/95:** how often the close landed inside each interval. A well calibrated forecast reads about 50 / 80 /
  95; less means the bands are too narrow.
- **R²:** the out-of-sample $R^2$ of the return against a zero-mean walk. Around 0 (often slightly negative) is
  expected.
- **Hit:** the share of right directions among the forecasts that pick one.

**Auto-tune** picks the window (250, 500, 1000 bars or all), the ridge penalty and the number of past bars by the same
loss, on the 500 forecasts **before** the validated ones, so the scores you see are out of sample for the tuning
too.

## Try it

A random stock or any symbol: move the scenario, the number of bars ahead and the model. On `random_walk` model C
should match the naive one (no edge) with nominal coverage; on `accumulation`, whose calm and wild phases alternate
every 25 bars, C should beat it, more at 5 bars ahead than at 1.

```lab
{"kind": "forecast", "scenario": "accumulation", "k": 5, "model": "c"}
```

Measured with seed 1 (2000 bars, 500 forecasts out of sample), loss against the naive model:

| Scenario | A, 1 bar | C, 1 bar | A, 5 bars | C, 5 bars | C coverage 50/80/95 |
|---|---|---|---|---|---|
| `random_walk` | +0.6 % | +0.3 % | +1.2 % | +0.1 % | 53 / 82 / 96 |
| `accumulation` | −0.1 % | −1.0 % | +1.2 % | 0.0 % | 54 / 81 / 96 |
| `volatility_regime` | +1.0 % | +0.1 % | +0.8 % | −0.5 % | 53 / 80 / 95 |

Over seeds 1–3, C on `accumulation` is 1.0–1.2 % better than naive at 1 bar and 0–3.7 % at 5 bars; A never beats it
by more than 1.1 %. Gains of a few percent are what an honest volatility model earns on these data; a claim of much
more should make you suspicious. On real stocks, whose volatility clusters strongly, C's advantage is usually larger
(a synthetic walk whose volatility swings slowly gives about 10 %, `backend/tests/unit/analysis/test_forecast.py`).

## Pitfalls

- **Direction.** P(up) drifts a few points around 50 %. That is not a signal; the hit rate in the validation says so.
- **The window.** A long window averages different regimes; a short one is noisy. Auto-tune chooses on past data,
  but a regime that never happened in the window cannot be learned.
- **Gaps and events.** Earnings, splits and news are not in OHLC. The residual rows include past shocks, so the 95 %
  band allows for them, but not for one larger than any in the window.
- **Many settings, one sample.** Trying many models and keeping the best one is
  [multiple testing](learn:combinations#overfitting-and-multiple-testing); the validation guards against it only if
  you do not keep tuning by hand on the same bars.

## Exercise

1. In the widget, switch the scenario between `random_walk` and `accumulation`: compare "vs naive" for A and C at 1
   and at 5 bars ahead. Why does A lose to the naive model on a random walk?
2. On a real chart, replay a crash and watch the fan: does it widen after the first violent bars, and do the next
   bars stay inside the 95 % band?

```lab
{"kind": "replay", "symbol": "SPY", "date": "2020-02-19",
 "steps": ["Open Structure and switch on Forecast (next bars); open the Forecast tab.",
           "Note the 80 % range of the close for 5 bars ahead: the forecast is frozen at the start bar.",
           "Step forward 5 bars with Shift+Right and see where the closes landed.",
           "Press Forecast from here, then step 5 more bars; compare the new fan's width with the first one."],
 "reveal": "The first fan was made in a calm market, so it is narrow and the crash runs through it: a model built on past volatility needs a few violent bars before it widens. From inside the crash the fan is several times wider. The forecast is right about uncertainty after the fact, never ahead of a shock."}
```
