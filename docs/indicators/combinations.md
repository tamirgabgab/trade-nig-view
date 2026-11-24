# Combining indicators

Why one indicator is rarely enough, what each indicator in a combination should do, and the arithmetic of requiring
two or three conditions at once: what an AND gains (a higher conditional mean), what it costs (fewer cases, a wider
interval), and why a combination found by trying many of them must be distrusted. Every number on this page was
measured with the backend's one implementation: the per-sample numbers with the labs below (which recompute them on
any scenario, sample or real symbol), the pooled ones over 200 synthetic samples of a scenario.

## Why combine
An indicator is a function of past bars. A rule built on it ("RSI 14 below 40", "close above SMA 200") is an event
$A_t$: true or false at bar $t$, using only bars up to $t$. What a trader wants to know is what the price did *after*
such bars, compared with after any bar:

$$
r_t = \ln\frac{C_{t+h}}{C_t},
\qquad
\mathrm{edge}(A) = \mathbb{E}\left[r_t \mid A_t\right] - \mathbb{E}\left[r_t\right].
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $r_t$ | forward log return from bar $t$ to bar $t+h$ ($\times 100 \approx$ %) | about $-0.15$ to $+0.15$ for $h = 10$ |
| $C_t$ | close at bar $t$ | price |
| $h$ | look-ahead (horizon) | bars, 10 in the labs |
| $A_t$ | the rule is true at bar $t$ | true / false |
| $\mathbb{E}[r_t \mid A_t]$ | mean forward return after the bars where the rule is true | log return |
| $\mathbb{E}[r_t]$ | mean forward return after any bar (the baseline) | log return |
| $\mathrm{edge}(A)$ | what the rule adds over an average bar | log return, 0 = no information |

A rule has an [edge](glossary:edge) only if the past says something about the future. On a [random walk](glossary:random-walk) the increments are independent
of the past, so $\mathbb{E}[r_t \mid \text{anything known at } t] = h\mu$ for every rule and every combination of
rules: no indicator, and no AND of indicators, can create information that is not in the price process. On a market
with structure the right question decides which indicator helps: *which regime are we in* (a trend filter), *when
does a move start* (a trigger), *do other measurements agree* (a confirmation). One indicator answers one of these
questions; a strategy needs several, and combining indicators is conditioning on more than one of them.

Tightening a single rule is already a kind of AND. Move the threshold of this event lab on `range` (a
[mean-reverting](glossary:mean-reversion) market around 100): the lower the threshold, the deeper the dip that is required, the fewer the cases.

```lab
{"kind": "event", "indicator": "rsi", "output": "rsi", "op": "lt", "value": 40, "range": [20, 60],
 "horizon": 10, "scenario": "range"}
```

With seed 1 on `range` (1000 bars, 10-bar look-ahead):

| RSI 14 below | n | Edge | 95 % interval |
|---|---|---|---|
| 50 | 70 | +1.02 % | +0.16 % to +1.87 % |
| 45 | 46 | +1.37 % | +0.26 % to +2.47 % |
| 40 | 25 | +2.27 % | +0.73 % to +3.80 % |
| 35 | 7 | +1.51 % | −1.54 % to +4.57 % |
| 30 | 3 | +5.21 % | −0.34 % to +10.77 % |

The edge grows as the dip gets deeper (with noise: 35 is below 40 here), the count collapses, and the interval
widens until it says nothing. At 30, the textbook level, this sample has only three cases. On `random_walk` the same
rule at 40 gives −0.55 % (−2.01 % to +0.90 %, n = 39): no edge, as it must be. Every combination on this page faces
the same trade-off.

## Three roles: filter, trigger, confirmation
A combination works best when each part has a different job:

| Role | What kind of condition | Examples | Share of bars ($P$, `reversal`, seed 1) |
|---|---|---|---|
| Trend filter | a state that lasts for months | close above SMA 200; EMA 50 above EMA 200 | 0.489; 0.509 |
| Trigger | a one-bar event | RSI 14 crosses above 30; MACD histogram crosses above 0; close crosses above EMA 20 | 0.028; 0.037; 0.043 |
| Confirmation | a state checked on the trigger bar | MACD above 0; Stochastic %K above %D | 0.370; 0.505 |

(Shares over bars 200 to 989 of the 1000-bar sample, after the 200-bar [warm-up](glossary:warm-up) of the slowest rule.)

- The **filter** chooses the regime in which the rest of the rule is meant to work. It is true for long stretches,
  so it removes about half of the bars, not most of them.
- The **trigger** times the entry. It is rare by construction: a cross is true on one bar.
- The **confirmation** asks a second, different measurement whether it agrees at that moment. Here
  $\textcolor{#2962FF}{\mathrm{MACD}} = \mathrm{EMA}_{12} - \mathrm{EMA}_{26}$, so "MACD above 0" is the state
  "EMA 12 above EMA 26", a faster trend test than the SMA 200 ([lag](glossary:lag) 5.5 and 12.5 bars against 99.5). The histogram
  $\textcolor{#26A69A}{\mathrm{hist}} = \textcolor{#2962FF}{\mathrm{MACD}} - \textcolor{#FF6D00}{\mathrm{signal}}$
  crossing above 0 is the MACD line crossing above its signal line: [momentum](glossary:momentum) turning up.

Roles can fight each other. "Close above SMA 200" AND "RSI 14 crosses above 30" has $n = 0$ on `reversal`, `range`
and `random_walk` (seed 1): in a market that holds above its 200-bar average, RSI rarely falls to 30 at all. A filter
and a deep-[oversold](glossary:oversold) trigger ask for opposite things.

This lab starts with the filter and the trigger on; switch the confirmation on, then try other scenarios:

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Filter: close above SMA 200", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 200}}, "output": "ma"}},
  {"label": "Trigger: MACD histogram crosses above 0",
   "left": {"indicator": {"id": "macd", "params": {}}, "output": "hist"},
   "op": "crosses_above", "right": {"value": 0}},
  {"label": "Confirmation: MACD above 0",
   "left": {"indicator": {"id": "macd", "params": {}}, "output": "macd"},
   "op": "gt", "right": {"value": 0}}
 ]}
```

With seed 1 on `reversal` (up for 500 bars, then down):

| Rules on | n | Edge | 95 % interval |
|---|---|---|---|
| Filter alone | 36 | +1.48 % | −0.05 % to +3.01 % |
| Trigger alone | 34 | −0.28 % | −1.79 % to +1.23 % |
| Confirmation alone | 45 | +2.02 % | +0.94 % to +3.10 % |
| Filter AND trigger | 14 | +2.16 % | +0.26 % to +4.06 % |
| All three | 9 | +3.43 % | +1.68 % to +5.19 % |

The trigger alone has no edge: a MACD turn happens as often after the top as before it. Behind the filter it picks
the turns of the up half. For seeds 1–5 the filter AND trigger stays positive (+1.13 % to +3.52 %, n = 8 to 14, two
of the five intervals include zero) and all three rules give +2.43 % to +4.14 % (n = 5 to 10). On `range` the same
pair is negative (−1.74 %, −3.37 % to −0.11 %, n = 21, seed 1): a trend rule in a mean-reverting market buys near
the top of the range. The next section shows how much of the all-three figure is real.

## The mathematics of AND
**Counting.** For two rules $A$ and $B$,

$$
P(A \wedge B) = P(A)\,P(B \mid A),
\qquad
N_{A \wedge B} \approx N\,P(A)\,P(B \mid A),
\qquad
\mathrm{lift} = \frac{P(A \wedge B)}{P(A)\,P(B)}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $P(A)$ | share of bars on which rule $A$ is true | 0–1 |
| $P(B \mid A)$ | share of the $A$ bars on which $B$ is also true | 0–1; 1 if $A \Rightarrow B$ |
| $N$ | bars in the sample | bars, 1000 in the labs |
| $N_{A \wedge B}$ | bars on which both are true | bars, never more than $\min(N_A, N_B)$ |
| $\mathrm{lift}$ | how much more often both fire than if they were independent | 1 = independent, $\gg 1$ = overlapping, 0 = exclusive |

Adding a rule can only keep or remove bars, never add them: $P(B \mid A) \le 1$.

**What the AND buys.** Split the $A$ bars into those with and without $B$ (law of total expectation):

$$
\mathbb{E}[r \mid A] = P(B \mid A)\,\mathbb{E}[r \mid A \wedge B] + \bigl(1 - P(B \mid A)\bigr)\,\mathbb{E}[r \mid A \wedge \neg B].
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\mathbb{E}[r \mid A \wedge B]$ | mean forward return when both rules are true | log return |
| $\mathbb{E}[r \mid A \wedge \neg B]$ | mean forward return when $A$ is true and $B$ is not | log return |
| $\neg B$ | "not $B$" | — |

$\mathbb{E}[r \mid A]$ is a weighted average of the two parts, so $B$ raises the mean only if it separates the
better $A$ cases from the worse ones. Three cases follow:

- **$B$ carries no information beyond $A$** (given $A$, $B$ is independent of $r$): then
  $\mathbb{E}[r \mid A \wedge B] = \mathbb{E}[r \mid A]$. The edge stays the same and the count is multiplied by
  $P(B \mid A)$. Example: on `range`, "RSI 14 below 40" and "Stochastic %K crosses above %D" fire almost
  independently (seed 1: $P(B \mid A) = 0.205$, lift 0.97). `range` is an AR(1) process, so the expected future
  depends only on the distance from the centre: $\mathbb{E}[x_{t+h} - x_t \mid \text{past}] = -\bigl(1 - (1-\theta)^h\bigr)(x_t - \ln 100)$
  with $\theta = 0.08$. A timing trigger can add something only by picking deeper dips, and it does not: pooled over
  200 samples, the mean 10-bar return after RSI 14 below 40 is +2.68 %, after both +2.75 %. The number of signal
  bars fell by a factor of five for 0.07 percentage points.
- **$B$ is redundant** ($A \Rightarrow B$, or the two are the same rule written twice): $P(B \mid A) = 1$ and
  $A \wedge B = A$. Nothing changes, not even $n$. "RSI 14 above 50" is "close above SMMA 14" (see the next section
  and the SMMA page); "close above an EMA" is "EMA rising" (EMA page), and the same holds for McGinley.
- **$B$ is complementary**: it splits $A$ into a good and a bad part. On `reversal` the expected return is bounded:
  the drift is $\pm\mu$ with $\mu = 0.0025$ per bar, so for any rule
  $\mathbb{E}[r_t \mid \text{past}] \le h\mu = 2.50\,\%$ (in log terms), reached only by a rule that is certain to be
  in the up half. The slow SMA 200 filter stays true for many bars after the top; MACD above 0 turns off much sooner.
  Pooled over 200 samples, the mean 10-bar return after the signal is +1.61 % for the filter alone, +1.83 % with the
  trigger, +2.05 % with the confirmation instead of the trigger and +2.27 % with all three (the trigger alone −0.07 %). The AND climbs
  towards the ceiling.

**What the AND costs.** The lab's interval is the edge $\pm 1.96$ [standard errors](glossary:standard-error):

$$
\mathrm{se} = \frac{s}{\sqrt n},
\qquad
t = \frac{\mathrm{edge}}{\mathrm{se}} = \frac{\mathrm{edge}\,\sqrt n}{s},
\qquad
\frac{t_{A \wedge B}}{t_A} = \frac{\mathrm{edge}_{A \wedge B}}{\mathrm{edge}_A}\,\sqrt{\frac{n_{A \wedge B}}{n_A}}\;\frac{s_A}{s_{A \wedge B}}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $n$ | counted cases (at most one per $h + 1$ bars, so the forward windows do not overlap) | 0 to about 90 in the labs |
| $s$ | standard deviation of the forward returns after the signal | about 3–6 % for $h = 10$ |
| $\mathrm{se}$ | standard error of the mean | log return |
| $t$ | edge in units of its standard error; $\lvert t \rvert > 1.96$ = interval excludes 0 | — |
| $\mathrm{edge}_A,\ n_A,\ s_A$ | the same quantities for rule $A$ alone; subscript $A \wedge B$ for both rules | as above |

Halving $n$ widens the interval by $\sqrt 2 \approx 1.41$, so the edge must grow by the same factor just to keep
$t$. With seed 1:

| Scenario | Rules | n | Edge | $s$ | 95 % interval | $t$ |
|---|---|---|---|---|---|---|
| `reversal` | Close above SMA 200 | 36 | +1.48 % | 4.68 % | −0.05 % to +3.01 % | 1.90 |
| `reversal` | + MACD histogram crosses above 0 | 14 | +2.16 % | 3.62 % | +0.26 % to +4.06 % | 2.23 |
| `reversal` | + MACD above 0 | 9 | +3.43 % | 2.69 % | +1.68 % to +5.19 % | 3.83 |
| `range` | RSI 14 below 40 | 25 | +2.27 % | 3.92 % | +0.73 % to +3.80 % | 2.90 |
| `range` | + Stoch %K crosses above %D | 13 | +2.96 % | 4.18 % | +0.69 % to +5.23 % | 2.56 |
| `random_walk` | Close above SMA 200 | 32 | +0.94 % | 5.30 % | −0.90 % to +2.78 % | 1.00 |
| `random_walk` | + MACD histogram crosses above 0 | 11 | −0.12 % | 4.77 % | −2.94 % to +2.70 % | −0.08 |
| `random_walk` | + MACD above 0 | 7 | +0.86 % | 5.73 % | −3.39 % to +5.10 % | 0.40 |

Read the table with the pooled truths above:

- On `reversal`, from the filter alone to all three rules, $n$ falls to a quarter ($q = n_{A \wedge B}/n_A = 0.25$,
  so $1/\sqrt q = 2$) while the edge grows by 2.32 and $s$ falls: $t$ rises from 1.90 to 3.83. For the pair the edge
  grows less than needed (1.46 against 1.60) and $t$ rises only because $s$ falls. The pooled means say the
  combination is real. But the single sample overshoots. The all-three edge of +3.43 % is a mean return of +2.78 %
  after the signal (the average bar here returned −0.65 %), above the 2.50 % that any rule can earn on this
  scenario. With $n = 9$ an estimate can land far from the truth, and the extreme ones are the ones people remember.
- On `range` the edge rises by a factor of 1.30 while $n$ halves ($1/\sqrt{q} = 1.39$ needed): $t$ falls, the
  interval widens from 3.1 to 4.5 percentage points. Over 200 samples the gain is 0.07 points: the seed-1 rise is
  mostly noise.
- On `random_walk` nothing survives: every interval contains zero, and for seeds 1–5 none of the 14 rule sets of the
  Three roles and Try it labs (each subset of their three rules) excludes zero.

## Try it
A range strategy: an oversold level, a timing trigger and a third rule that looks like a filter. RSI and the
trigger are on; switch on the third rule, change the scenario, press the new-sample button:

```lab
{"kind": "combo", "scenario": "range", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Level: RSI 14 below 40",
   "left": {"indicator": {"id": "rsi", "params": {}}, "output": "rsi"},
   "op": "lt", "right": {"value": 40}},
  {"label": "Trigger: Stoch %K crosses above %D",
   "left": {"indicator": {"id": "stoch", "params": {}}, "output": "k"},
   "op": "crosses_above", "right": {"indicator": {"id": "stoch", "params": {}}, "output": "d"}},
  {"label": "Filter: close below SMA 50", "left": {"price": "close"}, "op": "lt",
   "right": {"indicator": {"id": "sma", "params": {"length": 50}}, "output": "ma"}}
 ]}
```

With seed 1 on `range`: RSI 14 below 40 alone +2.27 % (+0.73 % to +3.80 %, n = 25), the Stochastic cross alone
−0.32 % (−1.19 % to +0.55 %, n = 72), close below SMA 50 alone +1.06 % (+0.21 % to +1.92 %, n = 63), the first two
together +2.96 % (+0.69 % to +5.23 %, n = 13), all three +2.67 % (+0.28 % to +5.06 %, n = 12).

- For seeds 1–5 the pair beats RSI alone in four samples of five (+1.28 % to +3.69 %, n = 11 to 18), which looks
  convincing until you remember the pooled +0.07 points above.
- The third rule removes one case and moves the edge by a few tenths: it is implied by the first (next section).
- On `reversal` the pair is −2.08 % (−3.84 % to −0.32 %, n = 29): buying dips in a falling market. On
  `random_walk` it is +0.08 % (−1.60 % to +1.77 %, n = 29).

## Redundant vs complementary indicators
Two rules are redundant when they mark the same bars: exactly (an identity), by implication ($A \Rightarrow B$,
$P(B \mid A) = 1$), or nearly (a lift far above 1 with $P(B \mid A)$ close to 1). Many popular pairs are redundant
because the indicators are built from the same few averages of the same closes.

**RSI above 50 is close above the SMMA.** With $U_t = \max(\Delta x_t, 0)$ and $D_t = \max(-\Delta x_t, 0)$,
$U_t - D_t = \Delta x_t$, and Wilder's average is linear, so (apart from the seed bars)

$$
\textcolor{#7E57C2}{RSI_t} > 50
\iff \mathrm{RMA}_n(U)_t > \mathrm{RMA}_n(D)_t
\iff \textcolor{#AB47BC}{R_t} > \textcolor{#AB47BC}{R_{t-1}}
\iff x_t > \textcolor{#AB47BC}{R_t}
\iff x_t > \textcolor{#FF6D00}{E^{(2n-1)}_t}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#7E57C2}{RSI_t}$ | RSI of length $n$ at bar $t$ | 0–100 |
| $U_t,\ D_t$ | the up move and the down move of bar $t$ (one of them is 0) | price per bar, $\ge 0$ |
| $\Delta x_t$ | close-to-close change $x_t - x_{t-1}$ | price per bar |
| $\mathrm{RMA}_n(\cdot)$ | Wilder smoothing, step $\frac1n$ | same units as its input |
| $\textcolor{#AB47BC}{R_t}$ | SMMA $n$ of the close (Wilder's average) | price |
| $x_t$ | close at bar $t$ | price |
| $\textcolor{#FF6D00}{E^{(2n-1)}_t}$ | EMA of length $2n-1$ of the close, the same recursion as the SMMA $n$ | price |

The third step is the slope rule of every one-pole average ($R_t - R_{t-1} = \frac1n(x_t - R_{t-1})$ and
$x_t - R_t = (1 - \frac1n)(x_t - R_{t-1})$ have the same sign); the last is "SMMA $n$ = EMA $2n-1$" (SMMA page). For
$n = 14$ the three rules below are one rule. Measured with seed 1: they agree on every bar from bar 62 on, in all six
scenarios; before that the different seeds of the averages make a few bars differ.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "RSI 14 above 50", "left": {"indicator": {"id": "rsi", "params": {}}, "output": "rsi"},
   "op": "gt", "right": {"value": 50}},
  {"label": "Close above SMMA 14", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "smma", "params": {"length": 14}}, "output": "ma"}},
  {"label": "Close above EMA 27", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "ema", "params": {"length": 27}}, "output": "ma"}}
 ]}
```

With seed 1 on `reversal`: RSI 14 above 50 +1.57 % (+0.48 % to +2.66 %, n = 51), close above SMMA 14 +1.55 %
(n = 51), close above EMA 27 +1.85 % (+0.69 % to +3.01 %, n = 49); the first two together +1.73 % (n = 50), all
three +1.73 % (n = 49). The small differences are not information: a state is sampled every $h + 1 = 11$ bars from
its first true bar, and the three rules start on slightly different bars during the warm-up, so the counted bars
shift. Bar by bar the shares are identical: $P = 0.404$ for each and for their AND (bars 150 to 989). The "second
opinion" is the first opinion again.

Other redundant pairs measured on `reversal`, seed 1:

- **Implication.** Every bar with close above SMA 200 also had EMA 50 above EMA 200 ($P(B \mid A) = 1.000$, lift
  1.97). Across 18 samples (six scenarios, seeds 1–3), every bar with RSI 14 below 40 after the SMA 50 warm-up had
  close below SMA 50: a close far enough below its short average to push RSI under 40 is below the 50-bar mean too.
  That is why the third rule in Try it changes almost nothing. This is an empirical regularity, not a theorem.
- **A confirmation that always agrees.** On 94 % of the bars where close crosses above EMA 20, Stochastic %K is
  already above %D (lift 1.86): both measure the same up-move of the last few bars, so the "confirmation" filters
  out almost nothing.
- **Same averages.** "MACD above 0" is "EMA 12 above EMA 26"; "MACD histogram above 0" is "MACD above signal".
  Adding both forms of one condition adds nothing.

**Complementary** rules fire roughly independently (lift near 1, so the AND does not just repeat one of them) *and*
the second one is informative inside the first. Lift alone is not enough: the range trigger above has lift 0.97 and
adds nothing. Look for differences in input or time scale: a slow trend measure with a fast timing measure, price
with volume (`obv`, `vwap`), a level with volatility (`atr`, `bb`). Then measure the conditional mean, as in the
previous section.

## Overfitting and multiple testing
A 95 % interval excludes zero in 5 % of samples when the true edge is zero. Test $k$ rules and keep the best:

$$
P(\text{at least one false discovery}) = 1 - (1 - \alpha)^k,
\qquad
\alpha_{\mathrm{Bonferroni}} = \frac{\alpha}{k}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\alpha$ | chance of a false "significant" result per test | 0.05 for a 95 % interval |
| $k$ | number of rules (and parameter settings, scenarios, samples) tried | 1 to hundreds |
| $\alpha_{\mathrm{Bonferroni}}$ | per-test level that keeps the chance of any false discovery below $\alpha$ | $\alpha / k$ |

The first formula assumes independent tests; the Bonferroni bound holds for any dependence.

| $k$ | $1 - 0.95^k$ | $\alpha / k$ | $\lvert t \rvert$ needed (normal) |
|---|---|---|---|
| 1 | 5 % | 5 % | 1.96 |
| 3 | 14 % | 1.67 % | 2.39 |
| 7 | 30 % | 0.71 % | 2.69 |
| 14 | 51 % | 0.36 % | 2.91 |
| 20 | 64 % | 0.25 % | 3.02 |

A combo lab with three rules is seven tests (every non-empty subset), before the scenario, the sample and the
horizon are changed.

**An honest search.** The 14 rule sets of the Three roles and Try it labs (the seven subsets of each), on
`random_walk`, seeds 1 to 20: 280 tests where the true edge is exactly zero. Five intervals excluded zero
(1.8 %), in four of the 20 samples (seeds 6, 8, 16 and 20). That is fewer than 5 % per test and fewer than the 51 % per sample of independent
tests, because the 14 sets share their rules, and because the mean after the signal and the mean of the baseline
share the sample's own drift, which the interval does not account for (over 100 samples, $t$ of "close above SMA
200" has a standard deviation of 0.76, not 1). But it is not zero. The best one, seed 20:

| Rules on (seed 20, `random_walk`) | n | Edge | 95 % interval | $t$ |
|---|---|---|---|---|
| MACD histogram crosses above 0 | 29 | +0.12 % | −1.68 % to +1.92 % | 0.13 |
| MACD above 0 | 35 | +1.59 % | −0.06 % to +3.25 % | 1.89 |
| Both | 6 | +4.59 % | +2.39 % to +6.79 % | 4.08 |
| Both, and close above SMA 200 | 5 | +3.95 % | +1.73 % to +6.18 % | 3.48 |

Five of the six cases went up. A trader who found this would call it a strategy; on a random walk it is noise. Two
checks expose it:

- **Small $n$.** The interval uses the normal distribution, which is wrong for six values. Student's $t$ with
  $n - 1 = 5$ degrees of freedom needs 2.57 instead of 1.96, and turns $t = 4.08$ into $p \approx 0.0095$ instead of
  $0.00005$. That fails the Bonferroni level for $k = 14$ (0.0036). With fewer cases it gets absurd: "RSI 14 crosses
  above 30" on `uptrend`, seed 2, has $n = 2$, interval +0.37 % to +0.49 %, $t = 14.1$. An interval from two numbers
  means nothing.
- **A new sample.** Over 100 `random_walk` samples this pair's interval is above zero in 2 and below zero in 1, and
  pooled over 200 samples the mean return after it is +0.31 % against +0.29 % after any bar ($h\mu = 0.30$ %). Seed
  21 happens to look good too (+2.49 %, +0.46 % to +4.53 %, n = 17), seeds 22 to 24 do not: two in a row is still
  chance.

Press the new-sample button 19 times to reach seed 20, then keep going:

```lab
{"kind": "combo", "scenario": "random_walk", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "MACD histogram crosses above 0",
   "left": {"indicator": {"id": "macd", "params": {}}, "output": "hist"},
   "op": "crosses_above", "right": {"value": 0}},
  {"label": "MACD above 0", "left": {"indicator": {"id": "macd", "params": {}}, "output": "macd"},
   "op": "gt", "right": {"value": 0}},
  {"label": "Close above SMA 200", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 200}}, "output": "ma"}}
 ]}
```

Defences, in order of strength: write the rule down *before* looking (and count every variant you try as $k$);
require a mechanism (a regime that persists, a mean that pulls) and check it on the scenario that has it and on
`random_walk`, where the edge must vanish; demand more cases, not more conditions; confirm on new samples and real
symbols you did not use to find the rule; distrust the best of many, because it is the one most inflated by luck.

## Recipes
Each recipe states the market it assumes. None of them is a strategy: the labs are [event studies](glossary:event-study), not backtests
(no costs, no exits, no position sizing); a per-sample number is one rule on one sample, and the pooled numbers come
from synthetic markets built to have the property the recipe needs. Real prices may have it or not. Nothing here is
investment advice.

| Recipe | Filter | Trigger | Confirmation | Assumes | What the labs show |
|---|---|---|---|---|---|
| Trend momentum | close above SMA 200 | MACD histogram crosses above 0 | MACD above 0 | a trend that persists (`reversal`) | pooled +2.27 % vs +1.61 % for the filter alone (ceiling 2.50 %); negative on `range` |
| Trend pullback | EMA 50 above EMA 200 | Stoch %K crosses above %D | — | a trend with dips | on `reversal`, seeds 1–5, slightly above the filter alone (+1.05 % to +2.05 % vs +0.79 % to +1.52 %, n = 25 to 33) |
| Range reversion | RSI 14 below 40 (the level) | Stoch %K crosses above %D | — | prices pulled back to a mean (`range`) | RSI alone carries it (pooled +2.68 %); the cross adds 0.07 points and halves $n$ |

Rules of thumb:

- One indicator per role, from different families: a slow average for the regime, an [oscillator](glossary:oscillator) or a cross for the
  timing, a different measurement (MACD sign, volume, volatility) for the confirmation.
- Check redundancy before you add a rule: the identities above, or simply the AND's $n$ in a combo lab. If $n$ barely
  falls, the new rule repeats an old one; if it falls to almost nothing, the roles fight (close above SMA 200 with
  RSI crossing above 30).
- Check $n$ before the edge. Below about 20 cases the interval is wide and its normal approximation poor.
- Every rule must lose its edge on `random_walk`. If it keeps one, something is wrong (a bug, [look-ahead](glossary:lookahead) or luck).
- Count your tests, and take the scenario that should not work as seriously as the one that should.

## Exercise
1. In the Three roles lab, switch all three rules on and move from `reversal` to `uptrend`, `range` and
   `random_walk`. Explain each sign with the ceiling $h\mu$ and the AR(1) formula. On `uptrend` the drift is constant:
   why can no combination have an edge there, even though most of its signals are followed by gains?
2. In the Try it lab, switch on the third rule and watch $n$. Then estimate $P(B \mid A)$ for "close below SMA 50"
   given the first two rules from the counts the lab shows, and explain why the third rule is not a filter here.
3. In the [Overfitting](glossary:overfitting) lab, press the new-sample button ten times with both rules on. Count the samples whose interval
   excludes zero, and compare with $1 - 0.95^{10}$ for ten independent tests of one rule.
4. Start Replay on SPY on 19 February 2020, the last record close before the COVID crash, with SMA 200, MACD and RSI.
   Step forward and note every MACD histogram cross above 0 while the close is below the SMA 200 (the filter blocks
   it), then the first bar on which all three rules of the Three roles lab are true again. How many bars after the
   low does the filter let a trade through, and what does that cost compared with the trigger alone?

```lab
{"kind": "replay", "symbol": "SPY", "date": "2020-02-19",
 "indicators": [{"id": "sma", "params": {"length": 200}}, {"id": "macd", "params": {}}, {"id": "rsi", "params": {}}]}
```
