# Double Exponential Moving Average (dema)

## Formula
$$ E^{(1)} = \mathrm{EMA}_n(x), \quad E^{(2)} = \mathrm{EMA}_n(E^{(1)}), \quad D_t = 2E^{(1)}_t - E^{(2)}_t $$

The EMA's lag $(n-1)/2$ is cancelled to first order: on a ramp $D_t = x_t$ (zero lag).

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 9 | TradingView default |
| Source | close | TradingView default |
| Offset | 0 | Display shift |

## Warm-up
First valid bar index: $2(n-1)$ (the inner EMA is seeded $n-1$ bars after the outer one).

## What it measures
A faster trend line than the EMA with the same smoothing length.

## Differences vs TradingView
EMA seeds are SMA (TA-Lib convention, verified exactly against TA-Lib `DEMA`).

## Pitfalls
- Overshoots after a price step (the price of zero lag on ramps).
