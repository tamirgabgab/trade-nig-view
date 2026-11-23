# MACD (`macd`)

Gerald Appel's Moving Average Convergence Divergence: the distance between a fast and a slow average, a signal line
that smooths it, and the histogram between the two.

## Formula

$$
\mathrm{MACD}_t = \mathrm{MA}_f(x)_t - \mathrm{MA}_s(x)_t, \qquad S_t = \mathrm{MA}^{\text{sig}}_g(\mathrm{MACD})_t,
\qquad H_t = \mathrm{MACD}_t - S_t
$$

The signal average is seeded on the first valid MACD values.

## Kernel, lag and noise
With linear averages (EMA, SMA, ...) the MACD line is a linear filter with kernel $h^{(f)}_k - h^{(s)}_k$: its DC gain is
$1 - 1 = 0$, so it removes the price level and keeps the trend's slope. On a straight line of slope $b$ it settles at
$b\,(\bar k_s - \bar k_f)$ (for EMAs $\bar k = (n-1)/2$: $b \cdot 7$ at 12/26). It is a band-pass-like filter, so
"lag" in the moving-average sense does not apply.

## Defaults
| Param | Default | Why |
|---|---|---|
| Fast length | 12 | TradingView default |
| Slow length | 26 | TradingView default |
| Signal smoothing | 9 | TradingView default |
| Source | close | TradingView default |
| Oscillator MA type | EMA | TradingView default |
| Signal line MA type | EMA | TradingView default |

Level 0.

## Warm-up
First valid bar index: MACD $\max(w(f), w(s))$ (25 at the defaults); signal and histogram
$\max(w(f), w(s)) + w_{\text{sig}}(g)$ (33).

## Filter view
Not offered (an oscillator, not a moving average).

## What it measures
Trend momentum in price units: MACD above 0 means the fast average is above the slow one; the histogram shows whether
that gap is widening (strong colour) or narrowing (pale colour).

## Differences vs TradingView
- Same formula and defaults; TradingView offers SMA or EMA for both averages, here any of the 15 types.
- TA-Lib's `MACD` starts its fast EMA later (aligned with the slow one), so its first values differ; they converge
  after a few hundred bars.

## Pitfalls
- The MACD is in price units: values are not comparable across symbols or across a big price change of one symbol.
- Crossings of the signal line lag; on choppy prices they whipsaw.
