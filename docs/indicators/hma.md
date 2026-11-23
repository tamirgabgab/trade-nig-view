# Hull Moving Average (`hma`)

Alan Hull's average (2005) cancels most of a WMA's lag with a difference of two WMAs, then smooths the result with a
short WMA of about $\sqrt n$ bars. It is a finite (FIR) filter, smooth and fast. Its lag is exactly zero only for some
lengths.

## What it measures
The question it answers: "where is the trend level right now, smoothed, with almost no delay?" It is a smooth trend
line that turns almost as soon as price does. Its slope (rising or falling) is the usual signal. Cycles of about
$1.4n$ to $1.5n$ bars are exaggerated by 25 to 30% (2.0 to 2.3 dB), so swings look larger on the HMA than in price.

Move the length on `range`: the HMA follows the swings of the mean-reverting price closely, and swings of about
$1.4n$ to $1.5n$ bars can come out wider on the HMA than in the price itself.

```lab
{"kind": "param", "indicator": "hma", "vary": "length", "min": 2, "max": 100, "scenario": "range"}
```

## Formula
$$
\textcolor{#F9A825}{H_t} = \mathrm{WMA}_s\big(2\,\mathrm{WMA}_m(x) - \mathrm{WMA}_n(x)\big)_t, \qquad m = \lfloor n/2 \rfloor, \quad s = \lfloor \sqrt n \rfloor
$$

with $\mathrm{WMA}_\ell$ the linear-weighted average, kernel $\frac{2(\ell-k)}{\ell(\ell+1)}$ for $k = 0\ldots\ell-1$.

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#F9A825}{H_t}$ | the HMA at bar $t$ (the yellow line) | price |
| $x$ | the source (close by default) | price |
| $n$ | length | bars, 2–5000 (default 9) |
| $m$ | length of the fast inner WMA | bars, $\lfloor n/2 \rfloor$ (4 at $n = 9$) |
| $s$ | length of the outer smoothing WMA | bars, $\lfloor \sqrt n \rfloor$ (3 at $n = 9$) |
| $\mathrm{WMA}_\ell$ | linear-weighted average of length $\ell$ | price |

## Kernel, lag and noise
The kernel is the convolution $h = w_s * (2w_m - w_n)$. Its length is $n + s - 1$ taps (11 at $n = 9$), its DC gain is
$2 - 1 = 1$, and it has negative taps because the inner difference subtracts the long WMA.

**Lag by moment algebra.** A WMA of length $\ell$ lags $\frac{\ell-1}{3}$ bars. First moments are linear in a
combination whose weights sum to 1, and they add in a cascade:

$$
\bar k = \underbrace{2\cdot\frac{m-1}{3} - \frac{n-1}{3}}_{\text{inner difference}} + \underbrace{\frac{s-1}{3}}_{\text{outer WMA}}
= \frac{s + 2m - n - 2}{3}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\bar k$ | lag of the HMA (first moment of its kernel) | bars, $-\frac23$ to about $\frac{\sqrt n - 2}{3}$ |
| $\frac{\ell - 1}{3}$ | lag of a WMA of length $\ell$ | bars |
| $m,\ s,\ n$ | the three WMA lengths | bars |

- $n$ even ($2m = n$): $\bar k = \frac{s-2}{3}$, which is zero only when $s = 2$, i.e. $n \in \{4, 6, 8\}$.
- $n$ odd ($2m = n - 1$): $\bar k = \frac{s-3}{3}$, which is zero only when $s = 3$, i.e. $n \in \{9, 11, 13, 15\}$.
- Lengths 2, 3, 5 and 7 have **negative** lag ($-\frac13$ bar, $-\frac23$ for $n = 3$): they lead a ramp.
- From $n = 16$ on, the lag is positive and grows like $\frac{\sqrt n - 2}{3}$. Some values: 0.67 bars at
  $n = 20$, 1 bar at $n = 26$, $28$ and $30$.

The zeros are integer coincidences. With unrounded lengths $m = n/2$ and $s = \sqrt n$, the inner difference has lag
$-\frac13$ (a slight lead) and the outer WMA adds $\frac{\sqrt n - 1}{3}$. Hull's design is therefore "low lag"
($\approx \sqrt n / 3$, small compared with the WMA's $n/3$), not zero lag. Rounding $m$ and $s$ down moves it across
zero for small $n$.

**Taps at $n = 9$** ($m = 4$, $s = 3$, newest first):

$$
h = (0.300,\ 0.411,\ 0.363,\ 0.185,\ 0.007,\ -0.070,\ -0.081,\ -0.059,\ -0.037,\ -0.015,\ -0.004)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $h$ | the 11 kernel weights, $h_0$ (newest bar) first | — , sum 1 |

The peak sits at $k = 1$, not $k = 0$, because the outer WMA spreads the newest bar over three taps. The six negative
taps sum to $-\frac{4}{15} = -0.267$.

**Noise and curvature.** At $n = 9$: $\mathrm{NRF} = 0.4418$, which is 4.0 times the SMA's $\frac19$ and 3.1 times
the WMA's 0.141. The second moment is $\sum_k k^2 h_k = -7.89$, so on a parabola $ct^2$ the HMA settles $7.89c$ below
price.

| $n = 9$ (measured) | WMA | HMA |
|---|---|---|
| Lag (bars) | 2.67 | 0 |
| NRF | 0.141 | 0.442 |
| Step peak | 1 (monotone) | 1.267 at bar 4 |
| Peak gain | none (below 0 dB) | +2.27 dB at $P \approx 13.5$ |
| $-3$ dB period | 17 bars | 6.3 bars |

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 9 | TradingView default (minimum 2) |
| Source | close | TradingView default |
| Offset | 0 | Display shift (bars to the right); adds that many bars of lag |

## Warm-up
First valid bar index: $n + s - 2$, which is 10 at $n = 9$. $\mathrm{WMA}_n$ is first valid at $n-1$, and the outer
$\mathrm{WMA}_s$ needs $s - 1$ more bars. Length must be $\ge 2$.

## Filter view
- **Impulse:** 11 stems: a hump peaking at $k = 1$ (0.411), a sign change after $k = 4$ and a negative lobe that ends
  at $k = 10$. The kernel is finite, so nothing follows.
- **Step:** the response climbs to **1.267** at bar 4 (27% overshoot) and returns to exactly 1 at bar 10, with no undershoot.
- **Magnitude:** about 0 dB at long periods, a bump of +2.27 dB (gain 1.30) near $P \approx 13.5$ bars, 0 dB again
  near 7.8 bars and $-3$ dB near 6.3 bars. At $P = 2$ it is $-20.3$ dB: the outer WMA gives good attenuation of
  bar-to-bar noise.
- **Group delay:** about 0 at long periods (0.035 bars at $P = 200$). It rises to 2.1 bars near $P \approx 11$ and is
  negative below about 4.5 bars (down to $-2.0$ near $P \approx 3.5$, where the gain is already $-17$ dB).

## How to read it
- **Slope:** the usual signal. The line turns soon after price at a clean turn and, thanks to the outer WMA, is
  smoother bar to bar than DEMA or TEMA of the same length ($-20.3$ dB at $P = 2$ against $-13.6$ and $-10.5$ dB).
- **Price above / below the line:** with (almost) zero lag the gap on a trend is (almost) zero, so the side of the
  line is mostly short-term noise, not a trend reading (see Why it works).
- **HMA vs a slower average:** HMA above an SMA or WMA of similar length means the trend is up: the gap is the slower
  line's lag times the slope.
- **Overshoot:** after a gap the HMA runs past price by up to 27 % of the jump at $n = 9$, then comes back within
  $n + s - 1$ bars.
- **Trend vs range:** in a range its swings are exaggerated (cycles near $1.4n$ to $1.5n$ bars by 25 to 30 %), so
  turns of the line come often.

## Why it works
**What a gap to a zero-lag line contains.** For any average with kernel $h$, the gap to price has the kernel
$\delta_k - h_k$, whose sum is 0 and whose first moment is $-\bar k$. On a trend of slope $b$:

$$
x_t - \textcolor{#F9A825}{H_t} = b\,\bar k_{H},
\qquad
\textcolor{#F9A825}{H_t} - \textcolor{#00BCD4}{\mathrm{WMA}_{n,t}} = b\left(\frac{n-1}{3} - \bar k_{H}\right).
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $x_t$ | close at bar $t$ | price |
| $b$ | slope of the trend | price per bar |
| $\bar k_{H}$ | lag of the HMA | bars, $\frac23$ at $n = 20$ |
| $\textcolor{#00BCD4}{\mathrm{WMA}_{n,t}}$ | WMA of the same length, lag $\frac{n-1}{3}$ | price |

At $n = 20$ the HMA's lag is $\frac23$ bar, so "close above HMA 20" is a trend reading with a weight of only
$\frac23$ of a bar of slope; the rest is the newest bars' noise. "HMA 20 above WMA 20" is
$b\,(6.33 - 0.67) = 5.67\,b$: a slope estimate with a real lever. So the zero-lag line is good for the *slope* of the
HMA and for HMA vs a slower line, and useless for price vs HMA. The edge itself still needs persistent drift
(`reversal`); on a random walk future increments are independent of the past and every rule has zero edge.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0],
 "rules": [
  {"label": "Close above HMA 20", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "hma", "params": {"length": 20}}, "output": "ma"}},
  {"label": "HMA 20 above WMA 20",
   "left": {"indicator": {"id": "hma", "params": {"length": 20}}, "output": "ma"}, "op": "gt",
   "right": {"indicator": {"id": "wma", "params": {"length": 20}}, "output": "ma"}}
 ]}
```

Measured with seed 1 (1000 bars, 10-bar look-ahead):

| Scenario | Close above HMA 20 | HMA 20 above WMA 20 |
|---|---|---|
| `reversal` | −0.10 % (95 % interval −1.14 % to +0.95 %, n = 73) | +1.68 % (+0.61 % to +2.76 %, n = 49) |
| `random_walk` | −0.25 % (−1.35 % to +0.84 %, n = 75) | +0.39 % (−0.90 % to +1.68 %, n = 48) |
| `range` | −0.58 % (−1.51 % to +0.35 %, n = 77) | −0.99 % (−1.98 % to +0.01 %, n = 59) |

On `reversal`, where every slow-average rule on these pages has a positive edge, "Close above HMA 20" has none for
seeds 1–5 (−0.12 % to +0.54 %, every interval contains zero). "HMA 20 above WMA 20" is positive for all five
(+0.37 % to +1.68 %), but with a 5.67-bar lever its interval clears zero for only two; on `range` it is negative for
all five. One rule on one sample: not a backtest, not investment advice.

## Combine with
Use the HMA where its low lag helps: as the fast leg of a trend state against a slow line, plus a dip of price below a
short HMA as the entry bar:

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "HMA 50 above SMA 50",
   "left": {"indicator": {"id": "hma", "params": {"length": 50}}, "output": "ma"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 50}}, "output": "ma"}},
  {"label": "Close below HMA 20", "left": {"price": "close"}, "op": "lt",
   "right": {"indicator": {"id": "hma", "params": {"length": 20}}, "output": "ma"}}
 ]}
```

The first rule is $b\,(24.5 - \frac53) \approx 22.8\,b > 0$ on a trend (HMA 50 lags $\frac53$ bars, SMA 50 lags
24.5). With seed 1, on `reversal`: HMA 50 above SMA 50 alone +2.02 % (+0.87 % to +3.17 %, n = 43), positive with the
interval above zero for seeds 1–5 (+1.19 % to +2.45 %); Close below HMA 20 alone −0.18 % (−1.19 % to +0.82 %,
n = 72); both +2.10 % (+0.93 % to +3.27 %, n = 35). As expected from the gap algebra, the dip rule carries no
information of its own and the pair keeps the filter's edge. On `range` the pair gives −0.72 % (−1.72 % to +0.29 %,
n = 40). Not a backtest, not advice.

## Differences vs TradingView
TradingView's built-in computes the same expression with `length/2` and `sqrt(length)` as the two WMA lengths. We
round both down ($m = \lfloor n/2 \rfloor$, $s = \lfloor\sqrt n\rfloor$). How Pine rounds a fractional WMA length is
unconfirmed (assumption E2) and is checked in the TradingView cross-check. At the default $n = 9$ only the inner length
is in question ($4$ vs $4.5$), since $\sqrt 9 = 3$ exactly.

## Pitfalls
- "Zero lag" depends on the length: 0 at 9 but $+\frac13$ at 10 and $+\frac23$ at 20. Small lengths lead the trend.
- The 27% step overshoot means the HMA can sit well beyond the highest (or lowest) recent close after a gap. Do not use
  it as a support or resistance level the way an SMA is used.
- About 4 times the SMA's noise variance at the same length. A slope-change signal on a short HMA whipsaws in ranges.
- Price crossing the HMA is not a trend signal: with (almost) zero lag the gap holds almost no trend information.

## Exercise
1. In the first lab, on `reversal`, compare the two rules over several new samples. Then switch the second rule's
   meaning in your head to "HMA 20 above SMA 20": the lever becomes $9.5 - 0.67 = 8.83$ bars. Would you expect a
   cleaner edge, and why is it still not a forecast on `random_walk`?
2. In the param lab on `range`, find a length where the HMA's swings look larger than the price's. Is the typical
   swing length of the path near $1.4n$ to $1.5n$ there?
3. Start Replay on META on 2 February 2022, the evening of its quarterly report; the next bar is the large gap down
   of 3 February. With HMA 9 and SMA 9 on, step forward bar by bar: on which bar after the gap is the HMA furthest
   below the new price level, and when does it turn back? Compare with the step response (peak 1.267 at bar 4,
   settled at bar 10) and with the SMA 9, which never overshoots.

```lab
{"kind": "replay", "symbol": "META", "date": "2022-02-02",
 "indicators": [{"id": "hma", "params": {"length": 9}}, {"id": "sma", "params": {"length": 9}}]}
```
