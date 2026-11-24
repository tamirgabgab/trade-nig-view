# VWAP (`vwap`)

The Volume Weighted Average Price of the current trading [session](glossary:session): the average price paid per share since the
session opened. Intraday only: it restarts every morning and is hidden on daily and longer bars.

## What it measures
The question it answers: "what did the average share traded today cost, and is the price now above or below that?"
Every buyer and every seller of the session traded at some price; VWAP is the volume-weighted mean of those prices,
so price above VWAP means the average share bought today is in profit, price below means it is under water. It is the
benchmark that execution desks compare their fills with, which is why intraday traders watch it.

VWAP has no numeric parameter (its only input, the source, is a choice, which a slider cannot move), so this widget
is a `combo` lab on hourly bars instead: switch between the two rules to see VWAP of hlc3 (the default) and VWAP of
the close. Watch each morning: the line starts on the first bar's own price and then moves less and less as the
session's volume piles up.

```lab
{"kind": "combo", "scenario": "random_walk", "horizon": 7, "interval": "1h", "on": [0],
 "rules": [
  {"label": "Close above VWAP (hlc3)", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "vwap", "params": {"source": "hlc3"}}, "output": "vwap"}},
  {"label": "Close above VWAP (close)", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "vwap", "params": {"source": "close"}}, "output": "vwap"}}
 ]}
```

The hourly scenarios reuse the daily close path one bar per hour: seven bars per session (14:30–20:30 UTC), an
[opening gap](glossary:gap) four times wider than the gap between hours, and the U-shaped intraday volume of real markets (the first
and last hour trade most). A 1000-bar sample is about 143 sessions. Switch the data picker to daily bars and the line
disappears (see [Warm-up](glossary:warm-up)).

## Formula

$$
\textcolor{#2962FF}{\mathrm{VWAP}_t} = \frac{\sum_{i \in s(t),\ i \le t} p_i\,V_i}{\sum_{i \in s(t),\ i \le t} V_i}
= \frac{\sum_{i \in s(t),\ i \le t} p_i\,V_i}{S_t},
\qquad
p = \text{hlc3} = \frac{H + L + C}{3}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#2962FF}{\mathrm{VWAP}_t}$ | the session's volume-weighted average price at bar $t$ (the blue line) | price |
| $s(t)$ | the session of bar $t$: all bars of the same trading day | set of bars, 7 per session on hourly US stock bars |
| $p_i$ | the source of bar $i$, by default its typical price hlc3 | price |
| $H,\ L,\ C$ | high, low and close of the bar | price |
| $V_i$ | volume of bar $i$ | shares |
| $S_t$ | the session's volume so far, $\sum_{i \in s(t),\, i \le t} V_i$ | shares |

The sums restart at the first bar of every session (session dates as in ARCHITECTURE section 6: exchange-local
date, or the 18:00 New York open for CME futures). ChartLab restarts each session's running sums from zero exactly,
not by subtracting one global cumulative sum, so there is no rounding drift late in the history.

## Kernel, lag and noise
**The running form.** Multiply the definition by $S_t$, write $S_{t-1} = S_t - V_t$ for the previous bar of the same
session, and solve for the new value:

$$
S_t\,\textcolor{#2962FF}{\mathrm{VWAP}_t} = S_{t-1}\,\textcolor{#2962FF}{\mathrm{VWAP}_{t-1}} + V_t\,p_t
\;\Longrightarrow\;
\textcolor{#2962FF}{\mathrm{VWAP}_t} = \textcolor{#2962FF}{\mathrm{VWAP}_{t-1}}
+ g_t\,\bigl(p_t - \textcolor{#2962FF}{\mathrm{VWAP}_{t-1}}\bigr),
\qquad g_t = \frac{V_t}{S_t}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#2962FF}{\mathrm{VWAP}_{t-1}}$ | the value one bar earlier in the same session | price |
| $g_t$ | gain: the share of the session's volume so far that bar $t$ traded | $0$ to $1$; exactly $1$ on the first bar |
| $S_{t-1}$ | the session's volume up to the previous bar ($0$ on the first bar) | shares |

This is the EMA update $y_t = y_{t-1} + \alpha\,(x_t - y_{t-1})$ with one difference: the EMA's gain
$\alpha = \frac{2}{n+1}$ is a constant, the VWAP's gain is set by the volume and shrinks as the day's volume piles up.
With equal volume on every bar, $g = \frac1k$ on the $k$-th bar of the session, the gain of an EMA of length $2k - 1$:
the VWAP behaves like an EMA that starts each morning with length 1 and lengthens by two every bar, and that forgets
everything before the open. A bar with unusual volume (news, the close auction) gets a large gain whenever it comes.

**How fast a bar's weight decays.** Bar $j$ enters with weight $g_j$ and keeps $V_j / S_t$ at a later bar $t$ of the
same session:

$$
w_{j,t} = \frac{V_j}{S_t} = g_j \prod_{m=j+1}^{t} (1 - g_m)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $w_{j,t}$ | weight of bar $j$ inside $\textcolor{#2962FF}{\mathrm{VWAP}_t}$ | $0$ to $1$, the weights of a session sum to $1$ |
| $g_j,\ g_m$ | gains of bar $j$ and of the later bars $m$ | $0$ to $1$ |

An EMA's weights decay geometrically, $\alpha(1-\alpha)^{t-j}$, and never reach zero; here a bar's weight falls only
as fast as new volume arrives, and drops to zero at the next session. With the intraday volume profile of the hourly
lab data (1.8, 1.1, 0.8, 0.7, 0.8, 1.0, 1.6 times a base volume), in expectation:

| Bar of the session | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Gain $g$, U-shaped volume | 1 | 0.379 | 0.216 | 0.159 | 0.154 | 0.161 | 0.205 |
| Gain $g$, equal volume ($\frac1k$) | 1 | 0.500 | 0.333 | 0.250 | 0.200 | 0.167 | 0.143 |
| Weight of the first bar, U-shaped | 1 | 0.621 | 0.486 | 0.409 | 0.346 | 0.290 | 0.231 |
| Weight of the first bar, equal volume | 1 | 0.500 | 0.333 | 0.250 | 0.200 | 0.167 | 0.143 |
| Lag on a straight line, U-shaped (bars) | 0 | 0.62 | 1.27 | 1.91 | 2.46 | 2.90 | 3.10 |
| Lag, equal volume $\frac{k-1}{2}$ (bars) | 0 | 0.50 | 1.00 | 1.50 | 2.00 | 2.50 | 3.00 |
| Noise factor $\sum_j w_{j,t}^2$, U-shaped | 1 | 0.529 | 0.372 | 0.288 | 0.230 | 0.188 | 0.161 |

The heavy opening hour anchors the line: at the close the first bar still carries 23 % of the day's VWAP instead of
the 14 % an equal-volume average would give it (measured on the lab's `random_walk` hourly data, seed 1: the first bar
traded 22.2 % of its session's volume on average, slightly less than 23.1 % because volume also grows with the size
of a bar's move). The gain is not monotone: the heavy last hour pulls the line again (0.205 against 0.154 at mid-day).
The [lag](glossary:lag) grows through the session like that of a growing SMA, and ends near 3 bars for both volume shapes because
both ends of the U are heavy. Not time-invariant, so there is no fixed [kernel](glossary:kernel) and no [frequency response](glossary:frequency-response).

## Defaults
| Param | Default | Why |
|---|---|---|
| Source | hlc3 | TradingView default: the bar's typical price, a stand-in for where its volume traded |

Anchor: Session (fixed). No bands.

## Warm-up
First valid bar index: 0, and it restarts on the first bar of each session, where
$\textcolor{#2962FF}{\mathrm{VWAP}} = p$, the bar's own source value ($g = 1$). `NaN` while the session's volume so
far is 0.

**Empty on daily and longer intervals.** A daily bar is a whole session: the sum has one term, so the VWAP of a daily
bar would just be that bar's own hlc3, with nothing averaged. ChartLab returns `NaN` on every daily, weekly and monthly
bar (daily bars carry no session), so the line is hidden there; TradingView hides its VWAP on 1D and above by default
for the same reason. Every widget on this page therefore starts on hourly bars; an [event study](glossary:event-study) on daily bars finds no
signal at all ($n = 0$).

## Filter view
Not offered (not a fixed-kernel average).

## How to read it
- **Price above / below the line:** the last price is above / below the average price paid today. Above, the average
  buyer of the day is in profit; below, at a loss.
- **Distance from price**, best read in percent, $(C_t - \mathrm{VWAP}_t)/\mathrm{VWAP}_t$: how far the price has run
  from the day's average fill. Early in the session the line hugs the price; late in the session it hardly moves, so
  a late move opens a large gap.
- **Slope:** the line moves towards each new bar's price by the fraction $g_t$, so it always moves in the direction of
  $p_t - \mathrm{VWAP}_{t-1}$. A flat VWAP late in the day says little: it is flat because the gain is small.
- **Trend day vs range day:** on a trend day the price leaves the line after the first hours and stays on one side; on
  a range day it crosses back and forth around it.
- **Source:** hlc3 places each bar's volume at the middle of its range; close places it at the last price. With close
  the first bar's VWAP equals its close exactly, so "close above VWAP" is never true on the first bar of a session.
  From the second bar on, the two sources disagree on the side in about 6 % of the bars (6.3 % on `random_walk`
  hourly, seed 1; 4.6–7.2 % over three seeds and five scenarios), and differ by 0.25–0.37 % of the price on average.
- **Each morning is a fresh start:** the first bar's value is that bar alone; do not read much into the side in the
  first hour.

## Why it works
**VWAP is what volume-proportional trading pays.** Suppose you buy $q_i$ shares on bar $i$ of a session. Your average
price is

$$
\bar p = \frac{\sum_i q_i\,p_i}{\sum_i q_i},
\qquad q_i = c\,V_i \;\Longrightarrow\; \bar p = \frac{\sum_i c\,V_i\,p_i}{\sum_i c\,V_i} = \textcolor{#2962FF}{\mathrm{VWAP}}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $q_i$ | shares you trade on bar $i$ | shares |
| $\bar p$ | your average fill price over the session | price |
| $c$ | your fixed share of the market's volume, e.g. 1 % | — |
| $\textcolor{#2962FF}{\mathrm{VWAP}}$ | the session's VWAP at its last bar | price |

whatever the price path. That is why a large order is sliced in proportion to the expected volume (more at the open
and the close: the U shape) and judged by its slippage $\frac{\bar p - \mathrm{VWAP}}{\mathrm{VWAP}}$. Buying below
VWAP means you paid less than the average share traded today. Every trade has a buyer and a seller, so the day's
buyers as a group paid exactly VWAP: beating it is a comparison with the other traders of the day, a cost measure,
not a forecast.

**The gap to price is a volume-weighted sum of today's price changes.** With the close as source, write
$\Delta x_j = x_j - x_{j-1}$ and let $s$ be the first bar of the session. Since $x_t - x_i = \sum_{j=i+1}^{t}\Delta x_j$
and the weights $\frac{V_i}{S_t}$ sum to 1,

$$
x_t - \textcolor{#2962FF}{\mathrm{VWAP}_t} = \sum_{i=s}^{t} \frac{V_i}{S_t}\,(x_t - x_i)
= \sum_{j=s+1}^{t} \frac{S_{j-1}}{S_t}\,\Delta x_j
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $x_t$ | close at bar $t$ | price |
| $\Delta x_j$ | price change of bar $j$ (close to close) | price per bar |
| $s$ | first bar of the session of $t$ | bar index |
| $\frac{S_{j-1}}{S_t}$ | weight of that change: the share of today's volume (so far) that traded before bar $j$ | $0$ to $1$ |

Each change since the open counts with the share of the day's volume that traded before it, i.e. that it moved into
profit or loss. "Close above VWAP" is therefore a [momentum](glossary:momentum) measure, like "close above SMA", but over a window cut at
the open: at most six changes on hourly bars. (With hlc3 as source, add $\sum_i \frac{V_i}{S_t}(C_i - p_i)$: where
each bar closed inside its own range.)

**When that can predict anything.** The argument of the SMA page applies unchanged: if price changes are independent
of the past with a constant mean $\mu$ (`random_walk`, `uptrend`), the expected $h$-bar return after any signal is
$h\mu$, the same as after any bar, and the [edge](glossary:edge) is zero. An edge needs dependence: a drift that flips (`reversal`),
[mean reversion](glossary:mean-reversion) (`range`), or volume-led phases (`accumulation`). With a window this short, theory expects the signs of
the SMA page, much weaker. The lab uses a look-ahead of 7 bars, one session:

```lab
{"kind": "combo", "scenario": "range", "horizon": 7, "interval": "1h", "on": [0],
 "rules": [
  {"label": "Close above VWAP", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "vwap", "params": {}}, "output": "vwap"}},
  {"label": "Close below VWAP", "left": {"price": "close"}, "op": "lt",
   "right": {"indicator": {"id": "vwap", "params": {}}, "output": "vwap"}},
  {"label": "Close crosses above VWAP", "left": {"price": "close"}, "op": "crosses_above",
   "right": {"indicator": {"id": "vwap", "params": {}}, "output": "vwap"}}
 ]}
```

Measured with seed 1 (1000 hourly bars, 7-bar look-ahead):

| Scenario | Close above VWAP | Close below VWAP |
|---|---|---|
| `random_walk` | +0.11 % ([95 % interval](glossary:confidence-interval) −0.59 % to +0.81 %, n = 98) | +0.09 % (−0.63 % to +0.80 %, n = 104) |
| `uptrend` | +0.08 % (−0.45 % to +0.60 %, n = 105) | +0.16 % (−0.43 % to +0.75 %, n = 99) |
| `reversal` | +0.20 % (−0.50 % to +0.91 %, n = 100) | +0.08 % (−0.58 % to +0.75 %, n = 104) |
| `range` | −0.32 % (−1.00 % to +0.36 %, n = 105) | +0.60 % (−0.05 % to +1.25 %, n = 107) |
| `accumulation` | +0.25 % (−0.41 % to +0.90 %, n = 95) | −0.04 % (−0.64 % to +0.56 %, n = 104) |

Over seeds 1–5 the honest null holds: on `random_walk` and `uptrend` both rules change sign from seed to seed. The
signs theory predicts do show up, but weakly: "above" is negative on `range` for all five seeds (−0.19 % to −0.53 %)
and positive on `reversal` for all five (+0.06 % to +0.20 %), and positive on `accumulation` for four of five; yet
every single interval covers zero. The cross ("crosses above") changes sign with the seed in every scenario. The
information is in the slow context, not in today's side of the VWAP: on the same `reversal` bars "close above SMA 50"
gives +1.23 % (see Combine with). This is one rule on one sample, not a backtest (no costs, no exits), and not
investment advice.

## Combine with
VWAP answers "is the price cheap or dear against today's average fill?", not "which regime are we in?". So it is a
timing or execution layer on top of a slower rule that carries the edge: a trend filter (a long SMA on the same
hourly bars) or a volume-flow rule (`obv`). Buying the dips below VWAP within the trend is the classic use:

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 7, "interval": "1h", "on": [0, 2],
 "rules": [
  {"label": "Close below VWAP", "left": {"price": "close"}, "op": "lt",
   "right": {"indicator": {"id": "vwap", "params": {}}, "output": "vwap"}},
  {"label": "Close above VWAP", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "vwap", "params": {}}, "output": "vwap"}},
  {"label": "Close above SMA 50", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 50}}, "output": "ma"}}
 ]}
```

With seed 1, on `reversal` (hourly): Close above SMA 50 alone +1.23 % (+0.53 % to +1.92 %, n = 62), positive for
seeds 1–5 (+0.84 % to +1.77 %). Adding "below VWAP" gives +1.85 % (+0.95 % to +2.75 %, n = 39), adding "above VWAP"
+1.05 % (+0.24 % to +1.87 %, n = 58); but which of the two is higher changes with the seed (below wins on seeds 1, 2
and 4, above on 3 and 5), and each AND keeps only part of the episodes. On `random_walk` the SMA filter alone has no
stable sign (−0.38 % to +0.52 % over seeds 1–5).

The same with volume flow, on the one scenario where volume carries direction:

```lab
{"kind": "combo", "scenario": "accumulation", "horizon": 7, "interval": "1h", "on": [0, 2],
 "rules": [
  {"label": "Close below VWAP", "left": {"price": "close"}, "op": "lt",
   "right": {"indicator": {"id": "vwap", "params": {}}, "output": "vwap"}},
  {"label": "Close above VWAP", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "vwap", "params": {}}, "output": "vwap"}},
  {"label": "OBV above its value 20 bars ago", "left": {"indicator": {"id": "obv", "params": {}}, "output": "obv"},
   "op": "gt", "right": {"indicator": {"id": "obv", "params": {}}, "output": "obv", "ago": 20}}
 ]}
```

With seed 1, on `accumulation` (hourly): OBV above its value 20 bars ago alone +1.46 % (+0.78 % to +2.15 %, n = 59),
positive for seeds 1–5 (+0.68 % to +1.46 %); with "below VWAP" +1.45 % (+0.57 % to +2.33 %, n = 40), with "above
VWAP" +1.68 % (+0.89 % to +2.46 %, n = 51). Again the edge comes from the OBV rule; the VWAP side mostly decides the
price you pay. On `random_walk` the OBV rule has no edge (+0.38 %, −0.57 % to +1.32 %, n = 71), because volume there
depends only on the size of a move, not its direction. Same caveat: one sample, not a backtest, not advice.

## Differences vs TradingView
- Anchor fixed to Session (TradingView also offers week, month, quarter, year, earnings, dividends, splits); no
  standard-deviation bands yet.
- TradingView computes it from the chart's bars too, so on 1h bars it matches TradingView's 1h VWAP, not a tick VWAP.
- Hidden on daily and longer intervals (all values empty). TradingView hides it there by default too.

## Pitfalls
- With 1h or 4h bars there are only a few bars per session: the first value is just that bar's hlc3, and on hourly
  US stock bars the window never holds more than seven bars.
- Symbols without volume (indices, forex) have no VWAP (all values empty).
- **hlc3 is an approximation.** A real VWAP weights every trade by its own price; on bars, all of a bar's volume is
  placed at one price (hlc3 or close). A wide bar whose volume traded near one end is placed up to two thirds of its range
  away from where it really traded, and the line moves by $g_t$ times that.
- **The open dominates.** The first hour often trades the most and opens after the overnight gap, so the whole day's
  VWAP can sit near a price the market left early. After a big gap, the price can stay on one side of VWAP all day.
- **A late big-volume bar still moves it.** The gain is $V_t/S_t$, not a function of the time of day: a news bar with
  three times the usual volume can pull a late-session VWAP as much as a morning bar does.
- **Above VWAP is not a buy signal by itself.** The labs find no stable edge for either side alone; a high [hit rate](glossary:hit-rate)
  in an uptrend is the trend's, not the VWAP's (compare with the baseline, as the labs do).
- The synthetic hourly bars move as much per hour as the daily scenarios move per day (the same close path), so their
  numbers show the logic, not realistic intraday sizes.
- Real hourly history reaches only about 730 days back from today (Yahoo's limit): hourly replays and real-symbol
  labs cannot go further.

## Exercise
1. In the "Why it works" lab, keep only "Close above VWAP" on and switch the scenario from `range` to `random_walk`,
   `uptrend`, `reversal` and `accumulation`, pressing the new-sample button a few times on each. Which signs stay put
   and which flip, and why does none of the intervals leave zero? Then switch the data picker to daily bars: what
   happens to $n$, and why?
2. In the first lab, watch three mornings: how far does the line move on the second bar compared with the sixth?
   Compare with the gain table (0.38 vs 0.16). Then pick SPY on hourly bars in the data picker and look for a day on
   which the price never returned to VWAP after the first hour.
3. Start Replay on SPY hourly at the end of 8 April 2025, with VWAP. Step into the session of 9 April 2025, when a
   90-day pause of most of the newly announced tariffs was announced in the afternoon (New York time). For the bar of
   the announcement, read its volume from the volume bars and estimate its gain $g = V_t/S_t$: is it larger than the
   gain of a quiet mid-day bar? How far does the price run from the VWAP by the close, and where does the line start
   the next morning?

```lab
{"kind": "replay", "symbol": "SPY", "date": "2025-04-08", "interval": "1h", "indicators": [{"id": "vwap", "params": {}}]}
```
