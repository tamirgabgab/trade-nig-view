# Hull Moving Average (hma)

## Formula
$$ H_t = \mathrm{WMA}_{s}\big(2\,\mathrm{WMA}_{\lfloor n/2\rfloor}(x) - \mathrm{WMA}_n(x)\big)_t, \qquad s = \lfloor\sqrt n\rfloor $$

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 9 | TradingView default |
| Source | close | TradingView default |
| Offset | 0 | Display shift |

## Warm-up
First valid bar index: $n + s - 2$ with $s = \lfloor\sqrt n\rfloor$. Length must be $\ge 2$.

## What it measures
A smooth, low-lag average: the inner difference removes most of the WMA lag, the outer WMA smooths it.

## Differences vs TradingView
Matches Pine `ta.hma` (`math.floor` on both inner lengths).

## Pitfalls
- Overshoots after steps.
- Residual lag on a ramp is $(s + 2m - n - 2)/3$ with $m = \lfloor n/2 \rfloor$, not zero.
