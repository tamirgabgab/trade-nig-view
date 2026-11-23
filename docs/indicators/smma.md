# Smoothed Moving Average (`smma`)

Welles Wilder's smoothing, known in Pine as `ta.rma` (RMA) and on other platforms as SMMA: an EMA whose step is
$\frac1n$ instead of $\frac{2}{n+1}$. It is the average inside RSI, ATR and ADX. Use it when you want to see exactly
what those indicators smooth with, or a slow, very smooth trend line.

## What it measures
The question it answers: "where is the trend level, if each new bar moves the average by only $\frac1n$ of its
distance?" It is Wilder's running average. It is the smoothing step inside RSI (average gain and loss), ATR (average
true range) and ADX, so plotting it on price shows how sluggish those internal averages are. As a trend line it is
twice as slow as the EMA of the same length: lag $n - 1$ instead of $\frac{n-1}{2}$.

Move the length on `volatility_regime` (calm, then much wilder): a long SMMA stays smooth through the wild half, at
the cost of a large lag.

```lab
{"kind": "param", "indicator": "smma", "vary": "length", "min": 2, "max": 100, "scenario": "volatility_regime"}
```

## Formula
$$
\textcolor{#AB47BC}{R_t} = \textcolor{#AB47BC}{R_{t-1}} + \frac{x_t - \textcolor{#AB47BC}{R_{t-1}}}{n}
= \frac{(n-1)\,\textcolor{#AB47BC}{R_{t-1}} + x_t}{n},
\qquad \textcolor{#AB47BC}{R_{n-1}} = \frac1n\sum_{i=0}^{n-1} x_i
$$

$$
H(z) = \frac{\alpha}{1 - p\,z^{-1}}, \qquad \alpha = \frac1n, \qquad p = 1 - \frac1n
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#AB47BC}{R_t}$ | the SMMA (RMA) at bar $t$ (the purple line) | price |
| $x_t$ | the source (close by default) at bar $t$ | price |
| $n$ | length | bars, 1–5000 (default 7) |
| $\textcolor{#AB47BC}{R_{n-1}}$ | the seed: the SMA of the first $n$ values | price |
| $H(z)$ | transfer function, $z^{-1}$ = one-bar delay | — |
| $\alpha$ | step: the share of the gap closed per bar | $\frac1n$ |
| $p$ | pole, the share of yesterday's value kept | $1 - \frac1n$ |

A single real pole at $z = p$ ($p = 6/7 \approx 0.857$ at the default $n = 7$).

## Kernel, lag and noise
Impulse response $h_k = \frac1n\left(1 - \frac1n\right)^k$ for $k \ge 0$, DC gain 1. The EMA results apply with
$\alpha = \frac1n$:

$$
\bar k = \frac{1-\alpha}{\alpha} = n - 1,
\qquad
\mathrm{NRF} = \frac{\alpha}{2-\alpha} = \frac{1}{2n-1}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\bar k$ | lag: the kernel's centre of mass | bars, $n - 1$ |
| $\mathrm{NRF}$ | noise reduction factor: output / input variance for white noise | — , $\frac{1}{2n-1}$ |

**$\mathrm{RMA}_n \equiv \mathrm{EMA}_{2n-1}$.** Solve $\frac{2}{m+1} = \frac1n$: $m = 2n - 1$. The RMA of length $n$
is the same filter as the EMA of length $2n-1$, so (by the EMA page's result) it also has the lag and the noise
reduction of an SMA of length $2n - 1$: lag $\frac{(2n-1)-1}{2} = n-1$ and NRF $\frac{1}{2n-1}$, as above. The
equivalence is of the recursion, not of the first bars: the RMA seeds with the SMA of $n$ values at bar $n-1$, the
EMA with the SMA of $2n-1$ values at bar $2n-2$. The two lines converge as the seeds fade. Measured: `smma` length 14
and `ema` length 27 give identical impulse, step and frequency responses (lag 13.00, NRF 0.03704).

**Frequency response.** As for any one-pole average,

$$
\lvert H(e^{j\omega})\rvert^2 = \frac{\alpha^2}{1 - 2p\cos\omega + p^2},
\qquad
\tau(\omega) = \frac{p\cos\omega - p^2}{1 - 2p\cos\omega + p^2},
$$

monotone with no nulls, falling to $\frac{\alpha}{2-\alpha} = \frac{1}{2n-1}$ at $P = 2$.

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\omega$ | angular frequency, $2\pi/P$ for a cycle of period $P$ | rad per bar, $0$ to $\pi$ |
| $\lvert H(e^{j\omega})\rvert$ | gain for that cycle | 0–1 |
| $\tau(\omega)$ | group delay of that cycle | bars |

| At the default $n = 7$ ($\alpha = 1/7$) | Value |
|---|---|
| Lag $\bar k$ | 6.000 bars (measured ramp lag 6.000) |
| NRF | 0.07692 ($= 1/13$) |
| Equivalent EMA / SMA length | 13 |
| Half-power (−3 dB) period | 40.7 bars |
| Gain at $P = 2$ | −22.28 dB |
| Group delay zero crossing | $P = 2\pi/\arccos(6/7) = 11.6$ bars |
| Group delay at $P = 2$ | −0.462 bars |

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 7 | TradingView default for the SMMA indicator (range 1–5000) |
| Source | close | TradingView default |
| Offset | 0 | Display shift to the right, $0$–$500$ |

## Warm-up
First valid bar index: $n - 1$ (6 at the default), the bar of the SMA seed; plus the offset.

## Filter view
- **Impulse:** geometric stems $0.1429, 0.1224, 0.1050, \dots$ (ratio $6/7$). The drawer shows 61 stems before they
  fall below $10^{-4}$ of the first; the tail is much longer than the EMA(7)'s.
- **Step:** $1 - (6/7)^{k+1}$: 0.143, 0.265, 0.370, ... It passes 90% only on the 15th bar; no overshoot.
- **Magnitude:** monotone roll-off: −0.66 dB at 100 bars, −3.09 dB at 40, −7.09 dB at 20, −12.3 dB at 10,
  −22.28 dB at 2. Identical in shape to the EMA(13) curve.
- **Group delay:** 5.74 bars at 200 (tending to 6), 0.77 at 20, zero at 11.6 bars and −0.462 at 2. As for every
  EMA, slow trends are delayed by about $n - 1$ bars and faster swings by less.

## How to read it
- **Price above / below the line:** as for the EMA, and the two are one signal: the line rises on exactly the bars
  where the close is above it, since $x_t - R_t = (1 - \frac1n)(x_t - R_{t-1})$ and
  $R_t - R_{t-1} = \frac1n(x_t - R_{t-1})$ have the same sign.
- **Trend vs range:** a slow, smooth line; in a trend price stays on one side, in a range the line goes flat and price
  crosses it often.
- **Length:** read "SMMA $n$" as "EMA $2n - 1$". An SMMA 50 is as slow as an SMA 99.
- **Inside other indicators:** RSI 14 compares Wilder averages of up and down moves, ATR 14 is the Wilder average of
  the true range; their 14 is this filter's 14, with lag 13 bars.

## Why it works
**The gap to price is a slow exponentially weighted momentum.** As on the EMA page, with $p = 1 - \frac1n$,
$x_t - R_t = \sum_{j \ge 0} p^{\,j+1}\,\Delta x_{t-j}$, and the weights add up to $\frac{p}{1-p} = n - 1$, the lag.

**RSI above 50 is the same as close above the SMMA of the same length.** RSI uses
$U_t = \max(\Delta x_t, 0)$ and $D_t = \max(-\Delta x_t, 0)$, so $U_t - D_t = \Delta x_t$. The RMA is linear and
time-invariant, so (apart from the seeds)

$$
\mathrm{RMA}_n(U)_t - \mathrm{RMA}_n(D)_t = \mathrm{RMA}_n(\Delta x)_t = \textcolor{#AB47BC}{R_t} - \textcolor{#AB47BC}{R_{t-1}},
\qquad
\textcolor{#7E57C2}{RSI_t} > 50 \iff \mathrm{RMA}_n(U)_t > \mathrm{RMA}_n(D)_t .
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $U_t,\ D_t$ | the up move and the down move of bar $t$ (one of them is 0) | price per bar, $\ge 0$ |
| $\Delta x_t$ | close-to-close change, $x_t - x_{t-1}$ | price per bar |
| $\mathrm{RMA}_n(\cdot)$ | Wilder smoothing of length $n$ (this indicator) | same units as its input |
| $\textcolor{#AB47BC}{R_t} - \textcolor{#AB47BC}{R_{t-1}}$ | one-bar change of the SMMA $n$ of the close | price per bar |
| $\textcolor{#7E57C2}{RSI_t}$ | RSI of length $n$ | 0–100 |

So $\mathrm{RSI}_{14} > 50$ exactly when the SMMA 14 of the close is rising, which by How to read it is exactly when
the close is above the SMMA 14. Measured on 1000 bars (seed 1): the sign of RSI 14 − 50 equals the sign of close −
SMMA 14 on every bar from bar 62 on, in all six scenarios; the few mismatches before that come from the two different
seeds. The 50 line of RSI is a trend filter with lag 13 bars, not a separate piece of information. As for any
average, the edge is zero on a random walk and appears only when the drift persists (`reversal`); on `range` it flips.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0],
 "rules": [
  {"label": "Close above SMMA 14", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "smma", "params": {"length": 14}}, "output": "ma"}},
  {"label": "RSI 14 above 50", "left": {"indicator": {"id": "rsi", "params": {}}, "output": "rsi"},
   "op": "gt", "right": {"value": 50}}
 ]}
```

Measured with seed 1 (1000 bars, 10-bar look-ahead):

| Scenario | Close above SMMA 14 | RSI 14 above 50 |
|---|---|---|
| `reversal` | +1.55 % (95 % interval +0.47 % to +2.63 %, n = 51) | +1.57 % (+0.48 % to +2.66 %, n = 51) |
| `random_walk` | +0.24 % (−1.05 % to +1.53 %, n = 54) | +0.18 % (−1.11 % to +1.47 %, n = 54) |
| `uptrend` | +0.03 % (−0.88 % to +0.95 %, n = 71) | −0.04 % (−0.96 % to +0.87 %, n = 71) |
| `range` | −0.51 % (−1.25 % to +0.23 %, n = 66) | −0.49 % (−1.21 % to +0.24 %, n = 66) |

The two columns are almost the same numbers, as the identity says. On `reversal` the RSI rule is positive for seeds
1–5 (+0.16 % to +1.68 %), but its interval clears zero for only three of them. One rule on one sample: not a
backtest, not investment advice.

## Combine with
Since RSI's 50 line is itself a Wilder trend filter, a slow SMMA plus "RSI above 50" is a two-speed trend filter
(close above both the SMMA 50 and, in effect, the SMMA 14). The pullback reading of RSI (below 40) is the opposite
idea, and the lab shows which one fits which regime:

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Close above SMMA 50", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "smma", "params": {"length": 50}}, "output": "ma"}},
  {"label": "RSI 14 above 50", "left": {"indicator": {"id": "rsi", "params": {}}, "output": "rsi"},
   "op": "gt", "right": {"value": 50}},
  {"label": "RSI 14 below 40", "left": {"indicator": {"id": "rsi", "params": {}}, "output": "rsi"},
   "op": "lt", "right": {"value": 40}}
 ]}
```

With seed 1, on `reversal`: Close above SMMA 50 alone +1.92 % (+1.01 % to +2.84 %, n = 48), RSI 14 above 50 alone
+1.57 % (n = 51), both together +2.13 % (+0.99 % to +3.28 %, n = 42): the two filters agree most of the time, so the
AND changes little. RSI 14 below 40 alone is −2.34 % (−3.66 % to −1.01 %, n = 40); with the SMMA 50 filter only
n = 3 episodes remain. On `range` the signs flip: SMMA 50 alone −0.91 % (−1.76 % to −0.06 %, n = 66), RSI below 40
alone +2.27 % (+0.73 % to +3.80 %, n = 25), and the two trend filters together −0.99 % (−1.86 % to −0.11 %, n = 59),
negative for seeds 1–5. Not a backtest, not advice.

## Differences vs TradingView
Same recursion and seed as Pine `ta.rma` (the SMA of the first $n$ values). The seed's weight decays as
$(1 - \frac1n)^k \le e^{-k/n}$. The chart loads $\max(25n, 250)$ bars before the first visible one (when the symbol
has that much history), so the residual seed weight there is below $e^{-24} \approx 3.8\times10^{-11}$ for any $n$.
TA-Lib has no RMA, so the reference is the golden scalar model only; the manual TradingView cross-check
(`tv_crosscheck.json`) is still waiting for values.

## Pitfalls
- "Length 14" in RSI or ATR means an RMA that behaves like an EMA(27) or SMA(27), not like an EMA(14).
- SMMA is not the SMA, despite the name.
- The seed fades slowly ($e^{-k/n}$): on a symbol with little history, the first $5n$ or so bars after the warm-up
  (residual weight above $e^{-5} \approx 0.7\%$) still depend on where the data starts.
- With a long length (RMA(50) has lag 49 bars), the line is mainly a long-term reference, not a timing tool.
- Combining "RSI above 50" with "close above SMMA 14" adds nothing: they are the same rule.

## Exercise
1. In the first lab, switch on both rules and compare $n$ and the edge of the AND with each rule alone. Then change
   the SMMA rule in your head to length 7: would the identity still hold for RSI 14? (No: it needs the same $n$.)
2. In the combo lab, on `range`, switch the second rule off and the third on. Why does the pullback rule win here
   and lose on `reversal`?
3. Start Replay on AAPL on 15 September 2008, the day Lehman Brothers filed for bankruptcy, with SMMA 14 and RSI 14.
   Step through the following weeks and check the identity on real data: every time RSI crosses 50, the close should
   cross the SMMA 14 on the same bar.

```lab
{"kind": "replay", "symbol": "AAPL", "date": "2008-09-15",
 "indicators": [{"id": "smma", "params": {"length": 14}}, {"id": "rsi", "params": {}}]}
```
