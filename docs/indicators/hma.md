# Hull Moving Average (`hma`)

Alan Hull's average (2005) cancels most of a WMA's lag with a difference of two WMAs, then smooths the result with a
short WMA of about $\sqrt n$ bars. It is a finite (FIR) filter, smooth and fast. Its lag is exactly zero only for some
lengths.

## Formula
$$ H_t = \mathrm{WMA}_s\big(2\,\mathrm{WMA}_m(x) - \mathrm{WMA}_n(x)\big)_t, \qquad m = \lfloor n/2 \rfloor, \quad s = \lfloor \sqrt n \rfloor $$

with $\mathrm{WMA}_\ell$ the linear-weighted average, kernel $\frac{2(\ell-k)}{\ell(\ell+1)}$ for $k = 0\ldots\ell-1$.

## Kernel, lag and noise
The kernel is the convolution $h = w_s * (2w_m - w_n)$. Its length is $n + s - 1$ taps (11 at $n = 9$), its DC gain is
$2 - 1 = 1$, and it has negative taps because the inner difference subtracts the long WMA.

**Lag by moment algebra.** A WMA of length $\ell$ lags $\frac{\ell-1}{3}$ bars. First moments are linear in a
combination whose weights sum to 1, and they add in a cascade:

$$
\bar k = \underbrace{2\cdot\frac{m-1}{3} - \frac{n-1}{3}}_{\text{inner difference}} + \underbrace{\frac{s-1}{3}}_{\text{outer WMA}}
= \frac{s + 2m - n - 2}{3}.
$$

- $n$ even ($2m = n$): $\bar k = \frac{s-2}{3}$, which is zero only when $s = 2$, i.e. $n \in \{4, 6, 8\}$.
- $n$ odd ($2m = n - 1$): $\bar k = \frac{s-3}{3}$, which is zero only when $s = 3$, i.e. $n \in \{9, 11, 13, 15\}$.
- Lengths 2, 3, 5 and 7 have **negative** lag ($-\frac13$ bar, $-\frac23$ for $n = 3$): they lead a ramp.
- From $n = 16$ on, the lag is positive and grows like $\frac{\sqrt n - 2}{3}$. Some values: 0.67 bars at
  $n = 20$, 1 bar at $n = 26$, $28$ and $30$.

The zeros are integer coincidences. With unrounded lengths $m = n/2$ and $s = \sqrt n$, the inner difference has lag
$-\frac13$ (a slight lead) and the outer WMA adds $\frac{\sqrt n - 1}{3}$. Hull's design is therefore "low lag"
($\approx \sqrt n / 3$, small compared with the WMA's $n/3$), not zero lag. Rounding $m$ and $s$ down moves it across
zero for small $n$.

**Taps at $n = 9$** ($m = 4$, $s = 3$, newest first):

$$ h = (0.300,\ 0.411,\ 0.363,\ 0.185,\ 0.007,\ -0.070,\ -0.081,\ -0.059,\ -0.037,\ -0.015,\ -0.004) $$

The peak sits at $k = 1$, not $k = 0$, because the outer WMA spreads the newest bar over three taps. The six negative
taps sum to $-\frac{4}{15} = -0.267$.

**Noise and curvature.** At $n = 9$: $\mathrm{NRF} = 0.4418$, which is 4.0 times the SMA's $\frac19$ and 3.1 times
the WMA's 0.141. The second moment is $\sum_k k^2 h_k = -7.89$, so on a parabola $ct^2$ the HMA settles $7.89c$ below
price.

| $n = 9$ (measured) | WMA | HMA |
|---|---|---|
| Lag (bars) | 2.67 | 0 |
| NRF | 0.141 | 0.442 |
| Step peak | 1 (monotone) | 1.267 at bar 4 |
| Peak gain | none (below 0 dB) | +2.27 dB at $P \approx 13.5$ |
| $-3$ dB period | 17 bars | 6.3 bars |

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 9 | TradingView default (minimum 2) |
| Source | close | TradingView default |
| Offset | 0 | Display shift (bars to the right); adds that many bars of lag |

## Warm-up
First valid bar index: $n + s - 2$, which is 10 at $n = 9$. $\mathrm{WMA}_n$ is first valid at $n-1$, and the outer
$\mathrm{WMA}_s$ needs $s - 1$ more bars. Length must be $\ge 2$.

## Filter view
- **Impulse:** 11 stems: a hump peaking at $k = 1$ (0.411), a sign change after $k = 4$ and a negative lobe that ends
  at $k = 10$. The kernel is finite, so nothing follows.
- **Step:** the response climbs to **1.267** at bar 4 (27% overshoot) and returns to exactly 1 at bar 10, with no undershoot.
- **Magnitude:** about 0 dB at long periods, a bump of +2.27 dB (gain 1.30) near $P \approx 13.5$ bars, 0 dB again
  near 7.8 bars and $-3$ dB near 6.3 bars. At $P = 2$ it is $-20.3$ dB: the outer WMA gives good attenuation of
  bar-to-bar noise.
- **Group delay:** about 0 at long periods (0.035 bars at $P = 200$). It rises to 2.1 bars near $P \approx 11$ and is
  negative below about 4.5 bars (down to $-2.0$ near $P \approx 3.5$, where the gain is already $-17$ dB).

## What it measures
A smooth trend line that turns almost as soon as price does. Its slope (rising or falling) is the usual signal. Cycles
of about $1.4n$ to $1.5n$ bars are exaggerated by 25 to 30% (2.0 to 2.3 dB), so swings look larger on the HMA than in price.

## Differences vs TradingView
TradingView's built-in computes the same expression with `length/2` and `sqrt(length)` as the two WMA lengths. We
round both down ($m = \lfloor n/2 \rfloor$, $s = \lfloor\sqrt n\rfloor$). How Pine rounds a fractional WMA length is
unconfirmed (assumption E2) and is checked in the TradingView cross-check. At the default $n = 9$ only the inner length
is in question ($4$ vs $4.5$), since $\sqrt 9 = 3$ exactly.

## Pitfalls
- "Zero lag" depends on the length: 0 at 9 but $+\frac13$ at 10 and $+\frac23$ at 20. Small lengths lead the trend.
- The 27% step overshoot means the HMA can sit well beyond the highest (or lowest) recent close after a gap. Do not use
  it as a support or resistance level the way an SMA is used.
- About 4 times the SMA's noise variance at the same length. A slope-change signal on a short HMA whipsaws in ranges.
