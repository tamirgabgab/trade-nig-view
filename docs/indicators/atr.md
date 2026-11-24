# Average True Range (`atr`)

Wilder's volatility measure: the average size of a bar, counting overnight gaps. People use it as a unit: for stop
distances ("two ATRs below the entry"), for position sizes that risk the same amount on a calm and a wild asset, and
to see whether the market is getting quieter or wilder. It says nothing about direction.

## What it measures
The question it answers: "how far does price typically travel in one bar, gaps included?" Each bar contributes its
true range (its high–low range, stretched to include the previous close if the bar gapped away from it); the ATR is
the smoothed average of the last few weeks of those ranges, in price units.

Move the length on the volatility regime: the ATR steps up about fourfold when the second, wilder half begins. A short
ATR jumps there within days and is noisy everywhere; a long one is smooth but needs weeks to catch up.

```lab
{"kind": "param", "indicator": "atr", "vary": "length", "min": 2, "max": 100, "scenario": "volatility_regime"}
```

## Formula
The true range of bar $t$:

$$
TR_t = \max\left(H_t - L_t,\ \lvert H_t - C_{t-1}\rvert,\ \lvert L_t - C_{t-1}\rvert\right), \qquad TR_0 = H_0 - L_0
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $TR_t$ | true range of bar $t$ | price, $\ge 0$ |
| $H_t,\ L_t$ | high and low of bar $t$ | price |
| $C_{t-1}$ | the previous bar's close | price |
| $TR_0$ | the first bar has no previous close: its plain range (Pine `ta.tr(true)`) | price |

Since $L_t \le H_t$, the three terms are the distances between the points $L_t$, $H_t$ and $C_{t-1}$, and the largest
one spans all three. The same definition in one line:

$$
TR_t = \max(H_t,\ C_{t-1}) - \min(L_t,\ C_{t-1})
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\max(H_t, C_{t-1})$ | the bar's high, or the previous close if the bar opened and stayed below it | price |
| $\min(L_t, C_{t-1})$ | the bar's low, or the previous close if the bar opened and stayed above it | price |

So the true range is the bar's range extended to the previous close. Without the gap terms a bar that gaps down 15 %
and then trades quietly would count as a quiet bar. On the `shock` scenario (a −15 % gap half-way) the gap bar's
high–low range is 1.3 to 3.8 price units for seeds 1–5, its true range 12 to 26, i.e. 6.0 to 8.3 times the ATR
before it.

The ATR is the chosen average of the true range, Wilder's RMA by default:

$$
\textcolor{#B71C1C}{\mathrm{ATR}_t} = \mathrm{MA}^{\text{type}}_n(TR)_t, \qquad
\mathrm{RMA}_n(y)_t = \mathrm{RMA}_n(y)_{t-1} + \frac{y_t - \mathrm{RMA}_n(y)_{t-1}}{n}, \qquad
\mathrm{RMA}_n(y)_{n-1} = \frac1n\sum_{i=0}^{n-1} y_i
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#B71C1C}{\mathrm{ATR}_t}$ | the average true range (the dark red line) | price |
| $\mathrm{MA}^{\text{type}}_n$ | the smoothing: RMA (default), SMA, EMA or WMA | — |
| $n$ | length | bars, 1–5000 (default 14) |
| $\mathrm{RMA}_n$ | Wilder's average (the `smma` indicator), step $\frac1n$, seeded with the SMA of the first $n$ values | same units as its input |

The RMA is the same smoothing that sits inside the RSI: an exponential average with $\alpha = 1/n$, i.e. an EMA of
length $2n - 1$ (27 for $n = 14$); see the [SMMA page](learn:smma). On the gap bar the ATR moves by
$(TR_t - \textcolor{#B71C1C}{\mathrm{ATR}_{t-1}})/n$: +36 % to +52 % at once on `shock` (seeds 1–5). Move the length
to see how long the gap keeps weighing on it:

```lab
{"kind": "param", "indicator": "atr", "vary": "length", "min": 2, "max": 50, "scenario": "shock"}
```

## Kernel, lag and noise
The average is a linear filter of the true range (RMA: lag $n - 1$, NRF $1/(2n-1)$), but the true range itself is a
nonlinear function of the bars, so the ATR as a whole is not a linear filter of the price. After a one-bar spike in
the true range, the excess decays like $(1 - \frac1n)^k$: about a third of it is left 14 bars later and an eighth
after 28.

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 14 | Wilder's and TradingView's default |
| Smoothing | RMA | TradingView default (Wilder) |

## Warm-up
First valid bar index: $n - 1$ (13) for RMA, SMA, EMA and WMA; the true range exists from bar 0.

## Filter view
The drawer's Filter view tab is not offered (a volatility measure, not a moving average of the price). The filter
that smooths the true range is the RMA, measured here on the real code (`smma`, length 14): lag 13 bars, NRF
$1/27$; its step response is the ATR's response to a lasting change in bar size.

```lab
{"kind": "filter", "indicator": "smma", "params": {"length": 14}}
```

## How to read it
- **Level:** the typical bar size in price units. ATR 2 on a 100 stock is 2 % a bar; ATR 2 on a 20 stock is 10 %.
  Divide by the close (ATR / close) to compare assets or one asset across a big price change.
- **Rising / falling:** volatility expanding or contracting. A rise says bars got bigger, in either direction:
  crashes and melt-ups both lift it.
- **Spikes:** one huge bar (a gap) lifts the RMA by $1/n$ of its excess and fades over weeks; the line keeps
  "remembering" the shock long after the market calmed down.
- **Trend vs range:** neither. The ATR is the same for a market that rises 1 % a day and one that alternates
  ±1 %. Pair it with a direction tool (Combine with).
- **Length:** a short ATR follows the current bars closely (good for intraday stops), a long one gives a stable unit
  for sizing. **Smoothing:** SMA forgets a spike exactly $n$ bars later, the RMA slowly; EMA and WMA react faster than
  the RMA of the same length.
- **Intraday bars:** the first bar of a session carries the overnight gap. On the synthetic hourly data (gaps four
  times wider at the open) the first bar's true range averages 2.02 $\sigma$ against 1.64 $\sigma$ for the others,
  and exceeds its high–low range on 27 % of sessions (13 % for the other bars).

## Why it works
**A bound.** The close $C_t$ lies in $[L_t, H_t]$, so by the one-line form $TR_t \ge \lvert C_t - C_{t-1}\rvert$ on
every bar. The RMA has only positive weights, hence exactly, on every bar after the warm-up:

$$
\textcolor{#B71C1C}{\mathrm{ATR}_t} \ \ge\ \mathrm{RMA}_n\bigl(\lvert \Delta C\rvert\bigr)_t
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\lvert\Delta C\rvert$ | absolute close-to-close change $\lvert C_t - C_{t-1}\rvert$ | price |
| $\mathrm{RMA}_n(\lvert\Delta C\rvert)$ | the RSI's denominator (RSI page) | price |

The ATR is the RSI's volatility scale plus everything that happens between the closes.

**ATR on a random walk.** Let the log price move by independent normal returns with standard deviation $\sigma_r$ per
bar. Then $\mathbb{E}\lvert\Delta C\rvert \approx \sigma_r C\sqrt{2/\pi}$, and the bar's high and low add the moves
within the bar. Because the average is linear, the expected ATR is the expected true range:

$$
\mathbb{E}\bigl[\textcolor{#B71C1C}{\mathrm{ATR}_t}\bigr] \approx c\,\sigma_r\,C_t, \qquad
\sqrt{2/\pi} = 0.80 \ \le\ c, \qquad c_{\text{Brownian bar}} = \sqrt{8/\pi} = 1.60
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\sigma_r$ | standard deviation of one bar's log return | 0.008–0.03 in the scenarios |
| $C_t$ | the price level | price |
| $c$ | true range per unit of volatility and price | about 1.6 for continuous trading |
| $\sqrt{8/\pi}$ | expected high–low range of Brownian motion over one bar (Feller), in $\sigma_r$ | 1.596 |

The lower bound holds when nothing happens between closes ($H$ and $L$ at the open and close); continuous trading
within the bar raises $c$ to about 1.6. The synthetic bars have an open gap of $\sigma_r/4$ and two wicks of mean
$\tfrac12\sqrt{2/\pi}\,\sigma_r$, so their high–low range averages
$\sigma_r\sqrt{2/\pi}\,\bigl(\sqrt{17/16} + 1\bigr) = 1.62\,\sigma_r$ of the price. Measured on 200 000
`random_walk` bars (seed 1): $\mathbb{E}\lvert r\rvert = 0.796\,\sigma_r$, high–low 1.618, true range 1.637 (above
the high–low range on 13 % of the bars), ATR 14 / close 1.633. So in this data
$\sigma_r \approx \mathrm{ATR}/(1.64\,C)$; on real data, measure your own $c$ (Exercise).

**A volatility unit for stops.** Put a stop $k$ ATRs below the close. On a random walk the chance that a low touches
it within $h$ bars follows from the reflection principle, because $k\,\mathrm{ATR} \approx k\,c\,\sigma_r C$:

$$
P\Bigl(\min_{t < s \le t+h} L_s < C_t - k\,\textcolor{#B71C1C}{\mathrm{ATR}_t}\Bigr) \approx 2\,\Phi\!\left(-\frac{c\,k}{\sqrt h}\right)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $k$ | stop distance in ATRs | 1–3 |
| $h$ | holding time | bars |
| $\Phi$ | standard normal distribution function | 0–1 |

| Stop hit within $h$ bars (`random_walk`, 200 000 bars) | $k = 1$ | $k = 2$ | $k = 3$ |
|---|---|---|---|
| $h = 10$, measured / formula ($c = 1.64$) | 60.4 % / 60.4 % | 28.8 % / 30.0 % | 10.7 % / 12.0 % |
| $h = 20$, measured / formula | 70.8 % / 71.4 % | 44.3 % / 46.3 % | 24.5 % / 27.1 % |

The probability depends on $k$ and $h$ only, not on the asset or its price: a 2-ATR stop is hit with the same
probability on a calm utility and on a wild growth stock, which a fixed 5 % stop is not. Even with no edge at all,
a 2-ATR stop is hit within 10 bars almost a third of the time.

**A volatility unit for size.** Risk $R$ (money) per trade with a stop $k$ ATRs away; buy $q$ shares:

$$
q = \frac{R}{k\,\textcolor{#B71C1C}{\mathrm{ATR}_t}}, \qquad
\operatorname{sd}\bigl(q\,\Delta C\bigr) \approx q\,\sigma_r C_t = \frac{R}{c\,k}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $R$ | the money lost if the stop is hit | currency |
| $q$ | position size | shares |
| $\operatorname{sd}(q\,\Delta C)$ | the position's typical one-bar profit or loss | currency |

The position's daily swing is the same fraction of $R$ for every asset: ATR sizing is volatility parity.

**Response time.** The expected ATR is the RMA of the expected true range, so a lasting step in volatility appears
with the RMA's step response, $1 - (1 - \frac1n)^{j+1}$ of the way after $j$ bars. On `volatility_regime` the true
volatility jumps 3.75-fold half-way (seeds 1–5: ATR / close is 1.25 %–1.34 % in the calm half and 4.80 %–5.05 % in
the wild one, ratios 3.63–4.04). Averaged over 400 samples, measured bars after the jump until the line has covered
50 % and 90 % of it:

| Smoothing (length 14 unless stated) | 50 % | 90 % |
|---|---|---|
| RMA (default) | 9 | 31 |
| RMA 28 | 18 | more than 60 (formula: 63) |
| RMA 7 | 4 | 14 |
| SMA | 6 | 12 |
| EMA | 4 | 15 |
| WMA | 4 | 9 |
| Bollinger band width (20, for comparison) | 6 | 15 |

For the RMA 14 the formula gives exactly 9 and 31. The default ATR needs about six weeks of daily bars to show a new
regime in full: a stop set at 2 ATRs on the first wild days is far too tight.

**Volatility is not direction.** An event study on the ATR measures the mean return after a high reading, and there is
no reason for it to differ from any bar's. What changes is the spread of what follows:

```lab
{"kind": "event", "indicator": "atr", "output": "atr", "op": "gt", "value": 2, "range": [0.5, 8],
 "horizon": 10, "scenario": "volatility_regime"}
```

With seed 1, ATR 14 above 2: −1.24 % (95 % interval −6.03 % to +3.55 %, n = 23). For seeds 1–5 every counted signal
falls in the wild half, every interval contains zero, and the standard deviation of the 10-bar returns after the
signal is 7.1 %–11.7 % against 6.3 %–7.6 % after any bar: the histogram is wider, the mean is not shifted.

**A fixed threshold is not portable.** The ATR is in price units, $\approx c\,\sigma_r C$: it scales with the price
level as much as with volatility. On `random_walk` the volatility never changes, yet ATR 14 above 3 fires 0 times in
1000 bars for seed 1 (price between 50 and 104) and 64 times for seed 3 (price between 88 and 255). A threshold
tuned on one symbol means something else on another, and on the same symbol after it doubles. Portable forms compare
like with like: ATR / close, or the ATR with its own past ("ATR above its value 20 bars ago", Combine with).

One rule on one sample: not a backtest (no costs, no position sizing), sensitive to multiple testing, and not
investment advice.

## Combine with
The ATR is the "how much" next to a "which way": a direction rule (a trend filter, a band or RSI stretch) decides the
trade, the ATR sizes it and places the stop. As a rule in its own right it can only split signals by volatility
state. Does that split change the direction edge? Here the Bollinger fade on `range` is split by whether the ATR is
rising or falling over 20 bars (switch rule 2 off and rule 3 on to compare):

```lab
{"kind": "combo", "scenario": "range", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Close crosses below the Bollinger lower band", "left": {"price": "close"}, "op": "crosses_below",
   "right": {"indicator": {"id": "bb", "params": {}}, "output": "lower"}},
  {"label": "ATR 14 above its value 20 bars ago", "left": {"indicator": {"id": "atr", "params": {}}, "output": "atr"},
   "op": "gt", "right": {"indicator": {"id": "atr", "params": {}}, "output": "atr", "ago": 20}},
  {"label": "ATR 14 below its value 20 bars ago", "left": {"indicator": {"id": "atr", "params": {}}, "output": "atr"},
   "op": "lt", "right": {"indicator": {"id": "atr", "params": {}}, "output": "atr", "ago": 20}}
 ]}
```

With seed 1: the band cross alone +1.87 % (+0.20 % to +3.54 %, n = 16); with a rising ATR +1.49 % (−0.79 % to
+3.78 %, n = 10); with a falling ATR +2.73 % (+0.11 % to +5.35 %, n = 6). For seeds 1–5 both halves stay positive
(rising +1.29 % to +3.15 %, falling +2.03 % to +3.43 %); the falling half is higher on four of the five, but with
6 to 16 episodes and overlapping intervals that is not evidence. "ATR rising" alone has no edge on `range`,
`random_walk` or `volatility_regime` (seeds 1–5, every interval containing zero; on `reversal` one seed of five
clears zero). That is the expected null: in these scenarios volatility and direction are independent, so a volatility
filter can only thin the signals. Its value is in the size and the stop, not in the entry.

The [Bollinger Bands](learn:bollinger-bands) measure volatility too, as the spread of closes around their mean
(no gaps, no intrabar moves) and react faster to a new regime (table above); the bands mark *where* price is, the ATR
*how far* it moves per bar.

## Differences vs TradingView
- Same as TradingView's built-in (`ta.tr(true)`: $TR_0 = H_0 - L_0$; smoothing RMA, SMA, EMA or WMA).
- TA-Lib's `ATR` skips bar 0 (no previous close) and starts one bar later with a different seed; the two converge
  after a few hundred bars.

## Pitfalls
- In price units: not comparable across symbols or across a big price change (use ATR / close for a percentage).
  A fixed ATR threshold carried from one symbol to another tests the price level, not the volatility.
- The RMA seed fades slowly ($e^{-k/n}$); the compute endpoint loads $25n$ extra bars so shown values do not depend
  on where the history starts.
- One gap lifts the RMA for weeks: a third of the jump is still there 14 bars later. Stops sized on that ATR are wide
  for a while after the market calmed down.
- Slow to show a new regime: the default needs 31 bars for 90 % of a volatility jump.
- High ATR is not bearish and low ATR is not bullish; the ATR has no direction.
- On adjusted daily data the history is rescaled by splits and dividends, and so is the ATR in price units; ATR / close
  is hardly affected.

## Exercise
1. In the length lab on `volatility_regime`, set the length to 5, 14 and 50 and count the bars it takes the line to
   level off after the jump. Compare with the response table. Then switch the data picker to hourly bars (`1h`) and
   the scenario to `random_walk`: can you see the first bar of each session lifting the true range?
2. In the event lab, keep `volatility_regime` and move the threshold from 1 to 6. Watch $n$, the edge and the width of
   the "after the signal" histogram. Then set the scenario to `random_walk` and press the new-sample button: why does
   $n$ for "ATR above 3" jump between 0 and dozens on a series whose volatility never changes?
3. Start Replay on SPY on 19 February 2020, the record close before the COVID crash, with ATR 14. Step through the
   following weeks: how many bars did the ATR take to reach its peak? Note the close minus 2 ATR on 19 February: on
   which bar did a low first fall below it? Compare the ATR / close at the start and at the peak with
   the 3.75-fold jump of the synthetic regime.

```lab
{"kind": "replay", "symbol": "SPY", "date": "2020-02-19", "indicators": [{"id": "atr", "params": {}}]}
```
