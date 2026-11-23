# Smoothed Moving Average (smma, Wilder's RMA)

## Formula
$$ R_t = R_{t-1} + \frac{x_t - R_{t-1}}{n}, \qquad R_{n-1} = \mathrm{SMA}_n $$

An EMA with $\alpha = \frac1n$, so $\mathrm{RMA}_n \equiv \mathrm{EMA}_{2n-1}$ (after the seed). Lag $n-1$ bars;
noise reduction $\frac{1}{2n-1}$.

## Defaults
| Param | Default | Why |
|---|---|---|
| Source | close | TradingView default |
| Length | 7 | TradingView default |
| Offset | 0 | Display shift, $\ge 0$ |

## Warm-up
First valid bar index: $n - 1$.

## What it measures
Welles Wilder's smoothing, the average inside RSI and ATR (Pine `ta.rma`). Twice as slow as the EMA of the same length.

## Differences vs TradingView
Same seed as Pine `ta.rma`. The seed influence decays as $(1 - \frac1n)^k \approx e^{-k/n}$, which is why the chart
loads $25n$ extra bars ($e^{-25} \approx 1.4\times10^{-11}$).

## Pitfalls
- "Length 14" in RSI means an RMA that behaves like a 27-bar EMA.
