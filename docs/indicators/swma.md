# Symmetrically Weighted Moving Average (`swma`)

A fixed four-tap [FIR filter](glossary:fir-filter) with weights $\frac16, \frac26, \frac26, \frac16$ (Pine `ta.swma`). It has no length
input. Its purpose is not heavy smoothing but removing the two fastest possible oscillations, the 2-bar and 3-bar
zig-zags, with only 1.5 bars of [lag](glossary:lag). Pine uses it inside other indicators, for example the Relative Vigor Index.

## What it measures
A de-zig-zagged copy of price, 1.5 bars late: "what is price doing once the bar-to-bar alternation is removed?"
Plotted as an overlay it stays very close to the price itself; its use is as a pre-filter that removes bar-to-bar
alternation before another calculation looks at turns or crossings.

The SWMA has no length, so the only parameter is the display offset. Shift the line to the right and watch it fall
behind price: the 1.5-bar lag is small, and the offset shows what a few more bars of delay look like.

```lab
{"kind": "param", "indicator": "swma", "vary": "offset", "min": 0, "max": 10, "scenario": "random_walk"}
```

## Formula

$$
\textcolor{#8D6E63}{S_t} = \frac{x_t + 2x_{t-1} + 2x_{t-2} + x_{t-3}}{6},
\qquad
H(z) = \frac{1 + 2z^{-1} + 2z^{-2} + z^{-3}}{6} = \frac{1 + z^{-1}}{2}\cdot\frac{1 + z^{-1} + z^{-2}}{3}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#8D6E63}{S_t}$ | the SWMA at bar $t$ | price |
| $x_{t-k}$ | source price $k$ bars ago | price |
| $H(z)$ | transfer function of the filter | DC gain 1 |
| $z^{-1}$ | one-bar delay | |

The factorisation shows that the SWMA is a cascade of an SMA(2) and an SMA(3): $S = \mathrm{SMA}_2(\mathrm{SMA}_3(x))$.
The [kernel](glossary:kernel) is trapezoidal (the convolution of a 2-box and a 3-box), symmetric about $k = 1.5$.

## Kernel, lag and noise
[Impulse response](glossary:impulse-response) $h = \left(\frac16, \frac13, \frac13, \frac16\right)$ for $k = 0..3$, DC gain 1.

**Lag.** $\bar k = \frac{0\cdot1 + 1\cdot2 + 2\cdot2 + 3\cdot1}{6} = \frac96 = 1.5$ bars. Equivalently, centres of
mass add under convolution: $\frac{2-1}{2} + \frac{3-1}{2} = 0.5 + 1 = 1.5$.

**Noise.** $\mathrm{NRF} = \frac{1 + 4 + 4 + 1}{36} = \frac{5}{18} \approx 0.2778$. An SMA(4) has the same support and
the same lag but $\mathrm{NRF} = \frac14$: as a white-noise smoother the SWMA is slightly worse. What it buys is in the
frequency domain.

**[Frequency response](glossary:frequency-response).** Factor out the centre and use $\cos 3\theta = 4\cos^3\theta - 3\cos\theta$ with
$\theta = \omega/2$, $c = \cos(\omega/2)$:

$$
H(e^{j\omega}) = e^{-j\frac{3}{2}\omega}\;\frac{\cos\frac{3\omega}{2} + 2\cos\frac{\omega}{2}}{3}
= e^{-j\frac{3}{2}\omega}\;\frac{c\,(2c-1)(2c+1)}{3}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\omega$ | angular frequency, $2\pi/P$ for a cycle of $P$ bars | 0 to $\pi$ rad per bar |
| $e^{-j\frac32\omega}$ | the pure delay of 1.5 bars (linear phase) | modulus 1 |
| $c$ | $\cos(\omega/2)$ | 0–1 |

The real amplitude vanishes at $c = 0$ ($\omega = \pi$, $P = 2$) and at $c = \frac12$ ($\omega = \frac{2\pi}{3}$,
$P = 3$): exact nulls at 2 and 3 bars, one from each SMA factor. Between them the amplitude is negative, with a single
small sidelobe.

| Fixed kernel | SWMA | SMA(4), for comparison |
|---|---|---|
| Lag $\bar k$ | 1.500 bars (measured ramp lag 1.500) | 1.5 |
| NRF | 0.2778 | 0.25 |
| Half-power (−3 dB) period | 7.43 bars | 8.78 bars |
| Exact nulls | 3 and 2 bars | 4 and 2 bars |
| Gain at $P = 4$ / $P = 3$ | −12.55 dB / null | null / −12.04 dB |
| Sidelobe peak | −23.86 dB at $P \approx 2.46$ | −11.30 dB at $P \approx 2.73$ |

## Defaults
| Param | Default | Why |
|---|---|---|
| Source | close | Same default as the other averages (Pine `ta.swma` takes any series) |
| Offset | 0 | Display shift to the right, $0$–$500$ |

There is no length: the kernel is fixed.

## Warm-up
First valid bar index: $3$ (the fixed 4-bar window), plus the offset.

## Filter view
- **Impulse:** four stems $\frac16, \frac13, \frac13, \frac16$, then zero.
- **Step:** $\frac16, \frac12, \frac56, 1$: settled after 4 bars, no overshoot.
- **Magnitude:** almost flat for anything slower than about 10 bars (−0.40 dB at 20, −1.61 dB at 10), −3 dB at 7.43
  bars, −12.6 dB at 4, then the null at 3 (the nearest sample, at 3.05 bars, reads −39.7 dB) and the null at exactly
  2, which is a sample point and sits on the −120 dB floor. Both show as dips to the plot's lower edge. The small
  bump between 2 and 3 bars is the −23.9 dB sidelobe.
- **[Group delay](glossary:group-delay):** flat at 1.500 bars, because the kernel is symmetric (linear phase). The sign change of the
  amplitude between 2 and 3 bars adds a phase jump of $\pi$, not a change of slope. At $P = 2$ the gain is zero and
  the group delay is undefined, so the curve has a gap there.

## How to read it
- **Price above or below the line.** The SWMA is only 1.5 bars behind, so the side of price mostly reflects the last
  bar or two. It is not a trend test.
- **Slope.** The SWMA's one-bar change is the SWMA of the price increments (see "Why it works"): a smoothed 4-bar
  [momentum](glossary:momentum). Its sign flips less often than the sign of the raw one-bar change.
- **Crossings.** Its main use: compare the SWMA, not the raw close, with another line. A 2-bar zig-zag around a
  slower average produces a crossing on every other bar for the close and none for the SWMA.
- **Distance from price.** Small; a large gap means one or two bars moved far, which the SWMA spreads over four bars.
- **Trend vs range.** In both it follows price almost exactly; in a choppy range it removes the fastest flips.
- **The parameter.** There is none apart from the display offset, which adds a pure delay (and with it lag).

## Why it works
**Its slope is a weighted momentum.** Subtracting two consecutive values and writing $r_t = x_t - x_{t-1}$:

$$
\textcolor{#8D6E63}{S_t} - \textcolor{#8D6E63}{S_{t-1}} = \frac{r_t + 2r_{t-1} + 2r_{t-2} + r_{t-3}}{6}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#8D6E63}{S_t} - \textcolor{#8D6E63}{S_{t-1}}$ | one-bar change of the SWMA | price per bar |
| $r_t$ | one-bar price increment | price per bar |

On a [random walk](glossary:random-walk) with drift $b$ and increment noise $\sigma$ this has mean $b$ and standard deviation
$\sigma\sqrt{10}/6 = 0.53\,\sigma$, so "SWMA rising" is right about the trend's sign with probability
$\Phi(1.90\,b/\sigma)$, and "close above SWMA" with $\Phi(1.52\,b/\sigma)$ (trend-detection ratio $\rho = 1.52$, see
the LSMA page). Both are weak: an SMA 50 has $\rho = 6.09$. And on a random walk the increments after bar $t$ are
independent of all of these, so no rule built on them has an [edge](glossary:edge).

**What it does buy is fewer crossings.** Let $d_t$ be the gap between a line and a slower average, e.g. SMA 20. On a
random walk $d_t$ is a stationary Gaussian sequence (a fixed weighted sum of increments), and the chance of an upward
zero crossing on a given bar is

$$
P(d_{t-1} \le 0 < d_t) = \frac{\arccos \rho_1}{2\pi}, \qquad
\rho_1 = \operatorname{corr}(d_{t-1}, d_t)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $d_t$ | gap: close or SWMA minus SMA 20 | price |
| $\rho_1$ | lag-1 autocorrelation of the gap | 0.923 for the close, 0.974 for the SWMA |

Removing the 2- and 3-bar components raises $\rho_1$ from 0.923 to 0.974 and cuts the predicted up-crossings in
980 bars from 61.6 to 35.6, about 40 % fewer. The lab, with seed 1 on `random_walk` and a 1-bar [horizon](glossary:horizon) (so that
nearly every crossing counts): close crosses above SMA 20 n = 60, SWMA crosses above SMA 20 n = 37; over seeds 1 to 5
the counts are 58–76 and 30–43. The edges are noise (seed 1: +0.34 %, [95 % interval](glossary:confidence-interval) −0.02 % to +0.71 %, and −0.43 %,
−0.95 % to +0.09 %). The SWMA does not predict; it removes [whipsaws](glossary:whipsaw). One sample; not a backtest, not investment
advice.

```lab
{"kind": "combo", "scenario": "random_walk", "horizon": 1, "on": [0],
 "rules": [
  {"label": "Close crosses above SMA 20", "left": {"price": "close"}, "op": "crosses_above",
   "right": {"indicator": {"id": "sma", "params": {"length": 20}}, "output": "ma"}},
  {"label": "SWMA crosses above SMA 20", "left": {"indicator": {"id": "swma", "params": {}}, "output": "ma"},
   "op": "crosses_above", "right": {"indicator": {"id": "sma", "params": {"length": 20}}, "output": "ma"}}
 ]}
```

## Combine with
- **A slower average as the line to cross**: SWMA crossing SMA 20 instead of close crossing SMA 20 (the trigger, with
  fewer false flips).
- **SMA 200 as the trend filter**: only take the crossings in the direction of the long trend.
- **The raw close crossing as the comparison**: switch it on instead of the SWMA rule to see what the pre-filter
  changes.

With seed 1 on `reversal` (horizon 10): close above SMA 200 +1.48 % (−0.05 % to +3.01 %, n = 36), SWMA crosses above
SMA 20 +1.19 % (−0.01 % to +2.39 %, n = 23), close crosses above SMA 20 +0.57 % (−0.84 % to +1.99 %, n = 29). Filter
plus SWMA trigger: +0.91 % (−1.20 % to +3.02 %, n = 11); filter plus close trigger: +0.69 % (n = 12). With about ten
episodes the intervals are wide and the edge changes from seed to seed. On `random_walk` seed 2 the filter plus close
trigger even shows an interval above 0 (+2.67 %, n = 16) by pure chance: try enough rules and some will look
significant. One sample, no costs; not investment advice.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Close above SMA 200", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 200}}, "output": "ma"}},
  {"label": "SWMA crosses above SMA 20", "left": {"indicator": {"id": "swma", "params": {}}, "output": "ma"},
   "op": "crosses_above", "right": {"indicator": {"id": "sma", "params": {"length": 20}}, "output": "ma"}},
  {"label": "Close crosses above SMA 20", "left": {"price": "close"}, "op": "crosses_above",
   "right": {"indicator": {"id": "sma", "params": {"length": 20}}, "output": "ma"}}
 ]}
```

## Differences vs TradingView
Same formula as Pine `ta.swma`; there is no seed, so values do not depend on where the history starts. In
TradingView it exists as that Pine function (used by scripts such as the Relative Vigor Index) rather than as a
stand-alone built-in indicator; ChartLab shows it as an overlay. It is not part of the manual cross-check.

## Pitfalls
- No length input: the window is always 4 bars, so it cannot be made smoother.
- "Symmetric" describes the weights, not the timing: the filter is causal and runs 1.5 bars behind.
- For plain smoothing an SMA(4) is better (same lag, NRF 0.25 vs 0.278). Choose the SWMA when 2- and 3-bar
  oscillations must vanish, or when the low −24 dB sidelobe matters.
- Fewer crossings is not the same as better crossings: the pre-filter removes whipsaws, not the randomness of what
  follows.

## Exercise
1. In the "Why it works" lab, switch between the two rules on `random_walk`, `range` and `volatility_regime` and
   note n. Does the ratio stay near 0.6, as $\arccos\rho_1$ predicts for any random walk? The combine lab below
   counts the same two crossings with a 10-bar horizon: why are its n smaller?
2. In the combine lab, turn on rule 2 instead of rule 1 and press the new-sample button five times. How often does
   each combination have its interval above 0, and what does that say about choosing between them on one sample?
3. Start the replay on AAPL on 15 September 2008, the day of the Lehman Brothers bankruptcy, with the SWMA and an SMA
   20. Step through the following weeks: how many times does the close cross the SMA 20, and how many times does the
   SWMA?

```lab
{"kind": "replay", "symbol": "AAPL", "date": "2008-09-15",
 "indicators": [{"id": "swma", "params": {}}, {"id": "sma", "params": {"length": 20}}]}
```
