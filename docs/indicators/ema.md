# Exponential Moving Average (`ema`)

A first-order recursive (IIR) low-pass filter: each new bar moves the average a fixed fraction $\alpha$ of the way to
the price. With $\alpha = \frac{2}{n+1}$ it has the same lag and the same noise reduction as an $n$-bar SMA, but no
spectral nulls and an infinite memory. Use it when you want a smooth trend line that reacts to the newest bar at once.

## Formula
$$
E_t = \alpha\,x_t + (1-\alpha)\,E_{t-1} = E_{t-1} + \alpha\,(x_t - E_{t-1}),
\qquad \alpha = \frac{2}{n+1},
\qquad E_{n-1} = \frac1n\sum_{i=0}^{n-1} x_i
$$

$$
H(z) = \frac{\alpha}{1 - p\,z^{-1}}, \qquad p = 1 - \alpha,
$$

a single real pole at $z = p$ ($p = 0.8$ for $n = 9$). Unrolling the recursion from the seed,

$$
E_t = \sum_{k=0}^{t-n} \alpha\,p^{k}\,x_{t-k} \;+\; p^{\,t-n+1}\,E_{n-1}.
$$

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

## What it measures
A trend-following average that reacts to the newest price immediately ($\alpha = 20\%$ of the gap at $n = 9$) and
forgets old prices geometrically. Its gap to price on a steady trend is slope × $\frac{n-1}{2}$, as for the SMA, but
it has no drop-off effect: an old bar's influence fades smoothly instead of vanishing on a fixed day.

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
