# Stochastic (`stoch`)

George Lane's oscillator: where the close sits inside the high-low range of the last $n$ bars, from 0 (at the low)
to 100 (at the high). People use it to spot stretched moves in a range ("oversold" below 20, "overbought" above 80)
and, with its signal line %D, to time turns.

## What it measures
The question it answers: "how far up its recent range did the market close today?" If the close is the highest
high of the last 14 bars, %K is 100; if it is the lowest low, 0; halfway, 50. It is a position, not a speed: it says
nothing about how big the range is, only where the close lies in it. %D is a short average of %K that acts as its
signal line.

Move the %K length on `range` (a market that swings around 100): a short window makes %K jump between the extremes
on every wiggle, a long one only reaches 0 or 100 at the real swing lows and highs.

```lab
{"kind": "param", "indicator": "stoch", "vary": "k_length", "min": 3, "max": 100, "scenario": "range"}
```

## Formula

$$
\%K^{\text{raw}}_t = 100\,\frac{C_t - LL_t}{HH_t - LL_t}, \qquad HH_t = \max_{k<n} H_{t-k}, \quad
LL_t = \min_{k<n} L_{t-k}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\%K^{\text{raw}}_t$ | unsmoothed %K at bar $t$ (the fast %K) | 0–100 |
| $C_t,\ H_t,\ L_t$ | close, high and low of bar $t$ | price |
| $HH_t,\ LL_t$ | highest high and lowest low of the last $n$ bars, bar $t$ included | price |
| $n$ | %K length | bars, default 14 |
| $k$ | age of a bar inside the window | bars, $0$ to $n-1$ |

$$
\textcolor{#2962FF}{\%K_t} = \mathrm{SMA}_{s_k}(\%K^{\text{raw}})_t, \qquad
\textcolor{#FF6D00}{\%D_t} = \mathrm{SMA}_{s_d}(\textcolor{#2962FF}{\%K})_t
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#2962FF}{\%K_t}$ | the %K line (blue) | 0–100 |
| $\textcolor{#FF6D00}{\%D_t}$ | the %D line (orange), the signal line | 0–100 |
| $s_k$ | %K smoothing: 1 = fast Stochastic, 3 = slow Stochastic | bars, default 1 |
| $s_d$ | %D smoothing | bars, default 3 |
| $\mathrm{SMA}_m$ | simple average of the last $m$ values | — |

**Why it is bounded.** The window contains bar $t$, so $LL_t \le L_t \le C_t \le H_t \le HH_t$. Subtracting $LL_t$,

$$
0 \;\le\; C_t - LL_t \;\le\; HH_t - LL_t
\quad\Longrightarrow\quad
0 \le \%K^{\text{raw}}_t \le 100,
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $C_t - LL_t$ | how far the close is above the window's low | price, $\ge 0$ |
| $HH_t - LL_t$ | the window's high-low range | price, $\ge 0$ |

with 100 exactly when the close is the highest high of the window and 0 when it is the lowest low. An SMA is a
convex combination (positive weights that add up to 1), so %K and %D stay inside 0–100 too. A flat range
($HH = LL$) divides by zero: the value is empty there (Pine `na`), and so are the averages over it.

**Fast and slow.** With $s_k = 1$ (the default) %K is the raw value: the "fast" Stochastic. With $s_k = 3$ %K is
$\mathrm{SMA}_3$ of the raw value: the "slow" Stochastic. Since $\mathrm{SMA}_3(\mathrm{SMA}_1(x)) = \mathrm{SMA}_3(x)$,
the slow %K is exactly the fast %D, bar for bar.

## Kernel, lag and noise
Not a linear filter: a ratio of order statistics (a running max and min), so there is no impulse or frequency
response. The two SMAs smooth it with lags $(s_k - 1)/2$ and $(s_d - 1)/2$ bars: 0 and 1 at the defaults, 1 and 1
for the slow version. An SMA of length 3 divides the variance of white noise by 3.

## Defaults
| Param | Default | Why |
|---|---|---|
| %K length | 14 | TradingView default |
| %K smoothing | 1 | TradingView default (fast %K) |
| %D smoothing | 3 | TradingView default |

Levels 80 / 50 / 20.

## Warm-up
First valid bar index: %K $n + s_k - 2$ (13 at the defaults), %D $n + s_k + s_d - 3$ (15). The window needs $n$
bars (index $n - 1$), and each SMA of length $m$ adds $m - 1$. The slow version ($s_k = 3$): %K 15, %D 17.

## Filter view
Not offered: the Stochastic is non-linear (superposition fails for a running max and min), so it has no single
impulse or frequency response.

## How to read it
- **Levels:** above 80 the close is in the top fifth of the $n$-bar range, below 20 in the bottom fifth; 50 is the
  middle. "Overbought" and "oversold" are only names for these positions.
- **%K and %D:** %D is a 3-bar average of %K. %K crossing above %D means %K has risen above its own short mean: the
  close has moved up in the range over the last bars. The cross is most often read below 20 (a turn up from the
  bottom of the range) or above 80 (a turn down).
- **Range:** in a market that swings back and forth, %K travels from one end to the other and its extremes mark
  the swing highs and lows of the window.
- **Length:** a longer window makes the range wider, so %K reaches the extremes only at bigger swings and stays
  pinned for longer in a trend.

**Fast vs slow.** Move the %K smoothing from 1 to 3. The fast line jumps with every close; the slow line is the
fast %D, one bar later and calmer. The slow %D is a 3-bar average of that again.

```lab
{"kind": "param", "indicator": "stoch", "vary": "k_smoothing", "min": 1, "max": 10, "scenario": "range"}
```

**Trend: pinned at one end.** Take a steady climb $C_t = C_0 + b\,t$ in which every bar has a wick $w$ above and
below the close ($H = C + w$, $L = C - w$). Then $HH_t = C_t + w$ (the newest bar) and
$LL_t = C_t - (n-1)\,b - w$ (the oldest), so

$$
\%K^{\text{raw}}_t = 100\,\frac{(n-1)\,b + w}{(n-1)\,b + 2w} > 80
\iff (n-1)\,b > 3\,w .
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $b$ | price change per bar of the trend | price per bar |
| $w$ | wick: how far the high and the low lie from the close | price, $\ge 0$ |
| $(n-1)\,b$ | the trend's rise across the window | price |

At $n = 14$: as soon as the 13-bar rise exceeds three wicks, %K never leaves the 80–100 band. "Overbought" is the
normal state of a strong uptrend, not a sell signal (and "oversold" of a strong downtrend). The synthetic `uptrend`
is much noisier than that (drift 0.15 % per bar against 1.2 % noise per bar), so it only shifts %K up: its mean %K
is 55.9–63.1 over seeds 1–5, against 45.0–53.7 on `random_walk`.

## Why it works
**On a random walk %K carries no information about the future.** %K at bar $t$ is a function of bars $\le t$
only. On a random walk the next increments are independent of everything up to $t$, so

$$
\mathbb{E}\left[\,x_{t+h} - x_t \mid \textcolor{#2962FF}{\%K_t} < 20\,\right] = \mathbb{E}\left[\,x_{t+h} - x_t\,\right] = \mu\,h
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $x_t$ | log close at bar $t$ | — |
| $h$ | look-ahead | bars, 1–60 |
| $\mu$ | drift per bar | log return per bar |

and the edge (the mean after the signal minus the mean after any bar) is 0, at any level and any length.

**Its distribution on a random walk is U-shaped, not uniform.** With zero drift, reflecting the path
($x \to -x$, which swaps highs and lows) maps %K to $100 - \%K$, so the distribution is symmetric around 50. It is
not flat: the newest close is often a new extreme of the window. Without wicks ($H = L = C$), %K is 100 exactly
when the close is the highest of the last 14, and by the Sparre Andersen theorem that happens with probability
$\binom{26}{13}/4^{13} = 0.155$ for any symmetric continuous increments (a simulated Gaussian walk of 200,000
steps: 0.151 at 100, 0.157 at 0). Wicks soften the spikes into a U: on 200,000 bars of the `random_walk` scenario
the ten 10-point bins hold 11.3, 10.5, 9.2, 8.8, 8.6, 8.7, 9.2, 10.0, 11.4 and 12.1 % of the bars; 21.9 % are below
20 and 23.6 % above 80 (the small upward drift tilts it). "Oversold" happens on about one bar in five of a pure
random walk, so on its own it is not a rare event.

**In a mean-reverting market low %K points to a rise.** `range` is an AR(1) around $\ln 100$ with coefficient
$\phi = 0.92$ per bar, for which

$$
\mathbb{E}\left[\,x_{t+h} - x_t \mid x_t\,\right] = \left(1 - \phi^{h}\right)\left(\ln 100 - x_t\right),
\qquad 1 - 0.92^{10} = 0.566 ,
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\phi$ | share of today's deviation from the mean kept after one bar | 0.92 in `range` |
| $\ln 100 - x_t$ | how far the log close is below the mean | stationary s.d. 0.038 |
| $1 - \phi^h$ | share of the deviation expected back after $h$ bars | 0.566 at $h = 10$ |

so a close one standard deviation (3.8 %) below the mean expects about $+2.2\,\%$ over 10 bars. %K is a proxy for
that deviation, and how good a proxy depends on the length. The deviation forgets itself with a time constant of
$1/(1-\phi) = 12.5$ bars, so a 14-bar window often lies entirely above or below the mean, and low %K then only says
"lower than the last two weeks". A 50-bar window (four time constants) spans most of the stationary range, and low
%K means "below the mean".

```lab
{"kind": "event", "indicator": "stoch", "output": "k", "op": "lt", "value": 20, "range": [5, 50], "horizon": 10, "scenario": "range"}
```

```lab
{"kind": "event", "indicator": "stoch", "params": {"k_length": 50}, "output": "k", "op": "lt", "value": 20, "range": [5, 50], "horizon": 10, "scenario": "range"}
```

Measured with seed 1 (1000 bars, 10-bar look-ahead, %K below 20):

| Scenario | %K length 14 | %K length 50 |
|---|---|---|
| `range` | +0.96 % (95 % interval −0.13 % to +2.06 %, n = 42) | +1.32 % (+0.16 % to +2.48 %, n = 26) |
| `random_walk` | −0.08 % (−1.38 % to +1.22 %, n = 47) | −0.21 % (−1.53 % to +1.11 %, n = 44) |
| `uptrend` | −0.19 % (−1.62 % to +1.23 %, n = 34) | −0.96 % (−2.65 % to +0.74 %, n = 20) |
| `reversal` | −1.06 % (−2.34 % to +0.21 %, n = 49) | −2.57 % (−3.81 % to −1.32 %, n = 38) |

On `range` the edge is positive for seeds 1–5 at both lengths, but at length 14 (+0.69 % to +1.78 %) the interval
clears zero only for seed 2, while at length 50 (+1.32 % to +3.33 %) it clears zero for all five. Moving the
threshold to 10 at length 14 raises the mean (+1.17 % to +1.88 %) but cuts n to 31–38, and the interval clears zero
for two seeds out of five. On `random_walk` the sign changes with the seed, as the identity above says. On
`reversal` the same rule loses: below 20 the price is falling, and in a trend falling prices keep falling
(−1.06 % to −1.68 % at length 14, negative for all five seeds). "Overbought" mirrors it: %K 14 above 80 is −1.48 %
(−2.45 % to −0.50 %, n = 46) on `range` but +1.95 % (+0.70 % to +3.21 %, n = 37) on `reversal`. The levels are a
mean-reversion rule, and it only works where the market mean-reverts.

**The cross alone is noise; the cross at a low level is the oversold rule, timed.** "%K crosses above %D" gives
about 70 counted episodes in 1000 bars on every scenario, anywhere in the range, and its edge is
indistinguishable from zero on all four scenarios for seeds 1–5. Requiring the cross below 20 keeps the oversold
condition and adds a "turning up" trigger:

```lab
{"kind": "combo", "scenario": "range", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "%K crosses above %D",
   "left": {"indicator": {"id": "stoch", "params": {}}, "output": "k"}, "op": "crosses_above",
   "right": {"indicator": {"id": "stoch", "params": {}}, "output": "d"}},
  {"label": "%K below 20", "left": {"indicator": {"id": "stoch", "params": {}}, "output": "k"},
   "op": "lt", "right": {"value": 20}},
  {"label": "%D below 20 (= slow %K below 20)",
   "left": {"indicator": {"id": "stoch", "params": {}}, "output": "d"}, "op": "lt", "right": {"value": 20}}
 ]}
```

With seed 1, on `range`: the cross alone −0.32 % (−1.19 % to +0.55 %, n = 72); %K below 20 alone +0.96 % (n = 42);
both (a cross above %D while %K is still below 20) +1.94 % (+0.39 % to +3.50 %, n = 19), positive for seeds 1–5
(+1.19 % to +2.26 %) with the interval above zero for four of them. %D below 20 alone, the smoother version of the
same idea, gives +1.69 % (+0.42 % to +2.96 %, n = 35), above zero for four seeds out of five. On `reversal` the
cross below 20 is −1.38 % (−3.02 % to +0.27 %, n = 28), negative for four seeds; on `random_walk` its sign varies.
One rule on one sample: not a backtest (no costs, no position sizing), not investment advice.

## Combine with
The Stochastic is a mean-reversion trigger, and the previous section shows that its sign flips with the regime. The
classic fix is a trend filter: buy oversold readings only in an uptrend (a pullback), so the trigger times entries
in the direction of the trend instead of fighting it.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Close above SMA 200", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 200}}, "output": "ma"}},
  {"label": "%D below 20", "left": {"indicator": {"id": "stoch", "params": {}}, "output": "d"},
   "op": "lt", "right": {"value": 20}},
  {"label": "%K crosses above %D",
   "left": {"indicator": {"id": "stoch", "params": {}}, "output": "k"}, "op": "crosses_above",
   "right": {"indicator": {"id": "stoch", "params": {}}, "output": "d"}}
 ]}
```

With seed 1, on `reversal`: close above SMA 200 alone +1.48 % (−0.05 % to +3.01 %, n = 36); %D below 20 alone
−1.55 % (−3.03 % to −0.07 %, n = 41); both together +1.14 % (−0.81 % to +3.09 %, n = 10). The filter does flip the
sign of the dip rule, but it leaves 10 episodes and an interval that spans zero; over seeds 1–5 the AND ranges from
−1.38 % to +1.41 % (n = 7 to 12), so the data cannot tell. Adding the cross leaves n = 9. On `range` the SMA 200
filter alone is negative for all five seeds (−1.04 % to −1.67 %, every interval below zero), and with it the dip
rule keeps only 6–11 episodes. This is the usual price of stacking rules: each filter is right about the regime but
removes most of the signals, and with ten episodes almost any number is noise. Not a backtest, not advice.

## Differences vs TradingView
- Same formula and defaults as TradingView's built-in (`ta.stoch` + `ta.sma`).
- TA-Lib's `STOCH` / `STOCHF` return 0 for a flat range; here (and in Pine) the value is empty.

## Pitfalls
- In a strong trend %K stays above 80 (or below 20) for a long time; it is not a reversal signal by itself.
- Uses highs and lows: the result depends on the bar type (Heikin Ashi bars give a different Stochastic).
- "Oversold" is common: on a pure random walk about one bar in five has %K below 20.
- The 14-bar default is short for a slow mean reversion: the window's range may not contain the mean at all.
- "Slow Stochastic" means %K smoothing 3; its %K is the fast version's %D, so do not count them as two signals.

## Exercise
1. In the first event lab (`range`), move the threshold from 20 to 10 and back, then switch to the length-50 lab:
   which changes n more, and which changes the interval more? Then set the scenario to `reversal`: why does the
   same rule turn negative? (Hint: what does a low %K say about the drift in a trend?)
2. In the cross lab, switch rule 1 off and rule 2 on (the cross while %D is below 20). Compare n and the edge with
   the cross while %K is below 20, and explain the difference with the slow %K identity.
3. Start Replay on NVDA on 3 January 2023, the first trading day of a year with a strong rally, with the default
   Stochastic. Step forward and count how long %K stays above 80 at a time, and what price did after each
   "overbought" reading. Relate it to the pinned-trend condition $(n-1)\,b > 3\,w$.

```lab
{"kind": "replay", "symbol": "NVDA", "date": "2023-01-03", "indicators": [{"id": "stoch", "params": {}}]}
```
