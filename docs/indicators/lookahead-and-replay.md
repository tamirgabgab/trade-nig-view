# Lookahead and replay

**Lookahead** is using information at time $t$ that did not exist until later. It is the most common way a chart
study or a backtest looks better than reality, because the future is exactly what a trader does not have. This page
states ChartLab's rule against it, how the rule is tested for every indicator, the one indicator that is drawn
"early" (pivots), how the labs measure signals honestly, and how **bar replay** lets you see a chart as it was.

## The rule: the value at t uses only bars up to t
Every indicator output is a function of the bars up to and including its own bar:

$$
y_t = F\bigl(\mathrm{bar}_0, \mathrm{bar}_1, \dots, \mathrm{bar}_t\bigr)
\quad\Longleftrightarrow\quad
F(\mathrm{bars})_k = F(\mathrm{bars}_{0..k})_k \ \text{ for every } k.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $y_t$ | an indicator output at bar $t$ | price, 0–100, ... |
| $F$ | the indicator computed over a list of bars | — |
| $\mathrm{bars}_{0..k}$ | the history cut after bar $k$ (a prefix) | bars |
| $F(\cdot)_k$ | the output at bar $k$ | — |

The right-hand form is what can be tested: computing over the whole history and computing over the history cut at
bar $k$ must give the same value at bar $k$. If a later bar could change $y_k$, the two would differ. A filter that
satisfies it is **causal**; in signal-processing terms its [impulse response](glossary:impulse-response) is zero for negative delays.

## How the app tests it
`backend/tests/golden/test_replay_no_lookahead.py` checks the right-hand form for **every registered indicator**, at
its default parameters, on a daily fixture and on an hourly fixture with [sessions](glossary:session) (so VWAP and the session-anchored
indicators are covered too):

- cursors $k$ at the first bars (0, 1, 5, 30: inside the [warm-up](glossary:warm-up)), at a quarter, half and three quarters of the
  history, and at the last two bars;
- for each, `compute(bars)[k] == compute(bars[:k+1])[k]` for every output, within $10^{-12}$, `NaN` included.

The same check, `check_no_lookahead`, runs inside the property tests on random bars and random cursors, and a test of
the gap analysis checks that the gaps known at bar $k$ (and whether they were filled) are exactly those found on
`bars[:k+1]`. Around the indicators the data path is causal too:

- the backend's `until` cut is applied **before** dividend adjustment and resampling;
- a weekly or monthly bar cut by the cursor holds only the days up to the cursor (see
  [Bars and sessions](learn:bars-and-sessions));
- a plot `offset` must be $\ge 0$: an average can be drawn later than its bar, never earlier;
- a lab rule's `ago` must be $\ge 0$: it can read the past, not the future.

## Pivots: known late, drawn on their bar
A [pivot high](learn:pivots) is a bar higher than the $L$ bars before it and the $R$ bars after it. Whether bar $p$ is
a pivot is unknowable until bar $p + R$ has closed. ChartLab stores the pivot where it becomes known:

$$
\mathrm{high}_t =
\begin{cases}
H_{t-R} & \text{if bar } t - R \text{ is a pivot high} \\
\mathrm{NaN} & \text{otherwise}
\end{cases}
\qquad
\text{display shift} = R.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#F23645}{\mathrm{high}_t}$ | the pivot-high output at bar $t$ (its confirmation bar) | price or NaN |
| $H_{t-R}$ | the high of the pivot bar itself | price |
| $L,\ R$ | bars required on the left and on the right | bars, 5 and 5 by default |
| display shift | bars the chart draws the marker to the left of the bar that holds it | $R$ |

The value is causal (it sits at bar $p + R$ and uses bars up to $p + R$); only the *drawing* moves it $R$ bars left,
onto the high itself, so that it looks right on a finished chart. In replay the marker appears $R$ bars after the
top. [Pivot lows](glossary:pivot-point) work the same way ($\textcolor{#089981}{\mathrm{low}_t}$).

How much the difference matters is easy to measure. Below, an [event study](glossary:event-study) of "a pivot low was confirmed on this bar"
on a [random walk](glossary:random-walk), where no rule can have an [edge](glossary:edge):

```lab
{"kind": "combo", "scenario": "random_walk", "horizon": 10, "on": [0],
 "rules": [
  {"label": "Pivot low confirmed (5 bars after the low)",
   "left": {"indicator": {"id": "pivots", "params": {}}, "output": "low"}, "op": "gt", "right": {"value": 0}},
  {"label": "Pivot high confirmed (5 bars after the high)",
   "left": {"indicator": {"id": "pivots", "params": {}}, "output": "high"}, "op": "gt", "right": {"value": 0}}
 ]}
```

With seed 1 (1000 bars, 10-bar [look-ahead](glossary:horizon)) the honest rule, measured from the confirmation bar, gives −0.28 % ([95 %
interval](glossary:confidence-interval) −1.92 % to +1.36 %, n = 47): no edge, as it must be. The lab cannot measure the dishonest version, but the
same event study run offline from the **pivot bar itself**, as if the low were known when it happened, gives +3.08 %
(+1.86 % to +4.31 %, n = 47). Over seeds 1–5 the honest edge stays between −0.71 % and +0.26 % with every interval
including zero, while the lookahead version gives +2.64 % to +3.32 % with every interval above zero; on `range` and
`uptrend` the picture is the same (lookahead +1.30 % to +3.21 %). "Buying at the low" is the textbook lookahead: by
definition the price rose afterwards.

## Event studies: the signal from the past, the return after it
Every lab measures a rule the same way ([Combining indicators](learn:combinations)):

$$
A_t = G\bigl(\mathrm{bars}_{0..t}\bigr),
\qquad
r_t = \ln\frac{C_{t+h}}{C_t},
\qquad
\mathrm{edge} = \overline{r_t \mid A_t} - \overline{r_t}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $A_t$ | the rule is true at bar $t$ | true / false |
| $G$ | the rule: indicator values and prices at bars $t$ and $t-1$ (crosses), or $t - k$ with `ago` | — |
| $r_t$ | forward log return from the close of bar $t$ to the close $h$ bars later | log return, $\times 100 \approx$ % |
| $h$ | look-ahead (horizon) | bars, 1–60 |
| $\overline{r_t \mid A_t}$, $\overline{r_t}$ | mean return after the signal bars, after every bar | log return |

The signal reads only bars up to $t$; the return starts at $C_t$ and ends $h$ bars later, so the two never overlap.
At most one signal counts per $h + 1$ bars, so the counted forward windows do not overlap either. What the edge still
assumes is that you could trade **at the close of the signal bar**, the same close the signal was computed from. That
is realistic only for a decision made in the last moments of the session; otherwise the entry is the next open, and
the overnight move is not yours.

## Replay
Bar replay shows a chart as it was at a past bar, then steps forward one bar at a time:

- **Start:** the Replay button in the top bar, then click a bar, type a start date (the replay starts at the last bar
  on or before it), or start at a random bar. Exercise cards on these pages start it for you.
- **Step:** Next bar (`Shift+→`), or Play at 0.5 to 10 bars per second.
- **What you see:** the bars up to the cursor. Indicators are not recomputed per step: the values computed over all
  loaded bars are cut at the cursor. That is exact *because* of the test above: a value at bar $k$ is the same whether
  later bars exist or not.
- **Pivots** appear $R$ bars after their bar, at the moment they are confirmed.
- **[Gaps](learn:gaps)** after the cursor are not shown, and a gap filled after the cursor is shown as still open.
- **The interval is locked** while a replay runs; switching to another symbol ends it.
- **Drawings** stay visible, so a line drawn on today's chart is a line drawn with hindsight.

One thing replay does not undo: **dividend adjustment**. With ADJ on, past prices are scaled by every dividend paid
up to the day the history was downloaded, so price levels during a replay are levels nobody saw at the time. Returns
and scale-free indicators (RSI, Stochastic) are unaffected; switch ADJ off when absolute levels matter (see
[Adjusted prices](learn:adjusted-prices)).

## Common lookahead traps
- **Trading the close you computed from.** A rule on today's close can only be acted on at that close if you decide
  in the last seconds of the session. A study that enters at the signal bar's close should be read with that in mind;
  a stricter one enters at the next open.
- **[Adjusted prices](glossary:adjusted-price) as levels.** Adjusted history embeds later dividends. A rule such as "buy below 100" on adjusted
  prices triggers at raw prices that were higher.
- **Centred averages.** A moving average drawn at the centre of its window (shifted left by $\frac{n-1}{2}$) has no
  [lag](glossary:lag) on a finished chart and is the smoothest-looking line there is, because half of its window is in the future. Its
  last $\frac{n-1}{2}$ values cannot exist. ChartLab only allows shifts to the right.
- **Indicators that repaint.** Pivots, zig-zags and anything that redraws past values when new bars arrive look
  perfect in hindsight. Check where the value *becomes known*, not where it is drawn.
- **Re-fitted parameters.** Picking the length, the threshold or the combination that worked best on the history and
  then "testing" it on the same history uses the future to choose the rule. That is
  [overfitting](learn:combinations#overfitting-and-multiple-testing); it needs data the choice never saw.
- **Choosing the universe today.** The watchlist holds today's large, successful companies. A rule tested on them is
  tested on stocks already known to have survived and grown (survivorship bias): the future chose the sample.
- **Hindsight on the chart.** Seeing the whole chart, you know where the trend went. Replay hides the right side so
  you have to decide without it.

## Exercise
A guided replay of the February 2020 top in SPY, with pivots and a 50-bar average:

```lab
{"kind": "replay", "symbol": "SPY", "date": "2020-02-12",
 "indicators": [{"id": "pivots", "params": {}}, {"id": "sma", "params": {"length": 50}}],
 "steps": ["Start in Replay. Before stepping, write down what you expect for the next 20 bars.",
  "Step forward one bar at a time (Shift+Right) and note the date of the highest high of February.",
  "Keep stepping. On which bar does the pivot-high marker on that high appear, and on which bar is it drawn?",
  "Open the Gaps panel (minimum size 1 %) and keep stepping into March: when a gap appears, is it listed as filled or open, and when does that change?",
  "Note on which bar the close falls below the SMA 50, then exit the replay and look at the whole chart again."],
 "reveal": "The pivot high is drawn on the top bar but appears only five bars later, when five later bars with lower highs have confirmed it. Until then the pivot indicator says nothing about a top. A gap shows up on the bar that makes it and stays open until a later bar fills it. The close below the SMA 50 comes several bars after the top: the price first has to fall through the whole distance between itself and the average. On the full chart the top looks obvious; in replay it was not."}
```

Afterwards, in the lab above, set the scenario to `range` and then `uptrend` and press the new-sample button a few
times. Does the honest pivot-low rule ever show an edge that survives several samples? (Measured for seeds 1–5 on
`range`: −1.28 % to −0.45 %, two of the five intervals below zero. By the time a low is confirmed the price has
already bounced for five bars, and a [mean-reverting](glossary:mean-reversion) market tends to give some of that back.)

More exercises: [Guided exercises](learn:guided-exercises).
