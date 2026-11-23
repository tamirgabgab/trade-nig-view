# Least Squares Moving Average (`lsma`)

The LSMA fits an ordinary-least-squares line through the last $n$ prices and plots its value at the newest bar. That
makes it a fixed FIR filter that reproduces any straight line exactly. It is the cleanest example of the "price of zero
lag": at long lengths its noise variance is four times the SMA's.

## Formula
Index the window oldest to newest, $j = 0\ldots n-1$ (bar $t-n+1+j$). With $\bar j = \frac{n-1}{2}$ and
$S = \sum_j (j-\bar j)^2 = \frac{n(n^2-1)}{12}$, the OLS line $a + bj$ evaluated at position $p = n - 1 - o$
($o$ = offset) is

$$
L_t = \bar x + b\,(p - \bar j), \qquad b = \frac{1}{S}\sum_j (j-\bar j)\,x_{t-n+1+j}
\quad\Longrightarrow\quad
w_j = \frac1n + \frac{(p-\bar j)(j-\bar j)}{S}.
$$

## Kernel, lag and noise
With offset 0 ($p = n-1$) and $k = n-1-j$ bars ago:

$$ h_k = \frac{4n - 2 - 6k}{n(n+1)} = 3\cdot\underbrace{\frac{2(n-k)}{n(n+1)}}_{\mathrm{WMA}_n} - 2\cdot\underbrace{\frac1n}_{\mathrm{SMA}_n}, \qquad\text{so}\qquad \mathrm{LSMA} = 3\,\mathrm{WMA}_n - 2\,\mathrm{SMA}_n. $$

The weights fall linearly from $h_0 = \frac{4n-2}{n(n+1)}$ to $h_{n-1} = \frac{4-2n}{n(n+1)} < 0$. They are negative
for $k > \frac{2n-1}{3}$, about the oldest third of the window.

**Lag.** By moment algebra, $\bar k = 3\cdot\frac{n-1}{3} - 2\cdot\frac{n-1}{2} = 0$. More directly, OLS reproduces a
line exactly, so on $x_t = a + bt$ the output is $x_t$.

**Curvature.** $\sum_k k^2 h_k = -\frac{(n-1)(n-2)}{6}$ ($-92$ at $n = 25$). On a parabola $ct^2$ the LSMA sits
$92c$ below price.

**Noise.**

$$ \mathrm{NRF} = \sum_k h_k^2 = \frac{2(2n-1)}{n(n+1)} = h_0 \;\approx\; \frac4n. $$

NRF equals the newest weight. This is the OLS leverage: the variance of a fitted value is $\sigma^2$ times the weight
the fit gives the observation at which it is evaluated (the hat-matrix diagonal). At $n = 25$, NRF $= 98/650 = 0.1508$, which is **3.77 times** the SMA's $0.04$,
and the ratio $\frac{2(2n-1)}{n+1}$ tends to 4. Removing the SMA's lag of $\frac{n-1}{2}$ bars costs four times the
noise variance at the same length.

**Overshoot.** The negative weights total $\int_{2/3}^{1}(6u-4)\,du = \frac13$ as $n \to \infty$, and $0.3077$ at
$n = 25$. Because they all sit at the old end of the window, the step response is $1 + 0.308 = 1.308$ at its peak
(bar 16). It then falls back to 1, reached exactly at bar 24.

**What the offset does.** The kernel is linear in $p$, and the fitted line is exact on ramps, so the lag is exactly
$o$ bars. The noise is

$$ \mathrm{NRF}(o) = \frac1n + \frac{12\big(\frac{n-1}{2} - o\big)^2}{n(n^2-1)}. $$

| $n = 25$ | $o = 0$ | $o = 3$ | $o = 6$ | $o = 12$ | $o = 24$ | $o = 30$ |
|---|---|---|---|---|---|---|
| Lag (bars) | 0 | 3 | 6 | 12 | 24 | 30 |
| NRF | 0.1508 | 0.1023 | 0.0677 | 0.0400 | 0.1508 | 0.2892 |
| Negative taps | 8 | 7 | 4 | 0 | 8 | 10 |

At $o = \frac{n-1}{2}$ the kernel **is** the SMA (the line's value at its centre is the mean). The weights are all
non-negative only while $\lvert o - \frac{n-1}{2}\rvert \le \frac{n+1}{6}$ (offsets 8 to 16 at $n = 25$). Beyond
$\frac{n-1}{2}$ the newest bars get negative weight, and for $o > n-1$ the line is extrapolated behind the window.
The offset therefore trades lag for noise along one line, from the LSMA ($o = 0$) to the SMA ($o = \frac{n-1}{2}$).

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 25 | TradingView default |
| Offset | 0 | Pine `ta.linreg` offset: evaluate the line $o$ bars back (adds $o$ bars of lag); not a display shift |
| Source | close | TradingView default |

## Warm-up
First valid bar index: $n - 1$ (24 at the default), for any offset.

## Filter view
At $n = 25$, offset 0:
- **Impulse:** 25 stems on a straight line, from 0.151 at $k = 0$ down to $-0.071$ at $k = 24$, with zero crossing
  between $k = 16$ and $17$.
- **Step:** the cumulative sum of linear taps is a parabola. The response rises (concave) from 0.151 to its peak of
  **1.308** at bar 16, then descends along the same parabola to exactly 1 at bar 24. No undershoot.
- **Magnitude:** +0.36 dB already at $P = 200$, a peak of +2.57 dB (gain 1.345) near $P \approx 43$ bars, 0 dB near
  26 bars and $-3$ dB near 22.5 bars. Below that comes a rippling stopband ($-28$ dB at $P = 2$). For comparison,
  the SMA of the same length is $-3$ dB at 56 bars: the LSMA passes much shorter cycles.
- **Group delay:** 1.2 bars at $P = 200$, rising to 8.4 bars near $P \approx 31$. In the stopband it swings wildly
  (down to $-24$ near $P \approx 17.6$, where the gain has a dip of $-13$ dB). Read the group delay only where the
  gain is near 0 dB.

## What it measures
The current value of the best straight line through the last $n$ closes: where the linear trend "is now". The
difference between price and the LSMA is the residual of that fit.

## Differences vs TradingView
Same as Pine `ta.linreg(source, length, offset)` = `intercept + slope * (length - 1 - offset)`. Verified against
TA-Lib `LINEARREG` for offset 0.

## Pitfalls
- Here `offset` is the regression offset, not a plot shift as on the other averages. Raising it adds exactly that
  many bars of lag.
- A 31% step overshoot and a 34% gain bump at about $1.7n$ bars: swings of that length are exaggerated.
- Negative offsets (TA-Lib `TSF`, a one-bar-ahead forecast of the line) are not offered; the minimum is 0.
