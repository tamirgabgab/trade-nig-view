# Zero-Lag Exponential Moving Average (`zlema`)

An EMA applied to a "de-lagged" price, $x_t + (x_t - x_{t-d})$. The momentum term adds back roughly the lag the EMA is
about to introduce. The idea is attributed to Ehlers and Way (2010). It is not a TradingView built-in; it is included
to compare lag-cancelling designs.

## Formula
$$ Z_t = \mathrm{EMA}_n\big(x_t + (x_t - x_{t-d})\big) = \mathrm{EMA}_n\big(2x_t - x_{t-d}\big), \qquad d = \left\lfloor \frac{n-1}{2} \right\rfloor, \qquad \alpha = \frac{2}{n+1} $$

## Kernel, lag and noise
The de-lagging prefilter $g = 2\delta_0 - \delta_d$, i.e. $G(z) = 2 - z^{-d}$, has DC gain 1 and first moment
$\sum_k k\,g_k = -d$: it **leads** by $d$ bars. Lags add in a cascade, so

$$ \bar k = \frac{n-1}{2} - d = \begin{cases} 0 & n \text{ odd} \\ \tfrac12 & n \text{ even} \end{cases} $$

and the default $n = 20$ ($d = 9$) keeps half a bar of lag.

With $\beta = 1 - \alpha = \frac{n-1}{n+1}$, the kernel is a geometric decay with one jump at $k = d$:

$$ h_k = \begin{cases} 2\alpha\beta^k & k < d \\ \big(2 - \beta^{-d}\big)\,\alpha\beta^k & k \ge d \end{cases} $$

The tail $k \ge d$ is **negative whenever $\beta^d < \frac12$**, which holds for $n = 5$ and every $n \ge 7$. Its total
weight is $-(1 - 2\beta^d)$. Special cases: $n = 2$ gives $d = 0$, which is a plain EMA(2). $n = 3$ gives
$\beta^d = \frac12$ exactly: the tail vanishes and $h = \delta_0$, so ZLEMA(3) is the raw price.

**Noise.** Summing the two geometric pieces, and using $\frac{\alpha^2}{1-\beta^2} = \frac1n$:

$$ \mathrm{NRF} = \frac{\alpha^2}{1-\beta^2}\Big(4(1-\beta^{2d}) + (2\beta^d - 1)^2\Big) = \frac{5 - 4\beta^d}{n} \;\to\; \frac{5 - 4/e}{n} \approx \frac{3.53}{n}. $$

At $n = 20$: $\beta^9 = 0.4064$, so $\mathrm{NRF} = 0.1687$, which is 3.37 times the EMA's $0.05$.

**Overshoot.** The step response is the running sum of the kernel. It peaks at the last positive tap, $k = d - 1$:

$$ \max_k s_k = \sum_{k<d} 2\alpha\beta^k = 2\big(1 - \beta^d\big) \;\to\; 2(1 - e^{-1}) = 1.264. $$

The value is 1.187 at $n = 20$. The overshoot equals the negative tail's weight, $1 - 2\beta^d$.

**Curvature.** On a parabola $x_t = ct^2$ a linear filter gives $c\big(t^2 - 2t\,\bar k + \sum_k k^2 h_k\big)$. At
$n = 20$, $\sum_k k^2 h_k = -62$ and $\bar k = \frac12$, so the ZLEMA settles at $x_t - ct - 62c$. The half-bar lag
costs half a bar of the current slope $2ct$. For odd $n$ only the constant term remains (e.g. $-90c$ at $n = 21$).

| $n = 20$ (measured) | EMA | ZLEMA |
|---|---|---|
| Lag (bars) | 9.50 | 0.50 |
| NRF | 0.050 | 0.169 |
| Step peak | 1 (monotone) | 1.187 at bar 8 |
| Peak gain | none (below 0 dB) | +1.08 dB at $P \approx 48$ |
| $-3$ dB period | 63 bars | 15.6 bars |

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 20 | Common default (no TradingView built-in) |
| Source | close | TradingView convention |
| Offset | 0 | Display shift (bars to the right); adds that many bars of lag |

## Warm-up
First valid bar index: $n - 1 + d$, which is 28 at $n = 20$. The de-lagged input needs $d$ bars of history, and the EMA
is then SMA-seeded on its first $n$ valid values.

## Filter view
At $n = 20$:
- **Impulse:** nine positive stems decaying from $h_0 = 0.190$. At $k = 9$ the kernel jumps to $-0.018$, followed by a
  long negative geometric tail. The jump is the delayed $-x_{t-d}$ term entering.
- **Step:** the response climbs to **1.187** at bar 8, then decays monotonically (geometrically, at the EMA's rate) back
  to 1. No undershoot.
- **Magnitude:** the prefilter's gain $\lvert 2 - e^{-j\omega d}\rvert$ oscillates between 1 (0 dB, at periods
  $P = d/k$: 9, 4.5, 3, 2.25) and 3 (+9.5 dB, at $P = 2d/(2k+1)$: 18, 6, 3.6, ...). Multiplied by the EMA's low-pass,
  this gives a bump of +1.08 dB (gain 1.13) near $P \approx 48$, 0 dB near 24 bars and $-3$ dB near 15.6 bars. At
  short periods it ripples, with a dip of $-25.9$ dB near $P = 2.25$.
- **Group delay:** 1.45 bars at $P = 200$ (tending to 0.5 at DC), with a maximum of 3.8 bars near $P \approx 43$. At
  the prefilter's unit-gain periods its own delay is exactly $-d$. That shows as sharp negative spikes, e.g. $-9.3$ bars
  at $P = 9$.

## What it measures
A trend line with nearly no lag on steady trends, built from an EMA. Like the EMA, it has an infinite (geometric)
memory, unlike the finite HMA and LSMA.

## Differences vs TradingView
There is no TradingView built-in. Community Pine scripts usually compute exactly
`ta.ema(src + (src - src[lag]), length)` with `lag = math.floor((length - 1) / 2)`. Any difference from those is in
the EMA seed (SMA seed here; see the EMA page). Ehlers and Way's article also describes an "error-correcting" EMA
with an optimised gain term. That adaptive filter is a different indicator.

## Pitfalls
- Even lengths keep half a bar of lag; odd lengths have exactly zero ramp lag.
- ZLEMA(3) is the raw price, and short lengths smooth very little.
- The single delayed tap makes the response ripple at periods $d/k$. Cycles near $P = 2d$ (about $n$ bars) are
  amplified by the prefilter before the EMA attenuates them, so ZLEMA can trace short swings more strongly than its
  length suggests.
