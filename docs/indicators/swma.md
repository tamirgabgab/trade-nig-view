# Symmetrically Weighted Moving Average (swma)

## Formula
$$ S_t = \tfrac16 x_{t-3} + \tfrac26 x_{t-2} + \tfrac26 x_{t-1} + \tfrac16 x_t $$

## Defaults
| Param | Default | Why |
|---|---|---|
| Source | close | TradingView default |
| Offset | 0 | Display shift |

## Warm-up
First valid bar index: $3$ (fixed 4-bar window).

## What it measures
A very short smoothing filter with a constant 1.5-bar lag.

## Differences vs TradingView
Matches Pine `ta.swma`.

## Pitfalls
- No length input: the window is always 4 bars.
