# Glossary

Short definitions of the terms used across the learn pages. Hover an underlined term on any page to see its first
paragraph; the links under an entry open the page that explains it in full.

## A

### Adjusted price

A price scaled so that dividends do not show up as drops. The ADJ toggle multiplies each bar's open, high and low by
its adjusted close over its close and uses the adjusted close. The provider has already removed splits.

Adjusted history depends on the download date: the adjusted close of an old bar includes every dividend paid after
it. Volume is not changed. See [Adjusted prices](learn:adjusted-prices).

## B

### Backtest

A simulation of a trading rule over past data, with entries, exits, position sizing and costs, that gives an equity
curve. The labs in these pages are event studies, not backtests; backtesting is a later phase of ChartLab.

See [Overfitting and multiple testing](learn:combinations#overfitting-and-multiple-testing) for why a good result on
one sample is weak evidence.

### Bar

One interval of trading summarised as open, high, low, close and volume. A daily bar is labelled with its session
date; an intraday bar with its start time in UTC, which the chart shows in the display time zone.

See [Bars and sessions](learn:bars-and-sessions).

### Baseline

In an event study, the forward returns after every bar of the sample, not only after the signal bars. The edge is
measured against the baseline's mean, so a rising market does not make every rule look good.

## C

### Confidence interval

The 95 % interval of an edge: the edge plus or minus 1.96 standard errors. If it excludes zero, the rule differed from
an average bar on this sample. It ignores the baseline's own error and every other rule you tried.

See [Overfitting and multiple testing](learn:combinations#overfitting-and-multiple-testing).

### Confirmation

A second, different measurement checked on the bar where a trigger fires, asking whether it agrees, for example MACD
above zero when the RSI crosses up. It removes some triggers and helps only if it measures something the trigger does
not.

See [Three roles: filter, trigger, confirmation](learn:combinations#three-roles-filter-trigger-confirmation).

### Crossover

The bar on which one series moves from at or below another to above it (crosses above), or from at or above it to
below it (crosses below). It is true on that one bar only, which makes it a natural trigger.

See [Moving Average Cross](learn:ma-cross) and [MACD](learn:macd).

## D

### Death cross

A fast moving average crossing below a slow one, read as a turn to a downtrend; classically the 50-day average below
the 200-day. The MA Cross indicator marks it for any pair, by default 9 and 21 bars. It arrives late by construction.

See [Moving Average Cross](learn:ma-cross#why-it-works).

### Divergence

Price and an indicator disagreeing: price makes a higher high while the indicator, such as RSI, MACD or OBV, makes a
lower high (bearish), or a lower low against a higher indicator low (bullish). On pure noise they are common and
carry no edge.

See [RSI](learn:rsi#why-it-works) and [On Balance Volume](learn:obv).

### Drift

The average change of the log price per bar: the trend part of a return. The random walk scenario has a drift of 0.03
% per bar and the uptrend 0.15 %. Over a few bars the drift is tiny next to the noise.

## E

### Edge

In an event study, the mean forward log return over the horizon after the signal bars minus the mean after every bar
of the same sample. A positive edge means the signal was followed by better than average returns on this sample.

It is one rule on one sample: not a backtest (no costs, no exits) and not investment advice. See
[Combining indicators](learn:combinations).

### Event study

A measurement of what the close did a fixed number of bars after each bar where a condition was true, compared with
what it did after any bar. It reports the edge, the hit rates, a 95 % interval and the two distributions.

At most one signal counts per horizon plus one bars, so the counted forward windows do not overlap. See
[Guided exercises](learn:guided-exercises).

## F

### Filter

In signal processing, a rule that turns an input series into a smoother or otherwise shaped output. A moving average
is a causal low-pass filter: it uses only the current and past bars. Not to be confused with a trend filter.

The Filter view of a linear indicator shows its measured impulse, step and frequency response. See
[Lag and noise](learn:lag-and-noise).

### FIR filter

A finite impulse response filter: its output is a weighted sum of a fixed number of recent bars, so a spike leaves the
output once it is older than the window. SMA, WMA, ALMA, LSMA, SWMA and HMA are FIR filters.

See [Simple Moving Average](learn:sma#kernel-lag-and-noise).

### Frequency response

How a linear filter treats a cycle of each period: its gain, how much of the cycle survives (in decibels), and its
delay. The Filter view plots it for periods from 2 to 200 bars, measured by running the real indicator code.

See [Lag and noise](learn:lag-and-noise).

## G

### Gap

A jump between two bars. A full gap up: the bar's low is above the previous bar's high (a gap down: its high is
below the previous low). An optional partial gap: the open jumps past the previous close while the ranges
overlap.

Gaps smaller than the minimum size, in percent of the previous close, are not shown. See [Gaps](learn:gaps).

### Gap fill

A gap is filled when a later bar trades back across its whole zone: for a gap up, a low at or below the zone's
bottom; for a gap down, a high at or above its top. Until then the zone stays open.

See [Gaps](learn:gaps).

### Golden cross

A fast moving average crossing above a slow one, read as a turn to an uptrend; classically the 50-day average above
the 200-day. The MA Cross indicator marks it for any pair, by default 9 and 21 bars. It arrives late by construction.

See [Moving Average Cross](learn:ma-cross#why-it-works).

### Group delay

How many bars late a filter passes a cycle of a given period. A symmetric kernel such as the SMA delays every period
by the same amount; at very long periods the group delay of any filter equals its lag.

See [Lag and noise](learn:lag-and-noise).

## H

### Hit rate

The share of forward returns above zero, after the signal bars and, for comparison, after every bar. A hit rate above
one half says little alone: compare it with the baseline's hit rate and look at the edge.

### Horizon

How many bars ahead an event study measures the forward return, from the signal bar's close to the close that many
bars later. A longer horizon catches slower effects but leaves fewer non-overlapping signals.

## I

### IIR filter

An infinite impulse response filter: a recursive filter whose output feeds back into itself, so a spike decays but
never fully leaves. EMA, RMA, DEMA, TEMA, ZLEMA and T3 are IIR filters.

See [Exponential Moving Average](learn:ema).

### Impulse response

The output of a linear filter when its input is a single unit spike on flat data. Its values are the filter's weights,
the kernel; lag, noise reduction and frequency response all follow from it.

See [Lag and noise](learn:lag-and-noise).

## K

### Kernel

The weights a linear filter puts on the current and past bars, equal to its impulse response. An SMA weights its bars
equally, a WMA linearly, an EMA with weights that shrink by a constant factor per bar.

See [Simple Moving Average](learn:sma#kernel-lag-and-noise).

## L

### Lag

How many bars a filter's line trails the price on a steady trend: the centre of mass of its weights. An SMA or an EMA
lags about half its length; less lag usually means less noise reduction.

See [Lag and noise](learn:lag-and-noise).

### Log return

The natural logarithm of the ratio of two prices, for example the close a horizon ahead over today's close. Log
returns add up over time and are close to percentage returns for small moves; the labs show them times 100 as
percent.

### Lookahead

Using data from after a bar to compute that bar's value, which makes signals look better than they could have been.
Every indicator here is tested to give the same value at a bar whether or not later bars exist.

See [Lookahead and replay](learn:lookahead-and-replay).

## M

### Mean reversion

The tendency of a price to move back towards an average after moving away from it. The range scenario is
mean-reverting by construction: there, trend-following rules tend to lose and rules that fade extremes can gain.

See [Combining indicators](learn:combinations).

### Momentum

The tendency of a recent move to continue, and the indicators that measure the speed of a move, such as the MACD
histogram or the RSI. On a random walk, momentum has no predictive value.

See [MACD](learn:macd) and [RSI](learn:rsi).

### Moving average

The average of the last bars of a series, recomputed on every bar: it smooths noise at the cost of lag. The types
differ in their weights: simple, exponential, weighted, Wilder's, volume-weighted and adaptive.

See [Moving Average, any type](learn:moving-average) and [Simple Moving Average](learn:sma).

### Multiple testing

Trying many rules, parameters, scenarios or symbols and keeping the best one. With enough tries a large edge and a
t-statistic above 2 turn up by chance, about one test in twenty, so the best result overstates the truth.

See [Overfitting and multiple testing](learn:combinations#overfitting-and-multiple-testing).

## N

### Noise reduction factor

How much a linear filter shrinks the variance of white noise: the sum of its squared weights. An SMA of length n has
a factor of one over n, so its noise standard deviation falls by the square root of n.

See [Simple Moving Average](learn:sma#kernel-lag-and-noise) and [Lag and noise](learn:lag-and-noise).

## O

### OHLC

Open, high, low and close: the first, highest, lowest and last traded prices of a bar. Most indicators use the close;
true range, the Stochastic and pivots also use the high and the low.

See [Bars and sessions](learn:bars-and-sessions).

### Oscillator

An indicator drawn in its own pane that moves within a fixed range or around zero instead of following the price:
the RSI and the Stochastic between 0 and 100, the MACD around zero.

See [RSI](learn:rsi), [Stochastic](learn:stochastic) and [MACD](learn:macd).

### Overbought

An oscillator reading in its upper zone, RSI above 70 or Stochastic above 80: the recent move was unusually one-sided
upwards. In a strong trend it can last for weeks, so it is not a sell signal by itself.

See [RSI](learn:rsi#how-to-read-it).

### Overfitting

Tuning a rule's parameters until it fits the noise of one sample. It looks excellent there and fails on new data;
check a setting on other seeds, scenarios and symbols before trusting it.

See [Overfitting and multiple testing](learn:combinations#overfitting-and-multiple-testing).

### Oversold

An oscillator reading in its lower zone, RSI below 30 or Stochastic below 20: the recent move was unusually one-sided
downwards. In a strong downtrend it can last for weeks, so it is not a buy signal by itself.

See [RSI](learn:rsi#how-to-read-it) and [Stochastic](learn:stochastic).

## P

### Pivot point

In the Pivots indicator, a bar whose high is strictly above the highs of a set number of bars before and after it (a
pivot high), or whose low is strictly below theirs (a pivot low). It is confirmed only when those later bars exist.

These are swing points (fractals), not the floor-trader pivot levels computed from the previous high, low and close.
In replay a pivot appears as many bars late as its right side is long. See [Pivots](learn:pivots).

## R

### Random walk

A price whose steps are independent of the past, so no rule built on past prices predicts the next step beyond the
drift. The random walk scenario is the null hypothesis: any edge measured there is chance.

See [Simple Moving Average](learn:sma#why-it-works).

### Replay

Bar replay: the chart hides every bar after a cursor and you step or play forward bar by bar, seeing indicators,
pivots and gaps only as they were known at that bar.

See [Lookahead and replay](learn:lookahead-and-replay) and [Guided exercises](learn:guided-exercises).

### Resistance

A price zone where rises have tended to stop, such as earlier highs, a pivot high or the previous period's high. It
is a zone rather than an exact line, and it breaks; test it instead of assuming it.

See [Pivots](learn:pivots) and [Previous Period High/Low/Close](learn:previous-hlc).

### RMA

Wilder's moving average: an exponential average whose smoothing factor is one over the length, seeded with the simple
average of the first values. It is the smoothing inside the RSI and the ATR; the SMMA indicator draws it.

See [Smoothed Moving Average](learn:smma).

## S

### Scenario

A synthetic market model the labs generate: random walk, uptrend, range, reversal, shock, volatility regime or
accumulation. Each one tests a rule in a market whose properties are known exactly.

### Seed

The number that starts the random generator of a synthetic scenario: the same seed always gives the same bars. The
widgets start with seed 1, and the new-sample button draws another seed, so the quoted numbers change.

### Session

One trading day of an exchange, identified by its session date, the date of its daily bar. Every intraday bar belongs
to a session, and VWAP restarts at each session's first bar. A futures session can start the evening before.

See [Bars and sessions](learn:bars-and-sessions) and [VWAP](learn:vwap).

### Signal

A condition on prices or indicators that is true on some bars, for example RSI below 30 or the close crossing above
an average. The labs measure what the price did after the bars where it was true.

### Smoothing factor

The weight an exponential average gives to the newest bar; the rest goes to its previous value. The EMA uses two over
length plus one, the RMA one over length. A larger factor means a faster, noisier line.

See [Exponential Moving Average](learn:ema) and [Smoothed Moving Average](learn:smma).

### Standard deviation

The typical distance of values from their mean: the square root of the mean squared deviation. Bollinger Bands use
the population form, dividing by the count; the event-study statistics divide by the count minus one.

See [Bollinger Bands](learn:bollinger-bands).

### Standard error

The uncertainty of a mean estimated from a sample: the sample's standard deviation divided by the square root of its
size. In the labs it is the standard error of the mean forward return after the signal.

### Step response

The output of a filter when its input jumps from one constant level to another. It shows how many bars the line needs
to catch up and whether it overshoots; the Filter view measures it on the real code.

See [Lag and noise](learn:lag-and-noise).

### Support

A price zone where falls have tended to stop, such as earlier lows, a pivot low or the previous period's low. It is a
zone rather than an exact line, and it breaks; test it instead of assuming it.

See [Pivots](learn:pivots) and [Previous Period High/Low/Close](learn:previous-hlc).

## T

### t-statistic

The edge divided by its standard error: how many standard errors the edge lies from zero. A size above about 2 looks
significant, but among many tried rules about one in twenty gets there by chance.

See [Overfitting and multiple testing](learn:combinations#overfitting-and-multiple-testing).

### Trend filter

A condition that stays true for long stretches and selects the market regime, for example the close above its
200-bar SMA. It removes a large share of the bars; a trigger then times entries inside the regime.

See [Three roles: filter, trigger, confirmation](learn:combinations#three-roles-filter-trigger-confirmation).

### Trigger

A one-bar event that times an entry, usually a cross, for example the RSI crossing above 30. It is rare by
construction; with a trend filter and a confirmation it forms a rule.

See [Three roles: filter, trigger, confirmation](learn:combinations#three-roles-filter-trigger-confirmation).

### True range

A bar's range including any gap from the previous close: the largest of high minus low, the distance from the
previous close to the high and the distance from it to the low. On the first bar it is high minus low.

The ATR is its moving average. See [Average True Range](learn:atr).

## V

### Volatility

How much prices move per bar, usually the standard deviation of returns. The ATR measures it in price units and
Bollinger Bands set their width from it. The volatility regime scenario jumps from calm to wild half-way.

See [Average True Range](learn:atr) and [Bollinger Bands](learn:bollinger-bands).

### Volume

The number of shares or contracts traded during a bar. It is split-adjusted and not changed by dividend adjustment. In
the synthetic scenarios it carries direction only in accumulation; elsewhere it grows with the size of the move.

See [On Balance Volume](learn:obv) and [Volume SMA](learn:volume-sma).

## W

### Warm-up

The first bars of the data, before an indicator has enough history for its first value. The output there is NaN and
the chart draws nothing: no value is invented. A 20-bar SMA first appears on the 20th bar.

See [Warm-up](learn:warm-up).

### Whipsaw

A signal that reverses soon after it fires, such as a golden cross followed a few bars later by a death cross. It is
common when a trend signal runs in a sideways market.

See [Moving Average Cross](learn:ma-cross).
