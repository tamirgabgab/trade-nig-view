# Weighted Moving Average (`wma`)

A linearly weighted [FIR](glossary:fir-filter) average: the newest bar weighs $n$, the oldest $1$. At the same length it [lags](glossary:lag) less than the
SMA and is a little noisier; at the same lag it is the least noisy average with non-negative weights. It is also the
building block of the Hull MA and the LSMA.

## What it measures
The question it answers: "what is the average price, if the newer a bar is the more it counts?" It is an average
that trusts recent bars more. On a steady trend it trails by $\frac{n-1}{3}$ bars, so it hugs price closer than an
SMA of the same length and turns sooner; old bars fade out linearly, so the drop-off effect of the SMA is much weaker
(the leaving bar weighs only $\frac{2}{n(n+1)}$).

Move the length on the `shock` scenario: after the −15 % [gap](glossary:gap) the WMA bends down quickly, then flattens smoothly, with
no second jolt when the gap bar leaves the window.

```lab
{"kind": "param", "indicator": "wma", "vary": "length", "min": 2, "max": 100, "scenario": "shock"}
```

## Formula
$$
\textcolor{#00BCD4}{\mathrm{WMA}_t} = \frac{\sum_{k=0}^{n-1}(n-k)\,x_{t-k}}{n(n+1)/2},
\qquad
H(z) = \frac{2}{n(n+1)}\sum_{k=0}^{n-1}(n-k)\,z^{-k}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#00BCD4}{\mathrm{WMA}_t}$ | the average at bar $t$ (the cyan line) | price |
| $x_{t-k}$ | the source (close by default) $k$ bars ago | price |
| $n$ | length; also the weight of the newest bar | bars, 1–5000 (default 9) |
| $n-k$ | weight of the bar $k$ bars ago: $n$ for the newest, $1$ for the oldest | — |
| $n(n+1)/2$ | sum of the weights (normaliser) | — |
| $H(z)$ | transfer function, $z^{-1}$ = one-bar delay | — |

## Kernel, lag and noise
[Impulse response](glossary:impulse-response) $h_k = \frac{2(n-k)}{n(n+1)}$ for $0 \le k \le n-1$: a ramp from $\frac{2}{n+1}$ (newest) down to
$\frac{2}{n(n+1)}$ (oldest). The normaliser is $\sum_{k<n}(n-k) = \frac{n(n+1)}{2}$, so the DC gain is 1.

**Lag.** With $\sum_{k<n} k(n-k) = n\cdot\frac{n(n-1)}{2} - \frac{(n-1)n(2n-1)}{6} = \frac{n(n-1)(n+1)}{6}$,

$$
\bar k = \frac{2}{n(n+1)}\cdot\frac{n(n-1)(n+1)}{6} = \frac{n-1}{3},
$$

two thirds of the SMA's $\frac{n-1}{2}$.

**Noise.** With $\sum_{k<n}(n-k)^2 = \sum_{j=1}^{n} j^2 = \frac{n(n+1)(2n+1)}{6}$,

$$
\mathrm{NRF} = \frac{4}{n^2(n+1)^2}\cdot\frac{n(n+1)(2n+1)}{6} = \frac{2(2n+1)}{3n(n+1)},
$$

which is $\frac{2(2n+1)}{3(n+1)}$ times the SMA's $\frac1n$ (1.27 at $n = 9$, tending to $\frac43$).

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\bar k$ | lag: the kernel's centre of mass | bars, $\frac{n-1}{3}$ |
| $\mathrm{NRF}$ | [noise reduction factor](glossary:noise-reduction-factor): output / input variance for white noise | — , about $\frac{4}{3n}$ |
| $n$ | length | bars |

**Equal lag instead of equal length.** A WMA with lag $L$ has $n = 3L + 1$ and
$\mathrm{NRF} = \frac{2(2L+1)}{(3L+1)(3L+2)}$, while an SMA or EMA with the same lag has $\frac{1}{2L+1}$. The ratio
tends to $\frac89$: at equal lag the WMA is about 11% quieter. Example, lag 4: WMA(13) has NRF 0.0989, SMA(9) and
EMA(9) have 0.1111.

**Why: the WMA is the minimum-noise average for its lag.** Minimise $\sum_k h_k^2$ subject to $\sum_k h_k = 1$,
$\sum_k k\,h_k = L$ and $h_k \ge 0$. The problem is strictly convex, and its KKT conditions give
$h_k = \max(\lambda + \mu k,\,0)$: a straight line clipped at zero. The WMA [kernel](glossary:kernel) is exactly such a clipped ramp
(it would reach zero at $k = n$), so for every lag of the form $\frac{n-1}{3}$ no non-negative kernel (SMA, EMA, ALMA,
any other) is smoother than $\mathrm{WMA}_n$.

**No nulls.** Multiply by $1 - z^{-1}$: $(1 - z^{-1})\sum_{k<n}(n-k)z^{-k} = n - \sum_{k=1}^{n} z^{-k}$. On the unit
circle the sum of $n$ unit phasors reaches $n$ only if all of them equal 1, i.e. at $\omega = 0$, where $H = 1$. So
$H(e^{j\omega})$ never vanishes: the WMA has no exact spectral zeros for any $n$. At $P = 2$ its gain is $\frac1n$ for
odd $n$ and $\frac{1}{n+1}$ for even $n$.

| At the default $n = 9$ | Value |
|---|---|
| Lag $\bar k$ | 2.667 bars (measured ramp lag 2.667) |
| NRF | 0.1407 |
| Half-power (−3 dB) period | 17.0 bars (SMA(9): 20.2) |
| Stopband | shallow shoulders near −13, −17 and −19 dB, lowest −19.9 dB at $P \approx 2.23$ |
| Gain at $P = 2$ | −19.08 dB |

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 9 | TradingView default (range 1–5000) |
| Source | close | TradingView default |
| Offset | 0 | Display shift to the right, $0$–$500$ |

## Warm-up
First valid bar index: $n - 1$ (8 at the default), plus the offset.

## Filter view
- **Impulse:** nine stems falling linearly from 0.2 to 0.0222, then zero.
- **Step:** $\frac{(k+1)(2n-k)}{n(n+1)}$: 0.2, 0.378, 0.533, ..., exactly 1 on the 9th bar. It rises faster than the
  SMA's straight ramp at first and then bends over; no overshoot, finite settling.
- **Magnitude:** −0.08 dB at 100 bars, −0.53 dB at 40, −2.15 dB at 20, then a stopband without notches: the
  Dirichlet nulls of the SMA are replaced by gentle ripples whose peaks and troughs differ by less than 1 dB.
- **[Group delay](glossary:group-delay):** the kernel is not symmetric, so the phase is not linear. The delay is 2.66 bars at 200 bars
  (2.667 at DC) and falls steadily through the passband (2.59 at 40 bars, 2.30 at 20), so faster swings are delayed
  less than a trend. In the stopband it dips to about −1.78 bars near $P \approx 8$ and then wanders.
- **Compare:** set the WMA to length 13 and compare it with EMA 9 or SMA 9: equal lag (4.00), lower NRF (0.099 vs
  0.111).

## How to read it
- **Price above / below the line:** as for any average, the close is above / below a (recency-weighted) mean; on a
  trend the gap is about slope × $\frac{n-1}{3}$, a third smaller than an SMA's at the same length.
- **Slope and turns:** on a trend it is $\frac{n-1}{6}$ bars less late than the SMA of the same length, so it
  usually turns sooner; it still never overshoots, because all its weights are positive. Its one-bar change is
  $\frac{2}{n+1}\bigl(x_t - \mathrm{SMA}_{t-1}\bigr)$: it rises while the close is above yesterday's SMA of the same
  length.
- **WMA vs SMA of the same length:** the WMA sits above the SMA when recent bars are higher than older ones in the
  window, i.e. when the window slopes up. This pair is a slope meter (see Why it works).
- **Trend vs range:** in a range the WMA wiggles a little more than the SMA ($1.27\times$ the noise variance at
  $n = 9$); in a trend it stays closer to price.
- **Length:** lag and smoothness both grow with $n$; to compare it fairly with an SMA or EMA, match the lag
  ($n_{\mathrm{WMA}} = 3L + 1$), not the length.

## Why it works
**WMA minus SMA is a least-squares slope.** Fit a straight line to the last $n$ closes by least squares, with
$\tau = 0$ for the oldest bar and $\tau = n-1$ for the newest. Its slope is

$$
\hat b_t = \frac{\sum_{\tau=0}^{n-1}(\tau - \bar\tau)\,x_{t-n+1+\tau}}{\sum_{\tau=0}^{n-1}(\tau - \bar\tau)^2},
\qquad \bar\tau = \frac{n-1}{2},
\qquad \sum_{\tau=0}^{n-1}(\tau - \bar\tau)^2 = \frac{n(n^2-1)}{12}.
$$

Since the WMA weight of the bar at $\tau$ is $\tau + 1$, the numerator equals
$\frac{n(n+1)}{2}\bigl(\mathrm{WMA}_t - \mathrm{SMA}_t\bigr)$, and dividing:

$$
\textcolor{#00BCD4}{\mathrm{WMA}_t} - \textcolor{#2962FF}{\mathrm{SMA}_t} = \frac{n-1}{6}\,\hat b_t .
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\hat b_t$ | least-squares slope of the last $n$ closes | price per bar |
| $\tau$ | position in the window, $0$ = oldest, $n-1$ = newest | bars |
| $\bar\tau$ | the window's mean position | bars, $\frac{n-1}{2}$ |
| $\textcolor{#00BCD4}{\mathrm{WMA}_t}$, $\textcolor{#2962FF}{\mathrm{SMA}_t}$ | WMA and SMA of the same length $n$ | price |

So "WMA above SMA" is exactly "the regression line over the window slopes up", and a cross of the two is a sign
change of the fitted slope. (The same identity gives the LSMA end point, $\mathrm{SMA} + \frac{n-1}{2}\hat b =
3\,\mathrm{WMA} - 2\,\mathrm{SMA}$; see the `lsma` page.) A fitted slope predicts only if slopes persist: on a random
walk the next increments are independent of it and the [edge](glossary:edge) is zero; on `reversal` the slope is positive mostly in
the rising half; on the [mean-reverting](glossary:mean-reversion) `range` an upward slope means price has moved away from the centre and the
sign flips.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0],
 "rules": [
  {"label": "WMA 50 above SMA 50",
   "left": {"indicator": {"id": "wma", "params": {"length": 50}}, "output": "ma"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 50}}, "output": "ma"}},
  {"label": "WMA 20 above SMA 20",
   "left": {"indicator": {"id": "wma", "params": {"length": 20}}, "output": "ma"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 20}}, "output": "ma"}}
 ]}
```

Measured with seed 1 (1000 bars, 10-bar [look-ahead](glossary:horizon)):

| Scenario | WMA 50 above SMA 50 | WMA 20 above SMA 20 |
|---|---|---|
| `reversal` | +1.97 % ([95 % interval](glossary:confidence-interval) +0.81 % to +3.14 %, n = 44) | +1.86 % (+0.75 % to +2.96 %, n = 48) |
| `random_walk` | −0.31 % (−1.87 % to +1.25 %, n = 36) | −0.13 % (−1.43 % to +1.16 %, n = 47) |
| `range` | −0.69 % (−1.71 % to +0.32 %, n = 47) | −0.62 % (−1.60 % to +0.36 %, n = 60) |

The 50-bar slope rule is positive with the interval above zero for seeds 1–5 on `reversal` (+1.41 % to +2.34 %) and
negative for all five on `range` (−0.59 % to −1.25 %). The 20-bar slope is noisier: positive on `reversal` for every
seed, but its interval clears zero only for two of the five. One rule on one sample: not a backtest, not advice.

## Combine with
The slope pair is a trend filter; a short WMA gives a pullback trigger ("close dipped below the fast line while the
slow slope is up"):

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "WMA 50 above SMA 50",
   "left": {"indicator": {"id": "wma", "params": {"length": 50}}, "output": "ma"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 50}}, "output": "ma"}},
  {"label": "Close below WMA 10", "left": {"price": "close"}, "op": "lt",
   "right": {"indicator": {"id": "wma", "params": {"length": 10}}, "output": "ma"}}
 ]}
```

With seed 1, on `reversal`: the slope filter alone +1.97 % (n = 44); "Close below WMA 10" alone −0.33 % (−1.42 % to
+0.76 %, n = 74); together +1.86 % (+0.39 % to +3.33 %, n = 32). The pullback rule alone has no edge, and inside the
filter it does not improve on the filter: the filter carries the information, the trigger only picks the entry bar.
On `range` the pair gives +0.00 % (−1.15 % to +1.16 %, n = 41). Not a backtest (an entry on a dip may still get a
better price, which an [event study](glossary:event-study) of close-to-close returns does not measure), and not advice.

## Differences vs TradingView
None expected; same formula as Pine `ta.wma` (called LWMA on some other platforms). Verified equal to TA-Lib `WMA`.
The manual TradingView cross-check (`tv_crosscheck.json`) is still waiting for values.

## Pitfalls
- "Less lag" is not free at equal length: WMA(9) has 27% more noise variance than SMA(9). Compare at equal lag
  instead, where the WMA wins: WMA(13) ≈ EMA(9) in lag, with less noise.
- No nulls: a cycle of exactly $n$ bars is attenuated (−10.7 dB at 9 bars for $n = 9$), not removed.
- The Hull MA (`hma`) and the LSMA (`lsma`) combine WMAs with negative weights; their overshoot comes from that
  combination, not from the WMA itself.

## Exercise
1. In the slope lab, switch the scenario from `reversal` to `range` and back, then turn on the 20-bar rule alone.
   Why does a shorter regression window give a noisier slope estimate? (The variance of $\hat b$ for white noise is
   $\frac{12\sigma^2}{n(n^2-1)}$: halving $n$ makes it about eight times larger.)
2. In the param lab on `shock`, set the length to 50 and look at the bar 50 bars after the gap. Compare with an SMA
   50 in your head (the SMA page's drop-off effect): why does the WMA's slope show no one-bar spike there? (Use the
   one-bar change from How to read it.)
3. Start Replay on the S&P 500 (`^GSPC`) on 9 March 2009, the low of the 2007–2009 bear market, with WMA 50 and
   SMA 50. Step forward until the WMA crosses above the SMA: the fitted 50-bar slope has turned positive. How many bars
   after the low did that take? Why does the slope of a V-shaped path turn positive only once a good part of the
   window lies after the low?

```lab
{"kind": "replay", "symbol": "^GSPC", "date": "2009-03-09",
 "indicators": [{"id": "wma", "params": {"length": 50}}, {"id": "sma", "params": {"length": 50}}]}
```
