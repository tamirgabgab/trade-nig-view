# McGinley Dynamic (`mcginley`)

An exponential average whose gain is set by the ratio of price to the average itself: it slows down when price runs
above it and speeds up when price falls below it. Use it as a trend line that hugs falling prices and lags rising ones
less nervously than a fixed EMA.

## Formula

With $r_t = x_t / M_{t-1}$:

$$
M_t = M_{t-1} + \frac{x_t - M_{t-1}}{n\,r_t^{4}}, \qquad M_{n-1} = \mathrm{EMA}_n(x)_{n-1}
$$

Equivalently $M_t = M_{t-1} + c_t\,(x_t - M_{t-1})$ with the data-dependent gain $c_t = 1/(n\,r_t^4)$. Wherever
$M_{t-1}$ is undefined the value is $\mathrm{EMA}_n(x)_t$ (Pine's `na(mg[1]) ? ta.ema(...)` rule).

## Kernel, lag and noise

**No impulse response.** The gain $c_t$ depends on the input, so superposition fails:
$f(x_1 + 2x_2) \ne f(x_1) + 2f(x_2)$, and a unit impulse on a zero baseline is not even defined ($r = x/M$ needs
$M > 0$). The filter is scale-equivariant, $f(ax) = a\,f(x)$ for $a > 0$ (only the ratio enters), but not
shift-equivariant: adding a constant to every price changes every $r_t$. What replaces the kernel is the **local
behaviour**: freeze $r$ and the recursion is a first-order EMA.

**Local EMA.** With $r$ fixed, $c = 1/N$ where

$$
N(r) = n\,r^4 .
$$

That is a Wilder (RMA) length $N$, i.e. an EMA in the $\alpha = 2/(m+1)$ convention with $m = 2N - 1$, lag
$(1-c)/c = N - 1$ and $\mathrm{NRF} = c/(2-c) = 1/(2N-1)$.

- **At rest** ($x \approx M$, $r = 1$): $c = 1/n$. A length-14 McGinley is an $\mathrm{RMA}_{14} \equiv \mathrm{EMA}_{27}$,
  lag 13 bars, about twice the lag of $\mathrm{EMA}_{14}$ (6.5 bars). The length is not an EMA length.
- **Sensitivity**: $\partial \ln c / \partial \ln r = -4$. A gap of $+1\%$ cuts the gain by about $4\%$.
- **Price above** ($r > 1$): $N$ grows, the line slows. A 10 % up-step ($r = 1.1$) gives $c = 1/(14 \cdot 1.4641) = 0.0488$.
- **Price below** ($r < 1$): $N$ shrinks, the line speeds up. A 10 % down-step ($r = 0.9$) gives
  $c = 1/(14 \cdot 0.6561) = 0.1089$, against a constant $0.1333$ for $\mathrm{EMA}_{14}$.

**Lag on a steady trend.** On a ramp of slope $b$ the line settles where its per-bar increment equals $b$. With the
gap $g = x_t - M_{t-1}$, equilibrium $c\,g = b$ gives $g = b\,n\,r^4$ and a lag behind the line of

$$
L = \frac{x_t - M_t}{b} = n\,r^4 - 1 \approx (n - 1) + 4n^2\,\frac{b}{x}, \qquad r = 1 + \frac{g}{M}.
$$

The lag depends on the **relative** slope $b/x$: longer in up-trends, shorter in down-trends. For $n = 14$ and a slope
of 0.1 per bar at a price near 201 the fixed point is $L = 13.41$ bars (the first-order formula gives 13.39).

**Overshoot.** The gain exceeds 1, so the line jumps past the price, when $n\,r^4 < 1$, i.e.
$r < n^{-1/4}$: for $n = 14$ a one-bar drop of more than 48.3 %. The new level is
$M_{t-1}\left(1 + \frac{r - 1}{n r^4}\right)$, which is $\le 0$ when $1 - r \ge n r^4$: for $n = 14$ a drop of
55.4 % or more ($n = 1$: 27.55 %). Large up-moves do the opposite: $c \to 0$ and the line almost freezes.

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 14 | TradingView default |
| Source | close | TradingView default |
| Offset | 0 | Display shift, $\ge 0$ |

## Warm-up
First valid bar index: $n - 1$ (13 at the default). The first value is the EMA seed, which in ChartLab is the SMA of
the first $n$ bars (see the EMA page). Near rest the seed's weight fades like $(1 - 1/n)^k$, so the chart loads
$\max(25n, 250)$ bars of extra history (350 at $n = 14$).

## Filter view
Only the **step** and **ramp** responses are shown, with the reason: the smoothing depends on the input
(superposition fails), so there is no single impulse or frequency response. Both inputs sit at price-like levels
because the ratio $x/M$ matters.

- **Step** 100 to 110 (+10 %): 4.88 % of the step on the first bar, 50 % after 12 bars, 90 % after 36, 99 % after
  68 (bar 0 is the step bar). A 10 % *down*-step (not plotted) moves 10.9 % on the first bar and reaches 90 % after 26
  bars: the asymmetry is the $r^4$ term.
- **Ramp lag**: 13.41 bars for a ramp of 0.1 per bar starting at 100, read where price is about 201. On a steeper
  relative slope the lag grows (formula above).

## What it measures
A trend line that keeps close to price on sell-offs and gives rising prices more room before it follows. Price
crossing it, and its slope, are read like an EMA's.

## Differences vs TradingView
- Same recursion as TradingView's built-in script, including the EMA fallback wherever the previous value is `na`;
  the seed is ChartLab's EMA (SMA-seeded), so the first few dozen bars can differ slightly.
- A zero divisor (price 0) gives no value for one bar and the next bar re-seeds from the EMA, as in Pine. An overflow
  of $r^4$ gives an infinite divisor and a zero step, as with IEEE arithmetic in Pine.
- **Deliberate deviation**: when a one-bar drop pushes the level to $\le 0$, Pine continues from the negative value
  and oscillates through values like $\pm 10^{200}$ that wreck the price scale. ChartLab replaces a level $\le 0$ by
  $\mathrm{EMA}_n(x)_t$ on that bar (the same fallback Pine uses after `na`, without the gap). Wherever Pine's level
  stays positive the values are identical.

## Pitfalls
- Length 14 does not mean "like EMA 14": at rest it is as slow as EMA 27.
- Not shift-invariant: an index quoted with an offset, or a spread series, gives a different line. Scale-invariant
  only, and undefined for non-positive prices.
- The asymmetry is built in: it lags rallies more than declines. Do not compare up-crosses and down-crosses as if
  they had the same delay.
