# Guided exercises

Each family of indicators gets one or more guided [replays](glossary:replay) of a real, well-known episode: the chart
goes back to a past day, you step forward bar by bar with the indicators on, and you write down what you see before
you know what came next. Every exercise card has the steps and a hidden "What to look for". One episode is an
anecdote, not evidence: the statistics live in the labs of the indicator pages, and these exercises only train the
eye.

## How to use Replay
- **Start:** "Start in Replay" on a card switches the chart to the symbol and the interval, adds the card's
  indicators (unless the same ones are already on) and starts the replay at the last bar on or before the date.
  Without a card: the **Bar replay** button in the top toolbar, then click a bar, type a date or start at a random
  bar.
- **Step:** the **Next bar** button or `Shift+→`. **Play / Pause** runs the replay at 0.5, 1, 2, 5 or 10 bars per
  second (the speed menu next to it).
- **Jump:** type another date in the replay bar's date field (Enter or leave the field). The replay restarts at the
  last bar on or before it, earlier or later than the cursor; that is also how you go back.
- **Read values:** the legends show the values of the bar under the crosshair; the **Data window** tab of the right
  sidebar lists every output.
- **Exit:** the X at the end of the replay bar, or the top toolbar's button again. Switching the symbol also ends it,
  the interval is locked while it runs, and a reload returns to the present.
- **What replay shows:** the bars up to the cursor and the indicator values as they were then (the values at a bar
  never depend on later bars). [Pivots](learn:pivots) appear $R$ bars after their bar, [gaps](learn:gaps) after the
  cursor are not listed, and a gap filled later shows as open. Details in
  [Lookahead and replay](learn:lookahead-and-replay#replay).
- **Prices:** with **ADJ** on (the default) past prices are scaled by later dividends, so levels differ from what was
  quoted at the time and a cross can move by a day. Switch ADJ off when the level itself matters
  ([Adjusted prices](learn:adjusted-prices)).

How to work through a card: before each group of steps, write down what you expect; open "What to look for" only at
the end; then exit and look at the whole chart again, and notice how obvious the episode looks with
[hindsight](learn:lookahead-and-replay#common-lookahead-traps).

## Moving averages: a death cross after the crash
A [moving average](glossary:moving-average) lags by about half its window, $(n-1)/2$ bars for an SMA
([SMA](learn:sma#kernel-lag-and-noise), [Lag and noise](learn:lag-and-noise#lag-the-centre-of-mass)). A
[death cross](glossary:death-cross) of the SMA 50 under the SMA 200 needs the fast line to travel the whole distance
to the slow one, so after a sharp turn it comes late
([Moving Average Cross](learn:ma-cross#why-it-works)). Rehearse it first: on the `reversal` scenario the drift turns
from up to down at bar 150; move the slow length and watch the death cross move away from the turn.

```lab
{"kind": "param", "indicator": "ma_cross", "vary": "slow_length", "min": 20, "max": 120,
 "params": {"fast_length": 10}, "scenario": "reversal"}
```

```lab
{"kind": "replay", "symbol": "SPY", "date": "2020-02-19",
 "indicators": [{"id": "ma_cross", "params": {"fast_length": 50, "slow_length": 200}}],
 "steps": [
  "Start in Replay. The chart stops at the close of 19 February 2020. Note where the price sits relative to the SMA 50 and the SMA 200, and how far apart the two lines are.",
  "Step forward with Shift+Right. Note the date of the first close below the SMA 50 and of the first close below the SMA 200.",
  "Keep stepping (or Play at 2 bars per second) until the death-cross marker appears. Count the bars since the top, and note the date of the lowest close before the marker.",
  "Play on through the spring until the golden-cross marker appears. How many bars after the lowest close did it come?",
  "Exit and compare the close on the death-cross bar with the close on the golden-cross bar."
 ],
 "reveal": "The price closed below the SMA 50 three sessions after the top (24 February) and below the SMA 200 six sessions after it (27 February). With ADJ on, the death cross came on 31 March, 29 bars after the top and six bars after the lowest close of 23 March; the golden cross came on 6 July, 72 bars after that low (with ADJ off: 30 March and 9 July, because dividends inside the 200-bar window shift the older closes a little). Each marker arrived weeks after the turn it dates: the death cross sold within days of the low, and the golden cross bought back higher. The price against the lines reacted far earlier than the cross. This is one V-shaped episode; in a slow, grinding decline the same rule looks better, and the event lab on the Moving Average Cross page finds no interval that excludes zero for the marker alone."}
```

## Oscillators: a divergence that failed and one that held
A bullish [divergence](glossary:divergence) is a lower low in price with a higher low in the RSI; Wilder's failure
swing at a bottom is the RSI dropping below 30, bouncing to a peak, pulling back without a new RSI low, then closing
above that peak. Both describe the past window, and both appear on pure noise
([RSI](learn:rsi#why-it-works)). The MACD histogram is the MACD's smoothed slope, so its turn marks a trough of
momentum, not of price ([MACD](learn:macd#how-to-read-it)). The 2022 bear market in SPY has one of each kind.

```lab
{"kind": "replay", "symbol": "SPY", "date": "2022-05-06",
 "indicators": [{"id": "rsi", "params": {}}, {"id": "macd", "params": {}}],
 "steps": [
  "Start in Replay. Step to 12 May 2022 and note the low of the bar and the RSI on it.",
  "Step to 20 May: is the low lower than on 12 May? Is the RSI lower or higher than on 12 May?",
  "Play at 2 bars per second into late June. Did the price hold above the May lows?",
  "Type 2022-09-23 in the date field. Step to 18 October, noting the RSI at the closes of 30 September and 12 October, the RSI's highest value in early October, and the first close where the RSI rises above that value.",
  "Over the same bars, watch the MACD histogram: on which bar does it stop falling, on which does it cross above 0, and does it stay above 0?",
  "Exit and look at all of 2022 and early 2023."
 ],
 "reveal": "On 20 May the low was below the low of 12 May while the RSI was higher: a bullish divergence, and the price went on to lower lows in June. In the autumn the close of 12 October was below the close of 30 September with a higher RSI, and the RSI completed a bottom failure swing on 18 October: below 30 in late September, a peak on 4 October, a pullback that stayed above 30, then a close above the 4 October peak. The MACD histogram bottomed on 27 September, crossed above 0 on 5 October, slipped back below 0 on 11 and 12 October and turned positive again on 13 October: an early and noisy turn of momentum. With hindsight October 2022 was the low of that bear market, but the same pattern failed in May. Two signals, one worked; the RSI page shows how often divergences appear on a random walk, where they cannot carry an edge."}
```

## Bands and volatility: a squeeze and a crash
### A Bollinger squeeze that broke
A squeeze is a band width at a multi-month low: the last 20 closes were quiet. It forecasts that the bands will widen,
not in which direction the price will go ([Bollinger Bands](learn:bollinger-bands#why-it-works), where the
`volatility_regime` lab rehearses it). In 2015 the S&P 500 spent months in a narrow range before the August sell-off.

```lab
{"kind": "replay", "symbol": "SPY", "date": "2015-08-07", "indicators": [{"id": "bb", "params": {}}],
 "steps": [
  "Start in Replay. Compare the distance between the bands with July (scroll left).",
  "Step to 19 August 2015, watching the bands close in. Scroll left: were they this narrow at any other time in 2015?",
  "Step through 20, 21, 24 and 25 August: where do the closes land relative to the lower band, and what do the bands do?",
  "Type 2015-05-01 in the date field and step through May and June: the bands were about as narrow in early May and again in late June. What followed those squeezes?"
 ],
 "reveal": "The band width relative to the basis reached its 2015 low on 19 August, about level with 6 May. The close fell below the lower band on 20 August and stayed below it for four sessions, and within a week the bands were more than six times as far apart as at the squeeze. The May squeeze was followed by a quiet drift, the late-June one by a short drop below the lower band that recovered within weeks. Three squeezes in one summer, one crash: which squeeze breaks hard is only obvious afterwards."}
```

### ATR in a crash
The [ATR](learn:atr#how-to-read-it) is an RMA of the [true range](glossary:true-range): it rises when bars get bigger
in either direction and forgets a burst of [volatility](glossary:volatility) slowly. In price units it also shrinks
when the price falls, so compare ATR / close across a crash.

```lab
{"kind": "replay", "symbol": "SPY", "date": "2008-09-12", "indicators": [{"id": "atr", "params": {}}],
 "steps": [
  "Start in Replay. Note the ATR and the close, and compute ATR / close in percent.",
  "Step through 15 September 2008 (the Lehman Brothers bankruptcy) and the rest of September: how big are the bars compared with the ATR?",
  "Play at 2 bars per second through October and November. On which date does the ATR peak? Compute ATR / close there.",
  "Type 2009-03-31 in the date field: is ATR / close back at its September level?"
 ],
 "reveal": "The ATR more than doubled in price units and came close to four times its starting value as a share of price, because the price fell while the bars grew. It peaked in late October, after the largest bars of early and mid October, since an RMA 14 averages several weeks. In the first quarter of 2009 ATR / close was still well above its September level. A stop two September ATRs wide was smaller than single October bars. One crash: the lesson is the lag and the slow decay of the RMA, not the size of this particular spike."}
```

## Volume: OBV against price, VWAP within a day
### OBV and price
OBV adds the volume of up closes and subtracts that of down closes, so it mostly retells the price. A bearish
divergence is the price making new highs while OBV does not ([OBV](learn:obv#how-to-read-it)); the OBV page shows
that such rules have an edge only where volume carries direction, which on real data is not known in advance
([OBV](learn:obv#why-it-works)).

```lab
{"kind": "replay", "symbol": "SPY", "date": "2021-11-01", "indicators": [{"id": "obv", "params": {}}],
 "steps": [
  "Start in Replay. Step through November 2021 and note the dates of the highest close and of the highest OBV of the month.",
  "Step on through December into the first days of January 2022. Each time the close makes a new high, compare OBV with its November peak.",
  "Play at 2 bars per second through January 2022. What does the price do?"
 ],
 "reveal": "OBV peaked on 24 November 2021. The closing highs of 10 December, 27 and 29 December and 3 January 2022 all came with OBV below that peak: a bearish divergence in Granville's reading, just before the 2022 bear market. For the counterexample, replay TSLA from 1 November 2021: its top of 4 November came with OBV still rising, and OBV went on to new highs in 2022 while the price stayed below that top. Two charts are two anecdotes; count the divergences that were followed by nothing as well."}
```

### VWAP on hourly bars
The [VWAP](learn:vwap#how-to-read-it) is the average price paid since the session opened, reset every morning
([Bars and sessions](learn:bars-and-sessions#sessions)). On a trend day the price leaves it after the first hours and
stays on one side; on a range day it crosses back and forth. Hourly bars from Yahoo reach back about 730 days, so this
card works until about January 2027.

```lab
{"kind": "replay", "symbol": "NVDA", "date": "2025-01-24", "interval": "1h", "indicators": [{"id": "vwap", "params": {}}],
 "steps": [
  "Start in Replay. The cursor is on the last hourly bar of Friday 24 January 2025. Note how the VWAP starts again at each session's first bar.",
  "Step one bar: Monday 27 January opens far below Friday's close (the DeepSeek sell-off). Where is the close of that first bar relative to the VWAP?",
  "Step through the rest of the session: count the hourly closes above and below the VWAP.",
  "Step through Tuesday 28 January and count again.",
  "Step through 29 to 31 January: how often does the price cross the line?"
 ],
 "reveal": "On 27 January every hourly close was below the VWAP: a trend day down, on which the average buyer of the day was at a loss all day. On 28 January every hourly close was above it, and from 29 to 31 January the price crossed back and forth: range days. Being below the VWAP all day described that day; it did not forecast the next one, which went the other way."}
```

## Market structure: gaps, pivots and last week's high
### A gap that filled and one that did not
A full gap down leaves a zone between the previous bar's low and the gap bar's high; it is filled when a later high
reaches back to the top of the zone ([Gaps](learn:gaps#filling-a-gap)). Turn on **Gaps** in the toolbar's Structure
menu and set the minimum size in the Gaps tab ([Gaps in the app](learn:gaps#gaps-in-the-app)).

```lab
{"kind": "replay", "symbol": "META", "date": "2022-10-26",
 "steps": [
  "Turn on Gaps in the Structure menu and set the minimum size to 5 % in the Gaps tab.",
  "Start in Replay and step one bar: the earnings gap down of 27 October 2022 appears. Read its size and zone in the Gaps tab.",
  "Play at 5 bars per second, or type later dates to jump: when does the Gaps tab show the gap as filled, and how many bars did it stay open?",
  "Continue to 2 February 2023: a gap up appears after the next earnings. Before stepping on, decide whether you expect it to fill, then play on through 2023."
 ],
 "reveal": "The gap of 27 October 2022 was about 20 % deep and filled on 4 January 2023, 46 bars later: the price came back up through the whole zone. The gap up of 2 February 2023, about 17 %, had still not filled in November 2026, because the trend ran away from it. A gap in the direction of a strong trend is the case where a fill gets less likely with every bar; on a random walk every gap fills eventually, but eventually can be years."}
```

### Pivots confirm late
A pivot low is a bar lower than the $L$ bars before and the $R$ bars after it, so it is known only $R$ bars later
([Pivots](learn:pivots#how-to-read-it)). The chart draws it on the low itself; replay shows when it appeared. Rehearse
on a random walk: move the right bars and watch the dots thin out, each drawn $R$ bars before it became known. The
replay covers the same weeks of 2022 as the oscillator exercise above.

```lab
{"kind": "param", "indicator": "pivots", "vary": "right", "min": 1, "max": 20, "scenario": "random_walk"}
```

```lab
{"kind": "replay", "symbol": "SPY", "date": "2022-09-28", "indicators": [{"id": "pivots", "params": {}}],
 "steps": [
  "Start in Replay and step to 30 September 2022. Is there a pivot-low dot on that bar yet?",
  "Keep stepping. On which bar does the dot for 30 September appear?",
  "Treat that low as support. How many bars later does the price trade below it?",
  "Step on to the dot for the low of 13 October. On which bar does it appear, and where is the close on that bar compared with the low it marks?"
 ],
 "reveal": "The dot for the low of 30 September appeared on 7 October, five bars later. Two bars after that, on 11 October, the price traded below it: the freshly confirmed support broke within days, and the selling went on to a lower low on 13 October. The low of 13 October was confirmed on 20 October, when the close was already well above it. With hindsight that low was the bottom of the 2022 bear market; in real time the pivot said so only after the bounce, and the pivot before it had failed."}
```

### A breakout above last week's high
The [Previous Period High/Low/Close](learn:previous-hlc) lines show last week's high and low; a close above the
previous week's high is a common breakout rule, with an edge that depends on the regime
([Previous Period HLC](learn:previous-hlc#why-it-works)). The lines move to new levels every Monday, so an old level
disappears from the chart unless you draw it.

```lab
{"kind": "replay", "symbol": "SPY", "date": "2024-11-01", "indicators": [{"id": "prev_hlc", "params": {"period": "week"}}],
 "steps": [
  "Start in Replay and step to Monday 4 November 2024: the lines jump to the high and low of the week of 28 October. Note them.",
  "Step to 6 November, the day after the US election: where does the bar open and close relative to the previous week's high?",
  "Before stepping into Monday 11 November, draw a Horizontal line at the level of the previous-week high you just saw broken; on Monday the indicator moves to the new week's levels.",
  "Step through the week of 11 November: where does Monday's open sit relative to the new line, and where does Monday close? How close does the pullback into 15 November come to your horizontal line?",
  "Optionally play on to 18 December and note where the close lands relative to the previous week's low."
 ],
 "reveal": "On 6 November the bar opened above the previous week's high and closed above it, and the next two days held there. On Monday 11 November the open barely poked above the new line and the close fell back below it: a break that did not hold. The pullback of mid-November came back almost exactly to the level broken on 6 November and turned there, as if the old resistance had become support; and on 18 December the close fell well below the previous week's low. A few weekly breaks on one chart cannot tell you how often such breaks hold; the lab on the Previous Period HLC page measures that, and its edge changes sign with the market type."}
```

## What these exercises cannot show
Every episode here was chosen because something large happened, which is exactly why it is well known: famous charts
are a biased sample. Each card is one path through one market, without costs or position sizes, read with an
indicator whose settings were fixed in advance. To ask whether a reading carries an edge, use the event and combo labs
of the indicator pages and read [Overfitting and multiple testing](learn:combinations#overfitting-and-multiple-testing)
before trusting any rule you found by looking at charts. Nothing here is investment advice.
