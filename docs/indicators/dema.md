# Double Exponential Moving Average (`dema`)

Patrick Mulloy's DEMA (1994): twice an EMA minus the EMA of that EMA. It follows a straight-line trend with zero lag,
at the price of more noise and a small overshoot after sudden moves. Use it when an EMA reacts too late.

## What it measures
The question it answers: "where is the trend level now, with the EMA's lag corrected away?" It is the trend level
with the EMA's lag removed. It turns earlier than an EMA of the same length but is choppier, and it briefly runs past
price after a gap or a sharp reversal.

Move the length on `reversal`: at the top the DEMA turns almost with price, while an EMA of the same length would
keep rising for about $\frac{n-1}{2}$ bars; at long lengths you can see it run past price after the turn.

```lab
{"kind": "param", "indicator": "dema", "vary": "length", "min": 2, "max": 100, "scenario": "reversal"}
```

## Formula
$$
\textcolor{#FF6D00}{E^{(1)}} = \mathrm{EMA}_n(x), \qquad E^{(2)} = \mathrm{EMA}_n\big(\textcolor{#FF6D00}{E^{(1)}}\big), \qquad
\textcolor{#26A69A}{D_t} = 2\textcolor{#FF6D00}{E^{(1)}_t} - E^{(2)}_t, \qquad \alpha = \frac{2}{n+1}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#26A69A}{D_t}$ | the DEMA at bar $t$ (the teal line) | price |
| $\textcolor{#FF6D00}{E^{(1)}}$ | EMA of the source, the plain EMA line | price |
| $E^{(2)}$ | EMA of that EMA (not plotted) | price |
| $x$ | the source (close by default) | price |
| $n$ | length of both EMAs | bars, 1–5000 (default 9) |
| $\alpha$ | EMA smoothing factor | 0–1 (0.2 at $n = 9$) |

Not to be confused with a "double-smoothed" EMA, which is $E^{(2)}$ alone (twice the lag of one EMA).

## Kernel, lag and noise
Write $\beta = 1-\alpha$ and $L = \frac{1-\alpha}{\alpha} = \frac{n-1}{2}$ (the EMA's lag). The EMA kernel is
$e_k = \alpha\beta^k$; the cascade $E^{(2)}$ has kernel $\alpha^2(k+1)\beta^k$, so

$$
h_k = \alpha\beta^k\big(2 - \alpha(k+1)\big).
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $h_k$ | DEMA weight of the bar $k$ bars ago | — , positive for $k < n$, negative after |
| $\beta$ | EMA pole, $1 - \alpha$ | 0–1 |
| $L$ | the EMA's lag | bars, $\frac{n-1}{2}$ |

The kernel is positive for $k < n$, exactly zero at $k = n$ (since $\alpha(n+1) = 2$) and negative for every $k > n$.

**Lag by moment algebra.** Lags (first moments) are linear in a combination whose weights sum to 1 and add in a
cascade. So $\bar k = 2L - (L + L) = 0$.

**Lag by transfer function.** With $E(z) = \frac{\alpha}{1-\beta z^{-1}}$,

$$
1 - E(z) = \frac{\beta\,(1 - z^{-1})}{1 - \beta z^{-1}}, \qquad H(z) = 2E - E^2 = 1 - \big(1 - E(z)\big)^2.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $E(z)$ | transfer function of one EMA | — |
| $H(z)$ | transfer function of the DEMA | — |
| $z^{-1}$ | one-bar delay | — |

$1 - H$ has a **double zero** at $z = 1$, so $H(1) = 1$ and $H'(1) = 0$. Since $-H'(1) = \sum_k k\,h_k$, the first
moment vanishes: on $x_t = a + bt$ the output is exactly $x_t$.

**Second moment and acceleration.** The EMA has $\sum_k k^2 e_k = L + 2L^2$ and variance $\kappa_2 = L + L^2$; variances
add in a cascade, which gives $\sum_k k^2 h_k = -2L^2$ ($-32$ at $n = 9$). On a parabola $x_t = ct^2$:

$$
\textcolor{#26A69A}{D_t} = c\big(t^2 - 2t\,\bar k + \textstyle\sum_k k^2 h_k\big) = x_t - 2cL^2.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $c$ | curvature of the test parabola | price per bar² |
| $\bar k$ | first moment (lag) of the DEMA kernel | 0 |
| $2cL^2$ | constant shortfall on an accelerating trend | price |

An EMA's error on a parabola keeps growing with $t$. DEMA's error stays constant: it trails an accelerating trend by a
fixed amount.

**Noise.** Summing $h_k^2$ in closed form:

$$
\mathrm{NRF} = \frac{5n^2 - 4n + 1}{2n^3} \;\to\; \frac{2.5}{n}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\mathrm{NRF}$ | noise reduction factor, $\sum_k h_k^2$ | — , 0.2538 at $n = 9$ |

At $n = 9$ this is $185/729 = 0.2538$, which is 2.28 times the EMA's $1/n = 0.111$. Removing the lag costs about 2.5
times the noise variance.

**Overshoot.** The step response is $s_k = 1 + \beta^{k+1}\big((k+1)\alpha - 1\big)$. It peaks at $k = n-1$, where
it equals $1 + \beta^{n+1}$: **1.1074** at $n = 9$, tending to $1 + e^{-2} = 1.135$ for long lengths. The overshoot is
exactly the total negative weight $\sum_{k>n} \lvert h_k \rvert$.

**Low-frequency view.** Treat $h_k$ as a signed distribution with cumulants $\kappa_r$. Then
$\ln H(e^{j\omega}) = \sum_r \kappa_r (-j\omega)^r / r!$, so
$\ln\lvert H \rvert \approx -\kappa_2\omega^2/2$ and the group delay is $\tau(\omega) \approx \kappa_1 - \kappa_3\omega^2/2$.
DEMA has $\kappa_1 = 0$ and $\kappa_2 = -2L^2 < 0$, so **its gain rises above 1** at low frequencies. A
non-negative kernel can never do that: its $\kappa_2$ is a true variance and $\lvert H \rvert \le \sum_k h_k = 1$.

| $n = 9$ (measured) | EMA | DEMA |
|---|---|---|
| Lag (bars) | 4.00 | 0 |
| NRF | 0.111 | 0.254 |
| Step peak | 1 (monotone) | 1.107 at bar 8 |
| Peak gain | none (below 0 dB) | +0.956 dB at $P \approx 42$ |
| $-3$ dB period | 28 bars | 12 bars |

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 9 | TradingView default |
| Source | close | TradingView default |
| Offset | 0 | Display shift (bars to the right); adds that many bars of lag |

## Warm-up
First valid bar index: $2(n-1)$, which is 16 at $n = 9$. The outer EMA is SMA-seeded on the first $n$ valid values of
the inner EMA, and the inner EMA's first valid index is $n-1$.

## Filter view
- **Impulse:** stems start at $h_0 = \alpha(2-\alpha) = 0.36$ and decay. They are exactly zero at $k = 9$ and form a
  small negative tail after that (minimum $-0.0088$ at $k = 13$), decaying geometrically.
- **Step:** the response rises to 1.107 at bar 8 and then falls back to 1 with no undershoot (the negative tail has a
  single sign).
- **Magnitude:** the curve sits above 0 dB for periods longer than about 22 bars, with a bump of +0.956 dB (gain 1.116)
  near $P \approx 42$. Cycles of that length are exaggerated by about 12%. It crosses $-3$ dB near 12 bars and has no
  spectral zeros ($-13.6$ dB at $P = 2$, against $-19.1$ dB for the EMA), so short-period noise gets through more.
- **Group delay:** 0 at DC. It grows like $-\kappa_3\omega^2/2 = 432\,\omega^2$ (0.39 bars at $P = 200$), peaks at
  2.47 bars near $P \approx 40$ and turns slightly negative below about 8 bars. Zero lag holds for trends only; a
  40-bar swing is still delayed by about 2.5 bars.

## How to read it
- **Price above / below the line:** on a straight trend price and DEMA coincide, so the side of the line says little
  about the trend; it mostly reflects the last few bars' noise.
- **DEMA vs EMA of the same length:** $\textcolor{#26A69A}{D} - \textcolor{#FF6D00}{E^{(1)}} =
  \textcolor{#FF6D00}{E^{(1)}} - E^{(2)}$, the lag correction. DEMA above the EMA means the correction is positive:
  a smoothed slope estimate is up (see Why it works).
- **Slope:** turns within a few bars of price at a clean turn; on a curved trend it trails by the constant $2cL^2$.
- **Trend vs range:** in a trend it hugs price; in a range it zigzags more than an EMA (2.3 times the noise variance
  at $n = 9$), so crossings with price come often.
- **Length:** a longer DEMA is smoother, but cycles near $4n$ to $5n$ bars are exaggerated by about 12 %.

## Why it works
**The lag correction is a smoothed momentum.** The EMA is linear, so (seeds aside)

$$
\textcolor{#26A69A}{D_t} - \textcolor{#FF6D00}{E^{(1)}_t} = \textcolor{#FF6D00}{E^{(1)}_t} - E^{(2)}_t
= \mathrm{EMA}_n\bigl(x - \textcolor{#FF6D00}{E^{(1)}}\bigr)_t ,
\qquad
\text{on } x_t = a + bt:\quad \textcolor{#FF6D00}{E^{(1)}_t} - E^{(2)}_t = b\,L .
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $x - \textcolor{#FF6D00}{E^{(1)}}$ | gap of price to the EMA, an exponentially weighted momentum (EMA page) | price |
| $b$ | slope of a straight trend | price per bar |
| $L$ | the EMA's lag, $\frac{n-1}{2}$ | bars |

The EMA trails a trend by $bL$ and the EMA of the EMA by $2bL$, so their difference measures $bL$ and the DEMA adds
it back: that is the zero lag. "DEMA above EMA" is therefore the sign of a smoothed momentum, a trend state. "Close
crosses above DEMA" is something else: since the DEMA tracks a trend with zero lag, the gap $x_t - D_t$ has no trend
component left (its kernel $\delta_k - h_k$ has zero sum and zero first moment). It is mostly the newest bars' noise,
and should carry no edge even where trends persist.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0],
 "rules": [
  {"label": "DEMA 20 above EMA 20",
   "left": {"indicator": {"id": "dema", "params": {"length": 20}}, "output": "ma"}, "op": "gt",
   "right": {"indicator": {"id": "ema", "params": {"length": 20}}, "output": "ma"}},
  {"label": "Close crosses above DEMA 20", "left": {"price": "close"}, "op": "crosses_above",
   "right": {"indicator": {"id": "dema", "params": {"length": 20}}, "output": "ma"}}
 ]}
```

Measured with seed 1 (1000 bars, 10-bar look-ahead):

| Scenario | DEMA 20 above EMA 20 | Close crosses above DEMA 20 |
|---|---|---|
| `reversal` | +2.19 % (95 % interval +1.17 % to +3.21 %, n = 43) | +0.70 % (−0.46 % to +1.87 %, n = 48) |
| `random_walk` | +0.67 % (−1.00 % to +2.34 %, n = 35) | +0.75 % (−0.42 % to +1.92 %, n = 50) |
| `range` | −1.33 % (−2.20 % to −0.46 %, n = 55) | −0.51 % (−1.46 % to +0.44 %, n = 57) |

"DEMA above EMA" is positive with the interval above zero for seeds 1–5 on `reversal` (+1.51 % to +2.61 %) and
negative on `range` for all five (−0.73 % to −1.91 %). The crossing's interval contains zero for every seed on every
one of these scenarios. On a random walk no rule has an edge: future increments are independent of anything known
now (the SMA page writes this out). One rule on one sample: not a backtest, not investment advice.

## Combine with
DEMA is a fast trend line, so it pairs with a slow trend filter (SMA 200: "the long trend is up") and serves as the
faster confirmation ("the short-term slope is up as well"):

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Close above SMA 200", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 200}}, "output": "ma"}},
  {"label": "DEMA 20 above EMA 20",
   "left": {"indicator": {"id": "dema", "params": {"length": 20}}, "output": "ma"}, "op": "gt",
   "right": {"indicator": {"id": "ema", "params": {"length": 20}}, "output": "ma"}}
 ]}
```

With seed 1, on `reversal`: Close above SMA 200 alone +1.48 % (−0.05 % to +3.01 %, n = 36), DEMA 20 above EMA 20
alone +2.19 % (n = 43), both +2.78 % (+1.23 % to +4.32 %, n = 25). The AND is positive for seeds 1–5 (+1.47 % to
+2.78 %), but not always above either rule alone, and its $n$ is smaller. On `range` the pair gives −1.34 % (−2.43 %
to −0.25 %, n = 40), on `random_walk` +0.15 % (−2.21 % to +2.51 %, n = 24). Not a backtest, not advice.

## Differences vs TradingView
Both EMAs are SMA-seeded (TA-Lib convention). The output is identical to TA-Lib `DEMA` on every bar. Whether Pine's
`ta.ema` seeds the same way is unconfirmed (assumption E2, see the EMA page). The two seeds' influence decays like
$k\beta^k$, and the chart loads at least $\max(25n, 250)$ extra bars, so any difference is far below display
precision.

## Pitfalls
- Zero lag means zero lag **on straight lines**. Accelerating trends leave a constant gap of $2cL^2$, and cycles of
  about $4n$ to $5n$ bars are both amplified and delayed.
- The output can leave the range of the prices it averages: after a step it rises 10.7% (of the step) above the new
  level.
- The noise variance is 2.3 to 2.5 times an EMA's. Do not compare DEMA and EMA crossovers at the same length as if they
  were equally smooth.
- Price crossing a zero-lag line is not a trend signal: the trend information is in DEMA vs EMA, not in price vs DEMA.

## Exercise
1. In the first lab, switch to the second rule alone on `reversal`, then press the new-sample button several times.
   Explain with the kernel $\delta_k - h_k$ why the crossing does not inherit the trend edge of the first rule.
2. In the param lab, set the length to 50 and find the top of the `reversal` path. How far does the DEMA run past
   price after the turn, and does it fit the step overshoot (+10.7 % of a step at $n = 9$, up to 13.5 % for long
   lengths)? (A turn is a change of slope, not a step, so expect a smaller effect.)
3. Start Replay on SPY on 24 December 2018, the low of the late-2018 sell-off, with DEMA 20 and EMA 20. Step forward
   and count the bars until the DEMA crosses above the EMA (the smoothed slope turns up), and compare with how long
   the EMA 20 itself takes to turn up.

```lab
{"kind": "replay", "symbol": "SPY", "date": "2018-12-24",
 "indicators": [{"id": "dema", "params": {"length": 20}}, {"id": "ema", "params": {"length": 20}}]}
```
