# VWAP (`vwap`)

The Volume Weighted Average Price of the current trading session: the average price paid per share since the
session opened. Intraday only.

## Formula

$$
\mathrm{VWAP}_t = \frac{\sum_{i \in s(t),\ i \le t} p_i\,V_i}{\sum_{i \in s(t),\ i \le t} V_i}, \qquad
p = \text{hlc3} = \frac{H + L + C}{3}
$$

where $s(t)$ is the session of bar $t$. The sums restart at the first bar of every session (session dates as in
ARCHITECTURE section 6: exchange-local date, or the 18:00 New York open for CME futures).

## Kernel, lag and noise
A volume-weighted average whose window grows from 1 bar at the session open to the whole session: it follows the
price closely in the first bars and becomes very stable late in the session. Not time-invariant, so no fixed kernel.

## Defaults
| Param | Default | Why |
|---|---|---|
| Source | hlc3 | TradingView default |

## Warm-up
First valid bar index: 0, and it restarts on the first bar of each session. Empty on daily and longer intervals.

## Filter view
Not offered (not a fixed-kernel average).

## What it measures
Whether the price trades above or below the session's average traded price (the "fair price" institutions benchmark
their fills against).

## Differences vs TradingView
- Anchor fixed to Session (TradingView also offers week, month, earnings, ...); no standard-deviation bands yet.
- TradingView computes it from the chart's bars too, so on 1h bars it matches TradingView's 1h VWAP, not a tick VWAP.
- Hidden on daily and longer intervals (all values empty).

## Pitfalls
- With 1h or 4h bars there are only a few bars per session: the first value is just that bar's hlc3.
- Symbols without volume (indices, forex) have no VWAP (all values empty).
