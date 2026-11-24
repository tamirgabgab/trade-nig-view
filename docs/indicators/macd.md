# MACD (`macd`)

Gerald Appel's Moving Average Convergence Divergence: the distance between a fast and a slow average, a signal line
that smooths it, and the histogram between the two. People use it as a [momentum](glossary:momentum) gauge: above or below zero for the
trend's direction, the signal-line crosses for turns in momentum.

## What it measures
The question it answers: "is the fast average above the slow one, and is the gap opening or closing?" The MACD line
is EMA 12 minus EMA 26 of the close, in price units. Above 0 the recent average is above the older one (price has
been rising); the histogram shows whether that gap is widening (strong colour) or narrowing (pale colour). In signal
terms it is a band-pass filter: it deletes the price level and keeps swings of roughly 20 to 140 bars.

Move the slow length on `reversal` (up half the bars, then down): a slow length close to the fast one gives a small,
nervous line; a long one gives a large, slow wave that turns well after the top.

```lab
{"kind": "param", "indicator": "macd", "vary": "slow_length", "min": 13, "max": 100, "scenario": "reversal"}
```

## Formula

$$
\textcolor{#2962FF}{\mathrm{MACD}_t} = \mathrm{MA}_f(x)_t - \mathrm{MA}_s(x)_t, \qquad
\textcolor{#FF6D00}{S_t} = \mathrm{MA}^{\text{sig}}_g(\textcolor{#2962FF}{\mathrm{MACD}})_t, \qquad
\textcolor{#26A69A}{\mathrm{Hist}_t} = \textcolor{#2962FF}{\mathrm{MACD}_t} - \textcolor{#FF6D00}{S_t}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#2962FF}{\mathrm{MACD}_t}$ | the MACD line (blue) | price, around 0 |
| $\textcolor{#FF6D00}{S_t}$ | the signal line (orange) | price, around 0 |
| $\textcolor{#26A69A}{\mathrm{Hist}_t}$ | the histogram (green above 0, red below) | price, around 0 |
| $x_t$ | the source (close by default) | price |
| $\mathrm{MA}_f,\ \mathrm{MA}_s$ | the [oscillator](glossary:oscillator) averages, fast and slow length (EMA by default) | price |
| $\mathrm{MA}^{\text{sig}}_g$ | the signal average of length $g$ (EMA by default) | price |
| $f,\ s,\ g$ | fast, slow and signal lengths | bars, 12 / 26 / 9 |

The signal average is seeded on the first valid MACD values. With the default EMAs every average is the one-pole
filter $\frac{\alpha}{1 - p\,z^{-1}}$ of the EMA page, with $\alpha = \frac{2}{n+1}$ and $p = 1 - \alpha$. Then

$$
G_M(z) = \frac{\alpha_f}{1 - p_f z^{-1}} - \frac{\alpha_s}{1 - p_s z^{-1}}
= \frac{(\alpha_f - \alpha_s)\,(1 - z^{-1})}{(1 - p_f z^{-1})(1 - p_s z^{-1})},
$$

because the numerator over the common denominator is
$\alpha_f(1 - p_s z^{-1}) - \alpha_s(1 - p_f z^{-1}) = (\alpha_f - \alpha_s) - (\alpha_f p_s - \alpha_s p_f)\,z^{-1}$
and $\alpha_f p_s - \alpha_s p_f = \alpha_f(1 - \alpha_s) - \alpha_s(1 - \alpha_f) = \alpha_f - \alpha_s$.

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $G_M(z)$ | transfer function from price to the MACD line; $z^{-1}$ = one-bar delay | — |
| $\alpha_f,\ \alpha_s$ | EMA factors $\frac{2}{f+1}$, $\frac{2}{s+1}$ | $\frac{2}{13} = 0.154$, $\frac{2}{27} = 0.074$ |
| $p_f,\ p_s$ | the two poles, $1 - \alpha$ | $\frac{11}{13} = 0.846$, $\frac{25}{27} = 0.926$ |
| $1 - z^{-1}$ | a one-bar difference: a zero at $z = 1$ (DC) | — |

So the MACD is a one-bar difference followed by two one-pole low-pass filters: a band-pass. The same algebra for the
signal and the histogram, with $1 - \frac{\alpha_g}{1 - p_g z^{-1}} = \frac{p_g\,(1 - z^{-1})}{1 - p_g z^{-1}}$:

$$
G_S(z) = G_M(z)\,\frac{\alpha_g}{1 - p_g z^{-1}}, \qquad
G_{\mathrm{Hist}}(z) = G_M(z)\left(1 - \frac{\alpha_g}{1 - p_g z^{-1}}\right)
= G_M(z)\,\frac{p_g\,(1 - z^{-1})}{1 - p_g z^{-1}} .
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $G_S(z),\ G_{\mathrm{Hist}}(z)$ | transfer functions to the signal line and to the histogram | — |
| $\alpha_g,\ p_g$ | the signal EMA's factor $\frac{2}{g+1}$ and pole | $0.2$, $0.8$ at $g = 9$ |

The signal is "MACD × EMA 9"; the histogram is "MACD × (1 − EMA 9)", a high-pass on top of the band-pass, with a
second zero at DC.

## Kernel, lag and noise
With linear averages (EMA, SMA, ...) the MACD line is a linear filter with [kernel](glossary:kernel) $h^{(f)}_k - h^{(s)}_k$: its DC gain is
$1 - 1 = 0$, so it removes the price level and keeps the trend's slope. On a straight line of slope $b$ it settles at
$b\,(\bar k_s - \bar k_f)$ (for EMAs $\bar k = (n-1)/2$: $b\,(12.5 - 5.5) = 7\,b$ at 12/26). It is a band-pass-like
filter, so "[lag](glossary:lag)" in the moving-average sense does not apply.

**MACD is a smoothed price change.** Divide the transfer function by the two EMAs' own gains:
$\frac{\alpha_f - \alpha_s}{\alpha_f \alpha_s} = \frac{1}{\alpha_s} - \frac{1}{\alpha_f} = \frac{s - f}{2}$, so

$$
\textcolor{#2962FF}{\mathrm{MACD}_t} = \frac{s - f}{2}\,\mathrm{EMA}_f\!\big(\mathrm{EMA}_s(\Delta x)\big)_t
= 7 \sum_{j \ge 0} c_j\,\Delta x_{t-j},
\qquad \sum_j c_j = 1, \quad \sum_j j\,c_j = \bar k_f + \bar k_s = 18 .
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\Delta x_t$ | one-bar price change $x_t - x_{t-1}$ | price per bar |
| $c_j$ | weight of the change $j$ bars ago: the EMA 12 and EMA 26 kernels convolved, all positive | sums to 1 |
| $\bar k_f + \bar k_s$ | centre of the weights: the two EMAs' lags added | 18 bars at 12/26 |
| $\frac{s-f}{2}$ | the scale | 7 at 12/26 |

The MACD line is 7 times a weighted average of the recent price changes, with positive weights centred 18 bars
back. On a ramp $\Delta x = b$ and the average is $b$, which is the $7\,b$ above. Checked against the implementation
on 1000 bars of each scenario: after bar 400 the two sides agree to $10^{-13}$ of the MACD's standard deviation.

**[Frequency response](glossary:frequency-response).** For a cycle of period $P$ ($\omega = 2\pi/P$),

$$
\lvert G_M(e^{j\omega})\rvert^2
= \frac{(\alpha_f - \alpha_s)^2\; 2\,(1 - \cos\omega)}
{\left(1 - 2p_f\cos\omega + p_f^2\right)\left(1 - 2p_s\cos\omega + p_s^2\right)} .
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\omega$ | angular frequency | rad per bar, $0$ to $\pi$ |
| $P$ | period of the cycle | bars, 2 to $\infty$ |
| $\lvert G_M(e^{j\omega})\rvert$ | amplitude gain of the MACD line for that cycle | 0 at DC, below 1 |

It is 0 at DC (the factor $1 - \cos\omega$) and small at $P = 2$, with one peak in between. **Where the peak is.**
For slow cycles, $1 - 2p\cos\omega + p^2 = (1-p)^2 + 2p(1 - \cos\omega) \approx \alpha^2 (1 + \tau^2\omega^2)$ with
$\tau^2 = \frac{p}{\alpha^2} = \frac{n^2 - 1}{4}$, and $2(1 - \cos\omega) \approx \omega^2$, so

$$
\lvert G_M\rvert^2 \approx \left(\frac{s-f}{2}\right)^2 \frac{\omega^2}{(1 + \tau_f^2\omega^2)(1 + \tau_s^2\omega^2)},
\qquad
\omega^\ast = \frac{1}{\sqrt{\tau_f\,\tau_s}},
\qquad
\lvert G_M\rvert_{\max} \approx \frac{(s-f)/2}{\tau_f + \tau_s} \approx \frac{s-f}{s+f} .
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\tau_f,\ \tau_s$ | time constants $\frac{\sqrt{n^2-1}}{2}$ of the fast and slow EMA | 5.98 and 12.99 bars |
| $\omega^\ast$ | frequency of the peak (maximise $u/((1 + \tau_f^2 u)(1 + \tau_s^2 u))$ over $u = \omega^2$) | rad per bar |
| $P^\ast = 2\pi/\omega^\ast$ | period of the peak, $\approx \pi\sqrt{f\,s}$ | 55.4 bars at 12/26 |
| $\lvert G_M\rvert_{\max}$ | gain at the peak | 0.369 ($-8.66$ dB) at 12/26 |

**How the lengths move it.** The peak period grows with the geometric mean $\sqrt{f\,s}$; the peak gain depends
only on the ratio $s/f$. Doubling both lengths (24/52) moves the peak to 111 bars at the same −8.67 dB; 5/35 (ratio
7) peaks at 41 bars and passes much more, −2.47 dB, since $\frac{35-5}{35+5} = 0.75$ ($-2.5$ dB). Closed form
(exact, not the approximation) against the implementation's Filter view:

| Output (12/26/9) | Peak period, closed form | Peak gain | −3 dB band |
|---|---|---|---|
| MACD | 55.3 bars | −8.66 dB | 21.7 to 140.7 bars |
| Signal | 66.1 bars | −9.50 dB | — |
| Histogram | 28.9 bars | −14.28 dB | 12.3 to 61.4 bars |

The drawer measures the response on a grid of 121 log-spaced periods, so it shows the peaks at 56.4, 65.7 and 29.4
bars, with the same gains (−8.66, −9.50, −14.28 dB). The signal line's extra low-pass moves its peak to longer
cycles; the histogram's extra high-pass moves its peak to shorter ones.

**The histogram is a smoothed change of MACD.** As above,
$\frac{p_g}{\alpha_g} = \frac{1-\alpha_g}{\alpha_g} = \frac{g-1}{2}$, so

$$
\textcolor{#26A69A}{\mathrm{Hist}_t} = \frac{g-1}{2}\,\mathrm{EMA}_g(\Delta\textcolor{#2962FF}{\mathrm{MACD}})_t
= 4\,\mathrm{EMA}_9(\Delta\textcolor{#2962FF}{\mathrm{MACD}})_t
= 28\,\mathrm{EMA}_9\!\big(\mathrm{EMA}_{12}(\mathrm{EMA}_{26}(\Delta^2 x))\big)_t .
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\Delta\mathrm{MACD}_t$ | one-bar change of the MACD line | price per bar |
| $\Delta^2 x_t$ | second difference of price, $\Delta x_t - \Delta x_{t-1}$: the acceleration | price per bar² |
| $\frac{g-1}{2}$ | the scale | 4 at $g = 9$ |

On a ramp the histogram settles at 0; on a parabola $x_t = \frac{c}{2}t^2$ (constant acceleration $c$) it settles at
$28\,c$ (measured with $c = 0.001$: 0.0280, while the MACD line rises by $7\,c$ per bar).

| Measured at 12/26/9 | MACD | Signal | Histogram |
|---|---|---|---|
| DC gain | 0 | 0 | 0 |
| NRF (white-noise input) | 0.01653 | 0.00714 | 0.00752 |

## Defaults
| Param | Default | Why |
|---|---|---|
| Fast length | 12 | TradingView default |
| Slow length | 26 | TradingView default |
| Signal smoothing | 9 | TradingView default |
| Source | close | TradingView default |
| Oscillator MA type | EMA | TradingView default |
| Signal line MA type | EMA | TradingView default |

Level 0.

## Warm-up
First valid bar index: MACD $\max(w(f), w(s))$ (25 at the defaults); signal and histogram
$\max(w(f), w(s)) + w_{\text{sig}}(g)$ (33). For EMAs $w(n) = n - 1$: MACD at $s - 1$, signal and histogram at
$s + g - 2$.

## Filter view
The MACD, its signal line and the histogram are linear with zero DC gain, so the drawer measures them as band-pass
filters: impulse, a [step response](glossary:step-response) that returns to 0, and the magnitude against the period (no lag: the centre of
mass of a kernel that sums to 0 is undefined). These figures are computed by running the real implementation.

```lab
{"kind": "filter", "indicator": "macd", "output": "macd"}
```

- **Impulse:** the MACD taps are $\alpha_f p_f^k - \alpha_s p_s^k$: 0.0798, 0.0616, 0.0466, ... (the first is
  $\frac{2}{13} - \frac{2}{27}$). They turn negative from the 10th tap on ($k \ge 9$, where
  $\alpha_f p_f^k < \alpha_s p_s^k$), and the negative tail cancels the positive head exactly.
- **Step:** the MACD's step response is $p_s^{k+1} - p_f^{k+1}$ ($k$ = bars since the step, 0 on the step bar): it
  rises to 0.278 at $k = 8$ and then decays back to 0 without going negative. A one-off jump in price is a
  temporary MACD bump, not a lasting level. The signal line peaks later (0.244 at $k = 13$). The histogram rises to
  0.122 at $k = 3$, is negative from $k = 14$ on and bottoms at −0.036 before returning to 0: after a jump the
  histogram first says "momentum up", then "momentum fading".
- **Magnitude:** as in the table above; the MACD line is within 3 dB of its peak for cycles between 21.7 and
  140.7 bars and is −8.66 dB at its 55-bar peak, the histogram −14.28 dB at 29 bars.

The classic short setting 5/35/5 shows how the lengths move the band: the MACD peak moves to about 41 bars (the
drawer's grid: 41.5) at −2.47 dB, the signal to about 50 bars at −2.94 dB and the histogram to about 15 bars at
−9.20 dB.

```lab
{"kind": "filter", "indicator": "macd", "output": "macd", "params": {"fast_length": 5, "slow_length": 35, "signal_length": 5}}
```

## How to read it
- **MACD above / below 0:** the fast EMA is above / below the slow EMA. A cross of 0 is exactly the fast EMA
  crossing the slow EMA (the `ma_cross` of EMA 12 and EMA 26). By the identity above it is also the sign of a
  weighted average of the last price changes, centred 18 bars back: a smoothed slope.
- **MACD vs signal:** MACD crossing above its signal line is exactly the histogram crossing above 0. Since the
  histogram is $4\,\mathrm{EMA}_9(\Delta\mathrm{MACD})$, the cross is where the MACD's smoothed slope turns from
  negative to positive: a trough of momentum (a few bars late), not a change of trend.
- **Histogram height:** the size of the smoothed change of MACD, an acceleration of price. Strong colour = the
  histogram is growing in its direction, pale = it is shrinking back to 0.
- **Trend vs range:** in a steady trend of $b$ price units per bar the MACD settles near $7\,b$ and the
  histogram near 0; in a range MACD oscillates around 0 and the histogram flips sign every swing.
- **Lengths:** longer lengths tune the filter to longer cycles ($P^\ast \approx \pi\sqrt{f s}$), a larger ratio
  $s/f$ lets more of them through.

## Why it works
**MACD > 0 is a momentum rule.** It says the weighted mean of recent price changes is positive. On a [random walk](glossary:random-walk) the
future changes are independent of the past, so the expected forward return after any bar, and after MACD > 0, is the
same $\mu h$: no [edge](glossary:edge). A momentum rule pays only when the drift itself persists, as in `reversal`; in the
[mean-reverting](glossary:mean-reversion) `range` a rise predicts a fall, so the sign flips.

**The histogram cross is an acceleration rule.** It says a smoothed second difference of price has turned
positive. That predicts something only if acceleration persists, and none of the synthetic scenarios has that (their
drift is constant or changes once), so there is no reason to expect an edge, and none is measured.

```lab
{"kind": "event", "indicator": "macd", "output": "macd", "op": "gt", "value": 0, "range": [-3, 3], "horizon": 10, "scenario": "reversal"}
```

```lab
{"kind": "event", "indicator": "macd", "output": "hist", "op": "crosses_above", "value": 0, "range": [-1, 1], "horizon": 10, "scenario": "reversal"}
```

Measured with seed 1 (1000 bars, 10-bar look-ahead):

| Scenario | MACD above 0 | Histogram crosses above 0 |
|---|---|---|
| `reversal` | +2.02 % ([95 % interval](glossary:confidence-interval) +0.94 % to +3.10 %, n = 45) | −0.28 % (−1.79 % to +1.23 %, n = 34) |
| `random_walk` | +0.35 % (−1.32 % to +2.02 %, n = 36) | −0.45 % (−1.77 % to +0.86 %, n = 34) |
| `uptrend` | +0.11 % (−0.93 % to +1.15 %, n = 64) | −0.33 % (−1.34 % to +0.68 %, n = 35) |
| `range` | −1.55 % (−2.38 % to −0.71 %, n = 57) | −0.62 % (−1.81 % to +0.56 %, n = 38) |

MACD above 0 on `reversal` is positive for seeds 1–5 (+1.48 % to +2.54 %) with every interval above zero; on
`range` it is negative for all five (−0.83 % to −1.83 %), with the interval below zero for four. On `random_walk`
and `uptrend` the sign changes with the seed: in `uptrend` the drift is constant, so the baseline already has it and
being above 0 adds nothing. The histogram cross has an interval containing zero in all 20 runs (four scenarios,
seeds 1–5), and its sign changes with the seed on each scenario. The zero-line cross ("MACD crosses above 0") is
rare on a trending path (2 to 7 episodes on `reversal`), too few to measure. One rule on one sample: not a backtest
(no costs, no position sizing), not investment advice.

## Combine with
MACD's two readings are different filters on the same price: the zero line is a trend filter (a smoothed slope), the
histogram cross a trigger (a turn of momentum). The classic setup uses them together: take the signal-line cross
only on the side of zero that agrees with the trend, optionally with a slow average as a second trend filter.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "MACD above 0", "left": {"indicator": {"id": "macd", "params": {}}, "output": "macd"},
   "op": "gt", "right": {"value": 0}},
  {"label": "Histogram crosses above 0",
   "left": {"indicator": {"id": "macd", "params": {}}, "output": "hist"}, "op": "crosses_above",
   "right": {"value": 0}},
  {"label": "Close above SMA 200", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 200}}, "output": "ma"}}
 ]}
```

With seed 1, on `reversal`: MACD above 0 alone +2.02 % (n = 45); the histogram cross alone −0.28 % (n = 34); both
together +2.85 % (+1.71 % to +3.98 %, n = 16), positive with the interval above zero for seeds 1–5 (+2.18 % to
+3.74 %). The edge is the filter's: the trigger alone has none, it only picks the bars inside the uptrend where
momentum turns up again, and it cuts n from 45 to 16. With the SMA 200 filter as well, +3.43 % (+1.68 % to +5.19 %,
n = 9): a higher mean on nine episodes, which is not evidence of anything. On `range` the pair is −2.04 % (−4.08 %
to +0.00 %, n = 14), negative for four seeds out of five: a trend rule in a market without a trend. More rules
mean fewer episodes and more chances to fit noise ([multiple testing](glossary:multiple-testing)). Not a backtest, not advice.

## Differences vs TradingView
- Same formula and defaults; TradingView offers SMA or EMA for both averages, here any of the 15 types.
- TA-Lib's `MACD` starts its fast EMA later (aligned with the slow one), so its first values differ; they converge
  after a few hundred bars.

## Pitfalls
- The MACD is in price units: values are not comparable across symbols or across a big price change of one symbol.
- Crossings of the signal line lag; on choppy prices they [whipsaw](glossary:whipsaw).
- It is a band-pass, not a trend line: after a one-off jump it returns to 0, and on a steady trend it reports the
  slope, not the level.
- The signal cross and the histogram's zero cross are the same event; do not count them as two confirmations.
- With other MA types (SMA, WMA, ...) the identities with 7 and 4 change: the ramp value is still
  $b\,(\bar k_s - \bar k_f)$ for linear averages, but adaptive or volume-weighted ones are not linear filters.

## Exercise
1. In the param lab, on `reversal`, move the slow length from 26 to 52 and then to 15. How do the size of the
   MACD wave and the bar of its zero cross after the top change? Relate it to $7\,b$ on a ramp (the scale is
   $\frac{s-f}{2}$) and to $P^\ast \approx \pi\sqrt{f\,s}$.
2. In the combo lab, switch the MACD-above-0 rule off and the SMA 200 rule on, so the histogram cross is filtered by
   a slower trend. Compare n and the edge on `reversal` and on `range`: which filter keeps more episodes, and why?
3. Start Replay on SPY on 19 February 2020, the record close before the COVID crash, with the default MACD. Step
   forward: on which bar does the histogram turn negative, and on which does the MACD line cross 0? Count the bars
   between them: the histogram (a smoothed acceleration) turns first, the zero line (a smoothed slope) confirms
   later. How far had price fallen by each of the two bars?

```lab
{"kind": "replay", "symbol": "SPY", "date": "2020-02-19", "indicators": [{"id": "macd", "params": {}}]}
```
