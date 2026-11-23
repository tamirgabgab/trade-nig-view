# Pivot Points High/Low (`pivots`)

Swing highs and lows (fractals): a bar whose high is above the $L$ bars before it and the $R$ bars after it (a pivot
high), or whose low is below them (a pivot low).

## Formula

Bar $p$ is a pivot high if

$$
H_p > H_j \quad \text{for every } j \in [p-L,\ p) \cup (p,\ p+R]
$$

and a pivot low with $L_p < L_j$ (strict on both sides). Bars with fewer than $L$ bars on their left are never pivots.

## Kernel, lag and noise
Not a filter. A pivot is only **confirmed** $R$ bars after it, when its right side is complete: the value is stored
at bar $t = p + R$ ($\text{high}_t = H_{t-R}$ if $t-R$ is a pivot high, else empty), so nothing uses future bars. The
chart draws each marker $R$ bars to the left, on the pivot bar itself (`display_shift` = $R$).

## Defaults
| Param | Default | Why |
|---|---|---|
| Left bars | 5 | Common swing definition (TradingView "Pivot Points High Low" uses 10/10) |
| Right bars | 5 | Same as the left side |

## Warm-up
First possible value: bar $L + R$.

## Filter view
Not offered (not a moving average).

## What it measures
The market's swing structure: higher highs and higher lows in an uptrend, lower ones in a downtrend; pivots are natural
anchors for support/resistance lines and Fibonacci tools.

## Differences vs TradingView
- Strict comparison on both sides: two equal highs next to each other are not pivots (TradingView's tie handling
  may differ; to be checked by hand).
- Shown as circles on the pivot bar rather than price labels.

## Pitfalls
- In replay a pivot appears $R$ bars late (no lookahead), on the bar where it was confirmed in real time.
- A larger $R$ gives fewer, more significant pivots, and a longer confirmation delay.
