# Weighted Moving Average (wma)

## Formula
$$ \mathrm{WMA}_t = \frac{\sum_{k=0}^{n-1}(n-k)\,x_{t-k}}{n(n+1)/2} $$

Kernel $h_k = \frac{2(n-k)}{n(n+1)}$. Lag $\frac{n-1}{3}$ bars; noise reduction $\frac{2(2n+1)}{3n(n+1)}$.

## Defaults
| Param | Default | Why |
|---|---|---|
| Source | close | TradingView default |
| Length | 9 | TradingView default |
| Offset | 0 | Display shift, $\ge 0$ |

## Warm-up
First valid bar index: $n - 1$.

## What it measures
An average that trusts recent bars more: the newest weighs $n$, the oldest $1$. Less lag than the SMA of the same
length, a little more noise.

## Differences vs TradingView
None expected (verified equal to TA-Lib on every bar).

## Pitfalls
- Building block of the Hull MA (R3b), which combines WMAs with negative weights.
