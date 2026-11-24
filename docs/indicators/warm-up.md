# Warm-up

An indicator needs a certain number of bars before its formula is defined: a 20-bar average has nothing to average
on the 5th bar of the history. Those first bars are the **warm-up**. This page lists the warm-up of every indicator
(read from the registry, `backend/app/indicators/`), explains why recursive filters need far more history than their
warm-up, and why the chart therefore loads bars you never see.

## NaN, never a made-up value
During warm-up every output is `NaN` (sent to the frontend as `null`), and the chart draws nothing there. ChartLab never
fills the gap with a shorter window, the first price, a zero or an extrapolation: a value on the chart is always the
indicator's own formula applied to enough real bars. In the labs a rule that reads a `NaN` is false on that bar, so an
event study starts only where every indicator it uses has a value.

The API reports the warm-up as `warmup`: the index of the first bar with a value in the output that starts **last**
(a composite's faster outputs start earlier; the MACD line starts 8 bars before its signal).

## Warm-up by family
At the registry defaults, plus a few common settings:

| Indicator | Setting | First bar with a value | Rule |
|---|---|---|---|
| [SMA](learn:sma), [WMA](learn:wma), [ALMA](learn:alma), [LSMA](learn:lsma), [VWMA](learn:vwma), [Volume SMA](learn:volume-sma) | length $n$ | $n - 1$ (SMA 9: 8; SMA 200: 199) | an $n$-bar window needs $n$ bars |
| [Bollinger Bands](learn:bollinger-bands), [Envelope](learn:envelope) | 20 | 19 | the window of the basis |
| [SWMA](learn:swma) | fixed 4 taps | 3 | four bars |
| [EMA](learn:ema), [SMMA](learn:smma), [McGinley](learn:mcginley) | length $n$ | $n - 1$ (EMA 9: 8; SMMA 7: 6; McGinley 14: 13) | seeded with the SMA of the first $n$ bars |
| [DEMA](learn:dema) | 9 | 16 | $2(n-1)$: an EMA of an EMA |
| [TEMA](learn:tema) | 9 | 24 | $3(n-1)$: three nested EMAs |
| [T3](learn:t3) | 5 | 24 | $6(n-1)$: six nested EMAs |
| [HMA](learn:hma) | 9 | 10 | $n + \lfloor\sqrt n\rfloor - 2$: a WMA of WMAs |
| [ZLEMA](learn:zlema) | 20 | 28 | $n - 1 + \lfloor (n-1)/2 \rfloor$: the lag term reads $\lfloor (n-1)/2 \rfloor$ bars back |
| [KAMA](learn:kama) | 10 | 10 | $n$: the efficiency ratio needs $n$ price changes |
| [RSI](learn:rsi) | 14 | 14 | $n$: the first change needs a previous bar |
| RSI with an SMA 14 of RSI | 14, 14 | 27 | $n + m - 1$ |
| [MACD](learn:macd) | 12, 26, 9 | line 25, signal and histogram 33 | $s - 1$, then $s + g - 2$ |
| [Stochastic](learn:stochastic) | 14, 1, 3 | %K 13, %D 15 | $n + s_k - 2$, then $n + s_k + s_d - 3$ |
| [ATR](learn:atr) | 14 | 13 | $n - 1$: the first true range is the first bar's range |
| [MA Cross](learn:ma-cross) | 9 / 21 | 20 | the slower average |
| [MA Ribbon](learn:ma-ribbon) | 20 … 200 | 199 | the slowest average |
| [OBV](learn:obv) | — | 0 | a running sum from the first bar |
| [VWAP](learn:vwap) | — | 0, and again at every session | restarts each session; `NaN` on daily bars |
| [Previous High/Low/Close](learn:previous-hlc) | day | the second period | the first period has no previous one (declared 0: it depends on the data) |
| [Pivots](learn:pivots) | 5 / 5 | 10 | $L + R$, and every pivot appears $R$ bars after its bar |

A plot `offset` of $k$ bars adds $k$ to the warm-up (SMA 20 with offset 5: 24). Pivots are a special case: their
warm-up is short, but each value is known only $R$ bars after the pivot bar (see
[Lookahead and replay](learn:lookahead-and-replay)).

Chains add up. MACD shows the rule: the slow EMA ($s = 26$) is first defined at bar 25; the signal line is an EMA of
length $g = 9$ of the MACD line, seeded on its first 9 values, so it starts at $25 + 8 = 33 = s + g - 2$.

## Warm-up is not convergence: IIR seeds
An FIR average (SMA, WMA, ...) is exact from its first value: it uses exactly its window. A recursive (IIR) average
is not. The EMA starts from a **seed**, the SMA of its first $n$ inputs, and then recurses:

$$
E_{n-1} = \frac{1}{n}\sum_{i=0}^{n-1} x_i,
\qquad
E_t = E_{t-1} + \alpha\,(x_t - E_{t-1}) = \sum_{k=0}^{t-n} \alpha\,p^k x_{t-k} + p^{\,t-n+1} E_{n-1}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $E_t$ | the EMA at bar $t$ | price |
| $x_t$ | input (the close by default) | price |
| $n$ | length | bars |
| $\alpha$ | smoothing factor: $\frac{2}{n+1}$ for the EMA, $\frac{1}{n}$ for the SMMA (RMA) | 0–1 |
| $p$ | pole, $1 - \alpha$ | 0–1 |
| $p^{\,t-n+1}$ | weight the seed still has at bar $t$ | 1 at the seed, then falling |

The seed is a legitimate estimate, not a fabricated value, but it is a *different* estimate from the one a longer
history would give: two EMAs started at different bars differ at bar $t$ by $p^{k}$ times their difference at the
later start, $k$ bars earlier. The memory fades geometrically:

$$
p^{k} = (1 - \alpha)^{k} \approx e^{-\alpha k} =
\begin{cases}
e^{-2k/(n+1)} & \text{EMA} \\
e^{-k/n} & \text{SMMA (RMA), the smoothing inside RSI and ATR}
\end{cases}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $k$ | bars since the seed | bars |
| $p^k$ | remaining weight of the seed | 0–1 |

A long EMA is therefore slow to forget where it started. An EMA 200 has $p = 199/201$, so 100 bars after its seed the
seed still carries $p^{100} = e^{-1.00} = 0.37$ of the weight. Two EMA 200 lines started a year apart on the same
symbol disagree visibly for months. The same holds, more slowly still, for KAMA in a quiet market (its slowest
smoothing is $s^2$ with $s = 2/31$) and for T3's six nested EMAs.

## Why the app loads extra history
The chart wants every value it shows to be the value a computation over the *whole* history would give, so that
scrolling, loading older pages or replaying never changes a number. The backend therefore computes each indicator over
the requested bars **plus a lookback** of earlier bars, then clips the result:

$$
\text{lookback} = \max(25\,n,\ 250),
\qquad
p^{\,24n} \le \left(1 - \tfrac{1}{n}\right)^{24n} \approx e^{-24} \approx 3.8 \times 10^{-11}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $n$ | the indicator's longest length parameter | bars |
| $25\,n$ | bars loaded before the first bar the chart asked for | bars |
| $p^{\,24n}$ | worst remaining seed weight on the first shown bar (the RMA, seeded at bar $n-1$ of the loaded history) | below the $10^{-9}$ test tolerance |

The EMA's seed weight there is about $e^{-48}$, far smaller. Indicators whose memory is longer define their own
lookback:

| Indicator | Lookback at the defaults | Why |
|---|---|---|
| SMA 9, EMA 9, most short averages | 250 | the minimum |
| SMA 50 / SMA 200 / EMA 200 | 1,250 / 5,000 / 5,000 | $25\,n$ |
| RSI 14, ATR 14, Stochastic | 350 | $25 \times 14$ |
| MACD 12/26/9 | 900 | the slow EMA's 650 plus the signal's 250: the signal is seeded on not-yet-converged MACD values |
| T3 | $\max(50\,n, 250)$ | six cascaded EMAs |
| KAMA 10 (slow 30) | 6,016 | its slowest smoothing fades like $(1 - s^2)^k$ |
| OBV, Previous High/Low/Close | the whole history | a running sum from the first bar; periods counted from the first one |

A plot offset adds its bars on top (`total_lookback`). A test computes every registered indicator over a window and
compares it with the full-history result. When the lookback reaches the first bar the provider has, the computation
simply starts there: at the very beginning of a symbol's history the chart shows the true warm-up, `NaN` bars
included.

## What a lab shows at the start
The labs compute on their sample only: 300 bars in a `param` lab, 1000 in `event` and `combo` labs, or the last bars of
a real symbol. No lookback is added, so the warm-up is visible on the left of every mini chart, and for recursive
filters the first values carry the seed. Move the length here and watch the line's first bar move to $n - 1$; at
length 250 only 51 of the 300 bars have a value:

```lab
{"kind": "param", "indicator": "sma", "vary": "length", "min": 2, "max": 250, "params": {"length": 50},
 "scenario": "random_walk"}
```

The MACD line starts at bar $s - 1$ and its signal line at $s + g - 2$; slide the slow length (kept above the fast
length 12, which would otherwise set the start) and watch both starts move together:

```lab
{"kind": "param", "indicator": "macd", "vary": "slow_length", "min": 13, "max": 100, "scenario": "uptrend"}
```

The impulse response of the RMA inside RSI 14 is the seed's memory drawn as a picture: weights $\alpha p^k$ with
$\alpha = 1/14$, which the Filter view cuts at $10^{-4}$ of the first weight, more than 100 bars on. That tail is why
RSI needs 350 bars of lookback but only 14 bars of warm-up:

```lab
{"kind": "filter", "indicator": "smma", "params": {"length": 14}}
```

Consequences for reading labs: an event study on 1000 bars with an SMA 200 has only about 800 bars left to find
signals; a long EMA or KAMA in a 300-bar lab is partly the seed, so its first hundred bars do not match the same
symbol on the main chart.

## Pitfalls
- **Long lengths on short histories.** An EMA 200 on monthly bars needs 200 months, more than 16 years, before its
  first value, and decades before the seed is forgotten. On `4h` bars of a stock (two a session) an SMA 200 needs
  about 100 sessions.
- **Different platforms, different starts.** Two charts that loaded different amounts of history give different EMA,
  RSI and MACD values near the start, both "correct". ChartLab's lookback makes its values match a full-history
  computation; another platform may load less.
- **OBV's level is arbitrary.** OBV starts at 0 on the first loaded bar, so only its changes mean something; the app
  loads the whole history so the level is at least stable.
- **Warm-up inside combinations.** A combination is defined only where all of its parts are: an AND of an SMA 200
  rule and an RSI rule starts at bar 199, not 14.

## Exercise
1. In the SMA lab, set the length to 250. How many bars are left for a `combo` or `event` study on the same 300-bar
   sample, and what does that do to the 95 % interval of any edge measured there? (Compare with
   [Combining indicators](learn:combinations).)
2. A 300-bar lab with EMA 200: the seed is the SMA of bars 0 to 199. Using $p^k$, how much weight does the seed still
   have on bar 299? How long would the sample have to be for the seed's weight to drop below 1 %?
3. Replay a symbol with indicators that need long histories and check that their values exist from the first bar you
   see:

```lab
{"kind": "replay", "symbol": "SPY", "date": "2020-02-19",
 "indicators": [{"id": "ema", "params": {"length": 200}}, {"id": "macd", "params": {}}],
 "steps": ["Start in Replay and scroll left to the oldest bar the chart has loaded.",
  "Hover the first few bars: do the EMA 200 and MACD have values there?",
  "In the SMA lab on this page, switch the data to SPY and set the length to 200: where does the line start there?"],
 "reveal": "On the chart the indicators have values from the first loaded bar (unless you reach the very start of SPY's history), because the backend computed them over a lookback of up to 5000 earlier bars and clipped the result. The lab computes on its own sample only, so its SMA 200 is empty for the first 199 bars of the sample (an EMA 200 would also carry its seed for the next few hundred)."}
```

More exercises: [Guided exercises](learn:guided-exercises).
