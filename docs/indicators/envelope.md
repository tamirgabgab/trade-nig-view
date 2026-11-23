# Envelope (`envelope`)

A moving average (the basis) with two bands a fixed percentage above and below it. Use it to mark how far price has
stretched from its trend in relative terms; the bands do not adapt to volatility.

## What it measures
How far price is from its trend in percent. A close outside a band is a move larger than $p$ % from the average: "is
price unusually far from where it has been lately?", with "unusually" fixed in advance as $p$ %.

Move the percent on a mean-reverting series: at 10 % (the default) the bands are far outside every swing, near 2–3 %
price touches them at the extremes of each swing.

```lab
{"kind": "param", "indicator": "envelope", "vary": "percent", "min": 1, "max": 15, "scenario": "range"}
```

## Formula

$$
\textcolor{#FF6D00}{B_t} = \mathrm{MA}^{\text{type}}_n(x)_t, \qquad \textcolor{#2962FF}{U_t} = \textcolor{#FF6D00}{B_t}\left(1 + \frac{p}{100}\right), \qquad \textcolor{#2962FF}{L_t} = \textcolor{#FF6D00}{B_t}\left(1 - \frac{p}{100}\right)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#FF6D00}{B_t}$ | the basis: an MA of the chosen type (SMA by default) | price |
| $\textcolor{#2962FF}{U_t}$, $\textcolor{#2962FF}{L_t}$ | the upper and lower bands | price |
| $x$ | the source (close by default) | price |
| $n$ | the basis length | bars, default 20 |
| $p$ | the band distance | percent, default 10 |

## Kernel, lag and noise

Each band is the basis scaled by a constant, so for a linear basis with kernel $h_k$ the bands are linear filters
with kernels $(1 \pm p/100)\,h_k$:

- **DC gain** $1 \pm p/100$ (1.1 and 0.9 at the default): on a flat price the upper band sits 10 % above it.
- **Lag**: scaling a kernel does not move its centre of mass, so all three lines have the basis's lag
  $\bar k = \sum_k k\,h_k / \sum_k h_k$ (9.5 bars for SMA 20) and the same group delay at every period.
- **NRF**: $(1 \pm p/100)^2 \sum_k h_k^2$ (0.0605, 0.05, 0.0405 for SMA 20). The band-to-basis distance
  $(p/100)\,B_t$ inherits the basis's noise, scaled by $p/100$.
- **Magnitude**: $\lvert H_U\rvert$ is $\lvert H_B\rvert$ shifted by $20\log_{10}(1.1) = +0.83$ dB, and
  $\lvert H_L\rvert$ by $20\log_{10}(0.9) = -0.92$ dB.

**When does a trend reach a band?** On a steady trend of slope $b$ the basis runs $\bar k$ bars behind:
$x_t - B_t = \bar k\,b$. Price touches the upper band only if $\bar k\,b \ge (p/100)\,B_t$, i.e.

$$
\frac{b}{\textcolor{#FF6D00}{B_t}} \ge \frac{p}{100\,\bar k}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $b$ | the trend's slope | price per bar |
| $\bar k$ | the basis lag | bars (9.5 for SMA 20) |
| $b / B_t$ | the slope as a fraction of price | per bar |

For SMA 20 and 10 % that is a sustained rise of 1.05 % of price per bar. On daily bars almost no trend does that, so
band touches at the defaults come from shocks and fast deviations, not from steady trends. A faster basis (smaller
lag) needs an even steeper trend.

If the basis is adaptive (McGinley, KAMA) or volume-weighted (VWMA), the bands inherit its data-dependent behaviour
and have no fixed kernel either.

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 20 | TradingView default |
| Percent | 10 | TradingView default |
| Source | close | TradingView default |
| Basis MA type | SMA | TradingView default ("Exponential" off) |

## Warm-up
First valid bar index: that of the basis average (19 for SMA 20); all three lines start together.

## Filter view
The drawer shows three entries (upper, basis, lower), each with impulse, step, $\lvert H\rvert$ in dB vs period and
group delay. At the defaults:

- **Impulse**: three flat 20-tap kernels of height 0.055, 0.05 and 0.045.
- **Step**: linear ramps that reach their DC gains 1.1, 1 and 0.9 on bar 19 (the step bar is bar 0).
- **Magnitude**: three copies of the SMA 20 curve offset by $+0.83$, 0 and $-0.92$ dB, with exact zeros at periods
  $20/j$ (20, 10, 6.67, 5, 4, ... , 2) shown as deep notches (the plot's frequency grid hits 20 and 2 exactly, where it
  floors at $-120$ dB); at $P = 200$ the upper band reads
  $+0.68$ dB and the lower $-1.06$ dB.
- **Group delay**: constant 9.5 bars for all three (the SMA kernel is symmetric, so the phase is linear), undefined at
  the zeros.

## How to read it
- **Price inside the bands**: within $p$ % of the trend, the normal state.
- **Price outside a band**: a deviation larger than $p$ %. Whether that means "stretched, will snap back" or "breaking
  out, will run" depends on the market, not on the band (next section).
- **Slope of the basis**: the trend direction, $\bar k$ bars late; the bands slope with it.
- **Distance from price**: on a steady trend price sits $\bar k\,b$ from the basis, so a steep trend rides near one
  band and a flat market sits near the basis.
- **Trend vs range.** In a range price oscillates between the bands (if $p$ fits the swings); in a strong trend it
  hugs one band and the other one is irrelevant.
- **The parameters.** The percent is the threshold of the reading and must fit the asset's volatility; the length
  sets the basis's lag and therefore how much of a trend shows as distance.

## Why it works
How often should price leave the bands at all? On a random walk with volatility $\sigma$ per bar, the distance from
an SMA basis is a weighted sum of recent returns (identity on the Moving Average page) with standard deviation

$$
\operatorname{sd}\!\left(\ln \frac{x_t}{\textcolor{#FF6D00}{B_t}}\right) \approx \sigma \sqrt{\frac{(n-1)(2n-1)}{6n}} = 2.49\,\sigma \quad (n = 20)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\sigma$ | standard deviation of one bar's return | 1.5 % in the random-walk scenario |
| $n$ | the basis length | 20 |
| $\ln(x_t / B_t)$ | the relative distance from the basis | about $\pm 4$ % |

At $\sigma = 1.5$ % that is 3.7 %: the default 10 % band is 2.7 standard deviations away (a close below it on fewer
than 1 % of bars), a 3 % band only 0.8. That is why the labs below use 3 %; at 10 % the range scenario gives no lower
band cross at all on seeds 1–5 (n = 0).

What happens after a band cross depends on the market.

**Random walk.** The future returns are independent of the distance, so there is no edge.

**Range** (mean reversion around a level $m$). With $d_t = x_t - m$:

$$
\mathbb{E}[x_{t+h} - x_t \mid d_t] = -\big(1 - (1-\theta)^h\big)\, d_t \approx -0.57\, d_t \quad (\theta = 0.08,\ h = 10)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $m$ | the level the range reverts to ($\ln 100$ in the scenario) | log price |
| $d_t$ | the log price's deviation from $m$ | about $\pm 4$ % |
| $\theta$ | the reversion speed per bar | 0.08 in the scenario |
| $h$ | the look-ahead | bars, 10 in the lab |

A close below the lower band (a large negative deviation) therefore predicts a rise of about half the deviation:
**fade the band**.

**Reversal** (persistent drift $\pm 0.25$ % per bar). A close above the upper band happens when the drift is up, and
the drift persists: **follow the band**.

```lab
{"kind": "combo", "scenario": "range", "horizon": 10, "on": [0],
 "rules": [
  {"label": "Close crosses below the 3 % lower band", "left": {"price": "close"}, "op": "crosses_below",
   "right": {"indicator": {"id": "envelope", "params": {"percent": 3}}, "output": "lower"}},
  {"label": "Close crosses above the 3 % upper band", "left": {"price": "close"}, "op": "crosses_above",
   "right": {"indicator": {"id": "envelope", "params": {"percent": 3}}, "output": "upper"}}
 ]}
```

With seed 1 (1000 bars, 10-bar horizon, SMA 20 basis, 3 %):

| Scenario | Crosses below the lower band | Crosses above the upper band |
|---|---|---|
| Range | $+1.92$ % ($+0.36$ to $+3.51$, n = 30) | $-2.26$ % ($-3.56$ to $-0.95$, n = 31) |
| Random walk | $+0.37$ % ($-1.08$ to $+1.83$, n = 34) | $+0.26$ % ($-1.83$ to $+2.39$, n = 21) |
| Reversal | $-1.55$ % ($-3.60$ to $+0.54$, n = 21) | $+2.49$ % ($+0.87$ to $+4.13$, n = 20) |

The same band gives opposite edges in the range and the reversal. On the range the upper-band rule is negative on all
of seeds 1–5 ($-1.21$ to $-2.26$ %) and the lower-band rule positive on all of them ($+0.88$ to $+2.13$ %). One rule on
one synthetic sample: not a backtest (no costs), sensitive to how many rules you try, and not investment advice.

## Combine with
- **Bollinger Bands** measure the same distance from an SMA 20, in standard deviations instead of percent. With a
  constant volatility (as in the range scenario) the two say nearly the same thing, so requiring both mostly removes
  signals; with changing volatility the Bollinger band adapts and the envelope does not.
- **A long average** (SMA 200) as a regime check: below a falling long average, a dip is more likely a trend than a
  stretch, and fading it loses.

```lab
{"kind": "combo", "scenario": "range", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Close crosses below the 3 % lower band", "left": {"price": "close"}, "op": "crosses_below",
   "right": {"indicator": {"id": "envelope", "params": {"percent": 3}}, "output": "lower"}},
  {"label": "Close below the Bollinger lower band", "left": {"price": "close"}, "op": "lt",
   "right": {"indicator": {"id": "bb", "params": {}}, "output": "lower"}},
  {"label": "Close below SMA 200", "left": {"price": "close"}, "op": "lt",
   "right": {"indicator": {"id": "sma", "params": {"length": 200}}, "output": "ma"}}
 ]}
```

With seed 1 on the range: the envelope rule alone $+1.92$ % (n = 30), the Bollinger rule alone $+1.48$ % ($-0.26$
to $+3.24$, n = 16), both together $+1.42$ % ($-1.03$ to $+3.94$, n = 10): no gain, a third of the signals. On the
reversal, the envelope rule with "close below SMA 200" is $-3.75$ % ($-6.47$ to $-0.95$, n = 15), worse than the
envelope rule alone ($-1.55$ %): there the long average is a reason **not** to fade the dip. One sample, no costs, not
investment advice.

## Differences vs TradingView
- Same multiplicative bands and defaults as TradingView's Envelope (length 20, 10 %, close).
- TradingView offers SMA or EMA as the basis (the "Exponential" switch); here any of the 15 types.

## Pitfalls
- Band width does not adapt to volatility: 10 % is wide for a utility stock and narrow for a crypto asset (see
  Bollinger Bands for a volatility-scaled version).
- The bands are not symmetric in log terms: $\ln 1.1 = 0.095$ but $\ln 0.9 = -0.105$. From the lower band price needs
  $+11.1$ % to return to the basis.
- The bands lag exactly as much as the basis; an "outside the band" reading compares today's price with a trend
  value from about $\bar k$ bars ago.

## Exercise
1. In the "Why it works" lab, switch between the two rules and set the scenario to Range, Random walk and Reversal in
   turn. Which formula above predicts the sign in each? Then set the scenario to Volatility regime: why do the band
   crosses bunch up in the second half?
2. In the percent lab, set the scenario to Random walk and find the smallest percent at which price stays inside the
   bands on almost every bar. Compare it with the 3.7 % standard deviation above: a band 2.7 standard deviations
   away should be crossed on fewer than 1 % of bars.
3. Start Replay on ^GSPC on 2020-02-19 (just before the COVID crash) with the default envelope (10 %). Step forward:
   does the index close below the lower band, how long does it stay there, and how far below the basis is it at the
   lowest close?

```lab
{"kind": "replay", "symbol": "^GSPC", "date": "2020-02-19", "indicators": [{"id": "envelope", "params": {}}]}
```
