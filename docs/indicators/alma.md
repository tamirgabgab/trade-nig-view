# Arnaud Legoux Moving Average (`alma`)

Arnaud Legoux and Dimitrios Kouzis-Loukas (2009) built this average from a Gaussian window placed near the recent end
of an $n$-bar window. All weights are positive, so it never overshoots. It gets its low lag by concentrating weight on
the last few bars, not by cancelling moments, and the Gaussian shape gives it a clean stopband.

## Formula
$$
A_t = \frac{\sum_{j=0}^{n-1} w_j\, x_{t-n+1+j}}{\sum_j w_j}, \qquad
w_j = \exp\!\left(-\frac{(j-m)^2}{2s^2}\right), \qquad m = \text{offset}\cdot(n-1), \qquad s = \frac{n}{\sigma}
$$

$j = 0$ is the oldest bar of the window and $j = n-1$ the newest. With the `floor` flag, $m = \lfloor \text{offset}\cdot(n-1)\rfloor$.

## Kernel, lag and noise
In bars ago ($k = n-1-j$), the Gaussian is centred at $k_c = (1-\text{offset})(n-1)$ bars back with standard deviation
$s = n/\sigma$ bars. Note that $\sigma$ is a sharpness parameter: a **larger** $\sigma$ means a **narrower** window.
At the defaults ($n = 9$, offset 0.85, $\sigma = 6$): $m = 6.8$, so $k_c = 1.2$, and $s = 1.5$.

Normalised taps, newest first:

$$ h = (0.2205,\ 0.3009,\ 0.2634,\ 0.1478,\ 0.0532,\ 0.0123,\ 0.0018,\ 0.0002,\ 0.0000) $$

**Lag.** Without truncation the lag would be $k_c = 1.2$ bars. The window ends at $k = 0$, only $0.8\,s$ on the
recent side of the centre, so the newest side of the Gaussian is cut off. That moves the centre of mass back to
$\bar k = 1.557$ bars. The old side is effectively unused: the four oldest taps sum to 0.014. At the defaults, ALMA(9)
is about a 5-bar filter.

**Noise.** $\mathrm{NRF} = 0.2334$. A full discrete Gaussian of width $s$ has
$\sum h_k^2 \approx \frac{1}{2\sqrt\pi\,s} = 0.188$; truncation raises it. For scale, an SMA of 4 bars has lag 1.5 and
NRF 0.25. In lag and noise, ALMA at its defaults is about an SMA(4). The difference is in the stopband (Filter view).

**The non-negative trade-off.** Since every $w_j \ge 0$, the output is a convex combination of the window's prices:

- it always lies within $[\min, \max]$ of the window;
- the step response rises monotonically from 0 to 1;
- $\lvert H(e^{j\omega})\rvert \le \sum_k h_k = 1$ at every frequency (no gain bump);
- the kernel's variance $\kappa_2$ is positive (1.49 at the defaults).

The lag can only reach 0 by putting all the weight on the newest bar, which means no smoothing. ALMA therefore trades
lag against noise inside these limits, with no negative weights like DEMA, HMA or LSMA.

**How the parameters move it** ($n = 9$):

| Setting | Lag (bars) | NRF |
|---|---|---|
| offset 0.85, $\sigma = 6$ (default) | 1.557 | 0.233 |
| default with `floor` ($m = 6$) | 2.151 | 0.205 |
| offset 0.5, $\sigma = 6$ (centred) | 4.000 | 0.189 |
| offset 1.0, $\sigma = 6$ | 0.910 | 0.323 |
| offset 0.85, $\sigma = 3$ | 2.558 | 0.148 |
| offset 0.85, $\sigma = 12$ | 1.216 | 0.383 |
| offset 0.85, $\sigma = 50$ | 1.000 | 1.000 |

A small $\sigma$ flattens the window towards an SMA. A large $\sigma$ collapses it onto the single bar nearest $m$,
which is a pure delay with no smoothing (the last row: one bar back, NRF 1).

## Defaults
| Param | Default | Why |
|---|---|---|
| Window size | 9 | TradingView default |
| Offset | 0.85 | TradingView default: Gaussian centre 85% of the way to the newest bar |
| Sigma | 6 | TradingView default: width $s = n/6$ bars |
| Source | close | TradingView default |
| Floor offset | off | Pine `floor` argument: $m = \lfloor \text{offset}\cdot(n-1) \rfloor$ |

## Warm-up
First valid bar index: $n - 1$ (8 at the default).

## Filter view
At the defaults:
- **Impulse:** nine positive stems shaped like a bell, peaking at $k = 1$ (0.301), with $k = 0$ at 0.220 (the cut
  side). The oldest four are invisible.
- **Step:** a monotone S-curve from 0.22 to 1, settled to plotting precision by bar 7. No overshoot.
- **Magnitude:** never above 0 dB ($-0.006$ dB at $P = 200$). The gain falls smoothly to $-3$ dB near 9.3 bars and stays
  at or below $-15.6$ dB for every period of 4 bars or less ($-22.2$ dB at $P = 2$). The SMA(4) with the same lag and
  noise has exact zeros at $P = 2$ and $4$, but its sidelobes reach $-11.3$ dB in between. The Gaussian has no
  sidelobes apart from those caused by truncation.
- **Group delay:** nearly flat in the passband: 1.56 bars at long periods, 1.50 at $P = 20$, 1.34 at $P = 10$. It
  falls and turns negative only below about 4.5 bars ($-1.4$ near $P \approx 3.3$, where the gain is already $-20$ dB).

## What it measures
A responsive, smooth price level: the Gaussian-weighted centre of the last few bars. It is a good default when you
want EMA-like responsiveness without the EMA's long tail or the overshoot of the lag-cancelling averages.

## Differences vs TradingView
Matches Pine `ta.alma(series, length, offset, sigma, floor)`, including the weight order (oldest bar at $j = 0$) and
the optional `floor`. Whether TradingView's built-in indicator exposes or uses `floor` is part of assumption E2. It
is off by default here.

## Pitfalls
- The window size $n$ is not the effective length. At the defaults the effective support is about 5 bars, and raising
  $\sigma$ shrinks it further.
- Offset near 1 with a large $\sigma$ approaches the raw price. Offset 0 centres the weight on the oldest bar, giving a
  lag of 7.1 bars at $n = 9$, more than the SMA's 4. Lag is never zero with useful smoothing, because the weights are
  non-negative.
- `floor` changes the default lag from 1.56 to 2.15 bars, a visible shift on the chart.
