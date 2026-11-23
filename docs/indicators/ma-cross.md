# Moving Average Cross (`ma_cross`)

A fast and a slow moving average, with a marker on every bar where the fast one crosses the slow one: up (golden
cross) or down (death cross). Use it as a simple trend-change signal, knowing that it is late by construction.

## Formula

$$
F_t = \mathrm{MA}^{\text{fast}}_{n_f}(x)_t, \qquad S_t = \mathrm{MA}^{\text{slow}}_{n_s}(x)_t, \qquad D_t = F_t - S_t
$$

$$
\text{cross}_t =
\begin{cases}
+1 & D_t > 0 \text{ and } D_{t-1} \le 0 \\
-1 & D_t < 0 \text{ and } D_{t-1} \ge 0 \\
\text{none} & \text{otherwise}
\end{cases}
$$

The current bar compares strictly, the previous bar non-strictly: the same rule as Pine's `ta.crossover` /
`ta.crossunder`. Both averages must be valid at $t-1$ and $t$, so the first possible marker is one bar after the
warm-up, and a cross is known at the close of bar $t$ (no lookahead).

**Ties.** A bar with $D = 0$ never carries a marker; the marker goes on the bar that leaves zero. So $+,0,-$ gives a
down marker on the third bar, and a touch from above that bounces, $+,0,+$, gives an **up** marker on the third bar
although the lines never swapped order. With real prices exact ties are rare; they occur in flat stretches where
both averages equal the same constant.

## Kernel, lag and noise

Each line is an ordinary MA (see its page). The cross signal depends on the difference filter
$g_k = h^F_k - h^S_k$: $\sum_k g_k = 0$ (no DC) and $\sum_k k\,g_k = L_F - L_S$. On a straight line $x_t = a + bt$,

$$
D_t = b\,(L_S - L_F),
$$

so $\operatorname{sign} D$ is the sign of a smoothed slope, and a cross is a slope sign change seen through two lags.

**Delay of a cross after a turn.** Let price rise with slope $b$ until bar 0 and fall with slope $b'$ after it:
$x_t = x_0 + bt - (b + b')\,(t)_+$. By linearity, with $\rho_h(t) = \sum_k h_k\,(t - k)_+$,

$$
D_t = b\,(L_S - L_F) - (b + b')\big(\rho_F(t) - \rho_S(t)\big).
$$

Once both windows are past the turn, $\rho_h(t) = t - L_h$ and $D_t = -b'(L_S - L_F)$: the sign has flipped. If each
MA were a pure delay, $\rho_h(t) = (t - L_h)_+$ and the cross would fall at

$$
t^* = \frac{b\,L_S + b'\,L_F}{b + b'},
$$

the **average** of the two lags for a symmetric turn, nearer $L_F$ when the new move is steeper. Real kernels round
the corner: $\rho_h(t) \ge (t - L_h)_+$ for $h_k \ge 0$ (Jensen, $(\cdot)_+$ is convex). The wider slow kernel
typically rounds it more, which holds $D_t$ positive longer; measured (first marker bar after a turn at bar 0):

| Pair | Lags $L_F$ / $L_S$ | $t^*$ symmetric | Measured | $t^*$ for $b' = 3b$ | Measured |
|---|---|---|---|---|---|
| SMA 9 / SMA 21 | 4 / 10 | 7 | 10 | 5.5 | 7 |
| EMA 9 / EMA 21 | 4 / 10 | 7 | 12 | 5.5 | 7 |
| SMA 50 / SMA 200 | 24.5 / 99.5 | 62 | 78 | 43.25 | 50 |
| EMA 50 / EMA 200 | 24.5 / 99.5 | 62 | 97 | 43.25 | 52 |

Equal lags do not mean equal cross timing: the EMA's infinite tail remembers the old trend longer than the SMA's
window.

## Defaults
| Param | Default | Why |
|---|---|---|
| Fast MA type | SMA | TradingView default |
| Fast length | 9 | TradingView default |
| Slow MA type | SMA | TradingView default |
| Slow length | 21 | TradingView default |
| Source | close | TradingView default |

## Warm-up
First valid bar index: the larger of the two averages' warm-ups (20 at the defaults); the first possible marker is one
bar later. Extra history: the larger of the two lookbacks.

## Filter view
The drawer measures the two lines (the markers are not a filter output):

- **Fast** (SMA 9): lag 4, NRF 0.1111, $-3$ dB at $P \approx 20.2$ bars, zeros at periods 9, 4.5, 3, 2.25.
- **Slow** (SMA 21): lag 10, NRF 0.0476, $-3$ dB at $P \approx 47.4$ bars, zeros at periods $21/j$ down to 2.1.

Both are symmetric FIR kernels, so the group delay is constant at the lag (undefined at the zeros). The gap between
the two group delays, 6 bars here, is what the slope estimate $D_t$ is built from.

## What it measures
Whether the short-term average is above or below the long-term one, i.e. the sign of the recent slope. A marker says
that sign has changed.

## Differences vs TradingView
- Same crossing rule as Pine's `ta.crossover` / `ta.crossunder`, and the same 9 / 21 SMA defaults.
- TradingView's MA Cross uses SMA or EMA (research doc §5); here each line can be any of the 15 types.
- ChartLab draws direction-coloured arrows (up below the bar, down above it).

## Pitfalls
- Crosses come late: at least about the average of the two lags after a symmetric turn, in practice more (10 bars
  for SMA 9/21, 97 bars for EMA 50/200).
- In sideways markets $D_t$ hovers near 0 and the markers whipsaw.
- A touch-and-bounce ($+,0,+$) produces a marker in the original direction.
- Lag-compensated types (HMA, DEMA, ZLEMA) cross earlier but overshoot, which adds false crosses.
