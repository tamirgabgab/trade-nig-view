# Moving Average Cross (ma_cross)

## Formula
$$ \text{cross}_t = +1 \text{ if } F_t > S_t,\ F_{t-1} \le S_{t-1}; \quad -1 \text{ if } F_t < S_t,\ F_{t-1} \ge S_{t-1} $$

## Defaults
| Param | Default | Why |
|---|---|---|
| Fast MA type | SMA | TradingView default |
| Fast length | 9 | TradingView default |
| Slow MA type | SMA | TradingView default |
| Slow length | 21 | TradingView default |
| Source | close | TradingView default |

## Warm-up
First valid bar index: The larger of the two averages' warm-ups (first possible cross one bar later).

## What it measures
Golden (up) and death (down) crosses between a fast and a slow trend line.

## Differences vs TradingView
Crosses are drawn as arrows below/above the bar; each average can be any type.

## Pitfalls
- A cross is known only at the bar's close (no lookahead).
- Crosses whipsaw in sideways markets.
