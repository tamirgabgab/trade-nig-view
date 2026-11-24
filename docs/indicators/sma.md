# Simple Moving Average (`sma`)

The equal-weight mean of the last $n$ values. It is the least noisy [FIR](glossary:fir-filter) average for a given window length and has
exact spectral nulls at period $n$ and its harmonics. Use it for a plain, reproducible "average price of the last
$n$ bars", or to remove a cycle whose length you know.

## What it measures
The question it answers: "what did the last $n$ bars cost on average, and is today's price above or below that?"
On a straight-line trend it runs exactly $\frac{n-1}{2}$ bars behind, so the gap between price and SMA is roughly
slope × [lag](glossary:lag). Price above a rising SMA means recent bars trade above the window's mean. Long SMAs (50, 200 on daily
bars) are watched as trend references mostly because many traders watch them.

Move the length: a short SMA hugs price and wiggles with it, a long one is smooth and trails the trend further.

```lab
{"kind": "param", "indicator": "sma", "vary": "length", "min": 2, "max": 200, "scenario": "uptrend"}
```

## Formula
$$
\textcolor{#2962FF}{\mathrm{SMA}_t} = \frac{1}{n}\sum_{k=0}^{n-1} x_{t-k},
\qquad
H(z) = \frac{1}{n}\sum_{k=0}^{n-1} z^{-k} = \frac{1}{n}\cdot\frac{1 - z^{-n}}{1 - z^{-1}}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#2962FF}{\mathrm{SMA}_t}$ | the average at bar $t$ (the blue line) | price |
| $x_{t-k}$ | the source (close by default) $k$ bars ago | price |
| $n$ | length, the number of bars averaged | bars, 1–5000 (default 9) |
| $k$ | age of a bar inside the window, $0$ = newest | bars, $0$ to $n-1$ |
| $H(z)$ | transfer function of the filter, $z^{-1}$ = one-bar delay | — |

The closed form of $H(z)$ is the running-sum view $y_t = y_{t-1} + \frac{x_t - x_{t-n}}{n}$: a comb $1 - z^{-n}$
followed by an integrator whose pole at $z = 1$ cancels the comb's zero there. ChartLab does not use the running sum;
it computes every window exactly (see Differences vs TradingView).

## Kernel, lag and noise
[Impulse response](glossary:impulse-response) $h_k = \frac1n$ for $0 \le k \le n-1$, zero otherwise. DC gain $\sum_k h_k = 1$.

**Lag.** Feed a straight line $x_t = a + bt$:

$$
y_t = \sum_k h_k\,\bigl(a + b(t-k)\bigr) = a + b\,(t - \bar k),
\qquad
\bar k = \sum_k k\,h_k = \frac{1}{n}\cdot\frac{n(n-1)}{2} = \frac{n-1}{2}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $y_t$ | filter output (here the SMA) at bar $t$ | price |
| $h_k$ | weight of the bar $k$ bars ago, $\frac1n$ | — |
| $a,\ b$ | level and slope of the test line | price, price per bar |
| $\bar k$ | lag: the kernel's centre of mass | bars, $\frac{n-1}{2}$ |

The SMA reproduces any trend exactly, shifted $\frac{n-1}{2}$ bars to the right. $\bar k$ is also the [group delay](glossary:group-delay) at
$\omega = 0$.

**Noise.** For white noise of variance $\sigma^2$, $\operatorname{Var}(y_t) = \sigma^2\sum_k h_k^2 = \sigma^2/n$, so
$\mathrm{NRF} = \frac1n$: the standard deviation shrinks by $\sqrt n$.

**Optimality.** Among all $n$-tap [kernels](glossary:kernel) with unit DC gain, Cauchy–Schwarz gives
$1 = \left(\sum_{k<n} h_k\right)^2 \le n\sum_{k<n} h_k^2$, with equality only for $h_k = \frac1n$. For a fixed window
the SMA is the best white-noise smoother there is; what it pays is lag, not noise.

**[Frequency response](glossary:frequency-response).** Sum the geometric series and factor out the centre of the window:

$$
H(e^{j\omega}) = e^{-j\omega\frac{n-1}{2}}\;\frac{\sin(n\omega/2)}{n\,\sin(\omega/2)}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\omega$ | angular frequency, $2\pi/P$ for a cycle of period $P$ | rad per bar, $0$ to $\pi$ |
| $P$ | period of a cycle | bars, $\ge 2$ |
| $e^{-j\omega\frac{n-1}{2}}$ | pure delay of $\frac{n-1}{2}$ bars | — |

The real factor is the Dirichlet kernel. Its magnitude $\left|\frac{\sin(n\omega/2)}{n\sin(\omega/2)}\right|$ vanishes
at $\omega = 2\pi m/n$, i.e. at periods $P = n/m$ for $m = 1, \dots, \lfloor n/2 \rfloor$. A cycle of exactly $n$,
$n/2$, $n/3$, ... bars is deleted completely, because every window then holds a whole number of cycles and they sum
to zero.

| At the default $n = 9$ | Value |
|---|---|
| Lag $\bar k$ | 4.000 bars (measured ramp lag 4.000) |
| NRF | 0.1111 |
| Exact nulls | periods 9, 4.5, 3 and 2.25 bars |
| Half-power (−3 dB) period | 20.2 bars (about $2.25\,n$ for any $n$) |
| Sidelobe peaks | −12.9, −16.7, −18.5 dB at periods 6.27, 3.64, 2.58 |
| Gain at $P = 2$ | $1/n$ for odd $n$, here −19.08 dB (an exact null for even $n$) |

As $n$ grows the Dirichlet kernel tends to a sinc and the first sidelobe tends to −13.26 dB.

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 9 | TradingView default (range 1–5000) |
| Source | close | TradingView default |
| Offset | 0 | Bars to shift the line right (display only; $0$–$500$, never negative, so no future bars are used) |

## Warm-up
First valid bar index: $n - 1$ (8 at the default), plus the offset. A `NaN` anywhere in a window gives `NaN` for
that bar.

## Filter view
- **Impulse:** nine equal stems of $1/9 = 0.1111$, then zero. The kernel is finite, so the plot ends there.
- **Step:** a straight ramp $\frac{k+1}{n}$ that reaches exactly 1 on the 9th bar. No overshoot: with $h_k \ge 0$
  the [step response](glossary:step-response) is a cumulative sum of non-negative taps and can only rise. Settling is finite ($n$ bars), unlike
  any IIR average.
- **Magnitude (dB vs period, 2–200 bars):** flat near 0 dB for long cycles (−0.11 dB at 100 bars, −0.73 dB at 40,
  −3.08 dB at 20), then the main lobe ends in the null at $P = 9$, followed by sidelobes and the nulls at 4.5, 3 and
  2.25. The response is sampled at 121 log-spaced periods, which do not land exactly on the nulls, so the samples
  nearest them read about −34 to −49 dB rather than the −120 dB floor; on the plot they are sharp dips to (or past)
  its lower edge.
- **Group delay:** a flat line at 4.000 bars across the whole axis. The kernel is symmetric
  ($h_k = h_{n-1-k}$), so the phase is linear. The Dirichlet factor changes sign from lobe to lobe, which adds jumps
  of $\pi$ to the phase but does not change its slope. Every component that passes is delayed by the same
  $\frac{n-1}{2}$ bars (no phase distortion); components in the first, third, ... sidelobes come out inverted.

## How to read it
- **Price above / below the line:** the last close is above / below the mean of the window. In a steady uptrend price
  stays above the SMA by about slope × $\frac{n-1}{2}$; in a downtrend below it.
- **Slope:** $\mathrm{SMA}_t - \mathrm{SMA}_{t-1} = \frac{x_t - x_{t-n}}{n}$, so the line rises when today's bar is
  above the bar that leaves the window (see Pitfalls).
- **Crossings:** price crossing the line is a change of sign of the gap. In a trend the crossings are rare and the
  gap is persistent; in a range price oscillates around the SMA and crosses it often.
- **Distance from price:** a large gap means price ran far from its recent mean. In a trend that is normal; in a range
  it tends to close again.
- **Length:** a longer window gives fewer, later crossings and a smoother line; a shorter one more, earlier and
  noisier crossings. On daily bars 20 ≈ a month, 50 ≈ ten weeks, 200 ≈ ten months of trading.

## Why it works
**The gap to price is a weighted sum of recent price changes.** Write $\Delta x_t = x_t - x_{t-1}$. Each term of the
window is $x_t - x_{t-k} = \sum_{j=0}^{k-1}\Delta x_{t-j}$, and averaging over $k$ gives

$$
x_t - \textcolor{#2962FF}{\mathrm{SMA}_t} = \sum_{j=0}^{n-2} \frac{n-1-j}{n}\,\Delta x_{t-j}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $x_t$ | close at bar $t$ | price |
| $\textcolor{#2962FF}{\mathrm{SMA}_t}$ | the average at bar $t$ | price |
| $\Delta x_{t-j}$ | price change of the bar $j$ bars ago | price per bar |
| $\frac{n-1-j}{n}$ | weight of that change: newest $\frac{n-1}{n}$, falling linearly to $\frac1n$ | — |

So "close above SMA" means: the linearly weighted sum of the last $n-1$ price changes is positive, a [momentum](glossary:momentum)
measure. Its weights add up to $\frac{n-1}{2}$, the lag, which is why the gap on a trend of slope $b$ is
$b\,\frac{n-1}{2}$. A crossing is a change of sign of this weighted momentum.

**When that can predict anything.** The [event study](glossary:event-study) compares the forward return $x_{t+h} - x_t$ after a signal with
the forward return after any bar. If price changes are independent of the past with a constant mean $\mu$ (a random
walk, with or without drift),

$$
\mathbb{E}\left[x_{t+h} - x_t \mid \text{anything known at } t\right] = h\,\mu ,
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $h$ | look-ahead (horizon) | bars, 10 in the labs |
| $\mu$ | mean change per bar (drift) | price per bar (log price in the synthetic scenarios) |

the same number after a signal as after any bar: the [edge](glossary:edge) is zero for every MA rule. That includes `uptrend`: price
above the SMA wins often there, but so does any bar, because the drift is constant. An edge needs dependence:

- `reversal` has a drift that flips sign once. The sign of the weighted momentum tells, with lag, which half you are
  in, so "close above SMA" has a positive edge.
- `range` is [mean-reverting](glossary:mean-reversion): in log price, $\mathbb{E}[x_{t+h} - x_t \mid x_t] = -\bigl(1 - (1-\theta)^h\bigr)(x_t - \ln 100)$
  with $\theta = 0.08$, so after 10 bars 57 % of the deviation from the centre is expected to be gone. Above a long
  SMA (close to the centre) the expected return is negative: the sign of the edge flips.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0],
 "rules": [
  {"label": "Close above SMA 50", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 50}}, "output": "ma"}},
  {"label": "Close crosses above SMA 50", "left": {"price": "close"}, "op": "crosses_above",
   "right": {"indicator": {"id": "sma", "params": {"length": 50}}, "output": "ma"}}
 ]}
```

Measured with seed 1 (1000 bars, 10-bar look-ahead):

| Scenario | Close above SMA 50 | Close crosses above SMA 50 |
|---|---|---|
| `reversal` | +1.73 % (95 % interval +0.50 % to +2.95 %, n = 47) | −0.77 % (−3.29 % to +1.75 %, n = 14) |
| `random_walk` | +0.17 % (−1.18 % to +1.52 %, n = 42) | +0.01 % (−1.81 % to +1.82 %, n = 20) |
| `uptrend` | −0.08 % (−1.13 % to +0.96 %, n = 66) | −0.31 % (−2.20 % to +1.59 %, n = 22) |
| `range` | −0.94 % (−1.78 % to −0.11 %, n = 63) | −0.67 % (−1.64 % to +0.31 %, n = 38) |

On `reversal` the "above" rule stays positive for seeds 1–5 (+1.24 % to +2.12 %, every interval above zero); on
`range` it is negative for all five (−0.54 % to −1.08 %). The crossing alone fires too rarely (5 to 14 counted
episodes on `reversal`) and has no stable sign: the information is in the state (which side of the line), not in the
moment of the cross. This is one rule on one sample, not a backtest (no costs, no exits), and not investment advice.

## Combine with
An SMA answers "which regime?", not "when?". The usual split is a slow SMA as the trend filter and a faster tool as
the trigger: an [oscillator](glossary:oscillator) (`rsi`) or the gap to a short SMA, which both measure a pullback. Whether the pullback rule
helps depends on the regime, and the lab shows it with the signs:

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Close above SMA 200", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 200}}, "output": "ma"}},
  {"label": "RSI 14 below 40", "left": {"indicator": {"id": "rsi", "params": {}}, "output": "rsi"},
   "op": "lt", "right": {"value": 40}},
  {"label": "Close below SMA 20", "left": {"price": "close"}, "op": "lt",
   "right": {"indicator": {"id": "sma", "params": {"length": 20}}, "output": "ma"}}
 ]}
```

With seed 1, on `reversal`: Close above SMA 200 alone +1.48 % (−0.05 % to +3.01 %, n = 36), RSI 14 below 40 alone
−2.34 % (−3.66 % to −1.01 %, n = 40), Close below SMA 20 alone −1.04 % (−2.17 % to +0.08 %, n = 62). The AND of the
first two keeps only n = 6 episodes (+0.91 %, −0.90 % to +2.72 %): too few to judge. Switch to `range` and the signs
flip: the SMA 200 filter alone −1.30 % (−2.35 % to −0.25 %, n = 51), RSI below 40 alone +2.27 % (+0.73 % to
+3.80 %, n = 25). Trend rules pay where trends persist, pullback rules where prices revert; the filter does not make a
pullback rule work in a trending market, it only thins it out. Same caveat: one sample, not a backtest, not advice.

## Differences vs TradingView
None expected; same formula as Pine `ta.sma`. ChartLab computes each window exactly (a sliding-window dot product,
$O(Nn)$), so there is no running-sum drift. Verified equal to TA-Lib `SMA`; the manual TradingView
cross-check (`tv_crosscheck.json`, AAPL daily, length 20) is still waiting for values.

## Pitfalls
- **Drop-off effect.** The slope is $\mathrm{SMA}_t - \mathrm{SMA}_{t-1} = \frac{x_t - x_{t-n}}{n}$: it depends on the
  bar that leaves as much as on the bar that enters. A large bar moves the line twice, when it arrives and again
  $n$ bars later when it leaves, even if nothing happens on that day.
- Exact nulls cut both ways: a cycle of exactly $n$ bars vanishes (an SMA(5) on daily bars removes a pure
  day-of-week pattern), but cycles in the first sidelobe still pass at about −13 dB, with inverted sign.
- Lag grows linearly with $n$: an SMA(200) on daily bars lags a trend by 99.5 bars, almost five months of trading days.
- Offset only moves the drawing to the right; it never reduces lag. A centred (negative) offset would need future
  bars and is not allowed.
- A high hit rate is not an edge: in an uptrend most bars are followed by gains, signal or not. Compare with the
  baseline, as the labs do.

## Exercise
1. In the first combo lab, keep only "Close above SMA 50" on and switch the scenario from `reversal` to
   `random_walk`, then `uptrend`, then `range`. Explain each sign with the expectation formula above. Then press the
   new-sample button a few times on `random_walk`: how much does the edge move around zero?
2. In the second lab, on `reversal`, switch on all three rules. How many episodes are left, and why does adding a
   rule never increase $n$?
3. Start Replay on SPY on 19 February 2020, the last record close before the COVID crash, with SMA 50 and SMA 200.
   Step forward and note two moments for each line: the first close below it, and the first bar on which the line
   itself turns down. Why does the SMA 200 turn so much later than price crosses it (lag $\frac{n-1}{2}$ = 99.5
   bars, and the slope $\frac{x_t - x_{t-n}}{n}$ compares with the bar 200 days earlier)?

```lab
{"kind": "replay", "symbol": "SPY", "date": "2020-02-19",
 "indicators": [{"id": "sma", "params": {"length": 50}}, {"id": "sma", "params": {"length": 200}}]}
```
