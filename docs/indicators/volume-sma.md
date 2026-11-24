# Volume SMA (`vol_sma`)

The simple moving average of volume, drawn on the volume histogram's scale so you can see which bars trade more than
usual. People use it to spot unusual activity: a bar with twice the typical volume, a breakout "on volume", a quiet
drift.

## What it measures
The question it answers: "how much does a typical bar of the last $n$ trade, and is this bar more or less than that?"
The line is the typical volume; the ratio of a bar's volume to the line, the *relative volume*, says how unusual the
bar is. It measures activity only. Nothing in it knows whether the bar went up or down.

Move the length on the `volatility_regime` scenario: the moves become almost four times larger half-way (bar 150 of
the 300), and because volume grows with the size of the move, the average volume rises by about half (1.52 times on
200 000 bars; 1.42 on this 300-bar sample). A short average catches the new level within a few bars but jumps with
every spike; a long one is calm and needs $n$ bars to get there.

```lab
{"kind": "param", "indicator": "vol_sma", "vary": "length", "min": 2, "max": 100, "scenario": "volatility_regime"}
```

## Formula

$$
\textcolor{#2196F3}{y_t} = \frac1n\sum_{k=0}^{n-1} V_{t-k},
\qquad
\mathrm{RV}_t = \frac{V_t}{\textcolor{#2196F3}{y_t}}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#2196F3}{y_t}$ | the Volume SMA at bar $t$ (the blue line on the volume scale) | shares |
| $V_t$ | volume of bar $t$ | shares, $\ge 0$ |
| $n$ | length | bars, 1–5000 (default 20) |
| $\mathrm{RV}_t$ | relative volume: this bar's volume over the line (not a ChartLab output; read it off the chart) | 0 to $n$, median about 0.94 |

The average includes the bar itself, which damps the ratio. With $x_t$ the bar's volume over the mean of the $n - 1$
bars before it:

$$
\mathrm{RV}_t = \frac{n\,x_t}{x_t + n - 1},
\qquad
x_t = \frac{V_t}{\frac{1}{n-1}\sum_{k=1}^{n-1} V_{t-k}},
\qquad
\mathrm{RV}_t = 2 \iff x_t = \frac{2(n-1)}{n-2}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $x_t$ | the bar's volume over the average of the previous $n - 1$ bars | $\ge 0$ |
| $\frac{2(n-1)}{n-2}$ | what "twice the line" means against the earlier bars | 2.11 at $n = 20$ |

So $\mathrm{RV}$ can never exceed $n$, and a bar "at twice the line" (length 20) traded 2.11 times the average of the
19 bars before it.

## Kernel, lag and noise
An SMA of the volume: flat kernel $h_k = 1/n$ for $k < n$, lag $(n-1)/2$ (9.5 bars at 20), NRF $1/n$. After a jump
in the volume level the line ramps linearly and reaches the new level after $n$ bars (the step response of a flat
box). Volume is roughly lognormal, so a few spikes pull the mean up: the typical bar sits below its own average
(median relative volume 0.94 on the synthetic `random_walk`, 0.94 on SPY and 0.92 on AAPL daily bars, 2007–2026;
Why it works shows where 0.94 comes from).

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 20 | TradingView's "Volume" indicator MA length |

## Warm-up
First valid bar index: $n - 1$ (19).

## Filter view
Not offered here (the same response as SMA; see the [SMA page](learn:sma#filter-view)).

## How to read it
- **Bar above / below the line:** above-average or below-average activity. Most bars sit a little below the line
  (median 0.94); that is the skew of volume, not a quiet market.
- **Unusual volume:** a bar at twice the line or more. On the synthetic random walk that is about 1.6 % of the bars,
  on SPY's daily bars 1.9 %: roughly one day a month. It marks a bar that moved a lot or a day with news (an
  earnings report, an index rebalance, an options expiry).
- **Rising line:** activity is building, usually because the moves are getting bigger (volume and volatility rise
  together, see Why it works). A falling line: the market is calming down.
- **Direction:** none. A heavy bar can be a rally or a sell-off; read the direction from the price, or from
  [OBV](learn:obv), which signs each bar's volume.
- **Length:** a short line follows each burst (lag $(n-1)/2$ bars) and makes fewer bars look unusual; a long one is a
  steadier baseline but takes $n$ bars to accept a new normal.
- **Hourly bars:** the line ripples with the time of day, and the open and close bars look unusual every day. See
  Hourly bars and the intraday profile.

## Why it works
**How often is volume unusual?** With $k_t = 0$ (every synthetic scenario except `accumulation`) the synthetic
volume is $V_t = 10^6 e^{0.3\xi_t + 20\lvert r_t\rvert}$, so its logarithm is a sum of a normal term and a
folded normal term:

$$
\ln V_t = \ln 10^6 + 0.3\,\xi_t + 20\,\lvert r_t\rvert,
\qquad
s^2 = \operatorname{Var}(\ln V_t) = 0.3^2 + 400\,\sigma^2\left(1 - \tfrac{2}{\pi}\right)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\xi_t$ | independent standard normal noise | — |
| $r_t$ | the bar's log return $\ln(C_t / C_{t-1})$, standard deviation $\sigma$ | about $\pm 0.015$ |
| $20\lvert r_t\rvert$ | bigger moves trade more: $e^{20\lvert r\rvert}$ is 1.22 times at a 1 % move, 1.49 at 2 %, 2.72 at 5 % | — |
| $s$ | standard deviation of $\ln V$ | 0.350 on `random_walk` ($\sigma = 0.015$) |
| $1 - \frac{2}{\pi}$ | variance of $\lvert Z\rvert$ for a standard normal $Z$ | 0.363 |

Treating $V$ as lognormal with this $s$ (the folded term is small), the share of bars above twice the mean and the
median relative to the mean are

$$
P\bigl(V_t > 2\,\mathbb E[V]\bigr) \approx 1 - \Phi\!\left(\frac{s^2/2 + \ln 2}{s}\right),
\qquad
\frac{\operatorname{median}(V)}{\mathbb E[V]} = e^{-s^2/2}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\Phi$ | standard normal distribution function | 0–1 |
| $\mathbb E[V]$ | mean volume, which the SMA estimates | shares |

At $s = 0.350$: 1.55 % and 0.94. Measured on 200 000 `random_walk` bars (seed 1): $s = 0.350$, volume above twice its
SMA 20 on 1.58 % of the bars, median relative volume 0.94. On 1000 bars, seeds 1–5:

| Scenario | Bars with volume above twice its SMA 20 |
|---|---|
| `random_walk` | 1.1 %–1.9 % |
| `uptrend` | 0.9 %–1.4 % |
| `range` | 1.5 %–2.2 % |
| `reversal` | 0.9 %–1.5 % |
| `shock` | 1.2 %–2.0 % |
| `volatility_regime` | 2.7 %–3.8 % (the switch, and the wider moves after it) |
| `accumulation` | 6.8 %–8.3 % (the $e^{\pm 0.8}$ up/down skew widens $\ln V$) |

Real daily volume behaves much the same: SPY 1.87 % of 5004 days (January 2007 to November 2026), AAPL 2.19 %; the
standard deviation of $\ln \mathrm{RV}$ is 0.32 for both, close to the model's 0.35.

**Volume grows with the size of the move.** In the model $\mathbb E[V \mid r] \propto e^{20\lvert r\rvert}$ by
construction; real stocks show the same shape, more weakly. Relative volume (SMA 20) by the size of the bar's move:

| Bar's move $\lvert r\rvert$ (synthetic `random_walk`, 200 000 bars) | Mean RV | Share above 2 |
|---|---|---|
| below 0.5 % | 0.82 | 0.1 % |
| 0.5 %–1 % | 0.90 | 0.2 % |
| 1 %–2 % | 1.04 | 0.9 % |
| 2 %–3 % | 1.24 | 3.9 % |
| 3 %–5 % | 1.53 | 14.5 % |
| above 5 % | 2.10 | 50.5 % |

| Bar's move, as a quantile of its own history (2007–2026) | SPY median RV | SPY share above 2 | AAPL median RV | AAPL share above 2 |
|---|---|---|---|---|
| quieter half | 0.87 | 0.6 % | 0.84 | 0.7 % |
| 50th–90th percentile | 1.00 | 1.4 % | 0.98 | 1.7 % |
| 90th–99th percentile | 1.17 | 8.9 % | 1.21 | 9.8 % |
| largest 1 % | 1.35 | 18.0 % | 1.47 | 28.0 % |

The correlation of $\ln \mathrm{RV}$ with $\lvert r\rvert$ is 0.32 for SPY, 0.42 for AAPL and 0.52 in the model.
Unusual volume mostly means an unusual move, which is why the Volume SMA rises in volatile periods and why
"unusual volume" days cluster with large candles.

**No direction by itself.** In the model the volume depends on $\lvert r_t\rvert$ and independent noise only, so
knowing $V_t$ says nothing about the sign of $r_t$, let alone of $r_{t+1}$: on the 200 000 bars, 50.5 % of the
bars above twice the line closed up, against 50.7 % of all bars. Real index data has a same-bar tilt: of SPY's 93
days above twice the line, only 24 % closed up (55 % of all days did), AAPL 43 % (53 %). Heavy days in an index are
more often selling days. That is the direction of the heavy bar itself, which the close already shows. What came
next is another matter: over the following 10 days SPY averaged −0.81 % after those days against +0.40 % after any
day, AAPL +0.70 % against +0.99 % (overlapping windows, so no test). The lab checks whether "volume above its
average", alone or with the bar's direction, says anything about the next 10 bars. *Volume above its average* is
written as the Volume SMA of length 1 (the volume itself) above the Volume SMA 20:

```lab
{"kind": "combo", "scenario": "random_walk", "horizon": 10, "on": [0],
 "rules": [
  {"label": "Volume above its 20-bar average",
   "left": {"indicator": {"id": "vol_sma", "params": {"length": 1}}, "output": "ma"}, "op": "gt",
   "right": {"indicator": {"id": "vol_sma", "params": {"length": 20}}, "output": "ma"}},
  {"label": "Up bar (close above previous close)", "left": {"price": "close"}, "op": "gt",
   "right": {"price": "close", "ago": 1}},
  {"label": "Down bar (close below previous close)", "left": {"price": "close"}, "op": "lt",
   "right": {"price": "close", "ago": 1}}
 ]}
```

With seed 1 on `random_walk`: volume above its average −0.15 % (−1.27 % to +0.96 %, n = 79); with an up bar −0.67 %
(−1.87 % to +0.53 %, n = 66); with a down bar −0.26 % (−1.52 % to +0.99 %, n = 68). Over all seven scenarios and
seeds 1–5, all 35 intervals of the volume rule alone contain zero. On `accumulation`, where up bars do trade more in
the accumulation phases, "heavy and up" gives +0.07 % to +0.85 % and "heavy and down" −0.87 % to +0.06 % (seeds 1–5):
a tilt in the expected direction, but no interval excludes zero. One bar's vote is weak; OBV adds up twenty of them,
and there the same effect becomes visible (see the [OBV page](learn:obv#why-it-works)).

One rule on one sample: not a backtest (no costs, no position sizing), sensitive to multiple testing, and not
investment advice.

## Hourly bars and the intraday profile
On hourly bars volume follows the time of day: heavy at the open, light at midday, heavy again into the close. The
synthetic hourly data uses the profile $p = (1.8, 1.1, 0.8, 0.7, 0.8, 1.0, 1.6)$ for the seven bars of a session
(New York 09:30 to 15:30); SPY's hourly bars (January 2024 to November 2026, 5000 bars) measure
$(1.57, 0.96, 0.75, 0.68, 0.76, 0.92, 1.35)$ times the overall mean, against the model's
$(1.62, 0.99, 0.72, 0.63, 0.72, 0.90, 1.44)$. Two consequences for a 20-bar average.

**The line ripples.** Twenty bars are two sessions and six bars, so one hour of the day is always missing from the
window, and which one changes every bar:

$$
\textcolor{#2196F3}{y_t} \propto \frac{3\sum_{j=0}^{6} p_j - p_{j^*(t)}}{20},
\qquad
\frac{\max \textcolor{#2196F3}{y}}{\min \textcolor{#2196F3}{y}} = \frac{23.4 - 0.7}{23.4 - 1.8} = 1.051,
\qquad
\lvert H(f)\rvert = \left\lvert\frac{\sin(\pi f n)}{n\,\sin(\pi f)}\right\rvert
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $p_j$ | the volume factor of hour $j$ of the session | 0.7–1.8, sum 7.8 |
| $j^*(t)$ | the hour missing from the 20-bar window at bar $t$ | 0–6 |
| $\lvert H(f)\rvert$ | the SMA's magnitude response at frequency $f$ (cycles per bar) | 0–1 |
| $f$ | the daily cycle is $f = 1/7$ | cycles per bar |

So SMA 20 swings by about 5 % within each day for no reason but the clock: measured, its mean change from bar to
bar is +3.2 %, +1.3 %, +0.5 %, −0.5 %, −0.9 %, −2.7 %, −0.9 % through the seven hours (140 000 synthetic bars),
+3.2 %, +1.0 %, +0.2 %, −0.5 %, −0.8 %, −2.3 %, −0.7 % on SPY. The SMA's response has nulls at $f = m/n$, so a length
that is a multiple of 7 (7, 14, 21) cancels the daily cycle exactly: SMA 21 measures 0.0 % in every hour (SPY within
±0.2 %). Try it: the widget starts on hourly bars; compare lengths 20 and 21.

```lab
{"kind": "param", "indicator": "vol_sma", "vary": "length", "min": 2, "max": 50, "scenario": "random_walk",
 "interval": "1h"}
```

**The ratio is biased by the hour.** Even a ripple-free SMA 21 is the average of all hours, so the open bar's
relative volume is about $p_0 / \bar p = 1.8 / 1.114 = 1.62$ and the midday bar's $0.7 / 1.114 = 0.63$ before
anything unusual happens (measured 1.61 and 0.63). "Twice the line" then flags the open and the close every week
and midday almost never. Share of bars above twice the average, by hour of the session:

| Baseline | 09:30 | 10:30 | 11:30 | 12:30 | 13:30 | 14:30 | 15:30 | All |
|---|---|---|---|---|---|---|---|---|
| SMA 20, synthetic | 20.0 % | 1.3 % | 0.1 % | 0.1 % | 0.2 % | 0.9 % | 14.1 % | 5.2 % |
| Same hour, previous 10 sessions, synthetic | 2.4 % | 2.5 % | 2.3 % | 2.4 % | 2.5 % | 2.5 % | 2.6 % | 2.5 % |
| SMA 20, SPY | 16.2 % | 2.4 % | 0.6 % | 0.0 % | 1.0 % | 2.4 % | 11.4 % | 4.9 % |
| Same hour, previous 10 sessions, SPY | 3.5 % | 4.4 % | 4.2 % | 4.1 % | 3.8 % | 5.3 % | 3.6 % | 4.1 % |

The fair comparison is a bar with the same hour on previous days:

$$
\mathrm{RV}^{\text{same hour}}_t = \frac{V_t}{\frac1m\sum_{j=1}^{m} V_{t - 7j}}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $V_{t-7j}$ | the volume of the same hour $j$ sessions earlier (seven hourly bars per session) | shares |
| $m$ | how many previous sessions the baseline averages | sessions, e.g. 10 |

It removes the profile: every hour is flagged about equally often. ChartLab does not have this "relative volume at
time" yet; until it does, read the Volume SMA on hourly bars with a length that is a multiple of 7, and judge the
open and the close against their own usual size, not against the line.

## Combine with
The textbook pairing is "a breakout on volume": a price signal, confirmed by above-average volume. Since volume
carries no direction, the confirmation can only tell big signal bars from small ones. Switch between rules 2 and 3:

```lab
{"kind": "combo", "scenario": "random_walk", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Close crosses above SMA 50", "left": {"price": "close"}, "op": "crosses_above",
   "right": {"indicator": {"id": "sma", "params": {"length": 50}}, "output": "ma"}},
  {"label": "Volume above its 20-bar average",
   "left": {"indicator": {"id": "vol_sma", "params": {"length": 1}}, "output": "ma"}, "op": "gt",
   "right": {"indicator": {"id": "vol_sma", "params": {"length": 20}}, "output": "ma"}},
  {"label": "Volume below its 20-bar average",
   "left": {"indicator": {"id": "vol_sma", "params": {"length": 1}}, "output": "ma"}, "op": "lt",
   "right": {"indicator": {"id": "vol_sma", "params": {"length": 20}}, "output": "ma"}}
 ]}
```

With seed 1 on `random_walk`: the cross alone +0.01 % (−1.81 % to +1.82 %, n = 20); "on volume" −1.90 % (−3.23 % to
−0.57 %, n = 11); on light volume +1.71 % (−0.57 % to +4.00 %, n = 17). The "confirmed" cross even loses with an
interval below zero, which on a random walk can only be chance: seeds 2–5 give −0.96 %, +2.07 %, +1.81 % and −1.12 %,
every interval containing zero. Over `random_walk`, `uptrend`, `range`, `reversal` and `accumulation` with seeds 1–5,
the volume-confirmed cross clears zero 3 times in 25, always downwards, never upwards. Volume confirmation adds no
edge in these markets; it only cuts the number of signals.

Better partners: [OBV](learn:obv) for the direction of the volume, a trend filter such as the
[SMA](learn:sma) for the direction of the price, and a volatility measure such as ATR, which tracks the same
"activity" from the price side (volume and the size of the moves rise together). See
[Combining indicators](learn:combinations) for why every extra rule costs episodes. Not a backtest, not advice.

## Differences vs TradingView
- Same as the moving average inside TradingView's "Volume" indicator (SMA, length 20).
- TradingView also has a separate built-in, Relative Volume at Time, that compares a bar with the same time of
  earlier sessions; ChartLab has no equivalent yet (see Hourly bars and the intraday profile).

## Pitfalls
- Symbols without volume (forex, some indices) give 0.
- The last bar of a live session is still forming: its volume (and the average) grows during the session, so the
  forming bar always looks quieter than it will end.
- On hourly bars a length that is not a multiple of the bars per session ripples with the time of day, and the open
  and close bars look unusual every day.
- The average includes the bar itself: at length 20, "twice the line" is 2.11 times the previous 19 bars, and the
  ratio can never exceed $n$.
- Volume is skewed: most bars sit below their average, and a handful of spikes (earnings, index rebalances, options
  expiries) move the line for $n$ bars.
- Heavy volume is not bullish or bearish by itself; it says the bar moved a lot or something happened.

## Exercise
1. In the first lab (`volatility_regime`), set the length to 5 and then to 50. How many bars after bar 150 does each
   line need to settle at the new level, and how does that compare with the step response of an SMA of length $n$?
   Then press the new-sample button: does the size of the jump stay near 1.5 times?
2. In the hourly lab, set the length to 20, then 21, then 14. Which lengths remove the daily ripple, and why exactly
   those? At length 20, which hours of the day would a "volume above twice the line" alert flag most often?
3. Start Replay on SPY on 19 February 2020, the record close before the COVID crash, with the Volume SMA.

```lab
{"kind": "replay", "symbol": "SPY", "date": "2020-02-19",
 "indicators": [{"id": "vol_sma", "params": {}}],
 "steps": ["Step day by day through the next six weeks and note the days whose volume bar reaches twice the blue line.",
           "For each of them, was it an up day or a down day?",
           "Keep going into April: is the volume still high in shares, and is it still unusual relative to the line?"],
 "reveal": "Relative volume jumped above 2 within days of the top, mostly on falling days, then faded below 1 by the end of March although the share volume stayed heavy: the 20-day line had caught up. Relative volume measures surprise, not level."}
```
