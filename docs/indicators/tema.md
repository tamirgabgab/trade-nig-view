# Triple Exponential Moving Average (`tema`)

Mulloy's TEMA (1994) combines three cascaded EMAs so that the first and second moments of the [kernel](glossary:kernel) both cancel. It
tracks straight lines and parabolas with zero error. It is the fastest member of the EMA family here and also the
noisiest.

## What it measures
The question it answers: "where is the trend level now, correcting for both the EMA's [lag](glossary:lag) and the bend of the
trend?" It is the trend level, tracking both slope and curvature with no steady-state error. It reacts to turns
fastest of the EMA family. It also chases noise most and overshoots after sharp moves.

Move the length on `shock`: after the −15 % [gap](glossary:gap) the TEMA dives past the new level, swings back above it and only
then settles; the longer the length, the slower and wider the swing.

```lab
{"kind": "param", "indicator": "tema", "vary": "length", "min": 2, "max": 100, "scenario": "shock"}
```

## Formula
$$
\textcolor{#EC407A}{T_t} = 3\textcolor{#FF6D00}{E^{(1)}_t} - 3E^{(2)}_t + E^{(3)}_t, \qquad \textcolor{#FF6D00}{E^{(1)}} = \mathrm{EMA}_n(x),\; E^{(k+1)} = \mathrm{EMA}_n\big(E^{(k)}\big),
\qquad \alpha = \frac{2}{n+1}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#EC407A}{T_t}$ | the TEMA at bar $t$ (the pink line) | price |
| $\textcolor{#FF6D00}{E^{(1)}}$ | EMA of the source, the plain EMA line | price |
| $E^{(2)},\ E^{(3)}$ | EMA of the EMA, and EMA of that (not plotted) | price |
| $x$ | the source (close by default) | price |
| $n$ | length of all three EMAs | bars, 1–5000 (default 9) |
| $\alpha$ | EMA [smoothing factor](glossary:smoothing-factor) | 0–1 (0.2 at $n = 9$) |

Not to be confused with a triple-smoothed EMA ($E^{(3)}$ alone, the basis of TRIX).

## Kernel, lag and noise
With $E(z) = \frac{\alpha}{1-\beta z^{-1}}$ and $\beta = 1-\alpha$, the binomial theorem gives

$$
H(z) = 3E - 3E^2 + E^3 = 1 - \big(1 - E(z)\big)^3, \qquad 1 - E(z) = \frac{\beta\,(1-z^{-1})}{1-\beta z^{-1}}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $E(z)$, $H(z)$ | transfer functions of one EMA and of the TEMA | — |
| $\beta$ | EMA pole, $1 - \alpha$ | 0–1 |
| $z^{-1}$ | one-bar delay | — |

$1 - H$ has a **triple zero** at $z = 1$, so the first two derivatives of $H$ at $z = 1$ vanish. Equivalently, the first
and second moments of the kernel are zero:

$$
\sum_k k\,h_k = 0, \qquad \sum_k k^2 h_k = 0, \qquad \sum_k k^3 h_k = 6L^3, \qquad L = \frac{n-1}{2}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $h_k$ | TEMA weight of the bar $k$ bars ago | — , changes sign twice |
| $L$ | the EMA's lag | bars, $\frac{n-1}{2}$ |

So a ramp **and** a parabola $x_t = ct^2$ pass through unchanged. The first error term is cubic: on $x_t = ct^3$ the
output is $x_t - 6cL^3$ (384c at $n = 9$).

The cascaded kernels are $\alpha\beta^k$, $\alpha^2(k+1)\beta^k$ and $\alpha^3\frac{(k+1)(k+2)}{2}\beta^k$, so

$$
h_k = \alpha\beta^k\Big(3 - 3\alpha(k+1) + \tfrac{\alpha^2}{2}(k+1)(k+2)\Big).
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $k$ | age of a bar | bars, $\ge 0$ |
| $\alpha,\ \beta$ | EMA factor and pole | 0–1 |

The bracket is a quadratic in $r = k+1$, whose roots solve $r^2 - (3n+2)\,r + \tfrac32(n+1)^2 = 0$. The kernel therefore
changes sign **twice**: positive, then negative, then positive again. At $n = 9$ the roots are $r = 6.74$ and $22.26$,
so taps $k = 6\ldots21$ are negative (total $-0.164$) and the tail from $k = 22$ on is positive again ($+0.017$). This
double sign change is why the [step response](glossary:step-response) rings: it overshoots, then undershoots, then settles.

**Noise.** Summing $h_k^2$ in closed form:

$$
\mathrm{NRF} = \frac{33n^4 - 54n^3 + 44n^2 - 18n + 3}{8n^5} \;\to\; \frac{4.125}{n}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\mathrm{NRF}$ | [noise reduction factor](glossary:noise-reduction-factor), $\sum_k h_k^2$ | — , 0.3822 at $n = 9$ |

At $n = 9$ this is $7523/19683 = 0.3822$, which is 3.44 times the EMA's 0.111 and 1.5 times DEMA's 0.254. Each
extra moment you cancel costs more noise variance.

**Low-frequency view.** With the cumulant expansion from the DEMA page, TEMA has $\kappa_1 = \kappa_2 = 0$ and
$\kappa_3 = 6L^3 > 0$. The [group delay](glossary:group-delay) is therefore $\tau(\omega) \approx -3L^3\omega^2$. That is **negative**: TEMA leads
slow cycles slightly, by $-0.15$ bars at $P = 200$ ($-0.19$ predicted to leading order). The gain bump comes from the
positive $\omega^4$ term.

| $n = 9$ (measured) | EMA | DEMA | TEMA |
|---|---|---|---|
| Lag (bars) | 4.00 | 0 | 0 |
| NRF | 0.111 | 0.254 | 0.382 |
| Step peak / dip | 1 / none | 1.107 / none | 1.147 at bar 5 / 0.983 at bar 21 |
| Peak gain | none (below 0 dB) | +0.956 dB | +1.53 dB at $P \approx 26$ |
| $-3$ dB period | 28 bars | 12 bars | 8 bars |

For long lengths the step peak tends to about 1.205 and the dip to about 0.976.

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 9 | TradingView default |
| Source | close | TradingView default |
| Offset | 0 | Display shift (bars to the right); adds that many bars of lag |

## Warm-up
First valid bar index: $3(n-1)$, which is 24 at $n = 9$. Each nested EMA is SMA-seeded on the first $n$ valid values of
the previous one.

## Filter view
- **Impulse:** stems start at $h_0 = \alpha(3 - 3\alpha + \alpha^2) = 0.488$ and fall through zero between $k = 5$ and
  $6$. A negative lobe follows (minimum $-0.0215$ at $k = 9$), and a faint positive tail starts at $k = 22$.
- **Step:** the response jumps to 0.488, peaks at 1.147 at bar 5, dips to 0.983 around bar 21 and creeps back to 1.
- **Magnitude:** above 0 dB for periods longer than about 13 bars, with a peak of +1.53 dB (gain 1.19) near
  $P \approx 26$. It crosses $-3$ dB near 8 bars and is only $-10.5$ dB at $P = 2$, so TEMA passes the most
  bar-to-bar noise of the three EMA-based averages.
- **Group delay:** negative for periods above about 69 bars (minimum about $-0.29$ near $P \approx 107$). It is
  positive between about 7 and 69 bars, peaking at 2.0 bars near $P \approx 27$, and slightly negative again at the
  shortest periods.

## How to read it
- **Price above / below the line:** on a ramp or a parabola price and TEMA coincide, so the side of the line is
  mostly noise; it is not a trend reading.
- **TEMA vs EMA of the same length:** the gap is the TEMA's lag correction; TEMA above EMA means a smoothed slope
  estimate is up.
- **TEMA vs DEMA:** the gap is the curvature correction, positive when the trend is bending upwards.
- **Slope and overshoot:** the line turns first of the EMA family, then rings after sharp moves (about +15 % / −2 %
  of a step at $n = 9$); a reversal of the line right after a gap may be that ringing, not a new turn.
- **Trend vs range:** in a range it chases every swing longer than about 8 bars (its −3 dB period at $n = 9$).

## Why it works
**Two corrections, two pieces of information.** Using DEMA $= 2E^{(1)} - E^{(2)}$:

$$
\textcolor{#EC407A}{T} - \textcolor{#FF6D00}{E^{(1)}} = 2\bigl(\textcolor{#FF6D00}{E^{(1)}} - E^{(2)}\bigr) - \bigl(E^{(2)} - E^{(3)}\bigr),
\qquad
\textcolor{#EC407A}{T} - \textcolor{#26A69A}{D} = \textcolor{#FF6D00}{E^{(1)}} - 2E^{(2)} + E^{(3)} .
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#EC407A}{T}$, $\textcolor{#26A69A}{D}$, $\textcolor{#FF6D00}{E^{(1)}}$ | TEMA, DEMA and EMA of the same length | price |
| $E^{(1)} - E^{(2)}$ | lag correction of one EMA stage: $bL$ on a ramp of slope $b$ | price |
| $E^{(1)} - 2E^{(2)} + E^{(3)}$ | second difference of the cascade: a curvature estimate | price |

On a ramp $x_t = a + bt$ each stage lags $L$ more, so both brackets on the left equal $bL$ and
$T - E^{(1)} = bL$: TEMA above EMA is the sign of a slope estimate, like DEMA above EMA. The second difference is 0 on
a ramp, and on a parabola $ct^2$ it is $2cL^2$ (TEMA is exact there, DEMA falls short by $2cL^2$): TEMA above DEMA is
the sign of a curvature (acceleration) estimate. A slope predicts only where slopes persist; none of the synthetic
scenarios has a persistent curvature, so the second rule should have no stable [edge](glossary:edge) anywhere. On a [random walk](glossary:random-walk)
neither has an edge: future increments are independent of the past.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0],
 "rules": [
  {"label": "TEMA 20 above EMA 20",
   "left": {"indicator": {"id": "tema", "params": {"length": 20}}, "output": "ma"}, "op": "gt",
   "right": {"indicator": {"id": "ema", "params": {"length": 20}}, "output": "ma"}},
  {"label": "TEMA 20 above DEMA 20",
   "left": {"indicator": {"id": "tema", "params": {"length": 20}}, "output": "ma"}, "op": "gt",
   "right": {"indicator": {"id": "dema", "params": {"length": 20}}, "output": "ma"}}
 ]}
```

Measured with seed 1 (1000 bars, 10-bar [look-ahead](glossary:horizon)):

| Scenario | TEMA 20 above EMA 20 (slope) | TEMA 20 above DEMA 20 (curvature) |
|---|---|---|
| `reversal` | +1.86 % ([95 % interval](glossary:confidence-interval) +0.62 % to +3.10 %, n = 43) | −0.21 % (−1.40 % to +0.98 %, n = 57) |
| `random_walk` | +0.45 % (−0.95 % to +1.86 %, n = 43) | −0.33 % (−1.40 % to +0.74 %, n = 58) |
| `range` | −1.11 % (−1.95 % to −0.27 %, n = 57) | −0.37 % (−1.13 % to +0.40 %, n = 58) |

Across seeds 1–5 the slope rule is positive on `reversal` every time (+0.80 % to +2.14 %, interval above zero for
three) and negative on `range` every time (−1.11 % to −1.73 %, interval below zero for all five). The curvature rule
changes sign with the seed on `reversal`; on `range` it is negative for all five seeds, but its interval clears zero
only once. One rule on one sample: not a backtest, not investment advice.

## Combine with
TEMA is too nervous to be a trend filter, so it plays the fast part: a slow average for the regime, the TEMA/EMA gap
for "the short-term slope agrees", and optionally RSI to avoid entering when the move is already stretched:

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Close above EMA 100", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "ema", "params": {"length": 100}}, "output": "ma"}},
  {"label": "TEMA 20 above EMA 20",
   "left": {"indicator": {"id": "tema", "params": {"length": 20}}, "output": "ma"}, "op": "gt",
   "right": {"indicator": {"id": "ema", "params": {"length": 20}}, "output": "ma"}},
  {"label": "RSI 14 below 60", "left": {"indicator": {"id": "rsi", "params": {}}, "output": "rsi"},
   "op": "lt", "right": {"value": 60}}
 ]}
```

With seed 1, on `reversal`: Close above EMA 100 alone +2.05 % (+0.99 % to +3.10 %, n = 44), TEMA 20 above EMA 20 alone
+1.86 % (n = 43), both together +2.77 % (+1.54 % to +4.01 %, n = 34); the pair is positive with the interval above
zero for seeds 1–5 (+1.48 % to +3.11 %). RSI 14 below 60 alone is −0.37 % (−1.44 % to +0.71 %, n = 76); all three
together +2.30 % (+0.73 % to +3.87 %, n = 24), so the RSI condition costs episodes without adding edge here. On
`range` the pair gives −1.35 % (−2.35 % to −0.35 %, n = 52), on `random_walk` −0.12 % (−2.12 % to +1.87 %, n = 30).
More rules, fewer episodes and more room for chance ([multiple testing](glossary:multiple-testing)). Not a backtest, not advice.

## Differences vs TradingView
All three EMAs are SMA-seeded (TA-Lib convention). The output is identical to TA-Lib `TEMA` on every bar. Pine's
`ta.ema` seed is unconfirmed (assumption E2, see the EMA page). With at least $\max(25n, 250)$ bars of extra history
loaded, the seeds' influence is far below display precision.

## Pitfalls
- More "zero-lag" order is not free. TEMA's noise variance is 3.4 (at $n = 9$) to 4.1 times an EMA's at the same length.
- It overshoots after steps by 15% at $n = 9$ (up to about 20% at long lengths) and then undershoots by about 2%. The output can leave the price range it averages.
- The negative group delay at long periods is real but tiny. It is a side effect of cancelling two moments, not a
  forecast.
- Curvature is the second difference of a noisy series: TEMA vs DEMA flips often, and it found no stable edge in any
  synthetic scenario.

## Exercise
1. In the first lab, switch on only the curvature rule and step through all six scenarios. Is there one where the
   interval stays away from zero for several seeds? Which kind of price path would give curvature an edge?
2. In the param lab on `shock`, set the length to 9 and then 50. Measure the dive below the post-gap level in bars
   and in size, and compare with the step response (peak 1.147 at bar 5, dip 0.983 near bar 21 at $n = 9$).
3. Start Replay on NVDA on 3 January 2023, the first trading day of its 2023 rally, with TEMA 20 and EMA 20. Step
   through the first months: when does TEMA move above the EMA, and how often does it dip back below it during the
   advance? Compare those dips with what the price itself does on those bars.

```lab
{"kind": "replay", "symbol": "NVDA", "date": "2023-01-03",
 "indicators": [{"id": "tema", "params": {"length": 20}}, {"id": "ema", "params": {"length": 20}}]}
```
