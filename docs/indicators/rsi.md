# Relative Strength Index (`rsi`)

Wilder's [momentum](glossary:momentum) [oscillator](glossary:oscillator): the share of recent average gains in average gains plus losses, from 0 to 100. Optional
smoothing average and Bollinger Bands on the RSI. People use it to judge whether the recent movement was mostly up or
mostly down, as a trend filter (above or below 50) and as a pullback or "[oversold](glossary:oversold)" trigger (below 30 or 40).

## What it measures
The question it answers: "of all the recent price movement, what share went up?" It smooths the up moves and the down
moves separately with Wilder's average and reports the up share in percent. 50 means the smoothed gains and losses
balance; 70 means 70 % of the smoothed movement was up. It ignores the price level and the size of the moves; only
their direction and relative size count, so an RSI of 70 on a quiet stock and on a wild one mean the same thing.

Move the length on a [random walk](glossary:random-walk): a short RSI swings across the whole 0–100 range, a long one stays near 50. Why
Wilder's 70 and 30 suit exactly the length 14 is worked out in Why it works.

```lab
{"kind": "param", "indicator": "rsi", "vary": "length", "min": 2, "max": 50, "scenario": "random_walk"}
```

## Formula
Up and down moves of the source $x$ (close by default), each smoothed with Wilder's average $\mathrm{RMA}_n$:

$$
U_t = \max(x_t - x_{t-1},\, 0), \qquad D_t = \max(x_{t-1} - x_t,\, 0), \qquad
\textcolor{#2962FF}{\bar U_t} = \mathrm{RMA}_n(U)_t, \qquad \textcolor{#F23645}{\bar D_t} = \mathrm{RMA}_n(D)_t
$$

$$
\mathrm{RMA}_n(y)_t = \mathrm{RMA}_n(y)_{t-1} + \frac{y_t - \mathrm{RMA}_n(y)_{t-1}}{n},
\qquad \mathrm{RMA}_n(y)_n = \frac1n \sum_{i=1}^{n} y_i,
\qquad H(z) = \frac{\alpha}{1 - p\,z^{-1}},\quad \alpha = \frac1n,\quad p = 1 - \frac1n
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $x_t$ | the source (close by default) at bar $t$ | price |
| $U_t,\ D_t$ | the up move and the down move of bar $t$ (at least one of them is 0) | price per bar, $\ge 0$ |
| $\textcolor{#2962FF}{\bar U_t},\ \textcolor{#F23645}{\bar D_t}$ | average gain and average loss | price per bar, $\ge 0$ |
| $n$ | length | bars, 1–5000 (default 14) |
| $\mathrm{RMA}_n$ | Wilder's smoothing (the `smma` indicator), seeded with the SMA of the first $n$ changes | same units as its input |
| $H(z)$ | its transfer function, $z^{-1}$ = one-bar delay | — |
| $\alpha,\ p$ | step and pole | $\frac1n$ and $1 - \frac1n$ ($0.0714$ and $0.9286$ at $n = 14$) |

The ratio of the two averages, with Pine's edge cases, in this order:

$$
\textcolor{#7E57C2}{\mathrm{RSI}_t} =
\begin{cases}
100 & \textcolor{#F23645}{\bar D_t} = 0 \\
0 & \textcolor{#2962FF}{\bar U_t} = 0 \\
100 - \dfrac{100}{1 + \textcolor{#2962FF}{\bar U_t} / \textcolor{#F23645}{\bar D_t}}
= 100\,\dfrac{\textcolor{#2962FF}{\bar U_t}}{\textcolor{#2962FF}{\bar U_t} + \textcolor{#F23645}{\bar D_t}} & \text{otherwise}
\end{cases}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#7E57C2}{\mathrm{RSI}_t}$ | the RSI at bar $t$ (the purple line) | 0–100 |
| $\textcolor{#2962FF}{\bar U_t} / \textcolor{#F23645}{\bar D_t}$ | Wilder's "relative strength" $RS$ | $0$ to $\infty$ |

The two forms are the same algebra: $100 - \frac{100}{1 + RS} = 100\,\frac{RS}{1 + RS}$; multiply by
$\textcolor{#F23645}{\bar D_t}$. A perfectly flat window ($\bar U = \bar D = 0$) gives 100, as in Pine.

Optional smoothing and bands on the RSI:

$$
\textcolor{#F9A825}{M_t} = \mathrm{MA}^{\text{type}}_m(\textcolor{#7E57C2}{\mathrm{RSI}})_t,
\qquad
\textcolor{#089981}{B^{\pm}_t} = \textcolor{#F9A825}{M_t} \pm k\,\sigma_m(\textcolor{#7E57C2}{\mathrm{RSI}})_t
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#F9A825}{M_t}$ | the RSI-based MA (`rsi_ma`, the yellow line), seeded on the first RSI values | 0–100 |
| $\mathrm{MA}^{\text{type}}_m$ | the chosen average (any of the 15 MA types) of length $m$ | — |
| $m$ | smoothing length | bars, default 14 |
| $\textcolor{#089981}{B^{\pm}_t}$ | upper and lower band (`bb_upper`, `bb_lower`, green) | RSI points |
| $k$ | band width (BB StdDev) | default 2 |
| $\sigma_m(\cdot)$ | population standard deviation of the last $m$ RSI values | RSI points |

## Kernel, lag and noise
The RSI is not a linear filter, but it is one linear filter divided by another. Since $U_t - D_t = \Delta x_t$ and
$U_t + D_t = \lvert\Delta x_t\rvert$, and the [RMA](glossary:rma) (seed included) is linear,
$\textcolor{#2962FF}{\bar U} - \textcolor{#F23645}{\bar D} = \mathrm{RMA}_n(\Delta x)$ and
$\textcolor{#2962FF}{\bar U} + \textcolor{#F23645}{\bar D} = \mathrm{RMA}_n(\lvert\Delta x\rvert)$. Hence, exactly:

$$
\textcolor{#7E57C2}{\mathrm{RSI}_t} = 50 + 50\,\frac{\mathrm{RMA}_n(\Delta x)_t}{\mathrm{RMA}_n(\lvert\Delta x\rvert)_t}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\Delta x_t$ | close-to-close change $x_t - x_{t-1}$ | price per bar |
| $\mathrm{RMA}_n(\Delta x)_t$ | smoothed signed change: the one-bar slope of the SMMA $n$ of the close | price per bar |
| $\mathrm{RMA}_n(\lvert\Delta x\rvert)_t$ | smoothed absolute change, a volatility scale | price per bar, $> 0$ |

So $\mathrm{RSI} - 50$ is a smoothed slope divided by a smoothed volatility, scaled to $\pm 50$: an "efficiency" of
the recent move (net movement per unit of total movement). Measured: the identity holds to $3\times10^{-14}$ on every
bar of a $10^6$-bar random walk. Both averages are the RMA $n$ filter: [lag](glossary:lag) $n - 1$ bars (13 at the default) and noise
reduction $\frac{1}{2n-1}$, the same filter as an EMA of length $2n - 1$ (see the SMMA page). The denominator moves
slowly, so in practice the RSI behaves like that low-pass filter applied to the price changes and normalised by
volatility: on a random walk, RSI 14 and $50 + 50\sqrt{\pi/2}\,\mathrm{RMA}_{14}(\Delta x)/\sigma$ correlate at
0.990 (RMS difference 1.7 RSI points). A longer length therefore gives a calmer, slower RSI that stays nearer 50.

**One bar at a time.** Writing the two recursions out and subtracting gives an exact update rule:

$$
\textcolor{#7E57C2}{\mathrm{RSI}_t} = \textcolor{#7E57C2}{\mathrm{RSI}_{t-1}}
+ w_t\left(100\cdot\mathbf{1}[\Delta x_t > 0] - \textcolor{#7E57C2}{\mathrm{RSI}_{t-1}}\right),
\qquad
w_t = \frac{\lvert\Delta x_t\rvert}{n\,\mathrm{RMA}_n(\lvert\Delta x\rvert)_t}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\mathbf{1}[\Delta x_t > 0]$ | 1 on an up bar, 0 on a down bar | 0 or 1 |
| $w_t$ | step of this bar: its size relative to $n$ times the typical size | 0–1 (median 0.065, at most 0.28 on 1000 `range` bars at $n = 14$) |

The RSI is an adaptive EMA of an "up bar?" flag: every up bar pulls it towards 100, every down bar towards 0, and a
big bar pulls harder. So the RSI rises on every up close and falls on every down close (unless it is already at 100
or 0); measured, the sign of the RSI's change equals the sign of the close's change on all 985 bars of every scenario
(seed 1). It never turns before the close does.

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 14 | Wilder's and TradingView's default |
| Source | close | TradingView default |
| Smoothing | None | TradingView default |
| Smoothing length | 14 | TradingView default |
| Bollinger Bands on the smoothing | off | TradingView default |
| BB StdDev | 2 | TradingView default |

Levels 70 / 50 / 30.

## Warm-up
First valid bar index: $n$ (the first change needs one earlier bar, and the RMA seeds on the first $n$ changes), i.e.
14. The smoothing starts at $n + w_{\text{type}}(m)$ (27 for SMA 14), the bands at $n + m - 1$.

## Filter view
The RSI itself has no Filter view (it is a ratio, so superposition fails), but its two averages do: they are the RMA
of length $n$, i.e. `smma` with the same length. This is the filter inside RSI 14, measured by running the real code:

```lab
{"kind": "filter", "indicator": "smma", "params": {"length": 14}}
```

- **Impulse:** geometric stems $0.0714, 0.0663, 0.0616, \dots$ (ratio $13/14$), about 125 of them above $10^{-4}$ of
  the first. A big down day keeps weighing on $\bar D$ for weeks: after 14 bars it still carries $(13/14)^{14} = 35\%$
  of its first weight, after 28 bars 12.5 %.
- **Step:** $1 - (13/14)^{k+1}$; it passes 90 % only on the 32nd bar.
- **Lag and noise:** lag 13.00 bars, NRF 0.03704 ($= 1/27$), as for EMA 27 or SMA 27.
- **Magnitude:** monotone, no nulls: −0.72 dB at 200 bars, −2.34 dB at 100, −5.85 dB at 50, −12.75 dB at 20,
  −18.46 dB at 10, −28.63 dB at 2; the half-power (−3 dB) period is 84.7 bars.
- **[Group delay](glossary:group-delay):** 10.9 bars at 200 (tending to 13), zero at 16.5 bars, −0.481 at 2.

Applied to price changes, this low-pass is the same as a first-order high-pass on the price itself
($\frac{\alpha(1 - z^{-1})}{1 - p z^{-1}}$, zero gain at DC): a constant price level is invisible to the RSI, only the
changes count.

## How to read it
- **Above / below 50:** the smoothed gains exceed the smoothed losses. By the identity above,
  $\mathrm{RSI}_{n} > 50 \iff \mathrm{RMA}_n(\Delta x) > 0 \iff$ the SMMA $n$ of the close is rising $\iff$ the
  close is above the SMMA $n$ (SMMA page). The 50 line is a Wilder trend filter with lag $n - 1$, not extra
  information.
- **70 / 30 ([overbought](glossary:overbought) / oversold):** the recent move was unusually one-sided: at 70, 70 % of the smoothed movement
  was up. For length 14 these levels are about the 5 % tails of a random walk (Why it works); for other lengths the
  same rarity sits at other levels.
- **Trend vs range:** in a trend the RSI lives on one side of 50 and can stay above 70 (or below 30) for weeks; in a
  range it oscillates around 50 and, because the moves cancel, rarely reaches the outer levels at all.
- **Slope and turns:** the RSI moves in the direction of the bar's close (one bar at a time, above), so its peaks
  and troughs sit on the close's own turning bars. What the RSI adds is the height of a peak: how one-sided the
  move into it was. Failure swings and [divergences](glossary:divergence) compare those heights (Why it works).
- **Length:** a shorter RSI is jumpier and reaches the levels more often; a longer one is smoother, later and nearer
  50. Levels must move with the length.
- **Smoothing and bands:** the RSI crossing its MA is a change of sign of $\mathrm{RSI} - M$, a momentum of the
  momentum. The bands replace fixed 70 / 30 by levels that adapt to the RSI's own recent spread.

## Why it works
**Bounded by construction.** $U_t, D_t \ge 0$ and the RMA has only positive weights ($\alpha p^k$ and the seed's
$\frac1n$), so $\textcolor{#2962FF}{\bar U}, \textcolor{#F23645}{\bar D} \ge 0$ and
$\frac{\bar U}{\bar U + \bar D} \in [0, 1]$: the RSI is always in $[0, 100]$, whatever the price, the volatility or
the length. The ends are reached only when one side is exactly zero, and the RMA never forgets completely: after the
first down move $\bar D > 0$ forever (it decays as $p^k$), so a long run of gains drives the RSI towards 100 only
geometrically and the extremes are approached, not hit.

**The distribution on a random walk.** Let the changes be independent with mean $\mu$ and standard deviation
$\sigma$ (normal). The denominator $\mathrm{RMA}_n(\lvert\Delta x\rvert)$ is close to its mean
$\mathbb{E}\lvert\Delta x\rvert = \sigma\sqrt{2/\pi}$ (its own NRF is $\frac{1}{2n-1}$), while the numerator
$\mathrm{RMA}_n(\Delta x)$ has mean $\mu$ and variance $\frac{\sigma^2}{2n-1}$. Put into the identity:

$$
\textcolor{#7E57C2}{\mathrm{RSI}_t} \;\approx\; \mathcal N\!\left(50 + 50\sqrt{\tfrac{\pi}{2}}\,\frac{\mu}{\sigma},\;
s_n^2\right),
\qquad
s_n = \frac{50\sqrt{\pi/2}}{\sqrt{2n-1}} \approx \frac{62.7}{\sqrt{2n-1}}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\mu,\ \sigma$ | mean and standard deviation of one bar's change | price per bar |
| $\mathcal N(m, s^2)$ | normal distribution with mean $m$ and variance $s^2$ | — |
| $s_n$ | standard deviation of the RSI of length $n$ | RSI points, 12.1 at $n = 14$ |
| $\sqrt{2/\pi}$ | $\mathbb{E}\lvert Z\rvert$ for a standard normal $Z$ | 0.798 |

Centred on 50 for a driftless walk, and the spread shrinks like $1/\sqrt{2n-1}$: quadrupling the length roughly halves
it. Measured on a $10^6$-bar driftless random walk (seed 1; at length 14, seeds 2–5 agree within 0.1 points):

| Length $n$ | sd measured | $s_n$ | % of bars above 70 (below 30) | 5 % / 95 % quantiles |
|---|---|---|---|---|
| 2 | 31.4 | 36.2 | 33.5 % (33.5 %) | 3.3 / 96.7 |
| 5 | 19.9 | 20.9 | 17.9 % (17.9 %) | 17.4 / 82.6 |
| 7 | 16.8 | 17.4 | 12.8 % (12.8 %) | 22.3 / 77.7 |
| 10 | 14.1 | 14.4 | 8.2 % (8.1 %) | 26.8 / 73.2 |
| 14 | 11.9 | 12.1 | 4.6 % (4.7 %) | 30.4 / 69.6 |
| 20 | 9.9 | 10.0 | 2.1 % (2.1 %) | 33.6 / 66.4 |
| 30 | 8.1 | 8.2 | 0.57 % (0.63 %) | 36.6 / 63.4 |
| 50 | 6.3 | 6.3 | 0.05 % (0.06 %) | 39.6 / 60.4 |

The approximation is good from $n \approx 7$ on; for very short lengths the denominator is itself noisy and the RSI
piles up near the ends (RSI 2 is above 90 on 13.5 % of the bars).

**Why 70 / 30.** Wilder chose the levels from experience, but the table shows what they mean: at length 14, 70 and 30
are almost exactly the 95 % and 5 % quantiles of a random walk (69.6 and 30.4). "Overbought" at RSI 14 means "a move
as one-sided as the most extreme 5 % of pure chance". The same rarity at length $n$ sits near
$50 \pm 1.645\,s_n \approx 50 \pm 103/\sqrt{2n-1}$: about 73 / 27 at length 10, 66 / 34 at 20, 60 / 40 at 50. With
fixed 70 / 30, RSI 2 is "overbought" a third of the time and RSI 50 almost never, which is why short-RSI systems use
levels such as 90 / 10.

**Drift and [mean reversion](glossary:mean-reversion) move the distribution.** A drift shifts the centre by $50\sqrt{\pi/2}\,\mu/\sigma$: +1.25
points for `random_walk` ($\mu = 0.0003$, $\sigma = 0.015$; measured 51.2 on 200 000 bars) and +7.8 for `uptrend`
($\mu = 0.0015$, $\sigma = 0.012$), where RSI 14 is above 70 on 6 %–22 % of the bars (seeds 1–5). On `range` (an
Ornstein–Uhlenbeck process, AR coefficient 0.92) the changes are negatively autocorrelated, so the numerator's
smoothed sum partly cancels: its variance at $n = 14$ is 0.51 of the random-walk value, and the spread drops to about
8.4 points (measured 8.39 on 400 000 bars). There RSI 14 is below 30 on only 0.0 %–1.2 % of the bars and below 40 on
9.5 %–14.2 % (seeds 1–5). The paradox: the market where oversold signals should work is the one where the classic
level is almost never reached.

**When an oversold signal can have an [edge](glossary:edge).** On a random walk the future changes are independent of everything
known at $t$, RSI included, so $\mathbb{E}[x_{t+h} - x_t \mid \mathrm{RSI}_t] = h\mu$, the same as after any bar: the
edge is zero at every level and length. On `range` the expected move is towards the centre,
$\mathbb{E}[x_{t+h} - x_t \mid x_t] = -\bigl(1 - 0.92^h\bigr)(x_t - \ln 100)$ (57 % of the gap closes within 10 bars),
and a low RSI means price has just fallen, usually below the centre: a positive edge. In a trend that flips
(`reversal`) a low RSI marks the down half, where the drift continues: a negative edge.

```lab
{"kind": "event", "indicator": "rsi", "output": "rsi", "op": "lt", "value": 30, "range": [5, 50],
 "horizon": 10, "scenario": "range"}
```

Measured with seed 1 (1000 bars, 10-bar look-ahead), RSI 14 below the level:

| Scenario | Below 30 | Below 35 | Below 40 |
|---|---|---|---|
| `range` | +5.35 % (95 % interval −0.34 % to +11.37 %, n = 3) | +1.52 % (−1.53 % to +4.68 %, n = 7) | +2.30 % (+0.74 % to +3.88 %, n = 25) |
| `random_walk` | −1.32 % (−3.80 % to +1.22 %, n = 10) | −0.80 % (−2.96 % to +1.42 %, n = 23) | −0.55 % (−1.99 % to +0.91 %, n = 39) |
| `uptrend` | −0.06 % (−1.49 % to +1.40 %, n = 4) | −1.01 % (−2.97 % to +0.99 %, n = 10) | −1.29 % (−3.30 % to +0.75 %, n = 17) |
| `reversal` | −3.32 % (−4.90 % to −1.72 %, n = 24) | −2.67 % (−4.17 % to −1.15 %, n = 32) | −2.31 % (−3.59 % to −1.01 %, n = 40) |

At 30 the range signal fires 0–4 times in 1000 bars (seeds 1–5): far too few to conclude anything. At 40 it is
positive for seeds 1–5 (+1.33 % to +3.00 %, hit rate 0.59–0.75 vs about 0.50 for any bar), with the interval above
zero for four of them. On `random_walk` the intervals contain zero for every level at seeds 1, 3, 4 and 5; at 30,
seed 2 clears zero (+2.67 %, n = 8) by chance, which a 95 % interval allows once in twenty tries. On `reversal` the
rule loses for seeds 1–5 at 40 (−1.40 % to −2.37 %, all intervals below zero): buying "oversold" in a downtrend. On
`uptrend` (constant drift) the intervals at 35 and 40 contain zero for seeds 1–5: there is no regime to detect (at
30 only 1 to 5 signals fire, and two of those tiny samples clear zero, one upwards and one downwards).

The usual trigger waits for the RSI to leave the oversold zone, a one-bar event:

```lab
{"kind": "event", "indicator": "rsi", "output": "rsi", "op": "crosses_above", "value": 30, "range": [5, 50],
 "horizon": 10, "scenario": "reversal"}
```

With seed 1, RSI 14 crossing above 30: `reversal` −3.89 % (−6.11 % to −1.62 %, n = 12; negative for seeds 1–5, the
interval below zero for three), `random_walk` −0.67 % (−3.12 % to +1.83 %, n = 9), `range` n = 3. Crossing above 40
on `range`: +1.00 % (−0.68 % to +2.71 %, n = 24), positive for seeds 1–5 (+0.59 % to +2.29 %) but with the interval
above zero only for seed 2. The cross comes after the bounce has started, so part of the reversion (which is
proportional to the remaining gap) is already gone: on this sample it is weaker than the plain "below 40" state.

**Failure swings and divergences.** Wilder's *failure swing* at a top: the RSI rises above 70, falls back to a low
(the failure point), rises again without exceeding its first peak, then breaks below the failure point; at a bottom
the mirror image below 30. A *bearish divergence*: price makes a higher high while the RSI makes a lower high (bullish:
lower low in price, higher low in RSI). By the identity, a lower RSI peak at a higher price means the last few weeks'
net move per unit of total movement was smaller: the rally became less efficient. That is a statement about the past
window, not a forecast, and it happens by chance all the time: on a 200 000-bar driftless random walk (seed 2), of
the bars that make a new 50-bar high with an earlier 50-bar high 5 to 50 bars before, 47 % have a lower RSI 14 than
at the earlier high, so about 30 "bearish divergences" per 1000 bars with, by independence, exactly zero edge. The
labs compare values on the same bar, so they cannot test these patterns; this page makes no claim that they predict.
Study them in Replay (Exercise) and count the misses as well as the hits.

One rule on one sample: not a backtest (no costs, no position sizing), sensitive to [multiple testing](glossary:multiple-testing) (every level
and scenario you try is another test), and not investment advice.

## Combine with
The RSI is a pullback detector, and a pullback is only worth buying if the bigger trend is still up. The classic
stack: a slow trend filter (close above SMA 200), the RSI dip as the trigger, and a sign that the dip has turned as
the confirmation (close back above a short average such as SMA 5). Do not use RSI above 50 as the filter for an RSI
dip: it is the SMMA 14 trend filter and contradicts the trigger.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Close above SMA 200", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 200}}, "output": "ma"}},
  {"label": "RSI 14 below 40", "left": {"indicator": {"id": "rsi", "params": {}}, "output": "rsi"},
   "op": "lt", "right": {"value": 40}},
  {"label": "Close above SMA 5", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 5}}, "output": "ma"}}
 ]}
```

With seed 1, on `reversal`: Close above SMA 200 alone +1.49 % (−0.05 % to +3.06 %, n = 36); RSI 14 below 40 alone
−2.31 % (−3.59 % to −1.01 %, n = 40); both together +0.92 % (−0.90 % to +2.76 %, n = 6). The filter does its job,
it removes the dips of the falling half where the trigger loses, but only six episodes remain, and for seeds 2–5 the
AND gives −0.89 %, +0.68 %, −2.76 % and −1.82 % (n = 5 to 7, every interval containing zero). Adding the
confirmation leaves n = 1; Close above SMA 5 alone is within ±0.6 % of zero on `reversal`, `range`, `uptrend` and
`random_walk` (seeds 1–5). On `range` the SMA 200 filter alone is negative (−1.29 %, −2.33 % to −0.25 %, n = 51;
below zero for seeds 1–5) and it rarely agrees with a dip (n = 0 to 3 for the AND); on `uptrend` and `random_walk`
(seed 1) no rule and no AND clears zero.

The stack is built for one market structure: a persistent long trend with short pullbacks that mean-revert. None of
the six scenarios has both properties at once (a constant drift has independent pullbacks, the range has no trend),
so the lab mainly shows the cost of stacking rules: the episodes run out. Try the same block on a real symbol with
2000 bars and judge the interval, not the point estimate. Not a backtest, not advice.

## Differences vs TradingView
- Same formula, seeding and edge cases as TradingView's built-in (`ta.rsi`, a perfectly flat window gives 100). TA-Lib
  returns 0 there.
- TradingView's smoothing choices are SMA, "SMA + Bollinger Bands", EMA, SMMA (RMA), WMA and VWMA; here any of the 15
  types, and the bands are a separate switch that works with any of them.

## Pitfalls
- The RMA remembers its seed for a long time ($e^{-k/n}$): the first few hundred bars of a history differ between tools
  that start at different dates. The compute endpoint loads $25n$ extra bars so shown values do not depend on it.
- In a strong trend the RSI stays above 70 (or below 30) for weeks; overbought is not a sell signal by itself.
- 70 / 30 belong to length 14. At other lengths they mean a different rarity (a third of all bars at length 2, almost
  none at 50).
- In a range, where oversold signals make the most sense, RSI 14 rarely reaches 30: check $n$ before reading an edge,
  and consider 35–40.
- "RSI 14 above 50" and "close above SMMA 14" are the same rule; combining them adds nothing.
- "Length 14" is Wilder's 14: the averages behave like an EMA(27), lag 13 bars.
- Divergences and failure swings are common on pure noise; a few memorable ones on a chart are not evidence.

## Exercise
1. In the first event lab (`range`), move the threshold from 30 to 40 and watch $n$ and the interval. Then switch the
   scenario to `random_walk` and press the new-sample button a few times: how often does an interval exclude zero,
   and how often should it, if there is no edge?
2. In the length lab, on `random_walk`, set the length to 2, 14 and 50. Count roughly how often the line is beyond
   70 or 30 and compare with the table in Why it works. Which levels would make RSI 50 as "rare" as 70 / 30 is for
   RSI 14?
3. Start Replay on SPY on 19 February 2020, the record close before the COVID crash, with RSI 14 and SMA 200. Step
   through the following weeks: on which bar did the RSI first fall below 30, and did the decline stop there? Keep
   going past the March low: look for a bullish divergence or a failure swing, then for one that did not work
   elsewhere in the same year.

```lab
{"kind": "replay", "symbol": "SPY", "date": "2020-02-19",
 "indicators": [{"id": "rsi", "params": {}}, {"id": "sma", "params": {"length": 200}}]}
```
