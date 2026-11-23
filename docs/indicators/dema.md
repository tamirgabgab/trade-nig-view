# Double Exponential Moving Average (`dema`)

Patrick Mulloy's DEMA (1994): twice an EMA minus the EMA of that EMA. It follows a straight-line trend with zero lag,
at the price of more noise and a small overshoot after sudden moves. Use it when an EMA reacts too late.

## Formula
$$
E^{(1)} = \mathrm{EMA}_n(x), \qquad E^{(2)} = \mathrm{EMA}_n\big(E^{(1)}\big), \qquad
D_t = 2E^{(1)}_t - E^{(2)}_t, \qquad \alpha = \frac{2}{n+1}
$$

Not to be confused with a "double-smoothed" EMA, which is $E^{(2)}$ alone (twice the lag of one EMA).

## Kernel, lag and noise
Write $\beta = 1-\alpha$ and $L = \frac{1-\alpha}{\alpha} = \frac{n-1}{2}$ (the EMA's lag). The EMA kernel is
$e_k = \alpha\beta^k$; the cascade $E^{(2)}$ has kernel $\alpha^2(k+1)\beta^k$, so

$$ h_k = \alpha\beta^k\big(2 - \alpha(k+1)\big). $$

The kernel is positive for $k < n$, exactly zero at $k = n$ (since $\alpha(n+1) = 2$) and negative for every $k > n$.

**Lag by moment algebra.** Lags (first moments) are linear in a combination whose weights sum to 1 and add in a
cascade. So $\bar k = 2L - (L + L) = 0$.

**Lag by transfer function.** With $E(z) = \frac{\alpha}{1-\beta z^{-1}}$,

$$ 1 - E(z) = \frac{\beta\,(1 - z^{-1})}{1 - \beta z^{-1}}, \qquad H(z) = 2E - E^2 = 1 - \big(1 - E(z)\big)^2. $$

$1 - H$ has a **double zero** at $z = 1$, so $H(1) = 1$ and $H'(1) = 0$. Since $-H'(1) = \sum_k k\,h_k$, the first
moment vanishes: on $x_t = a + bt$ the output is exactly $x_t$.

**Second moment and acceleration.** The EMA has $\sum_k k^2 e_k = L + 2L^2$ and variance $\kappa_2 = L + L^2$; variances
add in a cascade, which gives $\sum_k k^2 h_k = -2L^2$ ($-32$ at $n = 9$). On a parabola $x_t = ct^2$:

$$ D_t = c\big(t^2 - 2t\,\bar k + \textstyle\sum_k k^2 h_k\big) = x_t - 2cL^2. $$

An EMA's error on a parabola keeps growing with $t$. DEMA's error stays constant: it trails an accelerating trend by a
fixed amount.

**Noise.** Summing $h_k^2$ in closed form:

$$ \mathrm{NRF} = \frac{5n^2 - 4n + 1}{2n^3} \;\to\; \frac{2.5}{n}. $$

At $n = 9$ this is $185/729 = 0.2538$, which is 2.28 times the EMA's $1/n = 0.111$. Removing the lag costs about 2.5
times the noise variance.

**Overshoot.** The step response is $s_k = 1 + \beta^{k+1}\big((k+1)\alpha - 1\big)$. It peaks at $k = n-1$, where
it equals $1 + \beta^{n+1}$: **1.1074** at $n = 9$, tending to $1 + e^{-2} = 1.135$ for long lengths. The overshoot is
exactly the total negative weight $\sum_{k>n} \lvert h_k \rvert$.

**Low-frequency view.** Treat $h_k$ as a signed distribution with cumulants $\kappa_r$. Then
$\ln H(e^{j\omega}) = \sum_r \kappa_r (-j\omega)^r / r!$, so
$\ln\lvert H \rvert \approx -\kappa_2\omega^2/2$ and the group delay is $\tau(\omega) \approx \kappa_1 - \kappa_3\omega^2/2$.
DEMA has $\kappa_1 = 0$ and $\kappa_2 = -2L^2 < 0$, so **its gain rises above 1** at low frequencies. A
non-negative kernel can never do that: its $\kappa_2$ is a true variance and $\lvert H \rvert \le \sum_k h_k = 1$.

| $n = 9$ (measured) | EMA | DEMA |
|---|---|---|
| Lag (bars) | 4.00 | 0 |
| NRF | 0.111 | 0.254 |
| Step peak | 1 (monotone) | 1.107 at bar 8 |
| Peak gain | none (below 0 dB) | +0.956 dB at $P \approx 42$ |
| $-3$ dB period | 28 bars | 12 bars |

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 9 | TradingView default |
| Source | close | TradingView default |
| Offset | 0 | Display shift (bars to the right); adds that many bars of lag |

## Warm-up
First valid bar index: $2(n-1)$, which is 16 at $n = 9$. The outer EMA is SMA-seeded on the first $n$ valid values of
the inner EMA, and the inner EMA's first valid index is $n-1$.

## Filter view
- **Impulse:** stems start at $h_0 = \alpha(2-\alpha) = 0.36$ and decay. They are exactly zero at $k = 9$ and form a
  small negative tail after that (minimum $-0.0088$ at $k = 13$), decaying geometrically.
- **Step:** the response rises to 1.107 at bar 8 and then falls back to 1 with no undershoot (the negative tail has a
  single sign).
- **Magnitude:** the curve sits above 0 dB for periods longer than about 22 bars, with a bump of +0.956 dB (gain 1.116)
  near $P \approx 42$. Cycles of that length are exaggerated by about 12%. It crosses $-3$ dB near 12 bars and has no
  spectral zeros ($-13.6$ dB at $P = 2$, against $-19.1$ dB for the EMA), so short-period noise gets through more.
- **Group delay:** 0 at DC. It grows like $-\kappa_3\omega^2/2 = 432\,\omega^2$ (0.39 bars at $P = 200$), peaks at
  2.47 bars near $P \approx 40$ and turns slightly negative below about 8 bars. Zero lag holds for trends only; a
  40-bar swing is still delayed by about 2.5 bars.

## What it measures
The trend level with the EMA's lag removed. It turns earlier than an EMA of the same length but is choppier, and it
briefly runs past price after a gap or a sharp reversal.

## Differences vs TradingView
Both EMAs are SMA-seeded (TA-Lib convention). The output is identical to TA-Lib `DEMA` on every bar. Whether Pine's
`ta.ema` seeds the same way is unconfirmed (assumption E2, see the EMA page). The two seeds' influence decays like
$k\beta^k$, and the chart loads at least $\max(25n, 250)$ extra bars, so any difference is far below display
precision.

## Pitfalls
- Zero lag means zero lag **on straight lines**. Accelerating trends leave a constant gap of $2cL^2$, and cycles of
  about $4n$ to $5n$ bars are both amplified and delayed.
- The output can leave the range of the prices it averages: after a step it rises 10.7% (of the step) above the new
  level.
- The noise variance is 2.3 to 2.5 times an EMA's. Do not compare DEMA and EMA crossovers at the same length as if they
  were equally smooth.
