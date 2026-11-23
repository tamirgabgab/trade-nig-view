# Kaufman Adaptive Moving Average (kama)

## Formula
$$ ER_t = \frac{|x_t - x_{t-n}|}{\sum_{k=0}^{n-1}|x_{t-k} - x_{t-k-1}|}, \quad c_t = \big(ER_t (f - s) + s\big)^2, \quad K_t = K_{t-1} + c_t (x_t - K_{t-1}) $$

with $f = 2/(\text{fast}+1)$, $s = 2/(\text{slow}+1)$.

## Defaults
| Param | Default | Why |
|---|---|---|
| Efficiency length | 10 | Kaufman / TA-Lib default |
| Fast | 2 | Kaufman default |
| Slow | 30 | Kaufman default |
| Source | close | TradingView default |

## Warm-up
First valid bar index: $n$ (seed $K_{n-1} = x_{n-1}$, first value at bar $n$).

## What it measures
Follows trends fast when price moves efficiently and flattens in chop.

## Differences vs TradingView
Seed and the ER = 1 rule for zero noise follow TA-Lib `KAMA` (verified exactly).

## Pitfalls
- The seed's weight decays slowly in chop; the chart loads extra history for it.
