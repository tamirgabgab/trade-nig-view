# Kaufman Adaptive Moving Average (`kama`)

An exponential average whose gain is set bar by bar by Kaufman's efficiency ratio: fast when price moves in a
straight line, very slow when it chops. Use it as a trend line that flattens in sideways markets instead of
whipsawing.

## What it measures
Whether price is trending efficiently. It answers "how much of the recent movement was net progress, and where is the
trend if I only follow the progress?". A rising or falling KAMA follows a clean move closely; a flat KAMA says the
recent path was mostly noise.

Move the efficiency length on the `range` scenario: the line stays almost flat through the chop, because a short
window of a mean-reverting path is rarely efficient.

```lab
{"kind": "param", "indicator": "kama", "vary": "length", "min": 2, "max": 50, "scenario": "range"}
```

## Formula

$$
\begin{aligned}
ER_t &= \frac{\lvert x_t - x_{t-n}\rvert}{\sum_{i=0}^{n-1} \lvert x_{t-i} - x_{t-i-1}\rvert}, \\
c_t &= \big(ER_t\,(f - s) + s\big)^2, \qquad f = \frac{2}{F + 1}, \quad s = \frac{2}{S + 1}, \\
\textcolor{#EF5350}{K_t} &= \textcolor{#EF5350}{K_{t-1}} + c_t\,(x_t - \textcolor{#EF5350}{K_{t-1}}), \qquad \textcolor{#EF5350}{K_{n-1}} = x_{n-1}.
\end{aligned}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#EF5350}{K_t}$ | the KAMA at bar $t$ | price |
| $x_t$ | source price | price |
| $ER_t$ | efficiency ratio: net change over the sum of absolute bar-to-bar changes | 0–1 |
| $n$ | efficiency length | 1–5000, default 10 |
| $F$, $S$ | fast and slow EMA lengths | 1–200, defaults 2 and 30 |
| $f$, $s$ | their EMA gains | $f = 2/3$, $s = 2/31$ at the defaults |
| $c_t$ | the bar's gain | $s^2 = 0.0042$ to $f^2 = 0.444$ |

By the triangle inequality the denominator ("noise") is never smaller than the numerator ("change"), so
$ER_t \in [0, 1]$. **ER = 1 rule** (TA-Lib): $ER_t = 1$ when the noise is 0 (a flat window) or not larger than the
change (equality, up to rounding).

## Kernel, lag and noise

**No impulse response.** $c_t$ is a function of the input, so superposition fails and there is no fixed kernel or
transfer function. Two exact properties survive: $c_t \in [s^2, f^2] \subset (0, 1]$, so $K_t$ always lies between
$K_{t-1}$ and $x_t$ (no overshoot); and $ER$ is invariant under any affine map of the prices, so
$f(ax + b) = a\,f(x) + b$.

**Local behaviour.** Freeze $c$ and the recursion is an EMA with $\alpha = c$: lag $(1-c)/c$, NRF $c/(2-c)$,
equivalent EMA length $m = 2/c - 1$. The squared mapping matters: $c$ is quadratic in $ER$, so a moderately noisy
trend already slows the filter a lot. At the defaults ($f = 2/3$, $s = 2/31$):

| $ER$ | $c$ | EMA length $2/c - 1$ | Lag $(1-c)/c$ (bars) |
|---|---|---|---|
| 1 (straight line) | $f^2 = 0.4444$ | 3.50 | 1.25 |
| 0.5 | 0.1337 | 13.96 | 6.48 |
| 0.3 | 0.0601 | 32.3 | 15.6 |
| 0.1 | 0.01556 | 127.6 | 63.3 |
| 0 (pure chop) | $s^2 = 0.004162$ | 479.5 | 239.25 |

- **Straight line**: every increment in the window has the same sign, so change = noise and $ER = 1$ (any monotone
  window does this). Then $c = f^2$ and the lag behind the line is $(1 - f^2)/f^2 = \left(\frac{F+1}{2}\right)^2 - 1$,
  which is 1.25 bars for $F = 2$. Note the square: even at full efficiency KAMA is an EMA of length 3.5, not 2.
- **Chop**: $ER \to 0$, $c \to s^2$, an EMA of length $2/s^2 - 1 = 479.5$ for $S = 30$, not 30.
- **Rough guide**: for a random walk, the ratio of expectations gives $ER \approx 1/\sqrt n \approx 0.32$ at $n = 10$
  ($c \approx 0.065$, EMA length about 30); for white noise around a constant, $ER \approx 1/n = 0.1$ (EMA length
  about 128). These are heuristics, not exact expectations of the ratio.

## Defaults
| Param | Default | Why |
|---|---|---|
| Efficiency length | 10 | Kaufman / TA-Lib default |
| Fast EMA length | 2 | Kaufman default |
| Slow EMA length | 30 | Kaufman default; Fast must not exceed Slow (rejected with an error) |
| Source | close | TradingView default |

With Fast = Slow = $L$ the gain is constant and KAMA is a plain EMA with $\alpha = (2/(L+1))^2$.

## Warm-up
First valid bar index: $n$ (10 at the default). The seed $K_{n-1} = x_{n-1}$ is not output; the first value is at bar
$n$, the first bar with a full ER window. In chop the seed fades like $(1 - s^2)^k$, so the chart loads
$\max(25n,\ \lfloor 25/s^2 \rfloor + n)$ bars of extra history: 6,016 at the defaults.

## Filter view
Only the **step** and **ramp** responses are shown, with the reason: the smoothing depends on the input
(superposition fails), so there is no single impulse or frequency response.

Both test inputs are perfectly efficient. A step has change = noise while the jump is in the window, and a flat
window afterwards (ER = 1 rule); a ramp is monotone. So both plots show KAMA's **fastest** regime only:

- **Step**: $1 - (1 - f^2)^{k+1}$, i.e. 0.444, 0.691, 0.829, 0.905 on bars 0 to 3; 99 % after 7 bars.
- **Ramp lag**: 1.25 bars.

On real, noisy data the same filter can be up to $239.25 / 1.25 \approx 190$ times slower in lag. The plots are a lower
bound on its lag, not a typical value.

## How to read it
- **Price above or below the line.** As for an EMA, and exactly the same as the slope: while $0 < c_t < 1$, price
  above KAMA and KAMA rising fire on the same bars (the proof is on the McGinley page and holds for any gain).
- **Slope and flatness.** A steep KAMA means an efficient move; a flat KAMA means the window's net change was small
  compared with its path. Flatness is the information: "no trend worth following".
- **Crossings.** In chop the line is slow and sits near the middle of the range, so price crosses it at every swing
  through the middle; the crossings then mark mean reversion, not new trends.
- **Distance from price.** Small in a clean trend (lag 1.25 bars at $ER = 1$); large and persistent in chop, where the
  gap measures how far price has strayed from a slow centre.
- **Trend vs range.** In a trend it behaves like a short EMA; in a range like a very long one. The same crossing means
  different things in the two regimes.
- **The parameters.** A longer efficiency length averages ER over more bars (fewer regime flips); Fast sets the speed
  in trends (lag $\left(\frac{F+1}{2}\right)^2 - 1$); Slow sets how still it stays in chop.

## Why it works
**In a range a slow line sits at the mean, and price returns to the mean.** The `range` scenario is an
Ornstein–Uhlenbeck process in log price; its deviation from the long-run level decays geometrically:

$$
\mathbb{E}\big[x_{t+h} - x_t \mid d_t\big] = -\big(1 - (1-\theta)^h\big)\,d_t, \qquad d_t = x_t - \mu
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $x_t$ | log price | |
| $\mu$ | long-run level ($\ln 100$ in the scenario) | |
| $d_t$ | deviation from the level | stationary standard deviation about 0.038 (3.8 %) |
| $\theta$ | speed of mean reversion per bar | 0.08 in the scenario |
| $h$ | horizon | bars; at $h = 10$ the factor is 0.57 |

In chop $ER$ stays low, $c$ is near $s^2$ and KAMA is a slow line close to $\mu$; then "close above KAMA" means
$d_t > 0$, and the formula predicts a *negative* edge: a trend rule loses money in a range. A fast line (EMA 10, lag
4.5 bars) sits close to price whatever the level, so its side says little about $d_t$. In a trend the same KAMA turns
into a short EMA, and "close above" becomes a weak trend test (trend-detection ratio $\rho = 1.87$ at $ER = 1$, LSMA
page). On a random walk neither reading has an edge: there is no mean to return to, and the increments after bar $t$
are independent of the past.

The lab, seed 1, 1000 bars, horizon 10, `range`: close above KAMA −0.61 % (95 % interval −1.49 % to +0.26 %,
n = 71), close above EMA 10 −0.31 % (−1.19 % to +0.57 %, n = 74), close above SMA 200 −1.30 % (−2.35 % to −0.25 %,
n = 51). Over seeds 1 to 5 the KAMA rule is negative every time (−0.47 % to −1.05 %, interval below 0 in two seeds),
the EMA 10 rule is always smaller in size (−0.31 % to −0.41 %) and never outside the noise, and the SMA 200 rule is below 0
with its interval in all five. Switch the scenario to `reversal` and the KAMA rule turns positive (+0.86 %, −0.25 %
to +1.96 %, n = 62 with seed 1). One rule on one sample: not a backtest and not investment advice.

```lab
{"kind": "combo", "scenario": "range", "horizon": 10, "on": [0],
 "rules": [
  {"label": "Close above KAMA", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "kama", "params": {}}, "output": "ma"}},
  {"label": "Close above EMA 10", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "ema", "params": {"length": 10}}, "output": "ma"}},
  {"label": "Close above SMA 200", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 200}}, "output": "ma"}}
 ]}
```

## Combine with
- **SMA 200 as the trend filter**: it decides whether there is a long trend to follow at all ($\rho = 12.2$).
- **Close above KAMA as the trigger**: fast in an efficient move, so it joins the trend early.
- **RSI 14 above 50 as a confirmation**: recent gains outweigh losses; on a trending random walk it repeats the
  trigger's information.

With seed 1 on `reversal` (horizon 10): close above SMA 200 +1.48 % (−0.05 % to +3.01 %, n = 36), close above KAMA
+0.86 % (−0.25 % to +1.96 %, n = 62); filter and trigger together +2.11 % (+0.52 % to +3.70 %, n = 28); adding RSI
gives +2.00 % (n = 28). The pair is positive for seeds 1 to 5 (+1.36 % to +2.11 %, interval above 0 in three). Now
switch the scenario to `range`: the same pair has −1.27 % (−2.37 % to −0.17 %, n = 45), negative for all five
seeds. A trend system is only as good as the regime it runs in; KAMA's flatness is the warning sign. On `random_walk`
the pair shows nothing (seed 1: +0.88 %, −0.90 % to +2.66 %, n = 25). One sample, no costs; not investment advice.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Close above SMA 200", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 200}}, "output": "ma"}},
  {"label": "Close above KAMA", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "kama", "params": {}}, "output": "ma"}},
  {"label": "RSI 14 above 50", "left": {"indicator": {"id": "rsi", "params": {}}, "output": "rsi"}, "op": "gt",
   "right": {"value": 50}}
 ]}
```

## Differences vs TradingView
- Not a TradingView built-in (decision D4); community scripts differ in seeding and in the ER edge cases.
- Seed, first value and the ER = 1 rule follow TA-Lib `KAMA`; ChartLab's values equal TA-Lib's on every bar
  (verified exactly).

## Pitfalls
- The Filter view numbers (lag 1.25) describe the trending regime only; in chop the lag is hundreds of bars.
- The seed's weight decays slowly in chop; the chart loads about 6,000 extra bars at the defaults so it never shows.
- Fast and Slow are not the EMA lengths you get: the squaring turns 2/30 into 3.5/479.5.
- A flat window counts as perfectly efficient ($ER = 1$), so after a gap the line catches up at the fast rate.
- In a range, price above a flat KAMA is a sign of stretch, not of a new trend.

## Exercise
1. In the "Why it works" lab, switch between `range`, `reversal` and `random_walk`. Which sign does the KAMA rule's
   edge take in each, and how does the formula for $\mathbb{E}[x_{t+h} - x_t \mid d_t]$ explain the `range` result?
2. In the first lab on `range`, move the efficiency length from 10 to 2 and then to 40. At which setting does the line
   follow the swings, and why does a very short window often look efficient ($ER$ near 1)?
3. Start the replay on SPY on 14 August 2015, during the sideways year that ended in the 24 August 2015 sell-off,
   with KAMA and EMA 10. Before the drop, how flat is KAMA compared with the EMA? On the fall, how fast does KAMA
   react once the moves become efficient?

```lab
{"kind": "replay", "symbol": "SPY", "date": "2015-08-14",
 "indicators": [{"id": "kama", "params": {}}, {"id": "ema", "params": {"length": 10}}]}
```
