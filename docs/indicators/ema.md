# Exponential Moving Average (`ema`)

A first-order recursive (IIR) low-pass filter: each new bar moves the average a fixed fraction $\alpha$ of the way to
the price. With $\alpha = \frac{2}{n+1}$ it has the same lag and the same noise reduction as an $n$-bar SMA, but no
spectral nulls and an infinite memory. Use it when you want a smooth trend line that reacts to the newest bar at once.

## What it measures
The question it answers: "where is the trend level, if every new bar counts a fixed share and older bars fade
away?" It is a trend-following average that reacts to the newest price immediately ($\alpha = 20\%$ of the gap at
$n = 9$) and forgets old prices geometrically. Its gap to price on a steady trend is slope × $\frac{n-1}{2}$, as for
the SMA, but it has no drop-off effect: an old bar's influence fades smoothly instead of vanishing on a fixed day.

Move the length on a market that turns: a short EMA turns with price, a long one keeps rising well after the top.

```lab
{"kind": "param", "indicator": "ema", "vary": "length", "min": 2, "max": 200, "scenario": "reversal"}
```

## Formula
$$
\textcolor{#FF6D00}{E_t} = \alpha\,x_t + (1-\alpha)\,\textcolor{#FF6D00}{E_{t-1}}
= \textcolor{#FF6D00}{E_{t-1}} + \alpha\,(x_t - \textcolor{#FF6D00}{E_{t-1}}),
\qquad \alpha = \frac{2}{n+1},
\qquad \textcolor{#FF6D00}{E_{n-1}} = \frac1n\sum_{i=0}^{n-1} x_i
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#FF6D00}{E_t}$ | the EMA at bar $t$ (the orange line) | price |
| $x_t$ | the source (close by default) at bar $t$ | price |
| $\alpha$ | smoothing factor: the share of the gap closed per bar | 0–1 (0.2 at $n = 9$) |
| $n$ | length | bars, 1–5000 (default 9) |
| $\textcolor{#FF6D00}{E_{n-1}}$ | the seed: the SMA of the first $n$ values | price |

In $z$-transform form, and unrolled from the seed:

$$
H(z) = \frac{\alpha}{1 - p\,z^{-1}}, \qquad p = 1 - \alpha,
$$

a single real pole at $z = p$ ($p = 0.8$ for $n = 9$);

$$
\textcolor{#FF6D00}{E_t} = \sum_{k=0}^{t-n} \alpha\,p^{k}\,x_{t-k} \;+\; p^{\,t-n+1}\,\textcolor{#FF6D00}{E_{n-1}}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $H(z)$ | transfer function, $z^{-1}$ = one-bar delay | — |
| $p$ | pole, the share of yesterday's EMA kept | 0–1 (0.8 at $n = 9$) |
| $k$ | age of a bar | bars, $\ge 0$ |
| $\alpha p^k$ | weight of the bar $k$ bars ago | — |
| $p^{\,t-n+1}$ | weight left on the seed | — , decays to 0 |

## Kernel, lag and noise
Impulse response $h_k = \alpha\,p^k$ for $k \ge 0$; DC gain $\sum_k \alpha p^k = \frac{\alpha}{1-p} = 1$.

**Lag.** Using $\sum_{k\ge0} k\,p^k = \frac{p}{(1-p)^2}$:

$$
\bar k = \sum_k k\,\alpha p^k = \frac{\alpha p}{(1-p)^2} = \frac{1-\alpha}{\alpha}.
$$

**Noise.**

$$
\mathrm{NRF} = \sum_k \alpha^2 p^{2k} = \frac{\alpha^2}{1-p^2} = \frac{\alpha^2}{(1-p)(1+p)} = \frac{\alpha}{2-\alpha}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\bar k$ | lag: the kernel's centre of mass | bars, $\frac{n-1}{2}$ |
| $\mathrm{NRF}$ | noise reduction factor: output variance / input variance for white noise | — , $\frac1n$ |
| $\alpha,\ p$ | smoothing factor and pole, $p = 1 - \alpha$ | 0–1 |

**Why $\alpha = \frac{2}{n+1}$.** The EMA has one free parameter. Ask it to match the $n$-bar SMA's lag:
$\frac{1-\alpha}{\alpha} = \frac{n-1}{2}$ gives $\alpha = \frac{2}{n+1}$. Ask it instead to match the SMA's noise
reduction: $\frac{\alpha}{2-\alpha} = \frac1n$ gives $\alpha = \frac{2}{n+1}$ again. Both maps are monotone in
$\alpha$, so each condition has exactly one solution, and it is the same one. $\mathrm{EMA}_n$ is therefore the unique
exponential average that is indistinguishable from $\mathrm{SMA}_n$ both on a straight trend and on white noise.
Equivalently, eliminating $\alpha$: every EMA satisfies $\mathrm{NRF} = \frac{1}{2\bar k + 1}$, exactly the SMA's
lag–noise curve. The two differ only in the shape of the kernel: a finite box with nulls versus an infinite
geometric tail without them. (Wilder's smoothing, $\alpha = \frac1n$, is the same filter as $\mathrm{EMA}_{2n-1}$; see
the SMMA page.)

**Frequency response.**

$$
\lvert H(e^{j\omega})\rvert^2 = \frac{\alpha^2}{1 - 2p\cos\omega + p^2},
\qquad
\tau(\omega) = -\frac{d\arg H}{d\omega} = \frac{p\cos\omega - p^2}{1 - 2p\cos\omega + p^2}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\omega$ | angular frequency, $2\pi/P$ for a cycle of period $P$ | rad per bar, $0$ to $\pi$ |
| $\lvert H(e^{j\omega})\rvert$ | gain for that cycle | 0–1 |
| $\tau(\omega)$ | group delay: how late that cycle comes out | bars |

The denominator grows as $\cos\omega$ falls, so $\lvert H\rvert$ decreases monotonically from 1 at DC to
$\frac{\alpha}{1+p} = \frac{\alpha}{2-\alpha} = \frac1n$ at $P = 2$: no nulls, no ripple. The group delay is
$\frac{p}{1-p} = \bar k$ at DC, crosses zero where $\cos\omega = p$, and ends at $-\frac{p}{1+p}$ at $P = 2$.

| At the default $n = 9$ ($\alpha = 0.2$) | Value |
|---|---|
| Lag $\bar k$ | 4.000 bars (measured ramp lag 4.000) |
| NRF | 0.1111 |
| Half-power (−3 dB) period | 28.0 bars (SMA(9): 20.2) |
| Gain at $P = 9$ / $P = 2$ | −10.2 dB / −19.08 dB |
| Group delay zero crossing | $P = 2\pi/\arccos(0.8) = 9.76$ bars |
| Group delay at $P = 2$ | −0.444 bars |
| Weight in the last $n$ bars | $1 - p^n = 86.6\%$ (tends to $1 - e^{-2} = 86.5\%$ for large $n$) |

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 9 | TradingView default (range 1–5000) |
| Source | close | TradingView default |
| Offset | 0 | Display shift to the right, $0$–$500$ |

## Warm-up
First valid bar index: $n - 1$ (8 at the default), the bar of the SMA seed; plus the offset. If the input itself
starts with `NaN` (an EMA of another indicator), the seed is the SMA of its first $n$ valid values.

## Filter view
- **Impulse:** geometric stems $0.2, 0.16, 0.128, \dots$ (ratio 0.8). The drawer shows them until they fall below
  $10^{-4}$ of the first one: 43 stems at $n = 9$. The tail never ends exactly.
- **Step:** $1 - p^{k+1}$: 0.2, 0.36, 0.488, ... It passes 90% only on the 11th bar (the SMA(9) reaches 100% on the
  9th) and approaches 1 asymptotically. No overshoot: all taps are positive.
- **Magnitude:** a smooth, monotone roll-off with no notches: −0.33 dB at 100 bars, −1.75 dB at 40, −4.71 dB at
  20, −10.2 dB at 9, down to −19.08 dB at 2. Compared with SMA(9) it attenuates more in the transition band (−4.71
  vs −3.08 dB at 20 bars) but never reaches a null: where the SMA deletes a 9-bar cycle, the EMA still passes 31% of
  its amplitude.
- **Group delay:** not flat. It falls from 3.91 bars at 200 (tending to 4 at very long periods) to 1.02 bars at 20,
  crosses zero at 9.76 and is −0.444 at 2. Slow trends are delayed by about $\bar k$, faster swings by less, so the
  EMA reshapes a swing slightly instead of just delaying it; the negative delay only affects cycles shorter than 9.76 bars,
  which it already attenuates by more than 9.5 dB.
- **Compare:** pick SMA with length 9 in the drawer's compare option. The lag and NRF rows of the table agree (4.00 and
  0.111), while every plot differs: that is the "same moments, different shape" result above.

## How to read it
- **Price above / below the line:** the close is above / below an exponentially weighted memory of past closes. In a
  steady trend the gap is about slope × $\frac{n-1}{2}$.
- **Slope:** $\textcolor{#FF6D00}{E_t} - \textcolor{#FF6D00}{E_{t-1}} = \alpha\,(x_t - \textcolor{#FF6D00}{E_{t-1}})$:
  the EMA rises exactly when the close is above yesterday's EMA. Since
  $x_t - \textcolor{#FF6D00}{E_t} = (1-\alpha)(x_t - \textcolor{#FF6D00}{E_{t-1}})$, that is the same as the close
  being above today's EMA: "line rising" and "price above the line" are one signal.
- **Two EMAs:** fast above slow is the classic trend state; the cross is when it changes (see `ma_cross`, and MACD,
  which is EMA 12 − EMA 26).
- **Trend vs range:** in a trend price stays on one side and the line slopes steadily; in a range the line goes flat
  and price crosses it back and forth.
- **Length:** a longer EMA lags more and crosses less; because there is no window, a very old shock still has a
  tiny weight $\alpha p^k$.

## Why it works
**The gap to price is an exponentially weighted momentum.** Write $\Delta x_t = x_t - x_{t-1}$ and
$e_t = x_t - E_t$. From the recursion, $e_t = p\,(\Delta x_t + e_{t-1})$, so

$$
x_t - \textcolor{#FF6D00}{E_t} = \sum_{j \ge 0} p^{\,j+1}\,\Delta x_{t-j},
\qquad
\sum_{j\ge0} p^{\,j+1} = \frac{p}{1-p} = \frac{n-1}{2}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\Delta x_{t-j}$ | price change of the bar $j$ bars ago | price per bar |
| $p^{\,j+1}$ | its weight, decaying geometrically | 0–1 |
| $\frac{n-1}{2}$ | the sum of the weights, equal to the lag | bars |

"Close above EMA" therefore means a geometrically weighted sum of recent price changes is positive; the weights add
up to the lag, so on a trend of slope $b$ the gap is $b\,\frac{n-1}{2}$. For two EMAs the same algebra gives, on a
ramp, $\mathrm{EMA}_{20} - \mathrm{EMA}_{50} = b\,(24.5 - 9.5) = 15\,b$: "EMA 20 above EMA 50" is a smoothed slope
estimate being positive, and a cross is its sign change.

**When it has an edge.** If price changes are independent of the past with a constant mean (a random walk, with or
without drift), the expected forward return is the same after any bar, so no EMA rule has an edge (the SMA page
writes this out). Momentum only predicts when the drift itself persists and changes rarely, as in `reversal`; in the
mean-reverting `range` the sign flips.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0],
 "rules": [
  {"label": "EMA 20 above EMA 50",
   "left": {"indicator": {"id": "ema", "params": {"length": 20}}, "output": "ma"}, "op": "gt",
   "right": {"indicator": {"id": "ema", "params": {"length": 50}}, "output": "ma"}},
  {"label": "Close above EMA 50", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "ema", "params": {"length": 50}}, "output": "ma"}}
 ]}
```

Measured with seed 1 (1000 bars, 10-bar look-ahead):

| Scenario | EMA 20 above EMA 50 | Close above EMA 50 |
|---|---|---|
| `reversal` | +2.25 % (95 % interval +1.28 % to +3.22 %, n = 42) | +2.18 % (+1.17 % to +3.19 %, n = 47) |
| `random_walk` | +0.65 % (−1.12 % to +2.41 %, n = 32) | +0.51 % (−0.85 % to +1.86 %, n = 42) |
| `uptrend` | +0.13 % (−0.86 % to +1.13 %, n = 59) | −0.05 % (−1.02 % to +0.91 %, n = 69) |
| `range` | −0.97 % (−2.11 % to +0.17 %, n = 52) | −0.74 % (−1.56 % to +0.08 %, n = 64) |

On `reversal` "EMA 20 above EMA 50" is positive with the interval above zero for seeds 1–5 (+1.47 % to +2.72 %); on
`range` it is negative for all five (−0.69 % to −1.69 %). On `random_walk` and `uptrend` the intervals contain zero
and the sign changes with the seed. One rule on one sample: not a backtest, not investment advice.

## Combine with
A classic stack: a slow EMA pair as the trend filter, MACD for momentum confirmation, RSI for a pullback entry. The
lab tests whether each layer adds information:

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "EMA 20 above EMA 50",
   "left": {"indicator": {"id": "ema", "params": {"length": 20}}, "output": "ma"}, "op": "gt",
   "right": {"indicator": {"id": "ema", "params": {"length": 50}}, "output": "ma"}},
  {"label": "MACD histogram above 0",
   "left": {"indicator": {"id": "macd", "params": {}}, "output": "hist"}, "op": "gt", "right": {"value": 0}},
  {"label": "RSI 14 below 50", "left": {"indicator": {"id": "rsi", "params": {}}, "output": "rsi"},
   "op": "lt", "right": {"value": 50}}
 ]}
```

With seed 1, on `reversal`: the EMA pair alone +2.25 % (n = 42); the MACD histogram above 0 alone −0.15 % (−1.17 %
to +0.88 %, n = 63); both together +1.98 % (+0.69 % to +3.27 %, n = 30). The histogram is MACD minus its signal line,
roughly the change of a smoothed slope (an acceleration), and `reversal` has no persistent acceleration, so it adds
nothing here; the filter carries the edge. RSI 14 below 50 alone is −1.26 % (−2.35 % to −0.18 %, n = 58), and all
three together leave n = 2: a dip below 50 while the histogram is positive is rare in a clean trend. On `range` the
EMA pair and the histogram together give −1.63 % (−2.70 % to −0.57 %, n = 37), negative for seeds 1–5. More rules
mean fewer episodes and more chances to fit noise (multiple testing). Not a backtest, not advice.

## Differences vs TradingView
The seed is the SMA of the first $n$ values (TA-Lib convention, also the seed Pine uses for `ta.rma`). ChartLab
matches TA-Lib `EMA` on every bar. The Pine manual's illustrative `pine_ema` seeds with the first value instead
($E_0 = x_0$). Two seeds differ by a term that decays as $p^k$: for $n = 9$, $0.8^{100} \approx 2.0\times10^{-10}$
of the initial difference after 100 bars. The chart loads $\max(25n, 250)$ extra bars before the first visible one
(when the symbol has that much history), which leaves a residual seed weight below $1.5\times10^{-21}$ for any $n$.
TradingView's own seed is still to be confirmed in the manual cross-check (`tv_crosscheck.json`).

## Pitfalls
- "Length" is not a window: the EMA uses the whole history; $n$ only sets $\alpha$.
- Its value depends, very weakly, on where the history starts. On a recent listing with less history than the
  lookback, the first bars after the warm-up still carry the seed.
- Not linear phase: cycles of different length are delayed by different amounts (see Filter view).
- RSI and ATR use Wilder's $\alpha = \frac1n$, not $\frac{2}{n+1}$; a "14" there behaves like an EMA(27).

## Exercise
1. In the first lab, on `reversal`, compare the two rules with seeds from the new-sample button. Then switch to
   `uptrend`: the trend is stronger than ever, so why does the edge vanish? (Hint: what is the baseline?)
2. In the combo lab, switch the MACD rule off and the RSI rule on. On `reversal` and then on `range`, which of the
   two rules changes sign, and what does that say about using a pullback entry without knowing the regime?
3. Start Replay on SPY on 3 January 2022, the record close before the 2022 bear market, with EMA 20 and EMA 50. Step
   forward until EMA 20 falls below EMA 50: how many bars after the high did the cross come, and how far had price
   already fallen? Relate it to the lags 9.5 and 24.5 bars: the cross waits until the smoothed slope estimate
   (about 15 × the slope on a straight decline) has turned negative.

```lab
{"kind": "replay", "symbol": "SPY", "date": "2022-01-03",
 "indicators": [{"id": "ema", "params": {"length": 20}}, {"id": "ema", "params": {"length": 50}}]}
```
