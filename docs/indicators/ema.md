# Exponential Moving Average (ema)

## Formula
$$ E_t = \alpha x_t + (1-\alpha)E_{t-1}, \qquad \alpha = \frac{2}{n+1}, \qquad E_{n-1} = \mathrm{SMA}_n $$

Kernel $h_k = \alpha(1-\alpha)^k$ (infinite). Lag $\frac{1-\alpha}{\alpha} = \frac{n-1}{2}$ and noise reduction
$\frac{\alpha}{2-\alpha} = \frac1n$: the same as an $n$-bar SMA, which is why $\alpha = \frac{2}{n+1}$.

## Defaults
| Param | Default | Why |
|---|---|---|
| Source | close | TradingView default |
| Length | 9 | TradingView default |
| Offset | 0 | Display shift, $\ge 0$ |

## Warm-up
First valid bar index: $n - 1$ (the SMA seed).

## What it measures
A trend-following average that reacts to new prices immediately and forgets old ones geometrically.

## Differences vs TradingView
The seed is the SMA of the first $n$ values (TA-Lib convention; verified equal to TA-Lib on every bar). The seed
influence after $k$ bars is $(1-\alpha)^k$ (for $n=9$: $0.8^{100} \approx 2\times10^{-10}$), so values agree with
TradingView to display precision once a few dozen bars of history are loaded. The chart always loads
$\max(25n, 250)$ extra bars, so this never shows. To be confirmed in the TV cross-check (`tv_crosscheck.json`).

## Pitfalls
- The value depends (very weakly) on where the history starts.
