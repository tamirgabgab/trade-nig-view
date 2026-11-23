# Average True Range (`atr`)

Wilder's volatility measure: the average size of a bar, counting overnight gaps.

## Formula

$$
TR_t = \max\left(H_t - L_t,\ \lvert H_t - C_{t-1}\rvert,\ \lvert L_t - C_{t-1}\rvert\right), \qquad TR_0 = H_0 - L_0
$$

$$
\mathrm{ATR}_t = \mathrm{MA}^{\text{type}}_n(TR)_t \quad (\text{RMA by default})
$$

## Kernel, lag and noise
The average is a linear filter of the true range (RMA: lag $n - 1$, NRF $1/(2n-1)$), but the true range itself is a
nonlinear function of the bars, so the ATR as a whole is not a linear filter of the price.

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 14 | Wilder's and TradingView's default |
| Smoothing | RMA | TradingView default (Wilder) |

## Warm-up
First valid bar index: $n - 1$ (13) for RMA, SMA, EMA and WMA; the true range exists from bar 0.

## Filter view
Not offered (a volatility measure, not a moving average of the price).

## What it measures
Typical bar size in price units, used for stop distances ($2\times$ ATR) and position sizing.

## Differences vs TradingView
- Same as TradingView's built-in (`ta.tr(true)`: $TR_0 = H_0 - L_0$).
- TA-Lib's `ATR` skips bar 0 (no previous close) and starts one bar later with a different seed; the two converge
  after a few hundred bars.

## Pitfalls
- In price units: not comparable across symbols or across a big price change (use ATR / close for a percentage).
- The RMA seed fades slowly ($e^{-k/n}$); the compute endpoint loads $25n$ extra bars so shown values do not depend
  on where the history starts.
