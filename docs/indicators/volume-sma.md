# Volume SMA (`vol_sma`)

The simple moving average of volume, drawn on the volume histogram's scale so you can see which bars trade more than
usual.

## Formula

$$
y_t = \frac1n\sum_{k=0}^{n-1} V_{t-k}
$$

## Kernel, lag and noise
An SMA of the volume: flat kernel $h_k = 1/n$ for $k < n$, lag $(n-1)/2$ (9.5 bars at 20), NRF $1/n$.

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 20 | TradingView's "Volume" indicator MA length |

## Warm-up
First valid bar index: $n - 1$ (19).

## Filter view
Not offered here (the same response as SMA; see the SMA page).

## What it measures
Typical volume. A bar well above the line (for example $2\times$) marks unusual interest.

## Differences vs TradingView
- Same as the moving average inside TradingView's "Volume" indicator (SMA, length 20).

## Pitfalls
- Symbols without volume (indices, forex) give 0.
- The last bar of a live session is still forming: its volume (and the average) grows during the session.
