# Bollinger Bands (`bb`)

A moving average (the basis) with bands a multiple of the recent standard deviation above and below it. Unlike the
Envelope, the band width follows volatility: the bands widen in turbulent markets and squeeze in quiet ones. People use
them to judge whether a close is unusually far from its recent mean, to fade stretches in a range, to follow strength
in a trend ("walking the band") and to spot quiet periods (the "squeeze").

## What it measures
Two questions at once. **Where** is price within its recent spread: how many standard deviations of the last $n$
closes is today's close above or below their mean? And **how wide** is that spread: the distance between the bands is
a running volatility estimate in price units. A close at the upper band at the defaults means "two standard deviations
above the 20-bar mean", whatever the asset or its price.

Move the length on the volatility regime: the bands are narrow in the calm first half and about four times wider in
the wild second half; a longer length makes them smoother, later and (on a trending or [random-walk](glossary:random-walk) series) wider.

```lab
{"kind": "param", "indicator": "bb", "vary": "length", "min": 5, "max": 100, "scenario": "volatility_regime"}
```

## Formula

$$
\textcolor{#FF6D00}{B_t} = \mathrm{MA}^{\text{type}}_n(x)_t, \qquad
\sigma_t = \sqrt{\frac1n\sum_{k=0}^{n-1}\left(x_{t-k} - \mu_t\right)^2}, \quad \mu_t = \mathrm{SMA}_n(x)_t
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#FF6D00}{B_t}$ | the basis (the orange line): an MA of the chosen type, SMA by default | price |
| $x_t$ | the source (close by default) at bar $t$ | price |
| $n$ | length | bars, 1–5000 (default 20) |
| $\mu_t$ | the mean of the last $n$ values (equal to $\textcolor{#FF6D00}{B_t}$ for the SMA basis) | price |
| $\sigma_t$ | the **population** standard deviation of the last $n$ values about $\mu_t$ | price, a few % of it |

$$
\textcolor{#2962FF}{U_t} = \textcolor{#FF6D00}{B_t} + k\,\sigma_t, \qquad \textcolor{#2962FF}{L_t} = \textcolor{#FF6D00}{B_t} - k\,\sigma_t
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#2962FF}{U_t},\ \textcolor{#2962FF}{L_t}$ | upper and lower band (the blue lines) | price |
| $k$ | band distance in standard deviations ("StdDev", `mult`) | 0.001–50 (default 2) |

All three lines are moved right by the plot `offset` (default 0). $\sigma$ is the **population** deviation (divides by
$n$) of the window about its SMA, whatever the basis type, as in Pine `ta.stdev`. It is computed in two passes per
window (mean, then squared deviations), never as $E[x^2] - E[x]^2$, which loses all precision when
$\sigma \ll \lvert\mu\rvert$.

### Population or sample deviation
Statistics textbooks divide by $n - 1$ (Bessel's correction). The two differ by a constant factor:

$$
s_t = \sqrt{\frac{1}{n-1}\sum_{k=0}^{n-1}\left(x_{t-k} - \mu_t\right)^2} = \sqrt{\frac{n}{n-1}}\;\sigma_t
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $s_t$ | the sample standard deviation (pandas `std()`, Excel `STDEV`) | price |
| $\sqrt{n/(n-1)}$ | the ratio of the two | 1.026 at $n = 20$ |

Bollinger's definition and TradingView's built-in use $\sigma$ (`ta.stdev` with its default `biased = true`), and so
does this implementation. The $n - 1$ makes $s^2$ an unbiased estimate of the variance of independent draws around one
fixed mean. Closes are not that: on a random walk the expected window variance itself grows with $n$ (Why it works),
so there is no fixed "true" variance to be unbiased about. The band simply describes how spread out these $n$ closes
are, and $\sigma$ is the honest descriptive number. The choice matters little: on a 200 000-bar random walk (seed 1)
2-$\sigma$ bands have 11.9 % of the closes outside, sample-deviation bands 10.5 %.

### %b and band width
Two derived quantities that TradingView ships as separate indicators. They are not outputs here, but every rule on
them is a rule on the bands:

$$
\%b_t = \frac{x_t - \textcolor{#2962FF}{L_t}}{\textcolor{#2962FF}{U_t} - \textcolor{#2962FF}{L_t}} = \frac12 + \frac{z_t}{2k},
\qquad
z_t = \frac{x_t - \textcolor{#FF6D00}{B_t}}{\sigma_t},
\qquad
\mathrm{BW}_t = \frac{\textcolor{#2962FF}{U_t} - \textcolor{#2962FF}{L_t}}{\textcolor{#FF6D00}{B_t}} = \frac{2k\,\sigma_t}{\textcolor{#FF6D00}{B_t}}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\%b_t$ | where the close sits between the bands: 0 at the lower, 0.5 at the basis, 1 at the upper | mostly 0–1 |
| $z_t$ | the close's distance from the basis in standard deviations (a z-score) | about $\pm 2$ |
| $\mathrm{BW}_t$ | band width relative to the basis: a volatility measure without price units | 0.04–0.2 on daily bars |

Substitute $\textcolor{#2962FF}{U} - \textcolor{#2962FF}{L} = 2k\sigma$ and
$x - \textcolor{#2962FF}{L} = (x - \textcolor{#FF6D00}{B}) + k\sigma$ to get the second form of $\%b$. So:
$\%b < 0 \iff$ close below the lower band, $\%b > 1 \iff$ close above the upper band, $\%b$ crossing 0.5 $\iff$ the
close crossing the basis. In the labs write them as `close lt lower`, `close crosses_below lower`, and so on.

**%b is bounded.** With the SMA basis, the deviations in a window sum to zero, so if one close is $d$ away from the
mean, the other $n - 1$ sum to $-d$ and (Cauchy–Schwarz) their squares sum to at least $d^2/(n-1)$. Hence
$n\sigma^2 \ge d^2 + d^2/(n-1)$, i.e.

$$
\lvert z_t\rvert \le \sqrt{n-1}, \qquad \frac12 - \frac{\sqrt{n-1}}{2k} \le \%b_t \le \frac12 + \frac{\sqrt{n-1}}{2k}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\sqrt{n-1}$ | the largest possible distance of a close from its own window mean, in $\sigma$ | 4.36 at $n = 20$, 3 at $n = 10$ |

A close can never be more than 4.36 standard deviations from the SMA 20, and $\%b$ stays within $[-0.59, 1.59]$ at the
defaults, however violent the move (the largest $\lvert z\rvert$ on a 200 000-bar random walk: 3.82). A crash bar
both moves the close and inflates its own $\sigma$.

## Kernel, lag and noise
The basis is the chosen average with its own [kernel](glossary:kernel), [lag](glossary:lag) and NRF (see its page). The bands are not linear filters:
$\sigma$ of a sum is not the sum of the $\sigma$s. They are shift-invariant ($\sigma(x + c) = \sigma(x)$) and scale with
the price ($\sigma(a x) = \lvert a\rvert\,\sigma(x)$), so the band width is in price units.

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 20 | TradingView default (about a month of daily bars) |
| Basis MA type | SMA | TradingView default |
| Source | close | TradingView default |
| StdDev | 2 | TradingView default |
| Offset | 0 | TradingView default |

## Warm-up
First valid bar index: $\max(w_{\text{basis}},\ n - 1) + \text{offset}$, i.e. 19 at the defaults. With a basis that
warms up later (DEMA, T3, ...) the bands start with the basis (38 for DEMA 20).

## Filter view
The drawer's Filter view tab covers moving averages only. The basis is one, and this figure measures it by running the
real code: SMA 20, a flat 20-tap kernel, lag 9.50 bars, NRF 0.05, DC gain 1. The upper and lower bands are shown too,
but only with step and ramp responses: $\sigma$ depends on the input itself, so superposition fails and there is no
impulse or [frequency response](glossary:frequency-response).

```lab
{"kind": "filter", "indicator": "bb", "output": "basis"}
```

The basis lag matters for the bands: the mean of the window is centred $(n-1)/2 = 9.5$ bars in the past, so a
drifting price sits away from it even when nothing unusual happens (Why it works).

## How to read it
- **Position (%b):** a close near the upper band is high relative to the last $n$ closes, near the lower band low.
  "High" is measured in the asset's own recent standard deviation, so the reading is comparable across assets and
  price levels.
- **Width:** wide bands mean recent closes were spread out (high volatility), narrow bands a quiet market. A
  **squeeze** is band width at a multi-month low; an **expansion** is the bands opening fast after a shock.
- **Basis slope:** the trend of the SMA $n$, $(n-1)/2$ bars late, as on the SMA page.
- **Range:** price swings between the bands and the basis is flat; a close outside a band tends to come back
  ([mean reversion](glossary:mean-reversion)).
- **Trend ("walking the band"):** price rides along one band, touching or closing beyond it again and again, and
  the basis slopes. A close above the upper band is then strength, not a sell signal.
- **Length:** longer bands react later, and on a trending or random-walk series they are wider (the window's spread
  grows roughly like $\sqrt n$, Why it works). **StdDev:** sets how rare a close outside should be; at 2 it is
  about one close in eight on a random walk and one in ten on a range, not one in twenty.

## Why it works
**How often should a close be outside?** The folklore says "95 % inside", from a normal distribution. Two things break
it: the window's own mean and $\sigma$ are estimated from the same few closes, and prices are not independent draws.

*Independent draws* (white noise around a fixed level): the close is part of its own window, which pulls the mean
towards it. The exact distribution is $z^2/(n-1) \sim \mathrm{Beta}\bigl(\tfrac12, \tfrac{n-2}{2}\bigr)$, which gives
4.19 % outside $\pm 2\sigma$ at $n = 20$ (measured: 4.21 % on 400 000 bars). Slightly *fewer* than 5 %.

*A random walk* (log price with independent increments of standard deviation $\sigma_r$): anchor the window at its
first close and add up the increments. The expected window variance and the expected squared distance of the last
close from the window mean are

$$
\mathbb{E}\bigl[\sigma_t^2\bigr] = \sigma_r^2\,\frac{n^2 - 1}{6n},
\qquad
\mathbb{E}\bigl[(x_t - \mu_t)^2\bigr] = \sigma_r^2\,\frac{(n-1)(2n-1)}{6n},
\qquad
\frac{\mathbb{E}\bigl[(x_t - \mu_t)^2\bigr]}{\mathbb{E}\bigl[\sigma_t^2\bigr]} = \frac{2n - 1}{n + 1}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\sigma_r$ | standard deviation of one bar's log return | 0.015 in `random_walk` |
| $\sigma_t^2$ | the window's population variance (in log price) | $3.33\,\sigma_r^2$ at $n = 20$ |
| $(x_t - \mu_t)^2$ | the squared distance of the last close from the window mean | $6.18\,\sigma_r^2$ at $n = 20$ |
| $(2n-1)/(n+1)$ | how much larger the second is than the first | 1.86 at $n = 20$, tends to 2 |

The last close of a random walk is the point furthest along the path, while the mean sits in the middle of the
window: the distance is inflated by $\sqrt{(2n-1)/(n+1)} = 1.36$ at $n = 20$, and $z$ behaves like a normal variable
with standard deviation 1.36, not 1. A normal approximation then gives 14 % outside $\pm 2\sigma$; measured on
200 000 bars it is 11.9 % (the bound $\sqrt{n-1}$ and the correlation of the distance with $\sigma_t$ trim the tails).
Measured with the bands' own code (seed 1):

| Series (200 000 bars, $n = 20$, $k = 2$) | Above the upper band | Below the lower band | Outside |
|---|---|---|---|
| Independent draws (normal noise, 400 000 bars) | 2.1 % | 2.1 % | 4.2 % |
| `random_walk` | 6.8 % | 5.1 % | 11.9 % |
| `range` (mean-reverting) | 5.2 % | 4.6 % | 9.8 % |
| `uptrend` | 10.0 % | 2.9 % | 12.9 % |

| Random walk, % of closes outside $\pm k\sigma$ | $k = 1.5$ | $k = 2$ | $k = 2.5$ | $k = 3$ |
|---|---|---|---|---|
| Normal distribution (textbook) | 13.4 % | 4.6 % | 1.2 % | 0.27 % |
| $n = 10$ | 28.5 % | 8.2 % | 0.65 % | 0 (the bound is exactly 3) |
| $n = 20$ | 31.0 % | 11.9 % | 2.7 % | 0.28 % |
| $n = 50$ | 32.8 % | 14.3 % | 4.3 % | 0.89 % |

On 1000-bar samples (seeds 1–5) the random walk has 10.9 %–13.4 % of its closes outside the default bands. The
uptrend's asymmetry is the basis lag: a drift $b$ per bar puts the close $b(n-1)/2$ above the window mean, about 0.6
of a $\sigma$ in `uptrend`. Move $k$ on a random walk and count:

```lab
{"kind": "param", "indicator": "bb", "vary": "mult", "min": 0.5, "max": 4, "scenario": "random_walk"}
```

**Band width is a volatility estimate.** Taking the square root of the first expectation, on a random walk
$\mathrm{BW} \approx 2k\,\sigma_r\sqrt{(n^2-1)/(6n)} = 7.29\,\sigma_r$ at the defaults (RMS). Checked on 200 000 calm
`volatility_regime` bars ($\sigma_r = 0.008$): RMS width 5.80 %, formula 5.84 %. On 1000-bar samples (seeds 1–5) the
median width is 3.3–4.6 times larger in the wild half than in the calm half; the true volatility ratio is 3.75. The
width grows like $\sqrt n$ on a random walk, unlike the noise of an average, which shrinks.

**Fade or follow the band?** What happens after a close outside depends on the market, not on the band.

- On a *random walk* the future increments are independent of the past, the bands included: no [edge](glossary:edge).
- On `range` (an Ornstein–Uhlenbeck process, AR coefficient 0.92) the expected move is back towards the centre,
  $-\bigl(1 - 0.92^h\bigr)$ times the current deviation (57 % of it within 10 bars, derived on the
  [Envelope page](learn:envelope#why-it-works)). A close below the lower band is far below the centre: fade it.
- On `reversal` the drift persists for hundreds of bars: a close above the upper band marks the up half, so follow
  it.
- On `uptrend` (a constant drift) the band touches are frequent and carry no information beyond the drift itself.

```lab
{"kind": "combo", "scenario": "range", "horizon": 10, "on": [0],
 "rules": [
  {"label": "Close crosses below the lower band", "left": {"price": "close"}, "op": "crosses_below",
   "right": {"indicator": {"id": "bb", "params": {}}, "output": "lower"}},
  {"label": "Close crosses above the upper band", "left": {"price": "close"}, "op": "crosses_above",
   "right": {"indicator": {"id": "bb", "params": {}}, "output": "upper"}}
 ]}
```

With seed 1 (1000 bars, 10-bar [look-ahead](glossary:horizon), default bands):

| Scenario | Close crosses below the lower band | Close crosses above the upper band |
|---|---|---|
| `range` | +1.87 % ([95 % interval](glossary:confidence-interval) +0.20 % to +3.54 %, n = 16) | −3.18 % (−4.63 % to −1.74 %, n = 21) |
| `random_walk` | −0.22 % (−1.90 % to +1.46 %, n = 26) | +0.71 % (−1.30 % to +2.71 %, n = 21) |
| `uptrend` | −0.18 % (−2.15 % to +1.78 %, n = 16) | −0.42 % (−1.76 % to +0.93 %, n = 30) |
| `reversal` | −1.43 % (−3.69 % to +0.83 %, n = 20) | +1.52 % (−0.03 % to +3.06 %, n = 22) |

On `range` the lower-band cross is positive for seeds 1–5 (+1.59 % to +3.36 %, [hit rate](glossary:hit-rate) 0.56–0.76 against about
0.50 for any bar; the interval clears zero for four of them and touches it for the fifth) and the upper-band cross
negative for all five (−1.33 % to −3.28 %, below zero for two). On `reversal` the same upper-band cross is positive
for seeds 1–5 (+1.01 % to +3.29 %, above zero for three): the same line, the opposite trade. On `random_walk` the
intervals contain zero except for two of the ten seed-and-rule pairs, one on each side (+2.22 % and −2.51 % for the
lower band at seeds 2 and 5), which is what chance allows.

*Walking the band.* On `uptrend` the state "close above the upper band" has an edge between −0.45 % and +0.72 %
(seeds 1–5, every interval containing zero), yet the mean 10-bar return after it is still +0.43 % to +2.17 %: the
drift goes on. Selling the upper band in a steady uptrend gives up that drift; buying it gains nothing extra.

**The squeeze.** Narrow bands mean the last $n$ closes were quiet. They forecast the *size* of what follows only
through volatility, and never its direction. Two facts, measured with the real code (seed 1):

- *The bands will widen: regression to the mean.* $\sigma_t$ is an estimate from $n$ closes. When it is at a
  125-bar low it is mostly low by chance, and the next estimate is closer to normal. On a 200 000-bar random walk
  (constant true volatility), 20 bars after a squeeze the band width is on average 2.19 times the squeeze width
  (1.16 times after any bar).
- *The move is not larger than usual.* The next 10-bar absolute move after a squeeze averages 3.72 %, after any bar
  3.77 %. It is larger only *relative to the narrow band*: 3.28 band-$\sigma$ against 1.74. "The squeeze predicts a
  big move" is true in band units and false in price units when volatility does not cluster.

Real volatility does cluster and revert, which is the case for the squeeze; the synthetic `volatility_regime` has one
jump half-way. Averaged over 400 samples, the band width covers 50 % of that jump 6 bars after it and 90 % after 15
(the ATR 14 needs 9 and 31). Squeezes, though, come at random: in the calm half of seeds 1–5 the band width hits a
125-bar low 2 to 10 times, the last of them 8 to 165 bars before the switch: they mark where the calm half's
width happened to dip, and no squeeze rule can know when the regime will change. The
lab can express a squeeze as "both bands moved inwards over 20 bars" (the width shrank on both sides):

```lab
{"kind": "combo", "scenario": "volatility_regime", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Upper band below its value 20 bars ago", "left": {"indicator": {"id": "bb", "params": {}}, "output": "upper"},
   "op": "lt", "right": {"indicator": {"id": "bb", "params": {}}, "output": "upper", "ago": 20}},
  {"label": "Lower band above its value 20 bars ago", "left": {"indicator": {"id": "bb", "params": {}}, "output": "lower"},
   "op": "gt", "right": {"indicator": {"id": "bb", "params": {}}, "output": "lower", "ago": 20}}
 ]}
```

With seed 1 both rules together give −3.18 % (−8.38 % to +2.03 %, n = 13); the intervals contain zero for seeds 1–5
on `volatility_regime` and on `random_walk`. The histograms show the size question: the standard deviation of the
10-bar returns after the signal is 5.3 %–10.4 % against 6.3 %–7.6 % after any bar (seeds 1–5), sometimes wider and
sometimes narrower. A contraction tells you volatility was falling, not which way price will go.

One rule on one sample: not a backtest (no costs, no position sizing), sensitive to [multiple testing](glossary:multiple-testing) (every rule,
length and scenario you try is another test), and not investment advice.

## Combine with
The band says "stretched"; it cannot say whether the market is a range (fade) or a trend (follow). So pair it with a
regime filter rather than a second stretch detector:

- **RSI 14 below 35** measures the same stretch in a different unit (the RSI page shows it is a smoothed slope over
  volatility). Requiring both cuts the signals without protecting against a trend.
- **A rising basis** (the basis above its value 20 bars ago) is a trend check: it removes the lower-band crosses of a
  falling market, where fading loses.

```lab
{"kind": "combo", "scenario": "range", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Close crosses below the lower band", "left": {"price": "close"}, "op": "crosses_below",
   "right": {"indicator": {"id": "bb", "params": {}}, "output": "lower"}},
  {"label": "RSI 14 below 35", "left": {"indicator": {"id": "rsi", "params": {}}, "output": "rsi"},
   "op": "lt", "right": {"value": 35}},
  {"label": "Basis above its value 20 bars ago", "left": {"indicator": {"id": "bb", "params": {}}, "output": "basis"},
   "op": "gt", "right": {"indicator": {"id": "bb", "params": {}}, "output": "basis", "ago": 20}}
 ]}
```

With seed 1, on `range`: the band cross alone +1.87 % (+0.20 % to +3.54 %, n = 16), RSI 14 below 35 alone +1.51 %
(−1.54 % to +4.57 %, n = 7), both +1.98 % (−1.35 % to +5.32 %, n = 4); band cross and rising basis +1.96 % (−0.60 %
to +4.53 %, n = 9). On `reversal`: the band cross alone −1.43 % (−3.69 % to +0.83 %, n = 20), with the RSI −2.64 %
(−5.70 % to +0.43 %, n = 13), with the rising basis −0.47 % (−5.50 % to +4.56 %, n = 5). The RSI adds nothing (in the
falling half both say "stretched"); the rising basis removes most of the losing crosses, but for seeds 1–5 only 3 to
8 episodes remain and their edges range from −2.48 % to +1.51 %. The rising basis alone is the strongest rule on
`reversal` (+2.30 %, +1.18 % to +3.42 %, n = 44; above zero for seeds 1–5) and slightly negative on `range` (−0.01 %
to −1.17 %): a trend filter, with the trend filter's cost in a range. Not a backtest, not advice.

For volatility, the [ATR](learn:atr) measures bar size including [gaps](glossary:gap) and reacts more slowly than the band width; it
is the unit for stops and position sizes, while the bands mark where price is.

## Differences vs TradingView
- Same formula and defaults as TradingView's built-in (population $\sigma$, `ta.stdev`).
- TradingView offers SMA, EMA, SMMA ([RMA](glossary:rma)), WMA and VWMA as the basis; here any of the 15 types. $\sigma$ stays about
  the SMA in both.
- TradingView's separate "Bollinger Bands %B" and "Bollinger BandWidth" indicators plot the two derived quantities
  above; here they are rules on the bands (Formula).

## Pitfalls
- Population vs sample $\sigma$: other tools (pandas `std()`, Excel `STDEV`) divide by $n-1$; their bands are
  $\sqrt{n/(n-1)} = 1.026$ times wider at $n = 20$.
- "95 % inside the bands" assumes independent, normally distributed prices. On a random walk about 12 % of closes
  are outside at the defaults, more for longer lengths; real prices also have fat tails, so closes outside the bands
  are both more frequent and more persistent.
- A close above the upper band in a strong trend is common ("walking the band"), not by itself a sell signal.
- With a non-SMA basis, $\sigma$ is still measured about the SMA, so the bands are not centred on the window mean and
  $\%b = 0.5$ is not the mean.
- A squeeze says volatility was low, not that a big move is due. The bands nearly always widen afterwards (the
  estimate regresses), which looks like a successful prediction on a chart.
- Band width in price units is not comparable across assets; use $\mathrm{BW}$ (relative to the basis).

## Exercise
1. In the band-cross lab, switch between the two rules and set the scenario to `range`, `reversal` and
   `random_walk`. Which of the four regimes in Why it works predicts each sign? Press the new-sample button a few
   times on `random_walk`: how often does an interval exclude zero?
2. In the StdDev lab on `random_walk`, find the $k$ at which roughly one close in twenty is outside. Compare it with
   the table above and with the normal distribution's 1.96. Then set the scenario to `range`: does the same $k$ work?
3. Start Replay on SPY on 26 January 2018, after the very calm year 2017. How narrow were the bands before that day,
   and how many bars did it take them to open in the February sell-off? Did the narrow bands tell you which way the
   move would go?

```lab
{"kind": "replay", "symbol": "SPY", "date": "2018-01-26", "indicators": [{"id": "bb", "params": {}}]}
```

4. Start Replay on SPY on 19 February 2020, the record close before the COVID crash. Step through March: count the
   closes below the lower band. Was this a range (fade) or a trend (follow), and when could you have known?

```lab
{"kind": "replay", "symbol": "SPY", "date": "2020-02-19", "indicators": [{"id": "bb", "params": {}}]}
```
