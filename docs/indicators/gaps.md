# Gaps

A gap is a price range the market skipped: a bar that opens, or trades entirely, away from the previous bar. Stocks gap
when news arrives while the exchange is closed (earnings, guidance, a takeover, a macro shock); the next [session](glossary:session) opens
where the new information puts it, not where the last one closed. This page gives the app's exact definitions, what
"filling" a gap means, why some markets hardly gap at all, and how often gaps fill when nothing but chance is at work.

## What counts as a gap
A **full gap** leaves an empty zone between two bars: the ranges do not overlap at all.

$$
\text{gap up: } L_t > H_{t-1},\ \ \textcolor{#089981}{Z^{\uparrow}_t} = [H_{t-1},\ L_t]
\qquad
\text{gap down: } H_t < L_{t-1},\ \ \textcolor{#F23645}{Z^{\downarrow}_t} = [H_t,\ L_{t-1}]
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $t$ | the bar after the gap (the gap is listed on this bar) | bar index, $t \ge 1$ |
| $H_t,\ L_t$ | high and low of bar $t$ | price |
| $H_{t-1},\ L_{t-1}$ | high and low of the bar before | price |
| $\textcolor{#089981}{Z^{\uparrow}_t}$ | the zone of a gap up, from the old high (bottom) to the new low (top); drawn green while open | a price interval |
| $\textcolor{#F23645}{Z^{\downarrow}_t}$ | the zone of a gap down, from the new high (bottom) to the old low (top); drawn red while open | a price interval |

A **partial gap** (only with "Partial gaps" on, and only where there is no full gap) is a jump of the open while the
two ranges still overlap:

$$
\text{partial up: } O_t > C_{t-1}, \qquad \text{partial down: } O_t < C_{t-1}, \qquad
\text{zone between } C_{t-1} \text{ and } O_t
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $O_t$ | open of bar $t$ | price |
| $C_{t-1}$ | close of the previous bar | price |

Almost every bar opens a little away from the previous close, so partial gaps are everywhere; they only become
interesting with a size filter. The **size** of any gap is its zone's height relative to the previous close, and only
gaps of at least the minimum size are listed:

$$
s_t = 100\,\frac{\text{top}_t - \text{bottom}_t}{C_{t-1}} \ \ge\ s_{\min}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $s_t$ | gap size | % of the previous close |
| $\text{top}_t,\ \text{bottom}_t$ | upper and lower edge of the zone | price |
| $s_{\min}$ | minimum size (`min_pct`; the Gaps panel offers 0.5, 1, 2, 3 and 5 %) | %, default 1 |

The size is the **zone**, not the open-to-close jump: on the `shock` scenario the close-to-open jump is −15 %, but the
zone runs from the gap bar's high to the previous bar's low, both a wick away from the closes, so the listed size is
13.0 %–14.4 % (seeds 1–5).

The lab cannot call the gap finder, but on daily bars a full gap is a rule on prices: "low above the previous bar's
high" is exactly a full gap up (`ago: 1` reads the bar before). The dots mark the gaps; on `shock` one of them is the
−15 % bar half-way through.

```lab
{"kind": "combo", "scenario": "shock", "horizon": 10, "on": [0],
 "rules": [
  {"label": "Full gap down: high below the previous low", "left": {"price": "high"}, "op": "lt",
   "right": {"price": "low", "ago": 1}},
  {"label": "Full gap up: low above the previous high", "left": {"price": "low"}, "op": "gt",
   "right": {"price": "high", "ago": 1}},
  {"label": "Open above the previous high", "left": {"price": "open"}, "op": "gt",
   "right": {"price": "high", "ago": 1}}
 ]}
```

The synthetic daily bars open at $C_{t-1} e^{\eta_t \sigma / 4}$ (a quarter of a bar's [volatility](glossary:volatility)), so their full gaps
are small and rare: about 16 per 1000 bars, median size 0.14 %, and almost none of 1 % or more. Hourly bars (`1h`)
open each session with a gap four times wider, which gives about 1.8 full gaps of at least 1 % per 1000 bars on
`random_walk`. Real stocks gap by more, and on news.

## Filling a gap
A gap is **filled** when a later bar trades back across the whole zone, to the far edge:

$$
k^{*} =
\begin{cases}
\min\{k \ge k_0 : L_k \le \text{bottom}\} & \text{gap up} \\
\min\{k \ge k_0 : H_k \ge \text{top}\} & \text{gap down}
\end{cases}
\qquad
k_0 =
\begin{cases}
t + 1 & \text{full gap} \\
t & \text{partial gap}
\end{cases}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $k^{*}$ | the bar that filled the gap (`filled_time`); none while open | bar index, $> t$ for a full gap |
| $k_0$ | first bar that may fill it | bar index |
| $L_k,\ H_k$ | low and high of a later bar | price |

A full gap's own bar never reaches back into its zone (that is what makes it full), so it is filled at the earliest
on the next bar. A partial gap's bar overlaps the previous bar, so it can be filled on the very bar that made it.
While a gap is open the app keeps its **fill price**, the deepest penetration into the zone so far: for a gap up the
lowest low after $t$ if it is below the top (for a gap down the highest high above the bottom), nothing while no bar
has entered the zone, and the far edge once filled. Every field of a gap known at bar $k$ uses only bars $\le k$; the
replay test checks the gap finder like every indicator.

## Why stocks gap and indices rarely do
- **Stocks** trade in one session a day. Earnings, guidance and most company news come out before the open or after
  the close, so the price change happens between two bars: the gap is where the news is. The largest gaps of a stock
  are often on its earnings days.
- **Cash indices** such as `^GSPC` start the day near the previous close by construction: the first value is computed
  while many member stocks have not traded yet, so their old prices still count. The overnight move then shows up over
  the first minutes instead of as a gap. An ETF on the same index (SPY) trades as one security and gaps for real.
  Index charts therefore list few meaningful gaps.
- **Futures** (`CL=F`, `GC=F`, `SI=F`) trade almost around the clock; their session starts at 18:00 New York the
  evening before, so the daily bar has no long night to gap over. Gaps come mostly after weekends and holidays, and
  continuous futures add roll gaps when the front contract changes (see [Bars and sessions](learn:bars-and-sessions)).
- **Weekly and monthly bars** are resampled from the daily ones, and a week's bar overlaps the previous week's range
  far more often, so their gaps are rarer.
- **[Adjusted prices](glossary:adjusted-price):** splits are always adjusted (a 2-for-1 split would otherwise be a fake 50 % gap down). With ADJ
  off, an ex-dividend morning opens lower by about the dividend, a small gap that ADJ on removes (see
  [Adjusted prices](learn:adjusted-prices)).

## Gaps in the app
Turn on **Gaps** in the toolbar's Structure menu, or "Show on chart" in the **Gaps** tab of the right sidebar. The tab
holds the settings (minimum size 0.5, 1, 2, 3 or 5 %, default 1 %; partial gaps off by default) and lists the chart's
gaps newest first: direction and size, date, zone, and "Open" or the date it was filled, with a count of how many are
still open. A click scrolls the chart to the gap. On the chart each gap is a zone under the bars, from the gap bar to
the bar that filled it, or to the right edge while it is open; open zones are green (up) or red (down), filled ones
fade to grey. The gaps are found over the interval's whole history on the real bars (Heikin Ashi candles do not
change them), with the chart's ADJ setting.

In **replay** the app shows what was known at the cursor: gaps after the cursor are not listed, a gap filled after
the cursor shows as open, and the stored deepest fill is dropped (it may come from later bars).

The [Previous Period High/Low/Close](learn:previous-hlc) lines are the other half of the picture: the previous close is
the reference of the opening gap, and an open above the previous high is a gap-up open even when the bar later trades
back into yesterday's range. The [ATR](learn:atr#formula) counts gaps in every bar's [true range](glossary:true-range).

## How often gaps fill
"Gaps always get filled" is an old saying. On a [random walk](glossary:random-walk) it is true and means nothing: a driftless random walk
returns to every level eventually, so every gap fills, given enough time, without any force pulling it back. What
matters is how soon. For a driftless walk with bar volatility $\sigma$ the reflection principle gives the chance of
reaching a level $d$ away within $k$ bars, and with a [drift](glossary:drift) $\mu$ away from the level the chance of ever reaching it
is below one:

$$
P(\text{reached within } k \text{ bars}) \approx 2\,\Phi\!\left(-\frac{d}{\sigma\sqrt{k}}\right),
\qquad
P(\text{ever reached}) = e^{-2\mu d / \sigma^2}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $d$ | log distance from the current close to the level (for a gap up: to the zone's bottom) | 0.01 = about 1 % |
| $\sigma$ | [standard deviation](glossary:standard-deviation) of one bar's [log return](glossary:log-return) | 0.015 on `random_walk`, 0.012 on `uptrend` |
| $k$ | bars allowed | bars |
| $\Phi$ | standard normal distribution function | 0–1 |
| $\mu$ | drift per bar away from the level | 0.0015 on `uptrend` |

Measured in Python on 400 000 `random_walk` bars (seed 1): the chance that a level $d$ below the close is reached
within $k$ bars (the fill of a gap up whose bottom is $d$ away), with the reflection formula in brackets:

| $d$ | 5 bars | 20 bars | 100 bars |
|---|---|---|---|
| 2 % | 0.55 (0.55) | 0.77 (0.77) | 0.88 (0.89) |
| 5 % | 0.15 (0.15) | 0.46 (0.47) | 0.71 (0.74) |
| 10 % | 0.01 (0.00) | 0.14 (0.16) | 0.48 (0.53) |
| 15 % | 0.00 (0.00) | 0.03 (0.04) | 0.30 (0.35) |

The measured values fall a little short at long [horizons](glossary:horizon) because `random_walk` drifts up by 0.03 % a bar, away from
levels below. The rule of thumb is $d / \sigma\sqrt{k}$: a gap one bar-volatility deep is likely filled within days,
a gap ten volatilities deep (a −15 % earnings gap on a stock that moves 1.5 % a day) needs months, if it ever fills.

**Trend.** With a drift the two directions differ. On `uptrend` ($\mu = 0.15$ %, $\sigma = 1.2$ %) a level 5 %
**below** the price is reached within 100 bars only 35 % of the time, a level 5 % **above** it 94 %; the formula gives
$e^{-2 \cdot 0.0015 \cdot 0.05 / 0.012^2} = 0.35$ for ever reaching the lower one. In an uptrend gaps down fill, gaps
up are often left behind. On the synthetic gaps themselves (full gaps of any size, 400 000 bars, seed 1) the share
filled within 1, 5, 20 and 100 bars:

| Scenario | Gaps up | Gaps down |
|---|---|---|
| `random_walk` | 0.48, 0.74, 0.87, 0.93 | 0.48, 0.75, 0.89, 0.95 |
| `range` | 0.50, 0.79, 0.92, 0.99 | 0.48, 0.79, 0.92, 0.99 |
| `uptrend` | 0.44, 0.68, 0.79, 0.84 | 0.51, 0.82, 0.93, 0.99 |

These synthetic gaps are tiny (median 0.14 %), so most fill within days whatever the market; the long-run column
shows the drift at work, and the drift formula predicts the `uptrend` gaps up well (0.82 predicted from their
distances, 0.85 filled by the end of the path).

**Range.** In a [mean-reverting](glossary:mean-reversion) market the answer depends on where the gap points. With the price more than 3 % below
the centre of `range`, a level 5 % above it (towards the centre) was reached within 20 bars 81 % of the time, a level
5 % below it (away from the centre) 15 %, against 46 %–50 % either way on `random_walk`. A gap that pushes the price
away from fair value fills fast; one that pushes it back towards fair value may never fill. That is the honest version
of the saying: a gap fills when the move that made it was an overreaction, and nobody knows that at the open.

**The `shock` gap.** The −15 % jump leaves a zone 14.5 %–17.6 % above the gap bar's close (seeds 1–5, 1000 bars,
jump at bar 500). It was filled after 45, 90, 319 and 412 bars (seeds 3, 4, 5, 2); with seed 1 it was still open at
the end of the data, the highest high since having reached 86.56 against a top of 87.55. Two fills within 100 bars and
four within the 500 bars left, out of five: about what the table gives for a level 15 % away (0.30 within 100 bars,
0.57 within 500).

**What follows a gap.** With seed 1 the combo lab's full gap down on `shock` gives −0.63 % over 10 bars ([95 %
interval](glossary:confidence-interval) −4.33 % to +3.06 %, n = 12), a full gap up on `random_walk` +0.51 % (−3.63 % to +4.65 %, n = 10), and an
open above the previous high on `random_walk` +0.51 % (−0.89 % to +1.90 %, n = 48; every interval contains zero for
seeds 1–5, also on `range`). On synthetic data a gap is a random draw, so it predicts nothing; on real stocks a gap
carries news, which is a different and much harder question. One rule on one sample: not a [backtest](glossary:backtest), not investment
advice.

## Pitfalls
- A gap is listed on the bar **after** it ($t$), and a full gap cannot be filled on that bar.
- The size is the zone's height, smaller than the open-to-close jump; a 15 % move can be a 13 % gap.
- With partial gaps on and a low minimum size, almost every bar is a gap.
- Gaps depend on the interval: an hourly chart has a gap at most session opens, a weekly chart few.
- Index charts (`^GSPC`, `^NDX`) hardly gap by construction; use the ETF for the overnight move.
- Unadjusted prices (ADJ off) show ex-dividend gaps that are bookkeeping, not news.
- "Filled" says the price came back, not that it had to; on a random walk every gap fills eventually.
- On a finished chart you see which gaps filled; in real time you did not. Use replay to judge a gap without knowing
  its future (see [Lookahead and replay](learn:lookahead-and-replay)).

## Exercise
1. In the lab, switch between `shock`, `random_walk` and `range`, and between daily and hourly bars. How many full
   gaps does each give, and where do the dots cluster on hourly bars?
2. Use the table in How often gaps fill: a stock that moves about 2 % a day gaps down 10 % on earnings. What is $d /
   \sigma\sqrt{k}$ after 20 and after 100 days, and what does the reflection formula say about a fill if the stock
   then behaves like a random walk?
3. Replay META around its February 2022 earnings gap down, then NVDA around its May 2023 earnings gap up, with
   Gaps on (Structure menu, minimum size 5 %) and the previous week's levels.

```lab
{"kind": "replay", "symbol": "META", "date": "2022-02-02",
 "indicators": [{"id": "prev_hlc", "params": {"period": "week"}}],
 "steps": [
  "Turn on Gaps in the Structure menu and set the minimum size to 5 % in the Gaps tab.",
  "Step one bar: the gap down of 3 February 2022 appears. Read its size and zone in the Gaps tab.",
  "Keep stepping (or jump ahead in bigger steps): how far did the price go away from the zone before it came back, and how long did the zone stay open?"
 ],
 "reveal": "The zone lies far above the price: by the reflection rule of thumb a gap many daily volatilities deep needs months to fill, if it fills at all. Compare the time it actually stayed open with the table on this page, and remember that the replay only shows a fill once it has happened."}
```

```lab
{"kind": "replay", "symbol": "NVDA", "date": "2023-05-24",
 "indicators": [{"id": "prev_hlc", "params": {"period": "week"}}],
 "steps": [
  "With Gaps on, step one bar to 25 May 2023 and read the gap up in the Gaps tab.",
  "Step on: did the price come back down to the zone's bottom, or did it leave the gap behind?",
  "Compare with the META case: which way did the trend run after each gap?"
 ],
 "reveal": "A gap in the direction of a strong trend is the case the drift formula describes: the price moves away from the zone, and the chance of ever filling it shrinks with every bar of trend. Note the date it filled, if it did, from the Gaps tab once replay is over."}
```
