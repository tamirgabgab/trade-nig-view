# Envelope (`envelope`)

A moving average (the basis) with two bands a fixed percentage above and below it. Use it to mark how far price has
stretched from its trend in relative terms; the bands do not adapt to volatility.

## Formula

$$
B_t = \mathrm{MA}^{\text{type}}_n(x)_t, \qquad U_t = B_t\left(1 + \frac{p}{100}\right), \qquad L_t = B_t\left(1 - \frac{p}{100}\right)
$$

## Kernel, lag and noise

Each band is the basis scaled by a constant, so for a linear basis with kernel $h_k$ the bands are linear filters
with kernels $(1 \pm p/100)\,h_k$:

- **DC gain** $1 \pm p/100$ (1.1 and 0.9 at the default): on a flat price the upper band sits 10 % above it.
- **Lag**: scaling a kernel does not move its centre of mass, so all three lines have the basis's lag
  $\bar k = \sum_k k\,h_k / \sum_k h_k$ (9.5 bars for SMA 20) and the same group delay at every period.
- **NRF**: $(1 \pm p/100)^2 \sum_k h_k^2$ (0.0605, 0.05, 0.0405 for SMA 20). The band-to-basis distance
  $(p/100)\,B_t$ inherits the basis's noise, scaled by $p/100$.
- **Magnitude**: $\lvert H_U\rvert$ is $\lvert H_B\rvert$ shifted by $20\log_{10}(1.1) = +0.83$ dB, and
  $\lvert H_L\rvert$ by $20\log_{10}(0.9) = -0.92$ dB.

**When does a trend reach a band?** On a steady trend of slope $b$ the basis runs $\bar k$ bars behind:
$x_t - B_t = \bar k\,b$. Price touches the upper band only if $\bar k\,b \ge (p/100)\,B_t$, i.e.

$$
\frac{b}{B_t} \ge \frac{p}{100\,\bar k}.
$$

For SMA 20 and 10 % that is a sustained rise of 1.05 % of price per bar. On daily bars almost no trend does that, so
band touches at the defaults come from shocks and fast deviations, not from steady trends. A faster basis (smaller
lag) needs an even steeper trend.

If the basis is adaptive (McGinley, KAMA) or volume-weighted (VWMA), the bands inherit its data-dependent behaviour
and have no fixed kernel either.

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 20 | TradingView default |
| Percent | 10 | TradingView default |
| Source | close | TradingView default |
| Basis MA type | SMA | TradingView default ("Exponential" off) |

## Warm-up
First valid bar index: that of the basis average (19 for SMA 20); all three lines start together.

## Filter view
The drawer shows three entries (upper, basis, lower), each with impulse, step, $\lvert H\rvert$ in dB vs period and
group delay. At the defaults:

- **Impulse**: three flat 20-tap kernels of height 0.055, 0.05 and 0.045.
- **Step**: linear ramps that reach their DC gains 1.1, 1 and 0.9 on bar 19 (the step bar is bar 0).
- **Magnitude**: three copies of the SMA 20 curve offset by $+0.83$, 0 and $-0.92$ dB, with exact zeros at periods
  $20/j$ (20, 10, 6.67, 5, 4, ... , 2) shown as deep notches (the plot's frequency grid hits 20 and 2 exactly, where it
  floors at $-120$ dB); at $P = 200$ the upper band reads
  $+0.68$ dB and the lower $-1.06$ dB.
- **Group delay**: constant 9.5 bars for all three (the SMA kernel is symmetric, so the phase is linear), undefined at
  the zeros.

## What it measures
How far price is from its trend in percent. A close outside a band is a move larger than $p$ % from the average.

## Differences vs TradingView
- Same multiplicative bands and defaults as TradingView's Envelope (length 20, 10 %, close).
- TradingView offers SMA or EMA as the basis (the "Exponential" switch); here any of the 15 types.

## Pitfalls
- Band width does not adapt to volatility: 10 % is wide for a utility stock and narrow for a crypto asset (see
  Bollinger Bands for a volatility-scaled version).
- The bands are not symmetric in log terms: $\ln 1.1 = 0.095$ but $\ln 0.9 = -0.105$. From the lower band price needs
  $+11.1$ % to return to the basis.
- The bands lag exactly as much as the basis; an "outside the band" reading compares today's price with a trend
  value from about $\bar k$ bars ago.
