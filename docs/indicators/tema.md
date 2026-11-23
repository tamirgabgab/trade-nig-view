# Triple Exponential Moving Average (`tema`)

Mulloy's TEMA (1994) combines three cascaded EMAs so that the first and second moments of the kernel both cancel. It
tracks straight lines and parabolas with zero error. It is the fastest member of the EMA family here and also the
noisiest.

## Formula
$$
T_t = 3E^{(1)}_t - 3E^{(2)}_t + E^{(3)}_t, \qquad E^{(1)} = \mathrm{EMA}_n(x),\; E^{(k+1)} = \mathrm{EMA}_n\big(E^{(k)}\big),
\qquad \alpha = \frac{2}{n+1}
$$

Not to be confused with a triple-smoothed EMA ($E^{(3)}$ alone, the basis of TRIX).

## Kernel, lag and noise
With $E(z) = \frac{\alpha}{1-\beta z^{-1}}$ and $\beta = 1-\alpha$, the binomial theorem gives

$$ H(z) = 3E - 3E^2 + E^3 = 1 - \big(1 - E(z)\big)^3, \qquad 1 - E(z) = \frac{\beta\,(1-z^{-1})}{1-\beta z^{-1}}. $$

$1 - H$ has a **triple zero** at $z = 1$, so the first two derivatives of $H$ at $z = 1$ vanish. Equivalently, the first
and second moments of the kernel are zero:

$$ \sum_k k\,h_k = 0, \qquad \sum_k k^2 h_k = 0, \qquad \sum_k k^3 h_k = 6L^3, \qquad L = \frac{n-1}{2}. $$

So a ramp **and** a parabola $x_t = ct^2$ pass through unchanged. The first error term is cubic: on $x_t = ct^3$ the
output is $x_t - 6cL^3$ (384c at $n = 9$).

The cascaded kernels are $\alpha\beta^k$, $\alpha^2(k+1)\beta^k$ and $\alpha^3\frac{(k+1)(k+2)}{2}\beta^k$, so

$$ h_k = \alpha\beta^k\Big(3 - 3\alpha(k+1) + \tfrac{\alpha^2}{2}(k+1)(k+2)\Big). $$

The bracket is a quadratic in $r = k+1$, whose roots solve $r^2 - (3n+2)\,r + \tfrac32(n+1)^2 = 0$. The kernel therefore
changes sign **twice**: positive, then negative, then positive again. At $n = 9$ the roots are $r = 6.74$ and $22.26$,
so taps $k = 6\ldots21$ are negative (total $-0.164$) and the tail from $k = 22$ on is positive again ($+0.017$). This
double sign change is why the step response rings: it overshoots, then undershoots, then settles.

**Noise.** Summing $h_k^2$ in closed form:

$$ \mathrm{NRF} = \frac{33n^4 - 54n^3 + 44n^2 - 18n + 3}{8n^5} \;\to\; \frac{4.125}{n}. $$

At $n = 9$ this is $7523/19683 = 0.3822$, which is 3.44 times the EMA's 0.111 and 1.5 times DEMA's 0.254. Each
extra moment you cancel costs more noise variance.

**Low-frequency view.** With the cumulant expansion from the DEMA page, TEMA has $\kappa_1 = \kappa_2 = 0$ and
$\kappa_3 = 6L^3 > 0$. The group delay is therefore $\tau(\omega) \approx -3L^3\omega^2$. That is **negative**: TEMA leads
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

## What it measures
The trend level, tracking both slope and curvature with no steady-state error. It reacts to turns fastest of the
EMA family. It also chases noise most and overshoots after sharp moves.

## Differences vs TradingView
All three EMAs are SMA-seeded (TA-Lib convention). The output is identical to TA-Lib `TEMA` on every bar. Pine's
`ta.ema` seed is unconfirmed (assumption E2, see the EMA page). With at least $\max(25n, 250)$ bars of extra history
loaded, the seeds' influence is far below display precision.

## Pitfalls
- More "zero-lag" order is not free. TEMA's noise variance is 3.4 (at $n = 9$) to 4.1 times an EMA's at the same length.
- It overshoots after steps by 15% at $n = 9$ (up to about 20% at long lengths) and then undershoots by about 2%. The output can leave the price range it averages.
- The negative group delay at long periods is real but tiny. It is a side effect of cancelling two moments, not a
  forecast.
