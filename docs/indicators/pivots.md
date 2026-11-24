# Pivot Points High/Low (`pivots`)

Swing highs and lows (fractals): a bar whose high is above the $L$ bars before it and the $R$ bars after it (a pivot
high), or whose low is below them (a pivot low). People use them to read the market's swing structure (higher highs
and higher lows, or lower ones) and as anchors for [support](glossary:support) and [resistance](glossary:resistance) lines, trend lines and Fibonacci tools.

## What it measures
The question it answers: "where did the market turn, on the scale of $L$ bars back and $R$ bars forward?" A pivot high
is a local top: no bar in the window around it reached as high. It says nothing about the future by itself; it marks
the turns that have happened, and it can only mark a turn once $R$ bars have passed without a higher high. That
delay is the whole story of this indicator (Why it works).

The labs on these pages draw lines, not markers, so the dots below come from an [event study](glossary:event-study): each dot sits on the bar
where a pivot high was **confirmed**, $R = 5$ bars after the top itself. Set the [look-ahead](glossary:horizon) to 1 bar to see every
confirmed pivot high (two pivot highs are always more than $\min(L, R)$ bars apart, so none is skipped); leave the
threshold at 0 (it only filters the pivots by price). To see the circles on the pivot bars themselves, add "Pivot
points high/low" from the chart's Structure menu.

```lab
{"kind": "event", "indicator": "pivots", "output": "high", "op": "gt", "value": 0, "range": [0, 200],
 "horizon": 10, "scenario": "random_walk"}
```

## Formula
Bar $p$ is a pivot high if its high is above every high within $L$ bars on its left and $R$ bars on its right, a
pivot low if its low is below every low there (strict on both sides):

$$
H_p > H_j \ \text{ and } \ \text{for a pivot low } L_p < L_j,
\qquad \text{for every } j \in [p-L,\ p) \cup (p,\ p+R]
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $H_j,\ L_j$ | high and low of bar $j$ | price |
| $p$ | the candidate pivot bar | bar index, $p \ge L$ |
| $L$ | left bars (`left`) | bars, 1–50 (default 5) |
| $R$ | right bars (`right`) | bars, 1–50 (default 5) |

Bars with fewer than $L$ bars on their left are never pivots. The right side is only complete at bar $p + R$, so the
value is **stored there**, at the confirming bar $t = p + R$:

$$
\textcolor{#F23645}{\mathrm{PH}_t} =
\begin{cases}
H_{t-R} & t - R \text{ is a pivot high} \\
\text{empty} & \text{otherwise}
\end{cases}
\qquad
\textcolor{#089981}{\mathrm{PL}_t} =
\begin{cases}
L_{t-R} & t - R \text{ is a pivot low} \\
\text{empty} & \text{otherwise}
\end{cases}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#F23645}{\mathrm{PH}_t}$ | the `high` output at bar $t$: the price of the pivot high confirmed at $t$ (red circle above the bar) | price, mostly empty |
| $\textcolor{#089981}{\mathrm{PL}_t}$ | the `low` output: the price of the pivot low confirmed at $t$ (green circle below the bar) | price, mostly empty |
| $t$ | the confirming bar, $R$ bars after the pivot | bar index, $t \ge L + R$ |

In code both tests are rolling maxima: $H_p > \max(H_{p-L}, \dots, H_{p-1})$ and
$H_p > \max(H_{p+1}, \dots, H_{p+R})$, the second read at bar $t = p + R$ (lows: the same on $-L$).

## Kernel, lag and noise
Not a filter. A pivot is only **confirmed** $R$ bars after it, when its right side is complete: the value is stored
at bar $t = p + R$, so nothing uses future bars. The chart draws each marker $R$ bars to the left, on the pivot bar
itself (`display_shift` = $R$). The value at bar $t$ uses only bars $\le t$ (the replay test checks it), but the
drawing is placed in hindsight; see Why it works for what that means.

## Defaults
| Param | Default | Why |
|---|---|---|
| Left bars | 5 | Common swing definition (TradingView "Pivot Points High Low" uses 10/10) |
| Right bars | 5 | Same as the left side: a symmetric window of 11 bars |

## Warm-up
First possible value: bar $L + R$ (index 10 at 5/5), the confirmation of a pivot on bar $L$.

## Filter view
Not offered (not a moving average).

## How to read it
- **Swing structure:** in an uptrend each pivot low is above the previous one and each pivot high above the previous
  one (higher highs, higher lows); in a downtrend both step down. A close below the last pivot low in an uptrend breaks
  the pattern, and many traders treat that as the end of the trend (Dow theory in one sentence).
- **Support and resistance:** the last pivot high is where sellers won last time, the last pivot low where buyers
  did. Horizontal lines through them, or trend lines through two pivot lows, are the usual drawings. Whether price
  "respects" such a level is a statistical question (Why it works).
- **Left and right bars:** larger values give fewer, more significant pivots (a longer window has to be beaten) and a
  longer confirmation delay ($R$ bars). $L$ sets how far back the bar must dominate; $R$ alone sets the delay. A
  pivot 5/2 is confirmed after two bars, at the price of more false turns.
- **The latest dots:** the last $R$ bars of a chart can never carry a dot; the newest swing is always unconfirmed. In
  replay a dot appears $R$ bars behind the cursor, on the bar where it was confirmed in real time.
- **Trend vs range:** a range turns often, so it has more pivots per bar than a trend (measured below); in a strong
  trend the pivots against the trend are rare and small.

## Why it works
**How many pivots chance alone makes.** If the highs were independent draws, each of the $L + R + 1$ bars of a window
would be the highest with equal probability, so a fraction $\frac{1}{L+R+1}$ of the bars would be pivot highs. Prices
are not independent draws: they are close to a [random walk](glossary:random-walk). For a random walk with symmetric, continuous steps the
Sparre Andersen theorem gives the probability that a walk of $k$ steps stays below its starting point; the left and
right sides of the window are two independent such walks:

$$
P(\text{bar } p \text{ is a pivot high}) = u_L\,u_R,
\qquad u_k = \binom{2k}{k}\,4^{-k} \approx \frac{1}{\sqrt{\pi k}}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $u_k$ | probability that a $k$-step random walk stays strictly below its start | 0.375 at $k = 2$, 0.246 at 5, 0.176 at 10 |
| $\binom{2k}{k}$ | binomial coefficient | — |
| $L,\ R$ | left and right bars | bars |

So pivots thin out like $\frac{1}{\pi\sqrt{LR}}$, not like $\frac{1}{L+R+1}$: a walk wanders, so a bar is less often
the top of its window than a random draw would be. Measured on 200 000 `random_walk` bars (seed 1), pivot highs per
1000 bars:

| $L$ / $R$ | Measured `random_walk` | $1000\,u_L u_R$ | Independent draws $\frac{1000}{L+R+1}$ | `range` | `uptrend` |
|---|---|---|---|---|---|
| 2 / 2 | 137.0 | 140.6 | 200.0 | 142.6 | 133.7 |
| 5 / 5 | 58.8 | 60.6 | 90.9 | 65.4 | 56.4 |
| 10 / 10 | 30.5 | 31.0 | 47.6 | 36.4 | 28.1 |
| 5 / 2 | 91.6 | 92.3 | 125.0 | 95.0 | 98.3 |

The highs of real bars add a little wick noise to the walk, hence 58.8 instead of 60.6. A [mean-reverting](glossary:mean-reversion) `range` turns
more often, an `uptrend` less (and with 5 / 2 in an uptrend there are 98 pivot highs but only 77 pivot lows: the
short right side confirms tops quickly while the [drift](glossary:drift) erases the lows). At 5 / 5 a random walk makes a pivot high
about every 17 bars: a chart full of swing points is what noise looks like.

**Drawn in hindsight, stored without [lookahead](glossary:lookahead).** The dot is drawn on bar $p$ but known only at $p + R$. On the
pivot bar itself the next $R$ bars are lower by definition, so a "signal" read on the pivot bar has a huge, fake
[edge](glossary:edge). Measured on the same 200 000 `random_walk` bars (pivots 5 / 5, 11 760 pivot highs), the 10-bar log return
compared with the average bar:

| Reading the pivot high on | 10-bar edge | Share of 10-bar returns below zero |
|---|---|---|
| the pivot bar $p$ (lookahead) | −2.70 % | 72 % |
| the confirming bar $p + R$ (what a trader could do) | −0.03 % (standard error 0.04 %) | — |

The pivot low is the mirror image (+2.48 % on the pivot bar, −0.06 % on the confirming bar). The entire "edge" of
the pivot bar lives in the $R$ bars that confirm it. That is why the chart may draw the dot on $p$ (it shows what
happened) while every signal, lab and replay must use the confirming bar: in replay the dot only appears once the
cursor reaches $p + R$. A backtest that buys at pivot lows as drawn on the chart is reading the future (see
[Lookahead and replay](learn:lookahead-and-replay)).

**What follows a confirmed pivot.** On a random walk the future steps are independent of everything known at the
confirming bar, so the edge is zero. The event lab in What it measures measures it; with seed 1 (1000 bars, 10-bar
look-ahead), pivot high just confirmed:

| Scenario | Pivot high confirmed | Pivot low confirmed |
|---|---|---|
| `random_walk` | +0.52 % ([95 % interval](glossary:confidence-interval) −0.79 % to +1.83 %, n = 48) | −0.28 % (−1.92 % to +1.36 %, n = 47) |
| `range` | +0.67 % (−0.35 % to +1.70 %, n = 51) | −0.54 % (−1.83 % to +0.75 %, n = 49) |
| `uptrend` | +0.04 % (−0.99 % to +1.06 %, n = 49) | −0.46 % (−1.82 % to +0.91 %, n = 46) |
| `reversal` | +0.37 % (−1.00 % to +1.74 %, n = 42) | +0.20 % (−1.12 % to +1.51 %, n = 40) |

For seeds 1–5 every interval of the pivot-high rule contains zero on all four scenarios. The one lean is the pivot
low on `range`: −0.45 % to −1.28 % for seeds 1–5, the interval below zero for two of them. By confirmation the price
has climbed for $R$ bars off the low, which in a mean-reverting market is evidence that it now sits above the centre;
the reversion then pulls it back. The mirror rule (pivot high on `range`) does not show the mirror image (−0.57 % to
+0.67 %), so treat both as weak.

**Support from pivots, tested.** The labs cannot carry a pivot level forward, so this was measured in Python with the
indicator's own code: the first bar whose low reaches the last confirmed pivot low (a "test of support"), 200 000
bars, 10-bar edge. `random_walk` +0.02 % ([standard error](glossary:standard-error) 0.05 %; seed 2: −0.09 %), `uptrend` +0.02 % (seed 2:
−0.13 %): no reaction. On `range` +1.39 % (standard error 0.04 %), but the Ornstein–Uhlenbeck reversion from the
price's distance to the centre alone predicts +1.43 % at the same bars: the level adds nothing beyond "price is low in
its range". After a touch the next ten closes all stayed above the level only 22 %–30 % of the time. Levels matter
on real charts when many traders act on them (orders cluster at obvious highs and lows); the synthetic markets have
no traders, which is exactly what makes them the null hypothesis.

One rule on one sample: not a backtest (no costs, no position sizing), sensitive to [multiple testing](glossary:multiple-testing), and not
investment advice.

## Combine with
A pivot is a location, not a direction: it needs a trend filter to say which pivots to act on (the classic "buy the
higher low in an uptrend"). See [Previous Period High/Low/Close](learn:previous-hlc) for the other family of
reference levels, and [Gaps](learn:gaps) for the zones the market skipped. The lab can use the confirmation bar as a
rule (the output is above 0 only there):

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Close above SMA 200", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 200}}, "output": "ma"}},
  {"label": "Pivot low just confirmed", "left": {"indicator": {"id": "pivots", "params": {}}, "output": "low"},
   "op": "gt", "right": {"value": 0}},
  {"label": "Pivot high just confirmed", "left": {"indicator": {"id": "pivots", "params": {}}, "output": "high"},
   "op": "gt", "right": {"value": 0}}
 ]}
```

With seed 1 on `reversal`: Close above SMA 200 alone +1.48 % (−0.05 % to +3.01 %, n = 36); pivot low alone +0.20 %
(n = 40); filter AND pivot low +2.26 % (+0.50 % to +4.02 %, n = 16). It looks like the higher-low entry works, until
you swap the pivot low for the pivot high: filter AND pivot high gives +1.77 % (+0.04 % to +3.50 %, n = 18). Buying
swing tops "works" as well as buying swing lows, so the edge is the filter's (it selects the rising half of the
`reversal` path), and the pivot only thins the sample. For seeds 1–5 the filter AND pivot low ranges from +0.32 % to
+2.26 %, the interval above zero for two seeds. On `range` the same AND loses (−1.17 % to −2.48 %, seeds 1–5): there
the SMA 200 filter itself is negative (it selects prices above the centre). See
[Combining indicators](learn:combinations#three-roles-filter-trigger-confirmation) for the three roles, and why
stacking rules shrinks $n$ faster than it adds edge.

## Differences vs TradingView
- Strict comparison on both sides: two equal highs next to each other are not pivots (TradingView's tie handling
  may differ; to be checked by hand).
- Shown as circles on the pivot bar rather than price labels.
- TradingView's built-in "Pivot Points High Low" defaults to 10 / 10; here 5 / 5.

## Pitfalls
- In replay a pivot appears $R$ bars late (no lookahead), on the bar where it was confirmed in real time. On a
  finished chart every dot sits on its pivot bar, which a trader at that bar did not know: charts look more
  predictable in hindsight than they were.
- Never test a rule "at the pivot" with the drawn positions: the pivot bar carries a built-in edge of about −2.7 %
  (highs) over 10 bars on pure noise.
- A larger $R$ gives fewer, more significant pivots, and a longer confirmation delay.
- The newest $R$ bars never have a dot; the latest swing is always unconfirmed.
- Pivots are common on noise (one every 17 bars at 5 / 5 on a random walk): a level is not significant because a
  pivot made it.

## Exercise
1. In the event lab, set the look-ahead to 1 and count the dots on `random_walk`, `range` and `uptrend`. Compare with
   the table in Why it works (about 59, 65 and 56 per 1000 bars). Then set it back to 10 and press the new-sample
   button a few times on `random_walk`: how often does the interval exclude zero?
2. In the combo lab, switch off the pivot low and switch on the pivot high (keeping the SMA 200 filter). Why does the
   edge barely change? What would you need to show before you believed that the pivot itself adds something?
3. Start Replay on SPY at the start of 2022, near the top before that year's bear market, with pivots 5 / 5 and the
   SMA 200. Follow the steps.

```lab
{"kind": "replay", "symbol": "SPY", "date": "2022-01-03",
 "indicators": [{"id": "pivots", "params": {}}, {"id": "sma", "params": {"length": 200}}],
 "steps": [
  "Step forward one bar at a time and watch where the red and green dots appear: always five bars behind the cursor.",
  "Note the last pivot low before the decline. On which bar did the close first fall below it?",
  "Keep stepping: do the next pivot highs and lows step down (lower highs, lower lows)?",
  "Compare the bar where the structure broke with the bar where the close fell below the SMA 200."
 ],
 "reveal": "The structure break and the SMA 200 cross are both late by construction: the pivot needs five bars to be confirmed, the average lags about 100 bars. Look at how often an earlier lower low turned out to be noise, and count the false breaks as well as the true one."}
```
