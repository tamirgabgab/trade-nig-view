# Relative Strength Index (`rsi`)

Wilder's momentum oscillator: the share of recent average gains in average gains plus losses, from 0 to 100. Optional
smoothing average and Bollinger Bands on the RSI.

## Formula

$$
U_t = \max(x_t - x_{t-1}, 0), \qquad D_t = \max(x_{t-1} - x_t, 0), \qquad
\bar U = \mathrm{RMA}_n(U), \quad \bar D = \mathrm{RMA}_n(D)
$$

$$
\mathrm{RSI}_t = 100 - \frac{100}{1 + \bar U_t / \bar D_t}
$$

with Pine's edge cases, in this order: $\bar D_t = 0 \Rightarrow 100$, else $\bar U_t = 0 \Rightarrow 0$. RMA is
Wilder's average ($\alpha = 1/n$, seeded with the SMA of the first $n$ values). Smoothing (optional):
$\mathrm{MA}^{\text{type}}_m(\mathrm{RSI})$ seeded on the first RSI values; bands $\pm k\,\sigma_m(\mathrm{RSI})$ around
it (population $\sigma$).

## Kernel, lag and noise
Not a linear filter: the RSI is a ratio of two averages of rectified changes. Its smoothing is that of RMA $n$
(lag $n-1$ bars on each average), so a longer length gives a calmer, slower RSI that stays nearer 50.

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 14 | Wilder's and TradingView's default |
| Source | close | TradingView default |
| Smoothing | None | TradingView default |
| Smoothing length | 14 | TradingView default |
| Bollinger Bands on the smoothing | off | TradingView default |
| BB StdDev | 2 | TradingView default |

Levels 70 / 50 / 30.

## Warm-up
First valid bar index: $n$ (the first change needs one earlier bar), i.e. 14. The smoothing starts at
$n + w_{\text{type}}(m)$ (27 for SMA 14), the bands at $n + m - 1$.

## Filter view
Not offered (an oscillator, not a moving average).

## What it measures
Momentum: above 50 the average gain exceeds the average loss. 70 / 30 are the classic overbought / oversold levels.

## Differences vs TradingView
- Same formula, seeding and edge cases as TradingView's built-in (`ta.rsi`, a perfectly flat window gives 100). TA-Lib
  returns 0 there.
- TradingView's smoothing choices are SMA, "SMA + Bollinger Bands", EMA, SMMA (RMA), WMA and VWMA; here any of the 15
  types, and the bands are a separate switch that works with any of them.

## Pitfalls
- The RMA remembers its seed for a long time ($e^{-k/n}$): the first few hundred bars of a history differ between tools
  that start at different dates. The compute endpoint loads $25n$ extra bars so shown values do not depend on it.
- In a strong trend the RSI stays above 70 (or below 30) for weeks; overbought is not a sell signal by itself.
