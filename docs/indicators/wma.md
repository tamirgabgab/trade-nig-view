# Weighted Moving Average (`wma`)

A linearly weighted FIR average: the newest bar weighs $n$, the oldest $1$. At the same length it lags less than the
SMA and is a little noisier; at the same lag it is the least noisy average with non-negative weights. It is also the
building block of the Hull MA and the LSMA.

## Formula
$$
\mathrm{WMA}_t = \frac{\sum_{k=0}^{n-1}(n-k)\,x_{t-k}}{n(n+1)/2},
\qquad
H(z) = \frac{2}{n(n+1)}\sum_{k=0}^{n-1}(n-k)\,z^{-k}
$$

## Kernel, lag and noise
Impulse response $h_k = \frac{2(n-k)}{n(n+1)}$ for $0 \le k \le n-1$: a ramp from $\frac{2}{n+1}$ (newest) down to
$\frac{2}{n(n+1)}$ (oldest). The normaliser is $\sum_{k<n}(n-k) = \frac{n(n+1)}{2}$, so the DC gain is 1.

**Lag.** With $\sum_{k<n} k(n-k) = n\cdot\frac{n(n-1)}{2} - \frac{(n-1)n(2n-1)}{6} = \frac{n(n-1)(n+1)}{6}$,

$$
\bar k = \frac{2}{n(n+1)}\cdot\frac{n(n-1)(n+1)}{6} = \frac{n-1}{3},
$$

two thirds of the SMA's $\frac{n-1}{2}$.

**Noise.** With $\sum_{k<n}(n-k)^2 = \sum_{j=1}^{n} j^2 = \frac{n(n+1)(2n+1)}{6}$,

$$
\mathrm{NRF} = \frac{4}{n^2(n+1)^2}\cdot\frac{n(n+1)(2n+1)}{6} = \frac{2(2n+1)}{3n(n+1)},
$$

which is $\frac{2(2n+1)}{3(n+1)}$ times the SMA's $\frac1n$ (1.27 at $n = 9$, tending to $\frac43$).

**Equal lag instead of equal length.** A WMA with lag $L$ has $n = 3L + 1$ and
$\mathrm{NRF} = \frac{2(2L+1)}{(3L+1)(3L+2)}$, while an SMA or EMA with the same lag has $\frac{1}{2L+1}$. The ratio
tends to $\frac89$: at equal lag the WMA is about 11% quieter. Example, lag 4: WMA(13) has NRF 0.0989, SMA(9) and
EMA(9) have 0.1111.

**Why: the WMA is the minimum-noise average for its lag.** Minimise $\sum_k h_k^2$ subject to $\sum_k h_k = 1$,
$\sum_k k\,h_k = L$ and $h_k \ge 0$. The problem is strictly convex, and its KKT conditions give
$h_k = \max(\lambda + \mu k,\,0)$: a straight line clipped at zero. The WMA kernel is exactly such a clipped ramp
(it would reach zero at $k = n$), so for every lag of the form $\frac{n-1}{3}$ no non-negative kernel (SMA, EMA, ALMA,
any other) is smoother than $\mathrm{WMA}_n$.

**No nulls.** Multiply by $1 - z^{-1}$: $(1 - z^{-1})\sum_{k<n}(n-k)z^{-k} = n - \sum_{k=1}^{n} z^{-k}$. On the unit
circle the sum of $n$ unit phasors reaches $n$ only if all of them equal 1, i.e. at $\omega = 0$, where $H = 1$. So
$H(e^{j\omega})$ never vanishes: the WMA has no exact spectral zeros for any $n$. At $P = 2$ its gain is $\frac1n$ for
odd $n$ and $\frac{1}{n+1}$ for even $n$.

| At the default $n = 9$ | Value |
|---|---|
| Lag $\bar k$ | 2.667 bars (measured ramp lag 2.667) |
| NRF | 0.1407 |
| Half-power (−3 dB) period | 17.0 bars (SMA(9): 20.2) |
| Stopband | shallow shoulders near −13, −17 and −19 dB, lowest −19.9 dB at $P \approx 2.23$ |
| Gain at $P = 2$ | −19.08 dB |

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 9 | TradingView default (range 1–5000) |
| Source | close | TradingView default |
| Offset | 0 | Display shift to the right, $0$–$500$ |

## Warm-up
First valid bar index: $n - 1$ (8 at the default), plus the offset.

## Filter view
- **Impulse:** nine stems falling linearly from 0.2 to 0.0222, then zero.
- **Step:** $\frac{(k+1)(2n-k)}{n(n+1)}$: 0.2, 0.378, 0.533, ..., exactly 1 on the 9th bar. It rises faster than the
  SMA's straight ramp at first and then bends over; no overshoot, finite settling.
- **Magnitude:** −0.08 dB at 100 bars, −0.53 dB at 40, −2.15 dB at 20, then a stopband without notches: the
  Dirichlet nulls of the SMA are replaced by gentle ripples whose peaks and troughs differ by less than 1 dB.
- **Group delay:** the kernel is not symmetric, so the phase is not linear. The delay is 2.66 bars at 200 bars
  (2.667 at DC) and falls steadily through the passband (2.59 at 40 bars, 2.30 at 20), so faster swings are delayed
  less than a trend. In the stopband it dips to about −1.78 bars near $P \approx 8$ and then wanders.
- **Compare:** set the WMA to length 13 and compare it with EMA 9 or SMA 9: equal lag (4.00), lower NRF (0.099 vs
  0.111).

## What it measures
An average that trusts recent bars more. On a steady trend it trails by $\frac{n-1}{3}$ bars, so it hugs price
closer than an SMA of the same length and turns sooner; old bars fade out linearly, so the drop-off effect of the SMA
is much weaker (the leaving bar weighs only $\frac{2}{n(n+1)}$).

## Differences vs TradingView
None expected; same formula as Pine `ta.wma` (called LWMA on some other platforms). Verified equal to TA-Lib `WMA`.
The manual TradingView cross-check (`tv_crosscheck.json`) is still waiting for values.

## Pitfalls
- "Less lag" is not free at equal length: WMA(9) has 27% more noise variance than SMA(9). Compare at equal lag
  instead, where the WMA wins: WMA(13) ≈ EMA(9) in lag, with less noise.
- No nulls: a cycle of exactly $n$ bars is attenuated (−10.7 dB at 9 bars for $n = 9$), not removed.
- The Hull MA (`hma`) and the LSMA (`lsma`) combine WMAs with negative weights; their overshoot comes from that
  combination, not from the WMA itself.
