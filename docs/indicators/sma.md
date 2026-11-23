# Simple Moving Average (`sma`)

The equal-weight mean of the last $n$ values. It is the least noisy FIR average for a given window length and has
exact spectral nulls at period $n$ and its harmonics. Use it for a plain, reproducible "average price of the last
$n$ bars", or to remove a cycle whose length you know.

## Formula
$$
\mathrm{SMA}_t = \frac{1}{n}\sum_{k=0}^{n-1} x_{t-k},
\qquad
H(z) = \frac{1}{n}\sum_{k=0}^{n-1} z^{-k} = \frac{1}{n}\cdot\frac{1 - z^{-n}}{1 - z^{-1}}
$$

The closed form of $H(z)$ is the running-sum view $y_t = y_{t-1} + \frac{x_t - x_{t-n}}{n}$: a comb $1 - z^{-n}$
followed by an integrator whose pole at $z = 1$ cancels the comb's zero there. ChartLab does not use the running sum;
it computes every window exactly (see Differences vs TradingView).

## Kernel, lag and noise
Impulse response $h_k = \frac1n$ for $0 \le k \le n-1$, zero otherwise. DC gain $\sum_k h_k = 1$.

**Lag.** Feed a straight line $x_t = a + bt$:

$$
y_t = \sum_k h_k\,\bigl(a + b(t-k)\bigr) = a + b\,(t - \bar k),
\qquad
\bar k = \sum_k k\,h_k = \frac{1}{n}\cdot\frac{n(n-1)}{2} = \frac{n-1}{2}.
$$

The SMA reproduces any trend exactly, shifted $\frac{n-1}{2}$ bars to the right. $\bar k$ is also the group delay at
$\omega = 0$.

**Noise.** For white noise of variance $\sigma^2$, $\operatorname{Var}(y_t) = \sigma^2\sum_k h_k^2 = \sigma^2/n$, so
$\mathrm{NRF} = \frac1n$: the standard deviation shrinks by $\sqrt n$.

**Optimality.** Among all $n$-tap kernels with unit DC gain, Cauchy–Schwarz gives
$1 = \left(\sum_{k<n} h_k\right)^2 \le n\sum_{k<n} h_k^2$, with equality only for $h_k = \frac1n$. For a fixed window
the SMA is the best white-noise smoother there is; what it pays is lag, not noise.

**Frequency response.** Sum the geometric series and factor out the centre of the window:

$$
H(e^{j\omega}) = e^{-j\omega\frac{n-1}{2}}\;\frac{\sin(n\omega/2)}{n\,\sin(\omega/2)}.
$$

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
  the step response is a cumulative sum of non-negative taps and can only rise. Settling is finite ($n$ bars), unlike
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

## What it measures
The average price of the last $n$ bars. On a straight-line trend it runs exactly $\frac{n-1}{2}$ bars behind, so the
gap between price and SMA is roughly slope × lag. Price above a rising SMA means recent bars trade above the window's
mean. Long SMAs (50, 200 on daily bars) are watched as trend references mostly because many traders watch them.

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
