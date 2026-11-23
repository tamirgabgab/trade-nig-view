# Moving Average, any type (ma)

## Formula
$$ y_t = \mathrm{MA}^{\text{type}}_n(x)_t $$ for any of the 15 types (SMA, EMA, WMA, SMMA, DEMA, TEMA, HMA, LSMA, ALMA, SWMA, VWMA, McGinley, KAMA, T3, ZLEMA).

## Defaults
| Param | Default | Why |
|---|---|---|
| MA type | SMA | Most common |
| Length | 9 | TradingView default |
| Source | close | TradingView default |
| Offset | 0 | Display shift |

## Warm-up
First valid bar index: That of the chosen type, plus the offset.

## What it measures
One entry to compare averages by switching the type.

## Differences vs TradingView
Types with extra inputs use their defaults (ALMA 0.85/6, KAMA 2/30, T3 0.7, LSMA offset 0).

## Pitfalls
- For ALMA/KAMA/T3 inputs use the dedicated indicators.
