# Volume Weighted Moving Average (`vwma`)

The average of the last $n$ prices, each weighted by its bar's volume: roughly the average price at which the window's
shares changed hands. With constant volume it is exactly the SMA; with real volume its weights change from bar to bar,
so it is not a fixed filter. Use it next to an SMA of the same length: the gap between the two says where the volume
traded.

## Formula
$$
V_t = \frac{\sum_{k=0}^{n-1} x_{t-k}\,v_{t-k}}{\sum_{k=0}^{n-1} v_{t-k}}
= \frac{\mathrm{SMA}_n(x\,v)_t}{\mathrm{SMA}_n(v)_t}
$$

with $v_t$ the bar's volume. `NaN` where the window's total volume is 0.

## Kernel, lag and noise
**No fixed kernel.** Write the output as a weighted sum,

$$
V_t = \sum_{k=0}^{n-1} w_{t,k}\,x_{t-k},
\qquad
w_{t,k} = \frac{v_{t-k}}{\sum_{j=0}^{n-1} v_{t-j}},
\qquad \sum_k w_{t,k} = 1,\; w_{t,k} \ge 0.
$$

For a fixed volume series this is linear in the price, but the weights depend on $t$: it is a linear
**time-varying** filter. Shifting the prices by one bar while the volumes stay put does not simply shift the output, so
there is no single impulse response $h_k$, no transfer function $H(z)$, and no magnitude or group-delay curve. Viewed
as a function of price and volume together it is not even linear (a ratio of sums). Scaling every volume by the same
constant changes nothing; only relative volume inside the window matters.

**What replaces lag and NRF.** Each bar has its own kernel, hence its own instantaneous lag and noise factor:

$$
\bar k_t = \sum_k k\,w_{t,k} \in [0,\, n-1],
\qquad
\mathrm{NRF}_t = \sum_k w_{t,k}^2 = \frac{\sum_k v_{t-k}^2}{\left(\sum_k v_{t-k}\right)^2} \ge \frac1n.
$$

The inequality is Cauchy–Schwarz, with equality only for constant volume in the window. A heavy-volume bar pulls
$\bar k_t$ towards its own position: towards 0 (less lag) when it is the newest bar, towards $n-1$ as it ages. Against
price noise that is independent of volume, the VWMA is therefore never smoother than the SMA of the same length; its
effective number of bars is $n_{\text{eff}} = 1/\mathrm{NRF}_t$. Example: one bar with 10× the usual volume in a
20-bar window gets weight $\frac{10}{29} = 34.5\%$, and $n_{\text{eff}}$ drops from 20 to $\frac{29^2}{119} = 7.07$.

**Relation to the SMA.** With window means $\bar x$, $\bar v$, $\overline{xv}$ and the population covariance
$\operatorname{cov}_n(x, v) = \overline{xv} - \bar x\,\bar v$,

$$
V_t = \frac{\overline{xv}}{\bar v} = \mathrm{SMA}_n(x)_t + \frac{\operatorname{cov}_n(x, v)}{\bar v}.
$$

So $V_t = \mathrm{SMA}_t$ exactly when price and volume are uncorrelated inside the window (constant volume is the
obvious case), $V_t > \mathrm{SMA}_t$ when the heavy volume traded at the higher prices of the window, and
$V_t < \mathrm{SMA}_t$ when it traded at the lower ones.

| At the default $n = 20$, constant volume | Value |
|---|---|
| Lag (measured ramp lag) | 9.500 bars, as SMA(20) |
| NRF | $\frac{1}{20} = 0.05$, as SMA(20) |
| With real volume | $\bar k_t$ anywhere in $[0, 19]$, $\mathrm{NRF}_t \ge 0.05$ |

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 20 | TradingView default (range 1–5000) |
| Source | close | TradingView default |
| Offset | 0 | Display shift to the right, $0$–$500$ |

## Warm-up
First valid bar index: $n - 1$ (19 at the default), plus the offset. Any window whose total volume is 0 gives `NaN`.

## Filter view
The drawer measures linearity by running the real code: it changes the volume series and checks whether the output
changes. For the VWMA it does, so the drawer shows only the **step** and **ramp** responses, with the reason "the
weights are the bars' volumes, so the filter changes from bar to bar; the step and ramp responses are for constant
volume". No impulse, magnitude or group-delay plot is shown, because none would be valid for real volume.

With constant volume the VWMA reduces to SMA(20): the step response is a straight ramp of 0.05 per bar that reaches
1 on the 20th bar, and the ramp lag is 9.5 bars. On a real chart the response to the same price step depends on the
volume of the bars around it: a step on heavy volume is followed faster.

## What it measures
The volume-weighted average price of the last $n$ bars (with `close` standing in for the trade price), a rolling
cousin of the session VWAP. Its distance from the SMA is $\operatorname{cov}_n(x, v)/\bar v$: positive when buying
and selling were heaviest near the window's highs, negative near its lows. Moves on heavy volume shift it more than
quiet drifts do.

## Differences vs TradingView
Same formula as Pine `ta.vwma` ($\mathrm{SMA}(x v)/\mathrm{SMA}(v)$). A window with zero total volume gives `NaN`;
Pine's division by zero gives `na` as well. The values depend on the volume feed, and data vendors rarely report
identical volume, so expect larger differences from TradingView than for price-only averages. The manual cross-check
(`tv_crosscheck.json`) is still waiting for values.

## Pitfalls
- Symbols whose feed reports no volume (many forex pairs, some indices) have no VWMA line at all.
- A single volume outlier (index rebalancing, an earnings day) dominates the window for $n$ bars and then drops out
  abruptly, a stronger drop-off effect than the SMA's.
- Lag and smoothing are not fixed numbers: the same length can behave like a much shorter average when volume is
  concentrated on a few bars.
