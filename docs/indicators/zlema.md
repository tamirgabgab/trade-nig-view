# Zero-Lag Exponential Moving Average (`zlema`)

An EMA applied to a "de-lagged" price, $x_t + (x_t - x_{t-d})$. The momentum term adds back roughly the lag the EMA is
about to introduce. The idea is attributed to Ehlers and Way (2010). It is not a TradingView built-in; it is included
to compare lag-cancelling designs.

## What it measures
A trend line with nearly no lag on steady trends, built from an EMA: where price is "now", with the bar-to-bar noise
smoothed. Like the EMA, it has an infinite (geometric) memory, unlike the finite HMA and LSMA. The price of the
missing lag is more noise and an overshoot at every turn.

Move the length: the line stays on top of price at every length (no growing lag, unlike an EMA), it only gets
smoother and swings past price further at the turn.

```lab
{"kind": "param", "indicator": "zlema", "vary": "length", "min": 3, "max": 60, "scenario": "reversal"}
```

## Formula

$$
\textcolor{#AFB42B}{Z_t} = \mathrm{EMA}_n\big(x_t + (x_t - x_{t-d})\big) = \mathrm{EMA}_n\big(2x_t - x_{t-d}\big), \qquad d = \left\lfloor \frac{n-1}{2} \right\rfloor, \qquad \alpha = \frac{2}{n+1}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#AFB42B}{Z_t}$ | the ZLEMA at bar $t$ | price |
| $x_t$ | the source (close by default) | price |
| $n$ | the EMA length | bars, default 20 |
| $d$ | the de-lag shift, about half the EMA's lag | bars, 9 at $n = 20$ |
| $\alpha$ | the EMA smoothing constant | 0.095 at $n = 20$ |

## Kernel, lag and noise
The de-lagging prefilter $g = 2\delta_0 - \delta_d$, i.e. $G(z) = 2 - z^{-d}$, has DC gain 1 and first moment
$\sum_k k\,g_k = -d$: it **leads** by $d$ bars. Lags add in a cascade, so

$$
\textcolor{#AFB42B}{\bar k} = \frac{n-1}{2} - d = \begin{cases} 0 & n \text{ odd} \\ \tfrac12 & n \text{ even} \end{cases}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#AFB42B}{\bar k}$ | lag of the ZLEMA (first moment of its kernel) | 0 or 0.5 bars |
| $\frac{n-1}{2}$ | lag of the $\mathrm{EMA}_n$ | bars |

and the default $n = 20$ ($d = 9$) keeps half a bar of lag.

With $\beta = 1 - \alpha = \frac{n-1}{n+1}$, the kernel is a geometric decay with one jump at $k = d$:

$$
\textcolor{#AFB42B}{h_k} = \begin{cases} 2\alpha\beta^k & k < d \\ \big(2 - \beta^{-d}\big)\,\alpha\beta^k & k \ge d \end{cases}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#AFB42B}{h_k}$ | weight of the price $k$ bars ago | 0.190 at $k = 0$, $n = 20$ |
| $\beta$ | the EMA decay per bar, $1 - \alpha$ | 0.905 at $n = 20$ |
| $k$ | bars ago | 0, 1, 2, ... |

The tail $k \ge d$ is **negative whenever $\beta^d < \frac12$**, which holds for $n = 5$ and every $n \ge 7$. Its total
weight is $-(1 - 2\beta^d)$. Special cases: $n = 2$ gives $d = 0$, which is a plain EMA(2). $n = 3$ gives
$\beta^d = \frac12$ exactly: the tail vanishes and $h = \delta_0$, so ZLEMA(3) is the raw price.

**Noise.** Summing the two geometric pieces, and using $\frac{\alpha^2}{1-\beta^2} = \frac1n$:

$$
\mathrm{NRF} = \frac{\alpha^2}{1-\beta^2}\Big(4(1-\beta^{2d}) + (2\beta^d - 1)^2\Big) = \frac{5 - 4\beta^d}{n} \;\to\; \frac{5 - 4/e}{n} \approx \frac{3.53}{n}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\mathrm{NRF}$ | output noise variance over input white-noise variance, $\sum_k h_k^2$ | 0.169 at $n = 20$ |
| $\beta^d$ | weight left in the EMA after $d$ bars, tends to $e^{-1}$ | 0.406 at $n = 20$ |

At $n = 20$: $\beta^9 = 0.4064$, so $\mathrm{NRF} = 0.1687$, which is 3.37 times the EMA's $0.05$.

**Overshoot.** The step response is the running sum of the kernel. It peaks at the last positive tap, $k = d - 1$:

$$
\max_k s_k = \sum_{k<d} 2\alpha\beta^k = 2\big(1 - \beta^d\big) \;\to\; 2(1 - e^{-1}) = 1.264.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $s_k$ | the step response $k$ bars after a unit step | 0 to 1.264 |

The value is 1.187 at $n = 20$. The overshoot equals the negative tail's weight, $1 - 2\beta^d$.

**Curvature.** On a parabola $x_t = ct^2$ a linear filter gives $c\big(t^2 - 2t\,\bar k + \sum_k k^2 h_k\big)$. At
$n = 20$, $\sum_k k^2 h_k = -62$ and $\bar k = \frac12$, so the ZLEMA settles at $x_t - ct - 62c$. The half-bar lag
costs half a bar of the current slope $2ct$. For odd $n$ only the constant term remains (e.g. $-90c$ at $n = 21$).

| $n = 20$ (measured) | EMA | ZLEMA |
|---|---|---|
| Lag (bars) | 9.50 | 0.50 |
| NRF | 0.050 | 0.169 |
| Step peak | 1 (monotone) | 1.187 at bar 8 |
| Peak gain | none (below 0 dB) | +1.08 dB at $P \approx 48$ |
| $-3$ dB period | 63 bars | 15.6 bars |

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 20 | Common default (no TradingView built-in) |
| Source | close | TradingView convention |
| Offset | 0 | Display shift (bars to the right); adds that many bars of lag |

## Warm-up
First valid bar index: $n - 1 + d$, which is 28 at $n = 20$. The de-lagged input needs $d$ bars of history, and the EMA
is then SMA-seeded on its first $n$ valid values.

## Filter view
At $n = 20$:
- **Impulse:** nine positive stems decaying from $h_0 = 0.190$. At $k = 9$ the kernel jumps to $-0.018$, followed by a
  long negative geometric tail. The jump is the delayed $-x_{t-d}$ term entering.
- **Step:** the response climbs to **1.187** at bar 8, then decays monotonically (geometrically, at the EMA's rate) back
  to 1. No undershoot.
- **Magnitude:** the prefilter's gain $\lvert 2 - e^{-j\omega d}\rvert$ oscillates between 1 (0 dB, at periods
  $P = d/k$: 9, 4.5, 3, 2.25) and 3 (+9.5 dB, at $P = 2d/(2k+1)$: 18, 6, 3.6, ...). Multiplied by the EMA's low-pass,
  this gives a bump of +1.08 dB (gain 1.13) near $P \approx 48$, 0 dB near 24 bars and $-3$ dB near 15.6 bars. At
  short periods it ripples, with a dip of $-25.9$ dB near $P = 2.25$.
- **Group delay:** 1.45 bars at $P = 200$ (tending to 0.5 at DC), with a maximum of 3.8 bars near $P \approx 43$. At
  the prefilter's unit-gain periods its own delay is exactly $-d$. That shows as sharp negative spikes, e.g. $-9.3$ bars
  at $P = 9$.

## How to read it
- **Price above / below the line.** On a steady trend the line sits on price (lag 0 or half a bar), so which side
  price is on is mostly the noise of the last few bars, not the trend.
- **Slope.** The slope of the ZLEMA is the useful reading: a smoothed slope of price with almost no delay. At a turn
  the line first swings past price (step peak 1.187 at $n = 20$), so its slope flips a few bars after price and briefly
  exaggerates the new move.
- **Crossing an EMA of the same length.** The gap between the ZLEMA and the EMA is a smoothed momentum (next
  section); its sign is the most informative reading of this indicator.
- **Distance from price.** On a curving trend ($x_t = ct^2$) the ZLEMA settles $ct + 62c$ below price at $n = 20$: the
  distance grows with curvature, not with the slope.
- **Trend vs range.** In a trend it hugs price; in a range it wiggles with every swing near its $\approx n$-bar
  ripple period (see Pitfalls) and gives no direction.
- **The length.** A longer length lowers the noise ($\mathrm{NRF} \approx 3.53/n$) but does not add lag; it only moves
  the ripple and the overshoot to longer periods.

## Why it works
Subtract the EMA of the same length. Both are linear in the input, so once the seeds have washed out

$$
\textcolor{#AFB42B}{Z_t} - \mathrm{EMA}_n(x)_t = \mathrm{EMA}_n\big(x_t - x_{t-d}\big) = \mathrm{EMA}_n\Big(\sum_{j=0}^{d-1} r_{t-j}\Big).
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#AFB42B}{Z_t}$ | the ZLEMA at bar $t$ | price |
| $\mathrm{EMA}_n(x)_t$ | the plain EMA of the same length | price |
| $x_t - x_{t-d}$ | the $d$-bar momentum (9 bars at $n = 20$) | price |
| $r_{t-j}$ | the return of bar $t - j$ | about $\pm 1$–2 % per bar |

So **ZLEMA above EMA is exactly "the EMA-smoothed 9-bar momentum is positive"**, a long weighted sum of past returns
(total weight $d = 9$ bars of returns, spread over about $n$ bars by the EMA). In contrast, close minus ZLEMA weighs
past returns with a total weight of only $\bar k = 0.5$ bars (the identity on the Moving Average page): it is almost
pure noise and carries no information about the regime.

On a random walk neither sum predicts anything (future returns are independent of the past). In the reversal
scenario the momentum sign tells the rising half from the falling half; in the range scenario, positive momentum
means price is above its mean and about to revert, so the sign of the edge flips.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0],
 "rules": [
  {"label": "ZLEMA 20 above EMA 20", "left": {"indicator": {"id": "zlema", "params": {}}, "output": "ma"}, "op": "gt",
   "right": {"indicator": {"id": "ema", "params": {"length": 20}}, "output": "ma"}},
  {"label": "Close above ZLEMA 20", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "zlema", "params": {}}, "output": "ma"}}
 ]}
```

With seed 1 (1000 bars, 10-bar horizon):

| Scenario | ZLEMA 20 above EMA 20 | Close above ZLEMA 20 |
|---|---|---|
| Reversal | $+2.07$ % ($+0.96$ to $+3.20$, n = 46) | $-0.21$ % ($-1.25$ to $+0.84$, n = 73) |
| Random walk | $+0.70$ % ($-0.54$ to $+1.96$, n = 45) | |
| Range | $-1.22$ % ($-2.13$ to $-0.30$, n = 58) | |

The momentum rule is positive on all of seeds 1–5 in the reversal ($+1.16$ to $+2.10$ %) and negative on all of them
in the range ($-0.66$ to $-1.61$ %). One rule on one synthetic sample: not a backtest (no costs), sensitive to how many
rules you try, and not investment advice.

## Combine with
- **A long trend filter** (close above SMA 200) to say which regime you are in; the ZLEMA/EMA momentum sign is the
  shorter-term trigger.
- **RSI** above 50 as a confirmation. RSI is itself a smoothed ratio of up and down moves, so it largely repeats the
  momentum rule: expect little gain from it.
- **The MACD** is the same idea with two EMAs of different lengths; the ZLEMA/EMA gap uses one length and a de-lag
  shift instead.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Close above SMA 200", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 200}}, "output": "ma"}},
  {"label": "ZLEMA 20 above EMA 20", "left": {"indicator": {"id": "zlema", "params": {}}, "output": "ma"}, "op": "gt",
   "right": {"indicator": {"id": "ema", "params": {"length": 20}}, "output": "ma"}},
  {"label": "RSI 14 above 50", "left": {"indicator": {"id": "rsi", "params": {}}, "output": "rsi"},
   "op": "gt", "right": {"value": 50}}
 ]}
```

With seed 1 on the reversal: SMA 200 alone $+1.49$ % ($-0.05$ to $+3.06$, n = 36), the filter and the momentum rule
together $+2.60$ % ($+1.01$ to $+4.22$, n = 27), all three $+2.62$ % ($+1.04$ to $+4.23$, n = 27): the RSI adds
nothing, as expected. On the range the pair loses, $-1.47$ % ($-2.59$ to $-0.33$, n = 39). One sample, no costs, not
investment advice.

## Differences vs TradingView
There is no TradingView built-in. Community Pine scripts usually compute exactly
`ta.ema(src + (src - src[lag]), length)` with `lag = math.floor((length - 1) / 2)`. Any difference from those is in
the EMA seed (SMA seed here; see the EMA page). Ehlers and Way's article also describes an "error-correcting" EMA
with an optimised gain term. That adaptive filter is a different indicator.

## Pitfalls
- Even lengths keep half a bar of lag; odd lengths have exactly zero ramp lag.
- ZLEMA(3) is the raw price, and short lengths smooth very little.
- The single delayed tap makes the response ripple at periods $d/k$. Cycles near $P = 2d$ (about $n$ bars) are
  amplified by the prefilter before the EMA attenuates them, so ZLEMA can trace short swings more strongly than its
  length suggests.
- "Zero lag" is about the first moment on straight trends. At turns the line overshoots, and its noise variance, 3.4
  times that of an EMA of the same length, shows as extra wiggles.

## Exercise
1. In the "Why it works" lab, switch between the two rules, then set the scenario to Range and Random walk. Which rule
   changes sign between Reversal and Range, and why does the other one stay near zero everywhere?
2. In the length lab, set the length to 3 and then 4: why is the first line exactly the price, and the second not?
3. Start Replay on SPY on 2020-02-19 (just before the COVID crash) with ZLEMA 20 and EMA 20. Step forward: how many
   bars after the top does the ZLEMA cross below the EMA, and at the rebound does the ZLEMA swing past price (the
   overshoot) while the EMA does not?

```lab
{"kind": "replay", "symbol": "SPY", "date": "2020-02-19", "indicators": [{"id": "zlema", "params": {}}, {"id": "ema", "params": {"length": 20}}]}
```
