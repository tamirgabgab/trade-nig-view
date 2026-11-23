# Bollinger Bands (`bb`)

A moving average (the basis) with bands a multiple of the recent standard deviation above and below it. Unlike the
Envelope, the band width follows volatility: the bands widen in turbulent markets and squeeze in quiet ones.

## Formula

$$
B_t = \mathrm{MA}^{\text{type}}_n(x)_t, \qquad
\sigma_t = \sqrt{\frac1n\sum_{k=0}^{n-1}\left(x_{t-k} - \mu_t\right)^2}, \quad \mu_t = \mathrm{SMA}_n(x)_t
$$

$$
U_t = B_t + k\,\sigma_t, \qquad L_t = B_t - k\,\sigma_t
$$

$\sigma$ is the **population** deviation (divides by $n$) of the window about its SMA, whatever the basis type, as in
Pine `ta.stdev`. It is computed in two passes per window (mean, then squared deviations), never as
$E[x^2] - E[x]^2$, which loses all precision when $\sigma \ll \lvert\mu\rvert$.

## Kernel, lag and noise
The basis is the chosen average with its own kernel, lag and NRF (see its page). The bands are not linear filters:
$\sigma$ of a sum is not the sum of the $\sigma$s. They are shift-invariant ($\sigma(x + c) = \sigma(x)$) and scale with
the price ($\sigma(a x) = \lvert a\rvert\,\sigma(x)$), so the band width is in price units.

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 20 | TradingView default (about a month of daily bars) |
| Basis MA type | SMA | TradingView default |
| Source | close | TradingView default |
| StdDev | 2 | TradingView default |
| Offset | 0 | TradingView default |

## Warm-up
First valid bar index: $\max(w_{\text{basis}},\ n - 1) + \text{offset}$, i.e. 19 at the defaults. With a basis that
warms up later (DEMA, T3, ...) the bands start with the basis.

## Filter view
Not offered: the bands are not linear filters (see above), and the drawer's Filter view covers moving averages.

## What it measures
How unusual the current price is relative to the last $n$ bars: $(x_t - B_t)/\sigma_t$ is a z-score. The band width
$(U - L)/B = 2k\sigma/B$ is a relative volatility measure ("squeeze" when it is at a multi-month low).

## Differences vs TradingView
- Same formula and defaults as TradingView's built-in (population $\sigma$, `ta.stdev`).
- TradingView offers SMA, EMA, SMMA (RMA), WMA and VWMA as the basis; here any of the 15 types. $\sigma$ stays about
  the SMA in both.

## Pitfalls
- Population vs sample $\sigma$: other tools (pandas `std()`, Excel `STDEV`) divide by $n-1$; their bands are
  $\sqrt{n/(n-1)} = 1.026$ times wider at $n = 20$.
- "95 % inside the bands" assumes independent, normally distributed prices; real prices trend and have fat tails, so
  closes outside the bands are both more frequent and more persistent.
- A close above the upper band in a strong trend is common ("walking the band"), not by itself a sell signal.
