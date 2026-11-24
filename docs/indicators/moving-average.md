# Moving Average, any type (`ma`)

One entry that computes any of ChartLab's 15 moving averages, picked by the MA type input. Use it to compare averages
on the same chart by switching the type, without adding a new indicator each time.

## What it measures
The trend of the source over roughly the chosen length: a weighted mean of the last bars, with the [lag](glossary:lag) and
smoothness of the chosen type. Every average answers the same question, "where has price been lately?", and they
differ only in how they weigh the recent against the older bars.

Move the length on a trending series: the line falls further behind price (the lag grows with the length) and gets
smoother.

```lab
{"kind": "param", "indicator": "ma", "vary": "length", "min": 2, "max": 100, "scenario": "uptrend"}
```

## Formula

$$
\textcolor{#2962FF}{y_t} = \mathrm{MA}^{\text{type}}_n(x)_{t - o}, \qquad \text{type} \in \{\text{SMA, EMA, WMA, SMMA, DEMA, TEMA, HMA, LSMA, ALMA, SWMA, VWMA, McGinley, KAMA, T3, ZLEMA}\}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#2962FF}{y_t}$ | the plotted average at bar $t$ | price |
| $x$ | the source (close by default) | price |
| $n$ | the length | bars, default 9 |
| $o$ | the plot offset, $o \ge 0$ | bars, default 0 |
| type | which average (see each type's page) | one of 15 |

Each type is the same implementation as its dedicated indicator (see its page).
Types with extra inputs use their defaults here: ALMA offset 0.85 and sigma 6, KAMA fast 2 and slow 30 (the length is
the efficiency length), T3 volume factor 0.7, LSMA offset 0. SWMA ignores the length (fixed 4 taps).

## Kernel, lag and noise

The types fall into three classes (the verification classes of the harness):

- **Non-negative [kernels](glossary:kernel)** (SMA, EMA, WMA, SMMA, ALMA, SWMA): $h_k \ge 0$, so the output stays inside the window's
  range, never overshoots, and lag and NRF cannot both be small.
- **Lag-compensated** (DEMA, TEMA, HMA, LSMA, ZLEMA, T3): negative weights cancel the first moment (lag 0 for all but
  T3), paying with a larger NRF and overshoot at turns.
- **Data-dependent** (VWMA, McGinley, KAMA): no fixed kernel; the weights depend on volume or on the price itself.

For a linear type the lag is the kernel's centre of mass $\bar k = \sum_k k\,h_k$ (exact on any straight line:
$x_t = a + bt \Rightarrow y_t = a + b(t - \bar k)$) and the [noise reduction factor](glossary:noise-reduction-factor) is $\mathrm{NRF} = \sum_k h_k^2$.
Measured with this indicator at the default length $n = 9$:

| Type | Warm-up | Lag (bars) | NRF | Step peak |
|---|---|---|---|---|
| SMA | 8 | 4.000 | 0.1111 | 1 |
| EMA | 8 | 4.000 | 0.1111 | 1 |
| WMA | 8 | 2.667 | 0.1407 | 1 |
| SMMA ([RMA](glossary:rma)) | 8 | 8.000 | 0.0588 | 1 |
| DEMA | 16 | 0 | 0.2538 | 1.107 |
| TEMA | 24 | 0 | 0.3822 | 1.147 |
| HMA | 10 | 0 | 0.4418 | 1.267 |
| LSMA | 8 | 0 | 0.3778 | 1.267 |
| ALMA | 8 | 1.557 | 0.2334 | 1 |
| SWMA | 3 | 1.500 | 0.2778 | 1 |
| T3 | 48 | 3.600 | 0.1046 | 1.120 |
| ZLEMA | 12 | 0 | 0.3735 | 1.181 |
| VWMA | 8 | 4.000 (ramp, constant volume) | — | 1 |
| McGinley | 8 | 8.167 (ramp) | — | 1 |
| KAMA | 9 | 1.250 (ramp) | — | 1 |

The table is the lag-versus-noise trade-off in one place: SMA and EMA share lag 4 and NRF $1/9$ (that is why
$\alpha = 2/(n+1)$); every zero-lag type pays 2.3 to 4 times the SMA's noise variance; SMMA halves the noise for twice
the lag. The adaptive rows are ramp lags at price level 100 and slope 0.1 per bar, not kernel moments (see the
McGinley and KAMA pages for why).

The same slider with the type set to HMA: no lag at any length, but the line swings past price at every turn (step
peak 1.267 at $n = 9$). Compare with the SMA lab above.

```lab
{"kind": "param", "indicator": "ma", "vary": "length", "min": 2, "max": 100, "params": {"ma_type": "hma"}, "scenario": "uptrend"}
```

## Defaults
| Param | Default | Why |
|---|---|---|
| MA type | SMA | Most common |
| Length | 9 | TradingView default for most MA built-ins |
| Source | close | TradingView default |
| Offset | 0 | Display shift, $\ge 0$ |

## Warm-up
First valid bar index: that of the chosen type, plus the offset (column "[Warm-up](glossary:warm-up)" above for $n = 9$). Extra history:
$\max(25n, 250)$ bars for most types, $\max(50n, 250)$ for T3, and $\lfloor 25/s^2 \rfloor + n$ for KAMA (6,015 at
$n = 9$). HMA needs $n \ge 2$.

## Filter view
The drawer follows the chosen type:

- **Linear types**: [impulse response](glossary:impulse-response) (stems), [step response](glossary:step-response), $\lvert H\rvert$ in dB vs period on a log axis from 2 to
  200 bars, and [group delay](glossary:group-delay). [FIR](glossary:fir-filter) types show their exact spectral zeros as deep notches (SMA 9 has zeros at periods
  $9/j$: 9, 4.5, 3, 2.25; the plot floors at $-120$ dB where a grid point lands on one); lag-compensated types show overshoot in the step and a magnitude bump above
  0 dB.
- **VWMA, McGinley, KAMA**: step and ramp responses only, with the reason (volume weights change from bar to bar, or
  the smoothing depends on the input, so superposition fails). VWMA is measured at constant volume, where it equals
  the SMA.

## How to read it
- **Price above / below the line.** On a trend of slope $b$ per bar a linear average sits $\bar k\,b$ behind price, so
  in an uptrend price stays above it and in a downtrend below. Which side price is on is a statement about the recent
  returns (next section), not a forecast in itself.
- **Slope.** The line's slope is a smoothed slope of price, delayed by about $\bar k$ bars. A flat line with price
  crossing it back and forth is a range.
- **Crossings.** A price cross means the weighted sum of recent returns changed sign. Short or zero-lag types cross
  often (little memory); long non-negative types cross rarely and late.
- **Distance from price.** The gap grows with the slope ($\bar k\,b$) and, on a [random walk](glossary:random-walk), has a typical size of
  $\sigma\sqrt{\sum_j w_j^2}$ (next section): about 6 % for SMA 50 at 1.5 % daily volatility. A gap of that size is
  ordinary, not "stretched".
- **Trend vs range.** In a trend the line is sloped and stays on one side of price; in a range it is flat and price
  oscillates around it.
- **The length and the type.** The length sets the horizon (lag $\approx \frac{n-1}{2}$ for SMA and EMA); the type
  sets how that horizon is weighted. Zero-lag types (HMA, LSMA, DEMA, TEMA, ZLEMA) follow price closely and overshoot.

## Why it works
Write the log price through its bar returns, $x_t - x_{t-k} = \sum_{j=0}^{k-1} r_{t-j}$ (an average of prices and
of log prices differ only to second order in the bar moves). For a linear average with unit-gain kernel $h$ (so
$\sum_k h_k = 1$):

$$
x_t - \textcolor{#2962FF}{y_t} = \sum_k h_k\,(x_t - x_{t-k}) = \sum_k h_k \sum_{j=0}^{k-1} r_{t-j} = \sum_{j \ge 0} w_j\, r_{t-j}, \qquad w_j = \sum_{k > j} h_k
$$

$$
\sum_{j \ge 0} w_j = \sum_k k\,h_k = \bar k, \qquad \text{SMA}_n:\ w_j = \frac{n-1-j}{n} \ (0 \le j \le n-2)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $x_t$ | the log price at bar $t$ | log price |
| $\textcolor{#2962FF}{y_t}$ | the average at bar $t$ | log price |
| $h_k$ | the type's kernel (weight of the price $k$ bars ago) | weights, $\sum_k h_k = 1$ |
| $r_{t-j}$ | the return of bar $t - j$ | about $\pm 1$–2 % per bar |
| $w_j$ | weight of the return $j$ bars ago: the kernel's tail beyond $j$ | between 0 and 1 for $h_k \ge 0$ |
| $\bar k$ | the lag (centre of mass); also the total weight $\sum_j w_j$ | bars ($\frac{n-1}{2}$ for SMA) |

So **"price above the average" means a weighted sum of recent returns is positive**, with the newest returns weighted
most (a triangle for the SMA) and a total weight equal to the lag. A zero-lag type has $\sum_j w_j = 0$: positive
weights on the newest returns, negative ones further back, so it measures a change of slope rather than an
accumulated move. On a random walk with volatility $\sigma$ the typical distance from the line follows from the same
weights:

$$
\operatorname{sd}(x_t - \textcolor{#2962FF}{y_t}) = \sigma \sqrt{\sum_j w_j^2}, \qquad \text{SMA}_n:\ \sum_j w_j^2 = \frac{(n-1)(2n-1)}{6n}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\sigma$ | standard deviation of one bar's return | 1.5 % in the random-walk scenario |
| $\sum_j w_j^2$ | variance gain of the return weights | 16.2 for SMA 50 (sd $\approx 4.0\sigma \approx 6$ %) |

Does the sign tell anything about the next $h$ bars? On a random walk the future returns are independent of the past,
so the expected next $h$ returns are $h\mu$ after every bar and **no average, of any type or length, has an [edge](glossary:edge)**. A
steady uptrend is no different: every bar has the same expected return. An edge needs a market whose expected return
changes and whose past reveals the change: in the **reversal** scenario (drift $+0.25$ % per bar, then $-0.25$ %) a
long weighted sum of returns says which half you are in; a zero-lag type does not accumulate returns and so cannot.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0],
 "rules": [
  {"label": "Close above SMA 50", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "ma", "params": {"ma_type": "sma", "length": 50}}, "output": "ma"}},
  {"label": "Close above HMA 50", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "ma", "params": {"ma_type": "hma", "length": 50}}, "output": "ma"}}
 ]}
```

With seed 1 (1000 bars, 10-bar horizon):

| Scenario | Close above SMA 50 (lag 24.5) | Close above HMA 50 (lag 0) |
|---|---|---|
| Reversal | $+1.74$ % ($+0.50$ to $+2.99$, n = 47) | $-0.06$ % ($-1.14$ to $+1.03$, n = 64) |
| Random walk | $+0.17$ % ($-1.18$ to $+1.53$, n = 42) | |
| Range | $-0.94$ % ($-1.76$ to $-0.11$, n = 63) | |

The SMA 50 rule is positive on all of seeds 1–5 in the reversal ($+1.24$ to $+2.14$ %); in the [mean-reverting](glossary:mean-reversion) range
it turns negative (above the average means above the mean, which pulls price back). Same length, different type, no
edge: the lag is the memory. One rule on one synthetic sample: not a backtest (no costs), sensitive to how many rules
you try, and not investment advice.

## Combine with
An average is best as a **trend filter** (which regime?), with a faster rule as the **trigger** (when?):

- a long average (SMA 200) as the filter;
- the **MACD** histogram turning positive as the trigger: a difference of two EMAs and its signal line, i.e. a
  smoothed change of slope;
- a medium average (SMA 50) as a second, faster confirmation of the trend.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Close above SMA 200", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "ma", "params": {"ma_type": "sma", "length": 200}}, "output": "ma"}},
  {"label": "MACD histogram crosses above 0", "left": {"indicator": {"id": "macd", "params": {}}, "output": "hist"},
   "op": "crosses_above", "right": {"value": 0}},
  {"label": "Close above SMA 50", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "ma", "params": {"ma_type": "sma", "length": 50}}, "output": "ma"}}
 ]}
```

With seed 1 on the reversal: SMA 200 alone $+1.49$ % ($-0.05$ to $+3.06$, n = 36), the MACD cross alone $-0.28$ %
($-1.78$ to $+1.24$, n = 34), SMA 50 alone $+1.74$ % ($+0.50$ to $+2.99$, n = 47). Filter and trigger together:
$+2.18$ % ($+0.26$ to $+4.14$, n = 14); all three $+3.49$ % ($+1.69$ to $+5.33$, n = 9). The trigger has no edge of
its own; it only picks moments inside the regime the filter found, and every extra rule shrinks n and widens the
interval. On the random walk the pair gives $-0.12$ % ($-2.90$ to $+2.73$, n = 11). One sample, no costs, not
investment advice.

## Differences vs TradingView
- This entry is a ChartLab convenience; compare each type with the matching TradingView built-in (see each type's page).
- KAMA, T3 and ZLEMA are not TradingView built-ins (decision D4); they follow TA-Lib (KAMA, T3) or Ehlers and Way
  (ZLEMA).
- The type's own extra inputs (ALMA, KAMA, T3, LSMA) are fixed at their defaults here.

## Pitfalls
- To change ALMA's offset or sigma, KAMA's fast or slow length, or T3's volume factor, use the dedicated indicator.
- "Length" means different things: an EMA length for EMA, the efficiency window for KAMA, the per-stage length for T3
  (warm-up $6(n-1)$), and nothing for SWMA.
- Comparing types at the same length compares different lags; compare at equal lag (or equal NRF) instead.

## Exercise
1. In the "Why it works" lab, switch from the SMA 50 rule to the HMA 50 rule, then set the scenario to Range. Using
   $\sum_j w_j = \bar k$, explain why the HMA rule has no edge in either scenario while the SMA rule flips sign.
2. In the two length labs, set both to 50 on the uptrend: measure (by eye) how many bars the SMA trails price, and
   compare with $\bar k = 24.5$. What does the HMA do at the small dips instead?
3. Start Replay on NVDA on 2023-01-03 (the start of its 2023 rally) with an SMA 50 and an HMA 50. Step forward: which
   line does price cross more often, and which one stays on one side of price through the rally?

```lab
{"kind": "replay", "symbol": "NVDA", "date": "2023-01-03", "indicators": [{"id": "ma", "params": {"ma_type": "sma", "length": 50}}, {"id": "ma", "params": {"ma_type": "hma", "length": 50}}]}
```
