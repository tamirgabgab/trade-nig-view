# Triple Exponential Moving Average (tema)

## Formula
$$ T_t = 3E^{(1)}_t - 3E^{(2)}_t + E^{(3)}_t $$ with $E^{(k)}$ the $k$-times cascaded $\mathrm{EMA}_n$.

Zero lag on ramps and on parabolas' first-order term.

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 9 | TradingView default |
| Source | close | TradingView default |
| Offset | 0 | Display shift |

## Warm-up
First valid bar index: $3(n-1)$.

## What it measures
An even faster lag-compensated average than DEMA.

## Differences vs TradingView
Verified exactly against TA-Lib `TEMA`.

## Pitfalls
- Larger overshoot on steps than DEMA.
