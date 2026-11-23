# McGinley Dynamic (mcginley)

## Formula
$$ M_t = M_{t-1} + \frac{x_t - M_{t-1}}{n\,(x_t / M_{t-1})^4}, \qquad M_{n-1} = \mathrm{EMA}_n $$

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 14 | TradingView default |
| Source | close | TradingView default |
| Offset | 0 | Display shift |

## Warm-up
First valid bar index: $n - 1$ (EMA seed, as in the TradingView built-in).

## What it measures
An average whose speed adapts: it speeds up when price falls away below it and slows when price runs above it.

## Differences vs TradingView
Seed = first EMA value, as in TradingView's built-in script.

## Pitfalls
- Not shift-invariant (the ratio $x/M$ matters); scale-invariant only.
- Undefined for non-positive prices; a zero divisor gives no value for one bar, then it re-seeds from the EMA (Pine).
- A one-bar drop of more than about half makes the step overshoot below zero; Pine then oscillates through values
  like $\pm 10^{200}$ that wreck the price scale. ChartLab replaces a level $\le 0$ by the EMA on that bar (a deliberate difference; identical to Pine whenever Pine's level stays positive).
