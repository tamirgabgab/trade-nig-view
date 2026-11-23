# Previous Period High/Low/Close (`prev_hlc`)

Step lines at the high, low and close of the previous day, week or month: the reference levels traders watch for
breakouts, retests and "inside day" setups.

## Formula

For bar $t$ in period $P_k$ (the $k$-th period of the data that has bars):

$$
H^{prev}_t = \max_{i \in P_{k-1}} H_i, \qquad
L^{prev}_t = \min_{i \in P_{k-1}} L_i, \qquad
C^{prev}_t = C_{\text{last bar of } P_{k-1}}
$$

Periods are UTC calendar days, ISO weeks (Monday 00:00 UTC to Sunday) or UTC calendar months of each bar's open time.

## Kernel, lag and noise
Not a filter: a piecewise-constant selection of past extremes. Each level is fixed for the whole period and jumps on the
first bar of the next one.

## Defaults
| Param | Default | Why |
|---|---|---|
| Period | Day | The most used levels (previous day's high/low/close) |

## Warm-up
Data-dependent: empty during the first period of the history (it has no earlier period). Computed over the whole
history so the levels never move when older bars load.

## Filter view
Not offered (not a moving average).

## What it measures
Where the price trades relative to the last completed period's range: above the previous high is a breakout, back
inside the range a failed one; the previous close is the reference for the gap and the day's change.

## Differences vs TradingView
- Shortcut: UTC periods, upgrade to exchange-session periods when 24h markets need it. A US equity session
  (09:30-16:00 New York) always lies inside one UTC day, so stocks and ETFs match; forex and futures roll at 00:00 UTC
  instead of the exchange's session close (17:00 New York).
- On daily bars with Period = Day the lines are simply the previous bar's high, low and close.

## Pitfalls
- A holiday or a missing bar does not create an empty period: the previous period is the last one that has bars.
- With Period = Day on weekly or monthly bars every bar is its own period (the previous bar).
