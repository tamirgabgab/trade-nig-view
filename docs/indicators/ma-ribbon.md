# Moving Average Ribbon (ma_ribbon)

## Formula
$$ y^{(i)}_t = \mathrm{MA}^{\text{type}}_{n_i}(x)_t, \quad i = 1..4 $$

## Defaults
| Param | Default | Why |
|---|---|---|
| MA type | EMA | Common ribbon |
| Lengths | 20/50/100/200 | Standard horizons |
| Source | close | TradingView default |

## Warm-up
First valid bar index: The longest average's warm-up.

## What it measures
Trend direction and strength at four horizons: an ordered, widening fan is a strong trend.

## Differences vs TradingView
TradingView's ribbon script has its own per-line settings; here one type for all four.

## Pitfalls
- The 200-length line needs ~5000 bars of extra history to converge (loaded automatically).
