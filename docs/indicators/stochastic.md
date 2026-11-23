# Stochastic (`stoch`)

George Lane's oscillator: where the close sits inside the high-low range of the last $n$ bars, from 0 (at the low)
to 100 (at the high).

## Formula

$$
\%K^{\text{raw}}_t = 100\,\frac{C_t - LL_t}{HH_t - LL_t}, \qquad HH_t = \max_{k<n} H_{t-k}, \quad
LL_t = \min_{k<n} L_{t-k}
$$

$$
\%K = \mathrm{SMA}_{s_k}(\%K^{\text{raw}}), \qquad \%D = \mathrm{SMA}_{s_d}(\%K)
$$

A flat range ($HH = LL$) divides by zero: the value is empty there (Pine `na`), and so are the averages over it.

## Kernel, lag and noise
Not a linear filter (a ratio of order statistics). The two SMAs smooth it with lags $(s_k - 1)/2$ and $(s_d - 1)/2$.

## Defaults
| Param | Default | Why |
|---|---|---|
| %K length | 14 | TradingView default |
| %K smoothing | 1 | TradingView default (fast %K) |
| %D smoothing | 3 | TradingView default |

Levels 80 / 50 / 20.

## Warm-up
First valid bar index: %K $n + s_k - 2$ (13), %D $n + s_k + s_d - 3$ (15).

## Filter view
Not offered (an oscillator, not a moving average).

## What it measures
The close's position in the recent range: above 80 the close is near the top of the range, below 20 near the bottom.

## Differences vs TradingView
- Same formula and defaults as TradingView's built-in (`ta.stoch` + `ta.sma`).
- TA-Lib's `STOCH` / `STOCHF` return 0 for a flat range; here (and in Pine) the value is empty.

## Pitfalls
- In a strong trend %K stays above 80 for a long time; it is not a reversal signal by itself.
- Uses highs and lows: the result depends on the bar type (Heikin Ashi bars give a different Stochastic).
