# Moving Average Cross (`ma_cross`)

A fast and a slow moving average, with a marker on every bar where the fast one crosses the slow one: up (golden
cross) or down (death cross). Use it as a simple trend-change signal, knowing that it is late by construction.

## What it measures
Whether the short-term average is above or below the long-term one, i.e. the sign of the recent slope. A marker says
that sign has changed. The question it answers: "has the trend at the fast horizon turned against the trend at the
slow horizon?"

Move the fast length on a series that rises and then falls: a short fast line crosses the slow one often (many
markers, some false), a fast length close to the slow one crosses rarely and late.

```lab
{"kind": "param", "indicator": "ma_cross", "vary": "fast_length", "min": 2, "max": 50, "scenario": "reversal"}
```

## Formula

$$
\textcolor{#FF6D00}{F_t} = \mathrm{MA}^{\text{fast}}_{n_f}(x)_t, \qquad \textcolor{#2962FF}{S_t} = \mathrm{MA}^{\text{slow}}_{n_s}(x)_t, \qquad D_t = \textcolor{#FF6D00}{F_t} - \textcolor{#2962FF}{S_t}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#FF6D00}{F_t}$ | the fast average (any of the 15 types) | price |
| $\textcolor{#2962FF}{S_t}$ | the slow average | price |
| $n_f, n_s$ | fast and slow lengths | bars, default 9 and 21 |
| $x$ | the source (close by default) | price |
| $D_t$ | the gap between the lines | price, sign is what matters |

$$
\text{cross}_t =
\begin{cases}
\textcolor{#089981}{+1} & D_t > 0 \text{ and } D_{t-1} \le 0 \\
\textcolor{#F23645}{-1} & D_t < 0 \text{ and } D_{t-1} \ge 0 \\
\text{none} & \text{otherwise}
\end{cases}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\text{cross}_t$ | the `crosses` output: $\textcolor{#089981}{+1}$ golden (up arrow), $\textcolor{#F23645}{-1}$ death (down arrow), empty otherwise | $\pm 1$ or none |
| $D_{t-1}$ | the gap one bar earlier | price |

The current bar compares strictly, the previous bar non-strictly: the same rule as Pine's `ta.crossover` /
`ta.crossunder`. Both averages must be valid at $t-1$ and $t$, so the first possible marker is one bar after the
warm-up, and a cross is known at the close of bar $t$ (no lookahead).

**Ties.** A bar with $D = 0$ never carries a marker; the marker goes on the bar that leaves zero. So $+,0,-$ gives a
down marker on the third bar, and a touch from above that bounces, $+,0,+$, gives an **up** marker on the third bar
although the lines never swapped order. With real prices exact ties are rare; they occur in flat stretches where
both averages equal the same constant.

## Kernel, lag and noise

Each line is an ordinary MA (see its page). The cross signal depends on the difference filter
$g_k = h^F_k - h^S_k$: $\sum_k g_k = 0$ (no DC) and $\sum_k k\,g_k = L_F - L_S$. On a straight line $x_t = a + bt$,

$$
D_t = b\,(L_S - L_F),
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $b$ | the slope of the trend | price per bar |
| $L_F, L_S$ | the lags of the fast and slow lines | bars (4 and 10 at the defaults) |
| $g_k$ | the kernel of $D$: fast kernel minus slow kernel | weights summing to 0 |

so $\operatorname{sign} D$ is the sign of a smoothed slope, and a cross is a slope sign change seen through two lags.

**Delay of a cross after a turn.** Let price rise with slope $b$ until bar 0 and fall with slope $b'$ after it:
$x_t = x_0 + bt - (b + b')\,(t)_+$. By linearity, with $\rho_h(t) = \sum_k h_k\,(t - k)_+$,

$$
D_t = b\,(L_S - L_F) - (b + b')\big(\rho_F(t) - \rho_S(t)\big).
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $b'$ | the slope of the fall after the turn (positive number) | price per bar |
| $(t)_+$ | $\max(t, 0)$: the ramp that starts at the turn | bars |
| $\rho_h(t)$ | the line's response to that ramp ($h$ = fast or slow kernel) | bars |

Once both windows are past the turn, $\rho_h(t) = t - L_h$ and $D_t = -b'(L_S - L_F)$: the sign has flipped. If each
MA were a pure delay, $\rho_h(t) = (t - L_h)_+$ and the cross would fall at

$$
t^* = \frac{b\,L_S + b'\,L_F}{b + b'},
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $t^*$ | bars from the turn to the cross, for pure-delay lines | bars (7 for 9/21 on a symmetric turn) |

the **average** of the two lags for a symmetric turn, nearer $L_F$ when the new move is steeper. Real kernels round
the corner: $\rho_h(t) \ge (t - L_h)_+$ for $h_k \ge 0$ (Jensen, $(\cdot)_+$ is convex). The wider slow kernel
typically rounds it more, which holds $D_t$ positive longer; measured (first marker bar after a turn at bar 0):

| Pair | Lags $L_F$ / $L_S$ | $t^*$ symmetric | Measured | $t^*$ for $b' = 3b$ | Measured |
|---|---|---|---|---|---|
| SMA 9 / SMA 21 | 4 / 10 | 7 | 10 | 5.5 | 7 |
| EMA 9 / EMA 21 | 4 / 10 | 7 | 12 | 5.5 | 7 |
| SMA 50 / SMA 200 | 24.5 / 99.5 | 62 | 78 | 43.25 | 50 |
| EMA 50 / EMA 200 | 24.5 / 99.5 | 62 | 97 | 43.25 | 52 |

Equal lags do not mean equal cross timing: the EMA's infinite tail remembers the old trend longer than the SMA's
window.

## Defaults
| Param | Default | Why |
|---|---|---|
| Fast MA type | SMA | TradingView default |
| Fast length | 9 | TradingView default |
| Slow MA type | SMA | TradingView default |
| Slow length | 21 | TradingView default |
| Source | close | TradingView default |

## Warm-up
First valid bar index: the larger of the two averages' warm-ups (20 at the defaults); the first possible marker is one
bar later. Extra history: the larger of the two lookbacks.

## Filter view
The drawer measures the two lines (the markers are not a filter output):

- **Fast** (SMA 9): lag 4, NRF 0.1111, $-3$ dB at $P \approx 20.2$ bars, zeros at periods 9, 4.5, 3, 2.25.
- **Slow** (SMA 21): lag 10, NRF 0.0476, $-3$ dB at $P \approx 47.4$ bars, zeros at periods $21/j$ down to 2.1.

Both are symmetric FIR kernels, so the group delay is constant at the lag (undefined at the zeros). The gap between
the two group delays, 6 bars here, is what the slope estimate $D_t$ is built from.

## How to read it
- **Fast above slow** (the state): the smoothed slope is positive, an uptrend at the fast horizon. **Fast below
  slow**: a downtrend. The state is the information; the marker only dates its change.
- **The gap $D_t$.** On a trend it is $b(L_S - L_F)$: proportional to the slope (6 $b$ at 9 / 21). A widening gap is
  an accelerating trend, a narrowing one a trend that is losing slope, often before the cross.
- **Price vs the lines.** Price above both lines in an uptrend is normal (each line lags by its $L$); price falling
  between the lines is the first sign of a turn, before any marker.
- **Trend vs range.** In a trend the lines are apart and markers are rare. In a range $D_t$ hovers near 0 and the
  markers whipsaw.
- **The lengths.** A larger slow-to-fast ratio gives a larger gap (stronger signal) but a later cross; equal
  lengths give no gap at all.

## Why it works
Apply the return identity of the Moving Average page to both lines: $x_t - y_t = \sum_j w_j r_{t-j}$ with
$\sum_j w_j = \bar k$. Subtracting the two,

$$
D_t = \textcolor{#FF6D00}{F_t} - \textcolor{#2962FF}{S_t} = \sum_{j \ge 0} \big(w^S_j - w^F_j\big)\, r_{t-j}, \qquad \sum_{j \ge 0} \big(w^S_j - w^F_j\big) = L_S - L_F.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $w^F_j, w^S_j$ | return weights of the fast and slow lines (their kernels' tails beyond $j$) | 0 to 1 |
| $r_{t-j}$ | the return of bar $t - j$ | about $\pm 1$–2 % per bar |
| $L_S - L_F$ | total weight of past returns in $D$ | 6 bars at 9 / 21 |

For two SMAs the weights $w^S_j - w^F_j$ are non-negative and spread over the slow window, so **fast above slow means
a long weighted sum of returns is positive**: an estimate of the drift over the last $n_s$ bars. A golden cross is the
bar where that estimate turns positive.

On a random walk the next returns do not depend on that estimate, so neither the state nor the cross has an edge.
Where the drift changes and persists (the reversal scenario), the **state** classifies the regime and has an edge; the
**cross** comes late (about 10 bars after a turn at 9 / 21, table above) and also fires on every whipsaw, so the cross
bar itself carries little. In a mean-reverting range, a golden cross happens after price rose above its mean, and
price then tends to fall back: the cross becomes a contrarian signal.

The event lab studies the markers (op "greater than" 0 = golden crosses; switch to "less than" for death crosses):

```lab
{"kind": "event", "indicator": "ma_cross", "output": "crosses", "op": "gt", "value": 0, "range": [-1, 1], "horizon": 10, "scenario": "range"}
```

With seed 1 (1000 bars, 10-bar horizon, defaults 9 / 21): golden crosses on the range $-0.98$ % ($-2.00$ to $+0.06$,
n = 33), negative on four of seeds 1–5; death crosses on the range $+1.10$ % ($-0.08$ to $+2.30$, n = 32); golden
crosses on the random walk $+0.75$ % ($-0.86$ to $+2.38$, n = 28) and on the reversal $-0.84$ % ($-2.07$ to $+0.40$,
n = 14). No interval for the markers alone excludes zero with seed 1: the cross is the weakest way to use this
indicator. One rule on one synthetic sample: not a backtest (no costs), sensitive to how many rules you try, and not
investment advice.

## Combine with
Use the **state** (fast above slow) as the trend rule, a **long filter** (close above SMA 200) to confirm the regime,
and keep the **marker** only as an entry time:

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Fast above slow (9 / 21)", "left": {"indicator": {"id": "ma_cross", "params": {}}, "output": "fast"},
   "op": "gt", "right": {"indicator": {"id": "ma_cross", "params": {}}, "output": "slow"}},
  {"label": "Close above SMA 200", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 200}}, "output": "ma"}},
  {"label": "Golden cross marker", "left": {"indicator": {"id": "ma_cross", "params": {}}, "output": "crosses"},
   "op": "gt", "right": {"value": 0}}
 ]}
```

With seed 1 on the reversal: fast above slow alone $+1.71$ % ($+0.60$ to $+2.83$, n = 46), SMA 200 alone $+1.49$ %
($-0.05$ to $+3.06$, n = 36), both $+2.51$ % ($+0.77$ to $+4.29$, n = 25); the golden cross alone $-0.84$ % (n = 14),
and the cross with the SMA 200 filter keeps only n = 5 signals, too few to read (its sign changes from seed to seed).
On the range the state pair loses, $-1.03$ % ($-2.24$ to $+0.20$, n = 38): trend rules need a trending market. One
sample, no costs, not investment advice.

## Differences vs TradingView
- Same crossing rule as Pine's `ta.crossover` / `ta.crossunder`, and the same 9 / 21 SMA defaults.
- TradingView's MA Cross uses SMA or EMA (research doc §5); here each line can be any of the 15 types.
- ChartLab draws direction-coloured arrows (up below the bar, down above it).

## Pitfalls
- Crosses come late: at least about the average of the two lags after a symmetric turn, in practice more (10 bars
  for SMA 9/21, 97 bars for EMA 50/200).
- In sideways markets $D_t$ hovers near 0 and the markers whipsaw.
- A touch-and-bounce ($+,0,+$) produces a marker in the original direction.
- Lag-compensated types (HMA, DEMA, ZLEMA) cross earlier but overshoot, which adds false crosses.

## Exercise
1. In the event lab, keep the scenario on Range and switch the comparison from "greater than" to "less than" (death
   crosses): why does the sign of the edge flip, and what does that say about using crosses in a range? Then set the
   scenario to Reversal and compare n with the state rule in the combo lab.
2. In the fast-length lab, move the fast length from 2 to 20 on the reversal and count the markers. The turn is at
   bar 150 of the 300 shown: use $t^* = \frac{bL_S + b'L_F}{b + b'}$ (symmetric turn, $b' = b$) to predict where
   the first death cross after it should fall, and compare with the chart.
3. Start Replay on SPY on 2022-01-03 (the start of the 2022 bear market) with a 50 / 200 SMA cross. Step forward: when
   does the death cross appear, how far had SPY already fallen from its high by then, and how many whipsaw crosses
   follow during the year?

```lab
{"kind": "replay", "symbol": "SPY", "date": "2022-01-03", "indicators": [{"id": "ma_cross", "params": {"fast_length": 50, "slow_length": 200}}]}
```
