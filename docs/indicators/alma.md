# Arnaud Legoux Moving Average (`alma`)

Arnaud Legoux and Dimitrios Kouzis-Loukas (2009) built this average from a Gaussian window placed near the recent end
of an $n$-bar window. All weights are positive, so it never overshoots. It gets its low lag by concentrating weight on
the last few bars, not by cancelling moments, and the Gaussian shape gives it a clean stopband.

## What it measures
A responsive, smooth price level: the Gaussian-weighted centre of the last few bars. It answers "where has price been
over the last handful of bars, with the zig-zag removed?", and it is a good default when you want EMA-like
responsiveness without the EMA's long tail or the overshoot of the lag-cancelling averages.

Move the window size: the line stays smooth at every length and never runs past price, but its delay grows with $n$.

```lab
{"kind": "param", "indicator": "alma", "vary": "length", "min": 3, "max": 60, "scenario": "reversal"}
```

## Formula

$$
\textcolor{#039BE5}{A_t} = \frac{\sum_{j=0}^{n-1} w_j\, x_{t-n+1+j}}{\sum_j w_j}, \qquad
w_j = \exp\!\left(-\frac{(j-m)^2}{2s^2}\right), \qquad m = \text{offset}\cdot(n-1), \qquad s = \frac{n}{\sigma}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#039BE5}{A_t}$ | the ALMA at bar $t$ | price |
| $x_{t-n+1+j}$ | source price at window position $j$ ($j = 0$ oldest, $j = n-1$ newest) | price |
| $w_j$ | Gaussian weight of position $j$ (normalised by $\sum_j w_j$) | 0–1 |
| $n$ | window size | 1–5000, default 9 |
| $\text{offset}$ | where the Gaussian's centre sits, as a fraction of the window | 0–1, default 0.85 |
| $m$ | centre of the Gaussian, in window positions | $0\ldots n-1$ |
| $\sigma$ | sharpness: a larger $\sigma$ gives a narrower Gaussian | 0.1–100, default 6 |
| $s$ | standard deviation of the Gaussian | bars |

With the `floor` flag, $m = \lfloor \text{offset}\cdot(n-1)\rfloor$.

## Kernel, lag and noise
In bars ago ($k = n-1-j$), the Gaussian is centred at $k_c = (1-\text{offset})(n-1)$ bars back with standard deviation
$s = n/\sigma$ bars. Note that $\sigma$ is a sharpness parameter: a **larger** $\sigma$ means a **narrower** window.
At the defaults ($n = 9$, offset 0.85, $\sigma = 6$): $m = 6.8$, so $k_c = 1.2$, and $s = 1.5$.

Normalised taps, newest first:

$$
h = (0.2205,\ 0.3009,\ 0.2634,\ 0.1478,\ 0.0532,\ 0.0123,\ 0.0018,\ 0.0002,\ 0.0000)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $h$ | the weights $h_0, h_1, \ldots, h_8$ of the bars 0 to 8 bars ago, at the defaults | sum to 1 |

**Lag.** Without truncation the lag would be $k_c = 1.2$ bars. The window ends at $k = 0$, only $0.8\,s$ on the
recent side of the centre, so the newest side of the Gaussian is cut off. That moves the centre of mass back to
$\bar k = 1.557$ bars. The old side is effectively unused: the four oldest taps sum to 0.014. At the defaults, ALMA(9)
is about a 5-bar filter.

**Noise.** $\mathrm{NRF} = 0.2334$. A full discrete Gaussian of width $s$ has
$\sum h_k^2 \approx \frac{1}{2\sqrt\pi\,s} = 0.188$; truncation raises it. For scale, an SMA of 4 bars has lag 1.5 and
NRF 0.25. In lag and noise, ALMA at its defaults is about an SMA(4). The difference is in the stopband (Filter view).

**The non-negative trade-off.** Since every $w_j \ge 0$, the output is a convex combination of the window's prices:

- it always lies within $[\min, \max]$ of the window;
- the step response rises monotonically from 0 to 1;
- $\lvert H(e^{j\omega})\rvert \le \sum_k h_k = 1$ at every frequency (no gain bump);
- the kernel's variance $\kappa_2$ is positive (1.49 at the defaults).

The lag can only reach 0 by putting all the weight on the newest bar, which means no smoothing. ALMA therefore trades
lag against noise inside these limits, with no negative weights like DEMA, HMA or LSMA.

**How the parameters move it** ($n = 9$):

| Setting | Lag (bars) | NRF |
|---|---|---|
| offset 0.85, $\sigma = 6$ (default) | 1.557 | 0.233 |
| default with `floor` ($m = 6$) | 2.151 | 0.205 |
| offset 0.5, $\sigma = 6$ (centred) | 4.000 | 0.189 |
| offset 1.0, $\sigma = 6$ | 0.910 | 0.323 |
| offset 0.85, $\sigma = 3$ | 2.558 | 0.148 |
| offset 0.85, $\sigma = 12$ | 1.216 | 0.383 |
| offset 0.85, $\sigma = 50$ | 1.000 | 1.000 |

A small $\sigma$ flattens the window towards an SMA. A large $\sigma$ collapses it onto the single bar nearest $m$,
which is a pure delay with no smoothing (the last row: one bar back, NRF 1). Slide the offset to see the first rows
of the table on a chart: towards 0 the Gaussian moves to the old end of the window and the line falls behind.

```lab
{"kind": "param", "indicator": "alma", "vary": "alma_offset", "min": 0, "max": 1, "scenario": "reversal"}
```

## Defaults
| Param | Default | Why |
|---|---|---|
| Window size | 9 | TradingView default |
| Offset | 0.85 | TradingView default: Gaussian centre 85% of the way to the newest bar |
| Sigma | 6 | TradingView default: width $s = n/6$ bars |
| Source | close | TradingView default |
| Floor offset | off | Pine `floor` argument: $m = \lfloor \text{offset}\cdot(n-1) \rfloor$ |

## Warm-up
First valid bar index: $n - 1$ (8 at the default).

## Filter view
At the defaults:
- **Impulse:** nine positive stems shaped like a bell, peaking at $k = 1$ (0.301), with $k = 0$ at 0.220 (the cut
  side). The oldest four are invisible.
- **Step:** a monotone S-curve from 0.22 to 1, settled to plotting precision by bar 7. No overshoot.
- **Magnitude:** never above 0 dB ($-0.006$ dB at $P = 200$). The gain falls smoothly to $-3$ dB near 9.3 bars and stays
  at or below $-15.6$ dB for every period of 4 bars or less ($-22.2$ dB at $P = 2$). The SMA(4) with the same lag and
  noise has exact zeros at $P = 2$ and $4$, but its sidelobes reach $-11.3$ dB in between. The Gaussian has no
  sidelobes apart from those caused by truncation.
- **Group delay:** nearly flat in the passband: 1.56 bars at long periods, 1.50 at $P = 20$, 1.34 at $P = 10$. It
  falls and turns negative only below about 4.5 bars ($-1.4$ near $P \approx 3.3$, where the gain is already $-20$ dB).

## How to read it
- **Price above or below the line.** At the defaults the line is only 1.56 bars behind, so price crosses it often:
  the side of price says what the last two or three bars did, not what the trend is.
- **Slope.** A rising ALMA means the Gaussian-weighted centre of the last few bars is moving up. Because the weights
  are positive and the passband is flat, the slope is a clean, delayed copy of the recent price direction without
  overshoot.
- **Crossings.** Two ALMAs (e.g. 9 and 50), or an ALMA and a slower SMA, give a cleaner crossover than price and one
  ALMA: the fast line removes the 2–4-bar noise before the comparison.
- **Distance from price.** Bounded: the line always lies inside the window's range, so a large gap only appears after
  a move that the window has not yet absorbed.
- **Trend vs range.** In a trend it trails price by about $\bar k$ bars of slope. In a range it follows the swings
  that are longer than about 9 bars and removes the shorter ones (the $-15.6$ dB stopband).
- **The parameters.** A longer window adds lag roughly in proportion to $n$; the offset moves the weight between the
  old end (lag up to $n-1$) and the newest bar; $\sigma$ sets how many bars really count.

## Why it works
"Price above the line" is a test of the trend's sign whose sharpness grows with the lag. For any average with kernel
$h_k$ on a random walk with drift $b$ and increment noise $\sigma_r$ (the general derivation is on the LSMA page):

$$
P\big(x_t > \textcolor{#039BE5}{A_t}\big) = \Phi\!\left(\rho\,\frac{b}{\sigma_r}\right), \qquad
\rho = \frac{\bar k}{\sqrt{\sum_{j \ge 1} H_j^2}}, \qquad H_j = \sum_{k \ge j} h_k
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $b$ | drift: the mean increment per bar | price per bar |
| $\sigma_r$ | standard deviation of one increment (not ALMA's $\sigma$) | price per bar |
| $\bar k$ | the kernel's lag | 1.557 bars at the defaults |
| $H_j$ | tail sum of the kernel | 0–1 |
| $\rho$ | trend-detection ratio | 1.65 for ALMA 9, 3.97 for ALMA 50, 6.09 for SMA 50 |
| $\Phi$ | standard normal distribution function | 0–1 |

ALMA's low lag is exactly what makes it a weak trend detector: $\rho = 1.65$ at the defaults. On `reversal`
($b/\sigma_r = 0.0025/0.012 = 0.21$, drift up for 500 bars and then down) that gives $P = 0.635$ against 0.898 for an
SMA 50 (a simulation of the same random walk reproduces both). After a signal that is right with probability $P$ the
expected 10-bar return is about $10\,b\,(2P - 1)$: 0.7 % for ALMA 9, 1.5 % for ALMA 50, 2.0 % for SMA 50. On a pure
random walk every one of these is zero, because the increments after bar $t$ are independent of the past.

The lab agrees in order of size. With seed 1 (1000 bars, horizon 10, `reversal`): close above ALMA 9 +0.16 % (95 %
interval −0.84 % to +1.16 %, n = 75), close above ALMA 50 +1.25 % (+0.12 % to +2.37 %, n = 53), close above SMA 50
+1.73 % (+0.50 % to +2.95 %, n = 47). Over seeds 1 to 5 the SMA 50 rule always has its interval above 0, ALMA 9 never,
and ALMA 50 varies (+0.08 % to +1.25 %). On `random_walk` all three are inside the noise. One rule on one sample: not
a backtest and not investment advice.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0],
 "rules": [
  {"label": "Close above ALMA 9", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "alma", "params": {}}, "output": "ma"}},
  {"label": "Close above ALMA 50", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "alma", "params": {"length": 50}}, "output": "ma"}},
  {"label": "Close above SMA 50", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 50}}, "output": "ma"}}
 ]}
```

So ALMA's strength is display and pre-smoothing (no overshoot, a clean stopband), not detecting the trend by the side
of price. For a trend signal compare it with something slower.

## Combine with
- **SMA 200 as the trend filter**: a long lag gives a sharp test of the long trend ($\rho = 12.2$).
- **ALMA 9 above ALMA 50 as the trigger**: the gap between a fast and a slow ALMA has a lag difference of 8.4 bars
  and $\rho = 4.05$, about the same as price against ALMA 50, with the bar-to-bar noise removed from the fast side
  before the comparison.
- **RSI 14 above 50 as a confirmation**: it measures the balance of recent gains and losses, which on a trending
  random walk is nearly the same information, so expect it to add little.

With seed 1 on `reversal` (horizon 10): close above SMA 200 +1.48 % (−0.05 % to +3.01 %, n = 36), ALMA 9 above
ALMA 50 +1.93 % (+0.90 % to +2.95 %, n = 48), RSI 14 above 50 +1.57 % (+0.48 % to +2.66 %, n = 51). Filter and
trigger together: +2.11 % (+0.59 % to +3.62 %, n = 29); with RSI as well +1.89 % (n = 28), no gain. The pair is
positive for seeds 1 to 5 (+1.10 % to +2.54 %), with the interval above 0 in four of them. On `random_walk` it has
no edge (seed 1: +0.96 %, −0.87 % to +2.79 %, n = 24). One sample, no costs; not investment advice.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Close above SMA 200", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 200}}, "output": "ma"}},
  {"label": "ALMA 9 above ALMA 50", "left": {"indicator": {"id": "alma", "params": {}}, "output": "ma"},
   "op": "gt", "right": {"indicator": {"id": "alma", "params": {"length": 50}}, "output": "ma"}},
  {"label": "RSI 14 above 50", "left": {"indicator": {"id": "rsi", "params": {}}, "output": "rsi"}, "op": "gt",
   "right": {"value": 50}}
 ]}
```

## Differences vs TradingView
Matches Pine `ta.alma(series, length, offset, sigma, floor)`, including the weight order (oldest bar at $j = 0$) and
the optional `floor`. Whether TradingView's built-in indicator exposes or uses `floor` is part of assumption E2. It
is off by default here.

## Pitfalls
- The window size $n$ is not the effective length. At the defaults the effective support is about 5 bars, and raising
  $\sigma$ shrinks it further.
- Offset near 1 with a large $\sigma$ approaches the raw price. Offset 0 centres the weight on the oldest bar, giving a
  lag of 7.1 bars at $n = 9$, more than the SMA's 4. Lag is never zero with useful smoothing, because the weights are
  non-negative.
- `floor` changes the default lag from 1.56 to 2.15 bars, a visible shift on the chart.
- Low lag means a weak trend test: price above ALMA 9 is close to a coin flip even in a clear trend.

## Exercise
1. In the "Why it works" lab on `reversal`, compare the three rules one at a time. Order them by edge and by $\rho$:
   do the two orders agree? Press the new-sample button a few times: which rule keeps its interval above 0?
2. In the offset lab, move the offset from 0.85 to 0. The table says the lag goes from 1.56 to about 7 bars: count
   the delay at the turn on the chart. Then set it to 1.0: how much noise comes back?
3. Start the replay on NVDA at the first trading day of 2023, the start of its 2023 rally, with ALMA 9 and ALMA 50.
   Step forward: how many bars after the low does ALMA 9 cross above ALMA 50, and how often does price dip below
   ALMA 9 while the trend continues?

```lab
{"kind": "replay", "symbol": "NVDA", "date": "2023-01-03",
 "indicators": [{"id": "alma", "params": {}}, {"id": "alma", "params": {"length": 50}}]}
```
