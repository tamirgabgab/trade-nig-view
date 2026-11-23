# Kaufman Adaptive Moving Average (`kama`)

An exponential average whose gain is set bar by bar by Kaufman's efficiency ratio: fast when price moves in a
straight line, very slow when it chops. Use it as a trend line that flattens in sideways markets instead of
whipsawing.

## Formula

$$
\begin{aligned}
ER_t &= \frac{\lvert x_t - x_{t-n}\rvert}{\sum_{i=0}^{n-1} \lvert x_{t-i} - x_{t-i-1}\rvert}, \\
c_t &= \big(ER_t\,(f - s) + s\big)^2, \qquad f = \frac{2}{F + 1}, \quad s = \frac{2}{S + 1}, \\
K_t &= K_{t-1} + c_t\,(x_t - K_{t-1}), \qquad K_{n-1} = x_{n-1}.
\end{aligned}
$$

$n$ is the efficiency length, $F$ and $S$ the fast and slow EMA lengths. By the triangle inequality the denominator
("noise") is never smaller than the numerator ("change"), so $ER_t \in [0, 1]$. **ER = 1 rule** (TA-Lib): $ER_t = 1$
when the noise is 0 (a flat window) or not larger than the change (equality, up to rounding).

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

## What it measures
Whether price is trending efficiently. A rising or falling KAMA follows a clean move closely; a flat KAMA says the
recent path was mostly noise.

## Differences vs TradingView
- Not a TradingView built-in (decision D4); community scripts differ in seeding and in the ER edge cases.
- Seed, first value and the ER = 1 rule follow TA-Lib `KAMA`; ChartLab's values equal TA-Lib's on every bar
  (verified exactly).

## Pitfalls
- The Filter view numbers (lag 1.25) describe the trending regime only; in chop the lag is hundreds of bars.
- The seed's weight decays slowly in chop; the chart loads about 6,000 extra bars at the defaults so it never shows.
- Fast and Slow are not the EMA lengths you get: the squaring turns 2/30 into 3.5/479.5.
- A flat window counts as perfectly efficient ($ER = 1$), so after a gap the line catches up at the fast rate.
