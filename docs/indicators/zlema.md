# Zero-Lag Exponential Moving Average (zlema)

## Formula
$$ Z_t = \mathrm{EMA}_n\big(2x_t - x_{t-d}\big), \qquad d = \lfloor (n-1)/2 \rfloor $$

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 20 | Common default |
| Source | close | TradingView default |
| Offset | 0 | Display shift |

## Warm-up
First valid bar index: $n - 1 + d$.

## What it measures
An EMA of de-lagged data: the momentum term $x_t - x_{t-d}$ cancels the EMA's lag.

## Differences vs TradingView
Not a TradingView built-in; follows Ehlers & Way.

## Pitfalls
- Residual ramp lag $(n-1)/2 - d$ (0 or 1/2).
