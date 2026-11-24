# Previous Period High/Low/Close (`prev_hlc`)

Step lines at the high, low and close of the previous day, week or month: the reference levels traders watch for
breakouts, retests and "inside day" setups. Intraday traders watch yesterday's levels, swing traders last week's and
last month's.

## What it measures
The question it answers: "where does the price trade relative to the last completed period's range?" Above the
previous high, the market has gone further up than at any time in the last period: a breakout. Back inside the range,
the breakout failed. The previous close is the reference for the day's change and for the opening gap (see
[Gaps](learn:gaps)). The lines do not smooth or predict anything; they are three numbers per period, held flat until
the next period starts.

The period is a choice (day, week or month), not a slider, so this lab fixes it at the week on daily bars: the three
lines are last week's high (green), low (red) and close (grey), flat through each week (the small chart joins the
weeks with a short slope; the main chart draws true steps), and the dots mark the closes that crossed above last
week's high.

```lab
{"kind": "combo", "scenario": "random_walk", "horizon": 10, "on": [0],
 "rules": [
  {"label": "Close crosses above last week's high", "left": {"price": "close"}, "op": "crosses_above",
   "right": {"indicator": {"id": "prev_hlc", "params": {"period": "week"}}, "output": "high"}},
  {"label": "Close crosses below last week's low", "left": {"price": "close"}, "op": "crosses_below",
   "right": {"indicator": {"id": "prev_hlc", "params": {"period": "week"}}, "output": "low"}}
 ]}
```

## Formula
For bar $t$ in period $P_k$ (the $k$-th period of the data that has bars):

$$
\textcolor{#089981}{H^{prev}_t} = \max_{i \in P_{k-1}} H_i, \qquad
\textcolor{#F23645}{L^{prev}_t} = \min_{i \in P_{k-1}} L_i, \qquad
\textcolor{#787B86}{C^{prev}_t} = C_{\text{last bar of } P_{k-1}}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#089981}{H^{prev}_t}$ | previous period's high (`high`, green step line) | price |
| $\textcolor{#F23645}{L^{prev}_t}$ | previous period's low (`low`, red step line) | price |
| $\textcolor{#787B86}{C^{prev}_t}$ | previous period's close (`close`, grey step line) | price |
| $H_i,\ L_i,\ C_i$ | high, low, close of bar $i$ | price |
| $P_k$ | the period (day, ISO week, calendar month) that contains bar $t$ | a set of bars |
| $P_{k-1}$ | the last earlier period that has bars | a set of bars |

Periods are days, ISO weeks (Monday to Sunday) or calendar months of each bar's **session date**. On intraday bars
that is the exchange's session (a futures session that opens at 18:00 New York belongs to the next day, as its daily
bar does); daily and longer bars are stamped with their session date already. Once a bar of $P_k$ exists, $P_{k-1}$
is complete, so the value at bar $t$ uses only bars $\le t$.

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

## How to read it
- **Above the previous high:** a breakout. On the bar that crosses, price exceeds every price of the last period.
  **Below the previous low:** a breakdown.
- **Inside the range:** between the two lines the market is still "within last period's opinion". A whole period
  inside the previous one is an inside day (week, month): the range contracted.
- **Back inside after a break:** a failed breakout. Many traders treat the old high as support after a breakout (a
  retest) and as resistance again once price falls back below it.
- **The previous close:** the line the day's change is measured from. The first bar of a period opening away from
  it is the gap.
- **The period sets the scale:** day levels on hourly bars, week or month levels on daily bars. On daily bars with
  Period = Day the lines are simply the previous bar's high, low and close (a one-bar step). Week and month levels
  move rarely and are watched by more people; a monthly high is the highest price of about 21 trading days.
- **Intraday:** on hourly bars yesterday's high and low frame the session; the first hour often tests one of them.

## Why it works
**A breakout is a statement about a maximum.** "Close above last month's high" means the close beat the highest of
about 21 bars. On a random walk such events carry no information about the next step, so the edge is zero; what they
detect depends on the market. In a trend, new highs come almost only in the rising part, so the rule is a trend
detector: on `reversal` (drift $\mu = +0.25$ % per bar in the first half, $-0.25$ % in the second) a breakout above
last month's high happens in the rising half, and the next 10 bars there carry about
$10\mu \approx +2.5$ % against an average bar of about zero. In a mean-reverting range the same breakout marks a
price far above the centre, and the Ornstein–Uhlenbeck pull predicts the opposite:

$$
\mathbb{E}\left[x_{t+h} - x_t \mid x_t\right] = -\left(1 - (1-\theta)^h\right)\left(x_t - \ln 100\right)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $x_t$ | log close at bar $t$ | $\ln$ price |
| $h$ | look-ahead | bars, 10 here |
| $\theta$ | pull per bar of the `range` scenario | 0.08 |
| $\ln 100$ | the range's centre | $\ln$ price |

At $h = 10$ the bracket is 0.566: 57 % of the distance to the centre is expected back within ten bars. Measured in
Python on `range` (1000 bars, seeds 1–3), closes that crossed above last month's high sat 3.3 %–4.0 % above the
centre, where the formula predicts a 10-bar move of about −1.9 % to −2.3 %.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0],
 "rules": [
  {"label": "Close crosses above last month's high", "left": {"price": "close"}, "op": "crosses_above",
   "right": {"indicator": {"id": "prev_hlc", "params": {"period": "month"}}, "output": "high"}},
  {"label": "Close crosses above last week's high", "left": {"price": "close"}, "op": "crosses_above",
   "right": {"indicator": {"id": "prev_hlc", "params": {"period": "week"}}, "output": "high"}},
  {"label": "Close crosses above yesterday's high", "left": {"price": "close"}, "op": "crosses_above",
   "right": {"indicator": {"id": "prev_hlc", "params": {"period": "day"}}, "output": "high"}}
 ]}
```

Measured with seed 1 (1000 daily bars, 10-bar look-ahead), close crossing above the previous period's high:

| Scenario | Month | Week | Day |
|---|---|---|---|
| `reversal` | +1.90 % (95 % interval +0.20 % to +3.60 %, n = 18) | +0.74 % (−0.69 % to +2.17 %, n = 37) | −0.13 % (−1.22 % to +0.96 %, n = 68) |
| `range` | −2.69 % (−3.98 % to −1.41 %, n = 23) | −1.31 % (−2.47 % to −0.16 %, n = 44) | −0.32 % (−1.29 % to +0.65 %, n = 68) |
| `random_walk` | −0.10 % (−2.60 % to +2.41 %, n = 16) | −0.17 % (−1.77 % to +1.43 %, n = 38) | −0.32 % (−1.49 % to +0.84 %, n = 67) |
| `uptrend` | −0.54 % (−1.88 % to +0.79 %, n = 31) | −0.31 % (−1.40 % to +0.77 %, n = 48) | −0.16 % (−1.00 % to +0.69 %, n = 69) |

Over seeds 1–5 the monthly breakout is positive on `reversal` every time (+1.90 % to +3.12 %, every interval above
zero) and negative on `range` every time (−1.41 % to −4.20 %, four intervals below zero). The same rule, opposite
signs: the level does not "work", the market type decides. The longer the period, the rarer and more extreme the
break, so the effect grows from day to month while $n$ shrinks. On `random_walk` the intervals contain zero for
seeds 1–4; seed 5 gives +1.74 % (+0.16 % to +3.33 %) by chance, which a 95 % interval allows once in twenty tries.
On `uptrend` (a constant drift) every interval contains zero: with nothing to switch on, a breakout says nothing that
the drift did not already say.

**Intraday: yesterday's high and low on hourly bars.** The same test on synthetic hourly bars (seven per session,
the period being the session):

```lab
{"kind": "combo", "scenario": "range", "interval": "1h", "horizon": 10, "on": [0],
 "rules": [
  {"label": "Close crosses above yesterday's high", "left": {"price": "close"}, "op": "crosses_above",
   "right": {"indicator": {"id": "prev_hlc", "params": {"period": "day"}}, "output": "high"}},
  {"label": "Close crosses below yesterday's low", "left": {"price": "close"}, "op": "crosses_below",
   "right": {"indicator": {"id": "prev_hlc", "params": {"period": "day"}}, "output": "low"}}
 ]}
```

With seed 1 on `range`: crossing above yesterday's high −1.97 % (−3.10 % to −0.84 %, n = 38; −0.80 % to −1.97 % for
seeds 1–5, four intervals below zero); on `random_walk` −0.23 % to +0.36 % (seeds 1–5), every interval containing
zero. The synthetic hourly bars move as much per bar as the daily ones, so read this as "a break of the
last session's range, in bar units", not as a model of a real trading day.

One rule on one sample: not a backtest (no costs, no position sizing), sensitive to multiple testing (three periods,
two directions and several scenarios are many tests), and not investment advice.

## Combine with
A breakout is a trigger; it needs a filter that says whether the market is trending. The textbook pair is "close
above SMA 200" with a break of last week's high:

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Close crosses above last week's high", "left": {"price": "close"}, "op": "crosses_above",
   "right": {"indicator": {"id": "prev_hlc", "params": {"period": "week"}}, "output": "high"}},
  {"label": "Close above SMA 200", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 200}}, "output": "ma"}}
 ]}
```

With seed 1 on `reversal`: the weekly breakout alone +0.74 % (−0.69 % to +2.17 %, n = 37), the filter alone +1.48 %
(−0.05 % to +3.01 %, n = 36), both +2.22 % (+0.42 % to +4.03 %, n = 17). Over seeds 1–5 the AND gives +1.54 % to
+2.40 %, the interval above zero for two seeds. On `range` the filter does not rescue the breakout: the AND gives
−0.57 % to −2.25 % (seeds 1–5), because the SMA 200 filter there selects prices above the centre, the same bias as the
breakout. A filter helps only if it measures something the trigger does not. Swing points are the other family of
levels: see [Pivot Points High/Low](learn:pivots); and the
[ATR](learn:atr) gives the distance scale for "how far above the old high is far".

## Differences vs TradingView
- Periods follow the session date, so stocks, ETFs and cash indices (one session inside one calendar day) match
  TradingView's daily levels, and a futures or forex session that starts the evening before (18:00 or 17:00 New York)
  counts as one day, like its daily bar (not two halves split at midnight UTC). The week is the ISO week (Monday to
  Sunday) and the month the calendar month of the session date. See [Bars and sessions](learn:bars-and-sessions).
- On daily bars with Period = Day the lines are simply the previous bar's high, low and close.

## Pitfalls
- A holiday or a missing bar does not create an empty period: the previous period is the last one that has bars.
- With Period = Day on weekly or monthly bars every bar is its own period (the previous bar).
- The levels are of the bars on the chart: with ADJ on, older levels are dividend-adjusted and differ slightly from
  the prices printed at the time (see [Adjusted prices](learn:adjusted-prices)).
- A "breakout" edge on one market type turns into a loss on another (Why it works): check the regime, not the level.
- The first period of the loaded history has no lines.

## Exercise
1. In the Why it works lab, switch the scenario between `reversal` and `range` with only the monthly rule on: watch
   the edge change sign. Then switch on the weekly and daily rules one at a time: why do $n$ and the size of the edge
   move in opposite directions?
2. In the Combine with lab, change the scenario to `uptrend` and press the new-sample button a few times. Does the
   filter add anything when the trend never changes?
3. Replay SPY on hourly bars from 2 April 2025 with yesterday's levels, through the tariff sell-off and the rebound
   of the following week. Yahoo keeps about 730 days of hourly bars, so in 2027 this date falls out of reach; then
   pick any recent volatile week instead.

```lab
{"kind": "replay", "symbol": "SPY", "date": "2025-04-02", "interval": "1h",
 "indicators": [{"id": "prev_hlc", "params": {"period": "day"}}],
 "steps": [
  "Step through the first bars of each session: where does the open sit relative to yesterday's high, low and close?",
  "Mark each session that opened below yesterday's low. Did the price get back above that low before the close?",
  "Find a session where the price broke above yesterday's high. Did it hold above it for the rest of the session?"
 ],
 "reveal": "In a fast market the open often lands outside yesterday's range: the levels are then targets for a fill rather than barriers. Count how often a break held and how often it failed back inside; a handful of sessions is far too few to call either one an edge."}
```
