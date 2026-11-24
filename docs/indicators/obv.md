# On Balance Volume (`obv`)

Joe Granville's running total of volume: a bar's volume is added when it closes higher than the previous bar and
subtracted when it closes lower. People use it to see whether volume flows in on up bars or on down bars, and to spot
"accumulation": volume quietly favouring the up bars while the price still goes nowhere.

## What it measures
The question it answers: "over the last weeks, did more volume trade on up bars or on down bars?" Each bar votes with
its whole volume, in the direction of its close. Only changes of the line mean something: its level depends on the
bar where the sum started (proved in Formula), so the questions to ask are "is OBV higher than it was $k$ bars ago?"
and "did OBV rise while the price did not?".

OBV has no parameter, so there is no length slider here. Instead, this widget compares OBV with its own past, the one
kind of OBV rule that does not depend on the start date: "OBV above its value 20 bars ago", next to the same rule on
the close. The starting scenario is `accumulation`, the only one in which volume carries direction (100-bar cycles of
25 bars each: accumulation, markup, distribution, markdown; see Why it works). Watch the OBV pane rise during the
flat stretches before each markup.

```lab
{"kind": "combo", "scenario": "accumulation", "horizon": 25, "on": [0],
 "rules": [
  {"label": "OBV above its value 20 bars ago",
   "left": {"indicator": {"id": "obv", "params": {}}, "output": "obv"}, "op": "gt",
   "right": {"indicator": {"id": "obv", "params": {}}, "output": "obv", "ago": 20}},
  {"label": "Close above its value 20 bars ago", "left": {"price": "close"}, "op": "gt",
   "right": {"price": "close", "ago": 20}}
 ]}
```

With seed 1 (1000 bars, 25-bar look-ahead): OBV above its value 20 bars ago +3.73 % (95 % interval +1.80 % to
+5.65 %, n = 23); the same rule on the close +2.20 % (−1.28 % to +5.68 %, n = 24). For seeds 1–5 the OBV rule gives
+1.65 % to +3.79 % with the interval above zero for four of them, the close rule +0.76 % to +2.20 % with no interval
above zero: here the volume knows something the price does not.

## Formula

$$
\textcolor{#2962FF}{OBV_0} = 0, \qquad
\textcolor{#2962FF}{OBV_t} = \textcolor{#2962FF}{OBV_{t-1}} + u_t, \qquad
u_t = \operatorname{sign}(C_t - C_{t-1})\,V_t
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#2962FF}{OBV_t}$ | On Balance Volume at bar $t$ (the blue line) | shares, any sign, unbounded |
| $u_t$ | the bar's signed volume: $+V_t$ on an up close, $-V_t$ on a down close, 0 on an unchanged close | shares |
| $C_t$ | close of bar $t$ | price |
| $V_t$ | volume of bar $t$ | shares, $\ge 0$ |
| $\operatorname{sign}(\cdot)$ | $+1$, $-1$ or $0$ | — |

**The level depends on the start.** Let the sum start at bar $s$ instead of bar 0 (a tool with a shorter history, or
the lab's window of the last $N$ bars). Then

$$
\textcolor{#2962FF}{OBV^{(s)}_t} = \sum_{i=s+1}^{t} u_i = \textcolor{#2962FF}{OBV_t} - \textcolor{#2962FF}{OBV_s},
\qquad
\textcolor{#2962FF}{OBV^{(s)}_t} - \textcolor{#2962FF}{OBV^{(s)}_{t-k}} = \sum_{i=t-k+1}^{t} u_i
\quad (t - k \ge s)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#2962FF}{OBV^{(s)}_t}$ | OBV summed from bar $s$ on (0 at bar $s$) | shares |
| $s$ | the first bar of the history the sum sees | bar index |
| $\textcolor{#2962FF}{OBV_s}$ | a constant: the full-history OBV at bar $s$ | shares |
| $k$ | how many bars back a comparison looks | bars, e.g. 20 |

Starting later subtracts the constant $\textcolor{#2962FF}{OBV_s}$ from every value: the curve keeps its shape and
moves up or down as a whole. So the level, its sign and any comparison with a fixed number ("OBV above 0", "OBV
above 5 million") are arbitrary, while a difference over $k$ bars is the sum of the last $k$ signed volumes, the same
whatever the start. That is why this page has no `event` lab (it compares an output with a constant) and every rule
compares OBV with its own past. In the labs the sum starts at the first bar of the window (the last $N$ bars of a real
symbol), so the lab's OBV and the chart's differ by a constant.

## Kernel, lag and noise
Not a filter of the price: a cumulative sum (an integrator) of signed volume. It has no lag and no warm-up, and it
never forgets: every bar since the start of the history is in it. As a filter of $u$ its transfer function is
$H(z) = \frac{1}{1 - z^{-1}}$, a pole at $z = 1$ (infinite gain at zero frequency, which is why the level drifts
without bound). The $k$-bar difference used by the rules cancels that pole:

$$
\frac{1 - z^{-k}}{1 - z^{-1}} = \sum_{j=0}^{k-1} z^{-j}
\quad\Longleftrightarrow\quad
\textcolor{#2962FF}{OBV_t} - \textcolor{#2962FF}{OBV_{t-k}} = k\cdot\frac1k\sum_{j=0}^{k-1} u_{t-j}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $z^{-1}$ | one-bar delay | — |
| $1 - z^{-k}$ | the $k$-bar difference (a comb filter) | — |
| $\sum_{j<k} z^{-j}$ | a flat box of $k$ taps: $k$ times the SMA $k$ of $u$ | — |

So "OBV above its value $k$ bars ago" is "the SMA $k$ of signed volume is positive": a box filter with lag
$\frac{k-1}{2}$ bars (9.5 at $k = 20$), the same kernel as the [SMA](learn:sma#kernel-lag-and-noise).

## Defaults
No inputs.

## Warm-up
First valid bar index: 0.

## Filter view
Not offered (not a moving average).

## How to read it
- **Slope, not level:** a rising OBV means that, net, more volume traded on up closes than on down closes over that
  stretch; a falling one, the opposite. Read the slope over a window ($k$ bars) and compare it with the price over
  the same window.
- **Confirmation:** OBV and price rising together (or falling together) is the normal case: up closes move OBV up by
  definition. On a `random_walk` the 20-bar change of OBV and the 20-bar log return correlate at 0.86 (200 000 bars,
  seed 1; `uptrend` 0.84): mostly, OBV just retells the price.
- **Bullish divergence ("accumulation"):** OBV rises over $k$ bars while the close is flat or lower. The volume of the
  up bars outweighs the down bars although the up and down moves cancel: buyers absorb the supply without lifting
  the price, the reading goes.
- **Bearish divergence ("distribution"):** OBV falls while the close is flat or higher.
- **Breakouts of OBV:** Granville also watched OBV making a new high before the price did; it is the same idea as
  the divergence, on a longer window.
- **Units:** OBV is in shares, so its scale differs from symbol to symbol by orders of magnitude. Compare a symbol's
  OBV only with its own past, never with another symbol's OBV.

## Why it works
**Where the information comes from.** In the synthetic data, volume is

$$
V_t = 10^6\, e^{\,0.3\,\xi_t \,+\, 20\lvert r_t\rvert \,+\, 0.8\,k_t \operatorname{sign}(r_t)}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\xi_t$ | independent standard normal noise | — |
| $r_t$ | the bar's log return $\ln(C_t / C_{t-1})$ | about $\pm 0.01$ |
| $k_t$ | the phase flag: $+1$ in accumulation, $-1$ in distribution, 0 in every other phase and scenario | $-1, 0, +1$ |
| $20\lvert r_t\rvert$ | bigger moves trade more volume (a 2 % move: $e^{0.4} = 1.49$ times) | — |
| $e^{0.8}$ | how much more an up bar trades than a down bar in accumulation | 2.23 |

*Volume without direction ($k_t = 0$, every scenario but `accumulation`).* Then
$u_t = \operatorname{sign}(r_t)\,10^6 e^{0.3\xi_t + 20\lvert r_t\rvert}$ is a function of the bar's own return and of
noise independent of everything else: OBV's whole history is a function of past returns plus noise. On a random walk
the future returns are independent of both, so for every OBV rule
$\mathbb E[x_{t+h} - x_t \mid \textcolor{#2962FF}{OBV}_{\le t}] = h\mu$, the same as after any bar: no edge, exactly.
In a market whose price path has structure (a trend that flips, a range), an OBV rule can only pick up what the price
path already shows, because OBV is built from it; a price rule gets the same information directly.

*Volume with direction ($k_t = \pm 1$).* In accumulation and distribution $\mu = 0$, so $\operatorname{sign}(r_t)$
is $\pm 1$ with probability $\frac12$ each and independent of $\lvert r_t\rvert$. With
$A = 10^6\,\mathbb E[e^{0.3\xi}]\,\mathbb E[e^{20\lvert r\rvert}]$:

$$
\frac{\mathbb E[u_t]}{\mathbb E[V_t]}
= \frac{A\left(\tfrac12 e^{0.8k_t} - \tfrac12 e^{-0.8k_t}\right)}{A\left(\tfrac12 e^{0.8k_t} + \tfrac12 e^{-0.8k_t}\right)}
= \tanh(0.8\,k_t) = \pm 0.664
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\mathbb E[u_t] / \mathbb E[V_t]$ | the expected OBV step as a share of the average volume: a volume-weighted "up share" minus "down share" | $-1$ to $+1$ |
| $A$ | the common factor of noise and move size; it cancels | shares |
| $\tanh$ | hyperbolic tangent | $\tanh(0.8) = 0.664$ |

Measured on 400 000 bars of `accumulation` (seed 1): +0.664 in accumulation, −0.665 in distribution, and only +0.29
in markup and −0.29 in markdown, where it comes from the drift alone. Over a 25-bar accumulation phase OBV gains 26.5
million shares on average while the close moves −0.03 %; over the markup that follows it gains only 9.4 million while
the close rises 10 %. OBV climbs fastest exactly when the price is flat. The phase is a hidden state: accumulation and
distribution look the same in the price (flat, $\sigma = 0.008$), and the phase also sets the drift of the next 25
bars. OBV reveals the state; the price does not. That, and nothing else, is what an OBV edge needs.

**The divergence as a rule.** A bullish divergence over 20 bars is "OBV above its value 20 bars ago" AND "close below
its value 20 bars ago". With seed 1, the raw signal bars fall 134 in accumulation phases and 30 in the first bars of
markup (when the close is still below its level of 20 bars before), none in distribution or markdown.

```lab
{"kind": "combo", "scenario": "accumulation", "horizon": 25, "on": [0, 1],
 "rules": [
  {"label": "OBV above its value 20 bars ago",
   "left": {"indicator": {"id": "obv", "params": {}}, "output": "obv"}, "op": "gt",
   "right": {"indicator": {"id": "obv", "params": {}}, "output": "obv", "ago": 20}},
  {"label": "Close below its value 20 bars ago", "left": {"price": "close"}, "op": "lt",
   "right": {"price": "close", "ago": 20}},
  {"label": "OBV below its value 20 bars ago",
   "left": {"indicator": {"id": "obv", "params": {}}, "output": "obv"}, "op": "lt",
   "right": {"indicator": {"id": "obv", "params": {}}, "output": "obv", "ago": 20}},
  {"label": "Close above its value 20 bars ago", "left": {"price": "close"}, "op": "gt",
   "right": {"price": "close", "ago": 20}}
 ]}
```

With seed 1 on `accumulation` (25-bar look-ahead): both rules together +3.34 % (+1.37 % to +5.31 %, n = 12, hit rate
0.83 vs 0.44 for any bar); the close rule alone −1.60 % (−4.63 % to +1.42 %, n = 27). For seeds 1–5 the divergence
gives +2.58 % to +4.64 %, the interval above zero for four of them: a markup follows. The same pair on the other
scenarios, seed 1:

| Scenario | Bullish divergence (OBV up, close down over 20 bars), 25 bars ahead |
|---|---|
| `random_walk` | +1.75 % (−1.68 % to +5.18 %, n = 18) |
| `uptrend` | −1.24 % (−3.62 % to +1.14 %, n = 15) |
| `range` | −0.10 % (−1.55 % to +1.35 %, n = 20) |
| `reversal` | −1.15 % (−5.81 % to +3.51 %, n = 15) |
| `shock` | +2.52 % (−1.03 % to +6.07 %, n = 18) |
| `volatility_regime` | +2.24 % (−2.47 % to +6.96 %, n = 18) |

This is the honest null: over these six scenarios and seeds 1–5 (30 samples), three intervals exclude zero, with
opposite signs (`uptrend` +3.34 % and −3.70 %, `reversal` −5.63 %), about the 1.5 that a 95 % interval lets through
by chance. Where volume carries no direction, the divergence is noise. The same holds on hourly bars: with
`"interval": "1h"` the U-shaped intraday volume multiplies every bar's volume by its hour's factor, but the sign
information survives (seed 1: +3.06 %, +1.10 % to +5.03 %, n = 13 on `accumulation`; +0.66 %, n = 20 on
`random_walk`).

The bearish mirror is rules 3 and 4 of the lab (switch 1 and 2 off): OBV below its value 20 bars ago while the
close is above its own. It fires mostly in distribution phases (124 of 165 signal bars with seed 1). Its edge on
`accumulation` is negative for seeds 1–5 (−0.54 % to −6.81 %, n = 12 to 16), but the interval excludes zero only for
seeds 4 and 5: a weaker result on this sample size.

Do real markets have a $k_t$? The model assumes informed buyers who trade more on up bars before a rise; whether a
given stock has such a phase is exactly what the chart cannot tell you in advance. The labs on a real symbol give one
sample each; judge the interval, not the point estimate. One rule on one sample: not a backtest (no costs, no
position sizing), sensitive to multiple testing (every window, horizon and scenario you try is another test), and not
investment advice.

## Combine with
A trend filter on the price says where the price is; OBV says on which side the volume was. The classic reading puts
them together: rising OBV under a price that is still below its average is accumulation; rising OBV with the price
above its average is confirmation. Switch between rules 1 and 2:

```lab
{"kind": "combo", "scenario": "accumulation", "horizon": 25, "on": [0, 1],
 "rules": [
  {"label": "OBV above its value 20 bars ago",
   "left": {"indicator": {"id": "obv", "params": {}}, "output": "obv"}, "op": "gt",
   "right": {"indicator": {"id": "obv", "params": {}}, "output": "obv", "ago": 20}},
  {"label": "Close below SMA 50", "left": {"price": "close"}, "op": "lt",
   "right": {"indicator": {"id": "sma", "params": {"length": 50}}, "output": "ma"}},
  {"label": "Close above SMA 50", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 50}}, "output": "ma"}}
 ]}
```

With seed 1 on `accumulation` (25 bars ahead): Close below SMA 50 alone −1.71 % (−5.06 % to +1.65 %, n = 25); with
OBV rising +4.08 % (+1.30 % to +6.87 %, n = 14; seeds 1–5 +2.82 % to +4.72 %, the interval above zero for three).
OBV flips the sign of the weak-price rule. Now switch the scenario to `reversal` (a trend up, then down, volume
without direction): Close below SMA 50 alone −4.28 % (−7.70 % to −0.85 %, n = 23) and with OBV rising −4.05 %
(−10.23 % to +2.14 %, n = 13; negative for seeds 1–4, three intervals below zero). The same pair, the opposite
result: rising OBV in a downtrend is just a bounce, and the trend wins. With rule 3 instead, OBV and price agree; on
`reversal` that pair gains +4.03 % (+0.53 % to +7.54 %, n = 20) with seed 1 and clears zero for seeds 1–5, but Close
above SMA 50 alone already gives +3.08 % there: the price trend does the work, OBV only repeats it.

So combine OBV with a price trend filter, and expect OBV to add something only where volume leads price. The
[Volume SMA](learn:volume-sma) answers the other volume question, "how much?", and the
[Combining indicators](learn:combinations) page explains why AND-ing rules costs episodes. Not a backtest, not
advice.

## Differences vs TradingView
- Same as TradingView's built-in (`ta.obv`, 0 on the first bar). TA-Lib starts at $V_0$ instead, a constant offset.

## Pitfalls
- The level depends on where the history starts: two tools with different history give curves that differ by a
  constant. ChartLab always computes it over the whole loaded history, so values do not change when older bars load.
  The lab widgets start at their first bar, so their level differs from the chart's.
- Never compare OBV with a fixed number or with another symbol's OBV; compare it with its own past.
- A bar's whole volume counts with the sign of a close-to-close change, however small: a +0.01 % bar adds as much as
  a +5 % bar of the same volume, and an unchanged close adds nothing.
- On hourly bars the first and last bar of a session carry most of the volume (43 % in the synthetic U shape; 42 % on
  SPY's hourly bars, January 2024 to November 2026), so OBV moves mostly at the open, where the overnight gap decides
  the sign, and at the close.
- In most markets OBV mostly retells the price (correlation 0.86 with the 20-bar return on a random walk). A
  "confirmation" by OBV is rarely independent evidence.
- Divergences happen on pure noise all the time; a few memorable ones on a chart are not evidence.
- Symbols without volume (forex, some indices) give a flat line at 0.

## Exercise
1. In the first lab, switch the scenario to `random_walk` and press the new-sample button five times. How often does
   the OBV rule's interval exclude zero, and how often should it if volume carries no direction? Then switch the
   data picker to hourly bars: does the U-shaped intraday volume destroy the signal on `accumulation`, and why not?
2. In the divergence lab, switch to the bearish pair (rules 3 and 4) on `accumulation` and find the signal markers on
   the chart. In which phase of the 100-bar cycle do they sit, and what follows them? Why does the bullish pair
   sometimes fire in the first bars of a markup?
3. Start Replay on NVDA on 3 January 2023 with OBV and SMA 50, and step towards the late-May 2023 earnings gap. Did
   OBV rise faster than the price in the weeks before the gap, or did it simply move with it?

```lab
{"kind": "replay", "symbol": "NVDA", "date": "2023-01-03",
 "indicators": [{"id": "obv", "params": {}}, {"id": "sma", "params": {"length": 50}}],
 "steps": ["Step forward a week at a time and compare the OBV slope with the price slope over the last month.",
           "Mark any stretch where OBV rose while the close stayed flat or fell (a bullish divergence).",
           "Continue past the late-May 2023 gap and look for the opposite pattern later in the year."],
 "reveal": "Most of the time OBV and the price move together, because up closes add volume by definition. A divergence that preceded a big move looks convincing afterwards; count the divergences that were followed by nothing as well."}
```
