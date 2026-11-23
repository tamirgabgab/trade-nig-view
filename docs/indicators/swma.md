# Symmetrically Weighted Moving Average (`swma`)

A fixed four-tap FIR filter with weights $\frac16, \frac26, \frac26, \frac16$ (Pine `ta.swma`). It has no length
input. Its purpose is not heavy smoothing but removing the two fastest possible oscillations, the 2-bar and 3-bar
zig-zags, with only 1.5 bars of lag. Pine uses it inside other indicators, for example the Relative Vigor Index.

## Formula
$$
S_t = \frac{x_t + 2x_{t-1} + 2x_{t-2} + x_{t-3}}{6},
\qquad
H(z) = \frac{1 + 2z^{-1} + 2z^{-2} + z^{-3}}{6} = \frac{1 + z^{-1}}{2}\cdot\frac{1 + z^{-1} + z^{-2}}{3}
$$

The factorisation shows that the SWMA is a cascade of an SMA(2) and an SMA(3): $S = \mathrm{SMA}_2(\mathrm{SMA}_3(x))$.
The kernel is trapezoidal (the convolution of a 2-box and a 3-box), symmetric about $k = 1.5$.

## Kernel, lag and noise
Impulse response $h = \left(\frac16, \frac13, \frac13, \frac16\right)$ for $k = 0..3$, DC gain 1.

**Lag.** $\bar k = \frac{0\cdot1 + 1\cdot2 + 2\cdot2 + 3\cdot1}{6} = \frac96 = 1.5$ bars. Equivalently, centres of
mass add under convolution: $\frac{2-1}{2} + \frac{3-1}{2} = 0.5 + 1 = 1.5$.

**Noise.** $\mathrm{NRF} = \frac{1 + 4 + 4 + 1}{36} = \frac{5}{18} \approx 0.2778$. An SMA(4) has the same support and
the same lag but $\mathrm{NRF} = \frac14$: as a white-noise smoother the SWMA is slightly worse. What it buys is in the
frequency domain.

**Frequency response.** Factor out the centre and use $\cos 3\theta = 4\cos^3\theta - 3\cos\theta$ with
$\theta = \omega/2$, $c = \cos(\omega/2)$:

$$
H(e^{j\omega}) = e^{-j\frac{3}{2}\omega}\;\frac{\cos\frac{3\omega}{2} + 2\cos\frac{\omega}{2}}{3}
= e^{-j\frac{3}{2}\omega}\;\frac{c\,(2c-1)(2c+1)}{3}.
$$

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
  2, which is a sample point and sits on the −120 dB floor. Both show as dips to the plot's lower edge. The small bump between 2 and 3 bars is
  the −23.9 dB sidelobe.
- **Group delay:** flat at 1.500 bars, because the kernel is symmetric (linear phase). The sign change of the
  amplitude between 2 and 3 bars adds a phase jump of $\pi$, not a change of slope. At $P = 2$ the gain is zero and
  the group delay is undefined, so the curve has a gap there.

## What it measures
A de-zig-zagged copy of price, 1.5 bars late. Plotted as an overlay it stays very close to the price itself; its
use is as a pre-filter that removes bar-to-bar alternation before another calculation looks at turns or crossings.

## Differences vs TradingView
Same formula as Pine `ta.swma`; there is no seed, so values do not depend on where the history starts. In
TradingView it exists as that Pine function (used by scripts such as the Relative Vigor Index) rather than as a
stand-alone built-in indicator; ChartLab shows it as an overlay. It is not part of the manual cross-check.

## Pitfalls
- No length input: the window is always 4 bars, so it cannot be made smoother.
- "Symmetric" describes the weights, not the timing: the filter is causal and runs 1.5 bars behind.
- For plain smoothing an SMA(4) is better (same lag, NRF 0.25 vs 0.278). Choose the SWMA when 2- and 3-bar
  oscillations must vanish, or when the low −24 dB sidelobe matters.
