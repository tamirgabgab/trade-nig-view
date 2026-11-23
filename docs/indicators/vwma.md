# Volume Weighted Moving Average (`vwma`)

The average of the last $n$ prices, each weighted by its bar's volume: roughly the average price at which the window's
shares changed hands. With constant volume it is exactly the SMA; with real volume its weights change from bar to bar,
so it is not a fixed filter. Use it next to an SMA of the same length: the gap between the two says where the volume
traded.

## What it measures
The volume-weighted average price of the last $n$ bars (with `close` standing in for the trade price), a rolling
cousin of the session VWAP. It answers "at what price did most of the recent trading happen?". Its distance from the
SMA says whether buying and selling were heaviest near the window's highs (VWMA above SMA) or near its lows (below).
Moves on heavy volume shift it more than quiet drifts do.

Move the length on the `volatility_regime` scenario, where volume grows with the size of the bar's move: after the
switch to wild markets the big bars pull the line towards themselves.

```lab
{"kind": "param", "indicator": "vwma", "vary": "length", "min": 5, "max": 100, "scenario": "volatility_regime"}
```

## Formula

$$
\textcolor{#43A047}{V_t} = \frac{\sum_{k=0}^{n-1} x_{t-k}\,v_{t-k}}{\sum_{k=0}^{n-1} v_{t-k}}
= \frac{\mathrm{SMA}_n(x\,v)_t}{\mathrm{SMA}_n(v)_t}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#43A047}{V_t}$ | the VWMA at bar $t$ | price |
| $x_{t-k}$ | source price $k$ bars ago | price |
| $v_{t-k}$ | that bar's volume | shares (or contracts) |
| $n$ | length | 1–5000, default 20 |
| $\mathrm{SMA}_n(\cdot)_t$ | simple average of the last $n$ values | |

`NaN` where the window's total volume is 0.

## Kernel, lag and noise
**No fixed kernel.** Write the output as a weighted sum,

$$
\textcolor{#43A047}{V_t} = \sum_{k=0}^{n-1} w_{t,k}\,x_{t-k},
\qquad
w_{t,k} = \frac{v_{t-k}}{\sum_{j=0}^{n-1} v_{t-j}},
\qquad \sum_k w_{t,k} = 1,\; w_{t,k} \ge 0
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $w_{t,k}$ | weight of the bar $k$ bars ago, in the window ending at $t$: its share of the window's volume | 0–1 |
| $v$, $x$, $n$ | as above | |

For a fixed volume series this is linear in the price, but the weights depend on $t$: it is a linear
**time-varying** filter. Shifting the prices by one bar while the volumes stay put does not simply shift the output, so
there is no single impulse response $h_k$, no transfer function $H(z)$, and no magnitude or group-delay curve. Viewed
as a function of price and volume together it is not even linear (a ratio of sums). Scaling every volume by the same
constant changes nothing; only relative volume inside the window matters.

**What replaces lag and NRF.** Each bar has its own kernel, hence its own instantaneous lag and noise factor:

$$
\bar k_t = \sum_k k\,w_{t,k} \in [0,\, n-1],
\qquad
\mathrm{NRF}_t = \sum_k w_{t,k}^2 = \frac{\sum_k v_{t-k}^2}{\left(\sum_k v_{t-k}\right)^2} \ge \frac1n
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\bar k_t$ | instantaneous lag: the volume-weighted mean age of the window | 0 to $n-1$ bars |
| $\mathrm{NRF}_t$ | instantaneous noise reduction factor | $\frac1n$ to 1 |

The inequality is Cauchy–Schwarz, with equality only for constant volume in the window. A heavy-volume bar pulls
$\bar k_t$ towards its own position: towards 0 (less lag) when it is the newest bar, towards $n-1$ as it ages. Against
price noise that is independent of volume, the VWMA is therefore never smoother than the SMA of the same length; its
effective number of bars is $n_{\text{eff}} = 1/\mathrm{NRF}_t$. Example: one bar with 10× the usual volume in a
20-bar window gets weight $\frac{10}{29} = 34.5\%$, and $n_{\text{eff}}$ drops from 20 to $\frac{29^2}{119} = 7.07$.

**Relation to the SMA.** With window means $\bar x$, $\bar v$, $\overline{xv}$ and the population covariance
$\operatorname{cov}_n(x, v) = \overline{xv} - \bar x\,\bar v$,

$$
\textcolor{#43A047}{V_t} = \frac{\overline{xv}}{\bar v} = \textcolor{#2962FF}{\mathrm{SMA}_n(x)_t} + \frac{\operatorname{cov}_n(x, v)}{\bar v}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\bar x$, $\bar v$, $\overline{xv}$ | window means of price, volume and their product | price, shares, price × shares |
| $\operatorname{cov}_n(x, v)$ | population covariance of price and volume inside the window | price × shares |
| $\textcolor{#2962FF}{\mathrm{SMA}_n(x)_t}$ | the SMA of the same length | price |

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

## How to read it
- **Price above or below the line.** As for the SMA: on a trend the line lags by about $\frac{n-1}{2}$ bars, so price
  above the VWMA is a (noisy) sign of an up-trend. Heavy recent volume shortens that lag.
- **VWMA against the SMA of the same length.** The useful extra reading. VWMA above SMA: the window's volume was
  concentrated at its higher prices; below: at its lower prices. The gap is $\operatorname{cov}_n(x, v)/\bar v$, in
  price units.
- **Slope.** Read like an SMA's, but a single heavy bar can turn it abruptly, and the same bar leaving the window
  $n$ bars later can turn it back.
- **Crossings.** Price crossing the VWMA after a high-volume move happens sooner than crossing the SMA, because the
  heavy bar has pulled the line towards itself.
- **Trend vs range.** In a trend it behaves like the SMA. In a range with volume spikes at the extremes it sits
  closer to the extreme that traded more.
- **The length.** Longer windows lag more and dilute single volume spikes; short windows let one bar dominate
  ($n_{\text{eff}}$ can fall far below $n$).

## Why it works
**Price above the line** works as for any lagging average: on a random walk with drift $b$ and increment noise
$\sigma$, $P(x_t > \text{line}) = \Phi(\rho\, b/\sigma)$ with the trend-detection ratio $\rho$ (derivation on the LSMA
page). With constant volume the VWMA is the SMA 20, $\rho = 3.82$.

**The VWMA–SMA gap carries information only if volume does.** From the relation to the SMA,
$\textcolor{#43A047}{V_t} - \textcolor{#2962FF}{\mathrm{SMA}_t} = \operatorname{cov}_n(x, v)/\bar v$. If the volume of
a bar does not depend on whether the bar went up or down, then inside a trending window the heavy bars are spread
evenly over old (low) and new (high) prices, the covariance has mean 0, and the sign of the gap is a coin flip. The
synthetic scenarios are built exactly like that: their volume is $10^6 e^{0.3\xi_t + 20\lvert r_t\rvert}$ (larger on
bigger moves of either sign). On real data the question is open, and the data picker lets you test it on a real
symbol.

The lab on `reversal` with seed 1 (1000 bars, horizon 10): VWMA 20 above SMA 20 −0.08 % (95 % interval −1.10 % to
+0.95 %, n = 67), close above VWMA 20 +0.97 % (−0.07 % to +2.00 %, n = 58), close above SMA 20 +1.07 % (+0.03 % to
+2.10 %, n = 58). The two "close above" rules agree almost exactly, as they must when volume carries no direction; the
gap rule stays inside the noise for seeds 1 to 5 and on `random_walk` and `volatility_regime` too. On a random walk
no rule built on past prices or volumes can have an edge, because the future increments are independent of them. One
rule on one sample: not a backtest and not investment advice.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0],
 "rules": [
  {"label": "VWMA 20 above SMA 20", "left": {"indicator": {"id": "vwma", "params": {}}, "output": "ma"},
   "op": "gt", "right": {"indicator": {"id": "sma", "params": {"length": 20}}, "output": "ma"}},
  {"label": "Close above VWMA 20", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "vwma", "params": {}}, "output": "ma"}},
  {"label": "Close above SMA 20", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 20}}, "output": "ma"}}
 ]}
```

## Combine with
- **SMA 200 as the trend filter**: the long lag gives a sharp test of the long trend ($\rho = 12.2$).
- **Close above VWMA 20 as the trigger**: the shorter-term trend, with heavy recent bars weighted more.
- **VWMA 20 above SMA 20 as the volume confirmation**: "the volume was at the higher prices". On the synthetic data it
  can only add noise (see above); on real data it is the rule to test.

With seed 1 on `reversal` (horizon 10): close above SMA 200 +1.48 % (−0.05 % to +3.01 %, n = 36); filter and
trigger together +1.78 % (+0.28 % to +3.28 %, n = 30); with the volume confirmation as well +1.69 % (+0.24 % to
+3.15 %, n = 23), fewer episodes and no gain. The pair is positive for seeds 1 to 5 (+1.20 % to +2.63 %, interval
above 0 in three of them). On `random_walk` it has no edge (seed 1: +1.00 %, −0.70 % to +2.70 %, n = 25). One
sample, no costs; not investment advice.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Close above SMA 200", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 200}}, "output": "ma"}},
  {"label": "Close above VWMA 20", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "vwma", "params": {}}, "output": "ma"}},
  {"label": "VWMA 20 above SMA 20", "left": {"indicator": {"id": "vwma", "params": {}}, "output": "ma"},
   "op": "gt", "right": {"indicator": {"id": "sma", "params": {"length": 20}}, "output": "ma"}}
 ]}
```

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
- The synthetic scenarios' volume says nothing about direction, so the labs cannot show a volume edge; only real data
  can.

## Exercise
1. In the "Why it works" lab, switch the data picker from the random stock to a real symbol (e.g. SPY) and switch on
   only "VWMA 20 above SMA 20". Is its interval still around 0? Then try a few other symbols: if one shows an edge,
   how many rules and symbols did you try before finding it?
2. In the first lab on `volatility_regime`, move the length from 50 to 10. Where does the VWMA differ most from what
   an SMA of the same length would show, the calm half or the wild half, and why ($n_{\text{eff}}$)?
3. Start the replay on NVDA on 24 May 2023, the evening of its earnings report, with VWMA 20 and SMA 20. The next bar
   gaps up on very heavy volume: how far does each line move on that bar, and what happens to the VWMA 20 bars
   later when the bar leaves the window?

```lab
{"kind": "replay", "symbol": "NVDA", "date": "2023-05-24",
 "indicators": [{"id": "vwma", "params": {}}, {"id": "sma", "params": {"length": 20}}]}
```
