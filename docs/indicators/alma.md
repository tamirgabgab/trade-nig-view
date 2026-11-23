# Arnaud Legoux Moving Average (alma)

## Formula
$$ A_t = \frac{\sum_{j=0}^{n-1} w_j x_{t-n+1+j}}{\sum_j w_j}, \quad w_j = e^{-\frac{(j-m)^2}{2s^2}}, \quad m = o(n-1), \quad s = n/\sigma $$

## Defaults
| Param | Default | Why |
|---|---|---|
| Window size | 9 | TradingView default |
| Offset | 0.85 | Gaussian centre toward the newest bar |
| Sigma | 6 | Gaussian width |
| Source | close | TradingView default |
| Floor | off | Pine `floor` flag: $m = \lfloor o(n-1) \rfloor$ |

## Warm-up
First valid bar index: $n - 1$.

## What it measures
A Gaussian-weighted window: smooth like an SMA, responsive like an EMA.

## Differences vs TradingView
Matches Pine `ta.alma`.

## Pitfalls
- Offset near 1 approaches the last price; near 0 it lags like an SMA.
