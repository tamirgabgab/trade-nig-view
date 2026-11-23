# Volume Weighted Moving Average (vwma)

## Formula
$$ V_t = \frac{\sum_{k=0}^{n-1} x_{t-k} v_{t-k}}{\sum_{k=0}^{n-1} v_{t-k}} $$

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 20 | TradingView default |
| Source | close | TradingView default |
| Offset | 0 | Display shift |

## Warm-up
First valid bar index: $n - 1$.

## What it measures
An SMA where high-volume bars count more.

## Differences vs TradingView
Matches Pine `ta.vwma`. A window with zero total volume gives NaN (Pine would also divide by zero).

## Pitfalls
- Indices with no volume data show nothing.
