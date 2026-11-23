# Least Squares Moving Average (lsma)

## Formula
$$ L_t = a_t + b_t\,(n - 1 - o) $$ where $a_t + b_t j$ is the least-squares line through the last $n$ values ($j = 0..n-1$) and $o$ is the offset. Equivalently a fixed FIR: $w_j = \frac1n + \frac{(p-\bar j)(j-\bar j)}{S}$, $p = n-1-o$.

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 25 | TradingView default |
| Offset | 0 | Pine `ta.linreg` offset (evaluates the line $o$ bars back) |
| Source | close | TradingView default |

## Warm-up
First valid bar index: $n - 1$.

## What it measures
The end point of a rolling linear regression: follows a straight trend exactly.

## Differences vs TradingView
Same as Pine `ta.linreg(src, length, offset)`; verified against TA-Lib `LINEARREG` for offset 0.

## Pitfalls
- Offset here is the regression offset, not a display shift.
