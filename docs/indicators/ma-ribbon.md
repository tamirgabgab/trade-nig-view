# Moving Average Ribbon (`ma_ribbon`)

Four moving averages of one type at four lengths (default EMA 20, 50, 100, 200) drawn as a fan. Use it to read trend
direction and strength at several time scales at once: an ordered, widening fan is a strong trend, a tangle is no
trend.

## Formula

$$
y^{(i)}_t = \mathrm{MA}^{\text{type}}_{n_i}(x)_t, \qquad i = 1..4, \qquad (n_1, n_2, n_3, n_4) = (20, 50, 100, 200)
$$

## Kernel, lag and noise

Each line is an ordinary MA (see its page); for the default EMA, $h^{(i)}_k = \alpha_i(1-\alpha_i)^k$ with
$\alpha_i = 2/(n_i + 1)$, lag $L_i = (n_i - 1)/2$ and $\mathrm{NRF} = 1/n_i$.

**The fan is a lag spectrum.** On a trend $x_t = a + bt$, once the transients have died out each linear line sits at
$y^{(i)}_t = x_t - b\,L_i$. The gaps between lines are therefore

$$
y^{(i)}_t - y^{(j)}_t = b\,(L_j - L_i),
$$

proportional to the slope, with ratios fixed by the lengths. For EMA 20/50/100/200: price to MA 1 is $9.5b$, then
$15b$, $25b$ and $50b$ between consecutive lines. A widening fan means the slope is growing; equal order at all four
scales means the slope has the same sign over all four horizons. When the trend turns, the lines cross pairwise,
shortest first, each pair with the delay derived on the MA Cross page.

The same fan is also a set of four low-pass cut-offs. For an EMA, $\lvert H\rvert^2 = \frac{\alpha^2}{1 - 2(1-\alpha)\cos\omega + (1-\alpha)^2}$;
setting it to $\frac12$ gives

$$
\cos\omega_c = 1 - \frac{\alpha^2}{2(1-\alpha)}, \qquad P_c = \frac{2\pi}{\omega_c} \approx \pi\sqrt{n^2 - 1}.
$$

| Line | Length | Lag (bars) | NRF | $-3$ dB period (bars) | $\lvert H\rvert$ at $P = 200$ |
|---|---|---|---|---|---|
| MA 1 | 20 | 9.5 | 0.05 | 62.7 | $-0.41$ dB |
| MA 2 | 50 | 24.5 | 0.02 | 157.0 | $-2.09$ dB |
| MA 3 | 100 | 49.5 | 0.01 | 314.1 | $-5.40$ dB |
| MA 4 | 200 | 99.5 | 0.005 | 628.3 | $-10.36$ dB |

Cycles longer than a line's cut-off period pass it almost intact, shorter ones are attenuated: a swing that moves
MA 1 fully but MA 4 hardly has a period between roughly 60 and a few hundred bars.

With a lag-compensated type (DEMA, TEMA, HMA, LSMA, ZLEMA) every $L_i = 0$: on a straight trend the four lines
collapse onto price and only curvature separates them, so the fan loses its lag-spectrum reading.

## Defaults
| Param | Default | Why |
|---|---|---|
| MA type | EMA | Common ribbon choice |
| Length 1 | 20 | Short horizon |
| Length 2 | 50 | Medium horizon |
| Length 3 | 100 | Long horizon |
| Length 4 | 200 | The classic long-term average |
| Source | close | TradingView default |

## Warm-up
First valid bar index: the longest average's warm-up (199 for EMA 200). The chart loads the longest line's extra
history, $25 \cdot 200 = 5{,}000$ bars, after which the EMA 200 seed weight is $(1-\alpha_4)^{5000} \approx e^{-50}$.

## Filter view
The drawer shows one set of plots per line (four entries), each with impulse, step, $\lvert H\rvert$ in dB and group
delay:

- **Impulse**: geometric decays starting at $\alpha_i$ (0.0952, 0.0392, 0.0198, 0.00995).
- **Step**: $1 - (1 - \alpha_i)^{k+1}$. The plot stops at 500 bars, where MA 4 has only reached 0.993.
- **Magnitude**: four nested low-pass curves; the $-3$ dB points of MA 3 and MA 4 lie beyond the 200-bar end of the
  axis (table above).
- **Group delay**: tends to each line's lag at long periods (MA 1 is 8.60 at $P = 200$, MA 4 only 8.70, still far
  from its 99.5) and turns slightly negative at short periods, about $-0.5$ bars near $P = 2$.

## What it measures
Trend direction (order of the lines) and trend strength (spacing of the lines) at four horizons.

## Differences vs TradingView
TradingView's built-in ribbon configures each of the four lines separately (type, source and length per line).
ChartLab uses one type and one source for all four, with four editable lengths, and any of the 15 types.

## Pitfalls
- The 200-length line needs 5,000 bars of extra history to converge (loaded automatically); on short histories its
  start differs from TradingView's.
- Spacing scales with the slope in price units: compare widths across symbols only as a fraction of price.
- The longest line reacts to a reversal about 100 bars late (EMA 200 lag 99.5); it confirms, it does not warn.
