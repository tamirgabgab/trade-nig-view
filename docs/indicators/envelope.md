# Envelope (envelope)

## Formula
$$ B_t = \mathrm{MA}_n(x)_t, \quad U_t = B_t (1 + p/100), \quad L_t = B_t (1 - p/100) $$

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 20 | TradingView default |
| Percent | 10 | TradingView default |
| Source | close | TradingView default |
| Basis MA type | SMA | TradingView default (Exponential off) |

## Warm-up
First valid bar index: That of the basis average.

## What it measures
Fixed-percentage bands around a trend line.

## Differences vs TradingView
TradingView offers only SMA/EMA as basis; here any type.

## Pitfalls
- Band width does not adapt to volatility (see Bollinger Bands).
