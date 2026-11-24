# Least Squares Moving Average (`lsma`)

The LSMA fits an ordinary-least-squares line through the last $n$ prices and plots its value at the newest bar. That
makes it a fixed [FIR filter](glossary:fir-filter) that reproduces any straight line exactly. It is the cleanest example of the "price of zero
[lag](glossary:lag)": at long lengths its noise variance is four times the SMA's.

## What it measures
Where the recent linear trend "is now". Fit the best straight line through the last $n$ closes and read off its value
at the newest bar: that is the LSMA. Two numbers come out of the same fit: the level (the line) and the slope (how many
price units per bar the fitted trend rises). The difference between price and the LSMA is the residual of that fit,
so it says how far the last close sits from its own trend, not whether there is a trend.

Move the length and watch the line on a reversal: short lengths hug price, long lengths keep running straight past
the turn and overshoot before they bend.

```lab
{"kind": "param", "indicator": "lsma", "vary": "length", "min": 5, "max": 100, "scenario": "reversal"}
```

## Formula
Index the window oldest to newest, $j = 0\ldots n-1$ (bar $t-n+1+j$). The OLS line $a + bj$ is evaluated at position
$p = n - 1 - o$:

$$
\textcolor{#7E57C2}{L_t} = \bar x_t + b_t\,(p - \bar j), \qquad
b_t = \frac{1}{S}\sum_{j=0}^{n-1} (j-\bar j)\,x_{t-n+1+j}, \qquad
\bar j = \frac{n-1}{2}, \quad S = \sum_j (j-\bar j)^2 = \frac{n(n^2-1)}{12}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#7E57C2}{L_t}$ | the LSMA at bar $t$ | price |
| $x_{t-n+1+j}$ | source price (close) at window position $j$ | price |
| $\bar x_t$ | plain mean of the window (the SMA) | price |
| $b_t$ | OLS slope of the fitted line | price per bar |
| $n$ | length | 1–5000, default 25 |
| $o$ | regression offset | 0–500 bars, default 0 |
| $p$ | position where the line is read, $n-1-o$ | bars from the window's start |
| $\bar j$, $S$ | centre of the window and the sum of squared distances to it | bars, bars² |

Writing the fit out bar by bar gives a fixed weighted sum:

$$
\textcolor{#7E57C2}{L_t} = \sum_{j=0}^{n-1} w_j\,x_{t-n+1+j}, \qquad
w_j = \frac1n + \frac{(p-\bar j)(j-\bar j)}{S}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $w_j$ | weight of window position $j$; the weights sum to 1 and can be negative | dimensionless |
| $p$, $\bar j$, $S$, $n$ | as above | |

## Kernel, lag and noise
With offset 0 ($p = n-1$) and $k = n-1-j$ bars ago:

$$
h_k = \frac{4n - 2 - 6k}{n(n+1)} = 3\cdot\underbrace{\frac{2(n-k)}{n(n+1)}}_{\mathrm{WMA}_n} - 2\cdot\underbrace{\frac1n}_{\mathrm{SMA}_n}, \qquad\text{so}\qquad \textcolor{#7E57C2}{\mathrm{LSMA}} = 3\,\textcolor{#00BCD4}{\mathrm{WMA}_n} - 2\,\textcolor{#2962FF}{\mathrm{SMA}_n}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $h_k$ | weight of the bar $k$ bars ago ([impulse response](glossary:impulse-response)) | from $\frac{4n-2}{n(n+1)}$ down to $\frac{4-2n}{n(n+1)}$ |
| $k$ | bars ago | $0\ldots n-1$ |
| $\textcolor{#00BCD4}{\mathrm{WMA}_n}$, $\textcolor{#2962FF}{\mathrm{SMA}_n}$ | linearly weighted and simple averages of the same length | price |

The weights fall linearly from $h_0 = \frac{4n-2}{n(n+1)}$ to $h_{n-1} = \frac{4-2n}{n(n+1)} < 0$. They are negative
for $k > \frac{2n-1}{3}$, about the oldest third of the window.

**Lag.** By moment algebra, $\bar k = 3\cdot\frac{n-1}{3} - 2\cdot\frac{n-1}{2} = 0$. More directly, OLS reproduces a
line exactly, so on $x_t = a + bt$ the output is $x_t$.

**Curvature.** $\sum_k k^2 h_k = -\frac{(n-1)(n-2)}{6}$ ($-92$ at $n = 25$). On a parabola $ct^2$ the LSMA sits
$92c$ below price.

**Noise.**

$$
\mathrm{NRF} = \sum_k h_k^2 = \frac{2(2n-1)}{n(n+1)} = h_0 \;\approx\; \frac4n
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\mathrm{NRF}$ | [noise reduction factor](glossary:noise-reduction-factor): output variance / input variance for white noise | 0.1508 at $n = 25$ |
| $h_k$, $h_0$, $n$ | the kernel above and its newest weight | |

NRF equals the newest weight. This is the OLS leverage: the variance of a fitted value is $\sigma^2$ times the weight
the fit gives the observation at which it is evaluated (the hat-matrix diagonal). At $n = 25$, NRF $= 98/650 =
0.1508$, which is **3.77 times** the SMA's $0.04$, and the ratio $\frac{2(2n-1)}{n+1}$ tends to 4. Removing the SMA's
lag of $\frac{n-1}{2}$ bars costs four times the noise variance at the same length.

**Overshoot.** The negative weights total $\int_{2/3}^{1}(6u-4)\,du = \frac13$ as $n \to \infty$, and $0.3077$ at
$n = 25$. Because they all sit at the old end of the window, the [step response](glossary:step-response) is $1 + 0.308 = 1.308$ at its peak
(bar 16). It then falls back to 1, reached exactly at bar 24.

**What the offset does.** The [kernel](glossary:kernel) is linear in $p$, and the fitted line is exact on ramps, so the lag is exactly
$o$ bars. The noise is

$$
\mathrm{NRF}(o) = \frac1n + \frac{12\big(\frac{n-1}{2} - o\big)^2}{n(n^2-1)}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\mathrm{NRF}(o)$ | noise reduction factor at regression offset $o$ | $\frac1n$ (at $o = \frac{n-1}{2}$) and up |
| $o$, $n$ | offset and length | bars |

| $n = 25$ | $o = 0$ | $o = 3$ | $o = 6$ | $o = 12$ | $o = 24$ | $o = 30$ |
|---|---|---|---|---|---|---|
| Lag (bars) | 0 | 3 | 6 | 12 | 24 | 30 |
| NRF | 0.1508 | 0.1023 | 0.0677 | 0.0400 | 0.1508 | 0.2892 |
| Negative taps | 8 | 7 | 4 | 0 | 8 | 10 |

At $o = \frac{n-1}{2}$ the kernel **is** the SMA (the line's value at its centre is the mean). The weights are all
non-negative only while $\lvert o - \frac{n-1}{2}\rvert \le \frac{n+1}{6}$ (offsets 8 to 16 at $n = 25$). Beyond
$\frac{n-1}{2}$ the newest bars get negative weight, and for $o > n-1$ the line is extrapolated behind the window.
The offset therefore trades lag for noise along one line, from the LSMA ($o = 0$) to the SMA ($o = \frac{n-1}{2}$).

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 25 | TradingView default |
| Offset | 0 | Pine `ta.linreg` offset: evaluate the line $o$ bars back (adds $o$ bars of lag); not a display shift |
| Source | close | TradingView default |

## Warm-up
First valid bar index: $n - 1$ (24 at the default), for any offset.

## Filter view
At $n = 25$, offset 0:
- **Impulse:** 25 stems on a straight line, from 0.151 at $k = 0$ down to $-0.071$ at $k = 24$, with zero crossing
  between $k = 16$ and $17$.
- **Step:** the cumulative sum of linear taps is a parabola. The response rises (concave) from 0.151 to its peak of
  **1.308** at bar 16, then descends along the same parabola to exactly 1 at bar 24. No undershoot.
- **Magnitude:** +0.36 dB already at $P = 200$, a peak of +2.57 dB (gain 1.345) near $P \approx 43$ bars, 0 dB near
  26 bars and $-3$ dB near 22.5 bars. Below that comes a rippling stopband ($-28$ dB at $P = 2$). For comparison,
  the SMA of the same length is $-3$ dB at 56 bars: the LSMA passes much shorter cycles.
- **[Group delay](glossary:group-delay):** 1.2 bars at $P = 200$, rising to 8.4 bars near $P \approx 31$. In the stopband it swings wildly
  (down to $-24$ near $P \approx 17.6$, where the gain has a dip of $-13$ dB). Read the group delay only where the
  gain is near 0 dB.

## How to read it
- **Price above or below the line.** On a steady trend the LSMA sits *on* the trend (lag 0), so price is above it
  about half the time in an up-trend and about half the time in a down-trend. The side of price tells you whether
  the last close is above or below its own fitted trend, a residual, not the trend's direction.
- **Slope.** The direction of the LSMA is the trend signal. On a clean ramp the line moves by
  $\textcolor{#7E57C2}{L_t} - \textcolor{#7E57C2}{L_{t-1}} = b$ per bar; the fitted slope of the current window is the
  gap between the LSMA and the same LSMA with offset 1 (see "Why it works"). The two differ at turns: on an ideal
  V-shaped turn at $n = 50$ the line keeps rising for 7 bars, while the fitted slope stays positive for 25 bars (half
  the window).
- **Crossings.** Price crossing the LSMA is frequent and close to a coin flip in a trend; a crossing of two
  LSMAs, or of the LSMA and a slower SMA, says more.
- **Distance from price.** Large residuals mean price has left its linear trend: either a sharp move or a turn that
  the line has not yet caught.
- **Trend vs range.** In a trend it rides on price with no lag. In a range it zig-zags with price and amplifies
  swings of about $1.7n$ bars (the +2.57 dB bump). At a turn it overshoots: on the same ideal V at $n = 50$ it runs
  furthest past price (by 14 bars' worth of slope) 16 bars after the turn, about a third of the window.
- **The length.** Longer windows cut noise ($\mathrm{NRF} \approx 4/n$) but bend later at turns and overshoot
  further in price terms; the offset buys smoothness by adding exactly $o$ bars of lag.

## Why it works
**Price minus a moving average is a weighted sum of recent increments.** For any kernel $h_k$ with $\sum_k h_k = 1$,
write $r_t = x_t - x_{t-1}$:

$$
x_t - \textcolor{#7E57C2}{L_t} = \sum_{k} h_k\,(x_t - x_{t-k}) = \sum_{j \ge 1} H_j\, r_{t-j+1},
\qquad H_j = \sum_{k \ge j} h_k
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $r_t$ | one-bar price increment (use log prices for returns) | price per bar |
| $H_j$ | tail sum of the kernel: the weight increment $r_{t-j+1}$ gets in the gap | dimensionless |
| $h_k$ | the average's kernel | |

On a [random walk](glossary:random-walk) with [drift](glossary:drift), $r_t = b + \sigma\varepsilon_t$ with independent standard normal $\varepsilon_t$, so the
gap is normal with

$$
\mathbb{E}\big[x_t - \textcolor{#7E57C2}{L_t}\big] = b\sum_{j\ge1} H_j = b\,\bar k, \qquad
\operatorname{Var} = \sigma^2 \sum_{j\ge1} H_j^2, \qquad
P\big(x_t > \textcolor{#7E57C2}{L_t}\big) = \Phi\!\left(\rho\,\frac{b}{\sigma}\right), \quad
\rho = \frac{\bar k}{\sqrt{\sum_{j \ge 1} H_j^2}}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $b$ | drift: the mean increment per bar | price per bar |
| $\sigma$ | standard deviation of one increment | price per bar |
| $\bar k$ | the kernel's lag (centre of mass) | bars |
| $\rho$ | trend-detection ratio of the kernel: lag over the noise of the gap | 0 for the LSMA, 6.09 for SMA 50 |
| $\Phi$ | standard normal distribution function | 0–1 |

For every lagging average "price above the line" is a noisy test of $b > 0$, and it gets sharper with the lag. The
LSMA has $\bar k = 0$, so $\rho = 0$ and $P = \frac12$ whatever the trend: **price above the LSMA carries no
information about the trend's direction.** A simulation with $b/\sigma = 0.21$ (the `reversal` scenario) gives 0.502
for LSMA 50 and 0.898 for SMA 50, as the formula predicts.

The trend information of the LSMA sits in its slope. Reading the same line one bar back (offset 1) and subtracting
gives the OLS slope exactly, and on a random walk that slope is a weighted mean of the window's increments:

$$
\textcolor{#7E57C2}{L_t^{(o=0)}} - \textcolor{#7E57C2}{L_t^{(o=1)}} = b_t = \sum_{i=1}^{n-1} g_i\, r_{t-n+1+i},
\qquad g_i = \frac{6\,i\,(n-i)}{n(n^2-1)}, \qquad
P(b_t > 0) = \Phi\!\left(\frac{b}{\sigma}\sqrt{\frac{5n(n^2-1)}{6(n^2+1)}}\right)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#7E57C2}{L_t^{(o)}}$ | LSMA with regression offset $o$ | price |
| $b_t$ | OLS slope of the window | price per bar |
| $g_i$ | parabolic weights of the increments; they sum to 1 | dimensionless |
| $n$, $b$, $\sigma$, $\Phi$ | as above | |

So "LSMA 50 slope up" is right with probability $\Phi(0.208 \cdot 6.45) = 0.91$ on `reversal`. When the trend flips
sign half-way, the expected $h$-bar return after a signal that is right with probability $P$ is about
$h\,b\,(2P - 1)$: $10 \cdot 0.25\,\% \cdot 0.82 = 2.0\,\%$ for the slope rule and $0$ for price above the LSMA. On a
random walk without a turn none of this helps: the increments after bar $t$ are independent of everything before
it, so every rule built from past prices has an expected [edge](glossary:edge) of zero.

The lab checks it. With seed 1, 1000 bars and a 10-bar [horizon](glossary:horizon) on `reversal`: "LSMA 50 slope up" has an edge of
+1.97 % ([95 % interval](glossary:confidence-interval) +0.81 % to +3.14 %, n = 44), "close above LSMA 50" −0.08 % (−1.22 % to +1.06 %, n = 65), and
"close above SMA 50" +1.73 % (+0.50 % to +2.95 %, n = 47). The pattern holds for seeds 1 to 5 (slope rule +1.41 % to
+2.34 %, every interval above 0; close above LSMA always inside the noise). On `random_walk` the slope rule shows
nothing (seed 1: −0.31 %, −1.87 % to +1.25 %, n = 36). The slope is tested as "LSMA above the same LSMA with offset
1". One rule on one sample: not a backtest (no costs), and not investment advice.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0],
 "rules": [
  {"label": "LSMA 50 slope up (above LSMA 50 offset 1)",
   "left": {"indicator": {"id": "lsma", "params": {"length": 50}}, "output": "ma"}, "op": "gt",
   "right": {"indicator": {"id": "lsma", "params": {"length": 50, "offset": 1}}, "output": "ma"}},
  {"label": "Close above LSMA 50", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "lsma", "params": {"length": 50}}, "output": "ma"}},
  {"label": "Close above SMA 50", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 50}}, "output": "ma"}}
 ]}
```

## Combine with
- **A slow SMA as the trend filter.** SMA 200 lags 99.5 bars, so "close above SMA 200" is a sharp but late test of
  the long trend ($\rho = 12.2$). The LSMA's zero lag complements it: it confirms that the *recent* trend points the
  same way.
- **The LSMA slope as the trigger.** "LSMA 25 slope up" reacts within a fraction of the window, so it times entries
  inside the filter's trend.
- **RSI as a confirmation.** RSI above 50 says the recent gains outweigh the losses; it measures almost the same thing
  as the slope, so expect it to add little.

With seed 1 on `reversal` (horizon 10): close above SMA 200 alone +1.48 % (−0.05 % to +3.01 %, n = 36), LSMA 25
slope up alone +1.69 % (+0.58 % to +2.80 %, n = 46), both together +2.47 % (+0.92 % to +4.02 %, n = 26); adding RSI 14
above 50 gives +2.13 % (n = 25), no improvement. The AND of the first two stays positive with its interval above 0
for seeds 1 to 5. On `random_walk` the same pair has no edge (seed 1: +0.38 %, −1.89 % to +2.65 %, n = 25). The
filter and trigger agree only when the trend is old enough for both to see it, which is when it is most likely to
persist. One sample, no costs; not investment advice.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Close above SMA 200", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 200}}, "output": "ma"}},
  {"label": "LSMA 25 slope up (above LSMA 25 offset 1)", "left": {"indicator": {"id": "lsma", "params": {"length": 25}}, "output": "ma"},
   "op": "gt", "right": {"indicator": {"id": "lsma", "params": {"length": 25, "offset": 1}}, "output": "ma"}},
  {"label": "RSI 14 above 50", "left": {"indicator": {"id": "rsi", "params": {}}, "output": "rsi"}, "op": "gt",
   "right": {"value": 50}}
 ]}
```

## Differences vs TradingView
Same as Pine `ta.linreg(source, length, offset)` = `intercept + slope * (length - 1 - offset)`. Verified against
TA-Lib `LINEARREG` for offset 0.

## Pitfalls
- Here `offset` is the regression offset, not a plot shift as on the other averages. Raising it adds exactly that
  many bars of lag.
- A 31% step overshoot and a 34% gain bump at about $1.7n$ bars: swings of that length are exaggerated.
- Negative offsets (TA-Lib `TSF`, a one-bar-ahead forecast of the line) are not offered; the minimum is 0.
- "Price above the LSMA" is not a trend signal (it is right half the time in any steady trend); use the slope.
- The fitted slope is a late turn signal: after a V-shaped turn it keeps its old sign for about half the window.

## Exercise
1. In the "Why it works" lab, keep `reversal` and switch on only "Close above LSMA 50", then only "Close above SMA
   50". Which one has an edge, and how does $\rho$ explain it? Then switch to `random_walk`: what happens to all
   three edges, and why must they vanish?
2. In the first lab, set the scenario to `reversal` and move the length from 10 to 80. How many bars after the turn
   does the line keep rising, and when is it furthest past the price? Compare with the ideal V in "How to read it"
   (7 and 16 bars at $n = 50$) and with the step overshoot of 1.308.
3. Start the replay on SPY at the first trading day of 2022, just before the 2022 bear market, with LSMA 25 and
   SMA 25. Step through January: which line turns down first, and does the LSMA overshoot at the first low?

```lab
{"kind": "replay", "symbol": "SPY", "date": "2022-01-03",
 "indicators": [{"id": "lsma", "params": {"length": 25}}, {"id": "sma", "params": {"length": 25}}]}
```
