# Smoothed Moving Average (`smma`)

Welles Wilder's smoothing, known in Pine as `ta.rma` (RMA) and on other platforms as SMMA: an EMA whose step is
$\frac1n$ instead of $\frac{2}{n+1}$. It is the average inside RSI, ATR and ADX. Use it when you want to see exactly
what those indicators smooth with, or a slow, very smooth trend line.

## Formula
$$
R_t = R_{t-1} + \frac{x_t - R_{t-1}}{n} = \frac{(n-1)\,R_{t-1} + x_t}{n},
\qquad R_{n-1} = \frac1n\sum_{i=0}^{n-1} x_i
$$

$$
H(z) = \frac{\alpha}{1 - p\,z^{-1}}, \qquad \alpha = \frac1n, \qquad p = 1 - \frac1n
$$

A single real pole at $z = p$ ($p = 6/7 \approx 0.857$ at the default $n = 7$).

## Kernel, lag and noise
Impulse response $h_k = \frac1n\left(1 - \frac1n\right)^k$ for $k \ge 0$, DC gain 1. The EMA results apply with
$\alpha = \frac1n$:

$$
\bar k = \frac{1-\alpha}{\alpha} = n - 1,
\qquad
\mathrm{NRF} = \frac{\alpha}{2-\alpha} = \frac{1}{2n-1}.
$$

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

## What it measures
Wilder's running average. It is the smoothing step inside RSI (average gain and loss), ATR (average true range) and
ADX, so plotting it on price shows how sluggish those internal averages are. As a trend line it is twice as slow as
the EMA of the same length: lag $n - 1$ instead of $\frac{n-1}{2}$.

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
