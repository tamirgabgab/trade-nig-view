# Simple Moving Average (sma)

## Formula
$$ \mathrm{SMA}_t = \frac{1}{n}\sum_{k=0}^{n-1} x_{t-k} $$

Kernel $h_k = \frac1n$ for $k < n$. Lag (centre of mass) $\bar k = \frac{n-1}{2}$ bars; noise reduction
$\sum h_k^2 = \frac1n$. Magnitude response $|H(e^{j\omega})| = \left|\frac{\sin(n\omega/2)}{n\sin(\omega/2)}\right|$:
cycles of period $n, n/2, \dots$ bars are removed completely.

## Defaults
| Param | Default | Why |
|---|---|---|
| Source | close | TradingView default |
| Length | 9 | TradingView default |
| Offset | 0 | Bars to shift the line right (display only; only $\ge 0$ so no future bars are used) |

## Warm-up
First valid bar index: $n - 1$ (plus the offset).

## What it measures
The average price of the last $n$ bars. On a straight-line trend it runs exactly $\frac{n-1}{2}$ bars behind.

## Differences vs TradingView
None expected. Computed exactly per window (no running sum), so there is no floating-point drift.

## Pitfalls
- Every bar in the window weighs the same, so the line jumps when a big bar *leaves* the window $n$ bars later.
