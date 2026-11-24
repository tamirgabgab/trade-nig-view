# Moving Average Ribbon (`ma_ribbon`)

Four moving averages of one type at four lengths (default EMA 20, 50, 100, 200) drawn as a fan. Use it to read trend
direction and strength at several time scales at once: an ordered, widening fan is a strong trend, a tangle is no
trend.

## What it measures
Trend direction (order of the lines) and trend strength (spacing of the lines) at four [horizons](glossary:horizon) at once: "is the trend
up at 20 bars, at 50, at 100 and at 200, and how steep?" When all four agree the trend is the same at every scale; a
tangle means the horizons disagree.

Move the shortest length on a steady uptrend: the gap between price and MA 1 shrinks as MA 1 gets shorter (less [lag](glossary:lag)),
and MA 1 joins MA 2 as the lengths meet.

```lab
{"kind": "param", "indicator": "ma_ribbon", "vary": "length_1", "min": 5, "max": 100, "scenario": "uptrend"}
```

## Formula

$$
y^{(i)}_t = \mathrm{MA}^{\text{type}}_{n_i}(x)_t, \qquad i = 1..4, \qquad (n_1, n_2, n_3, n_4) = (20, 50, 100, 200)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#E69500}{y^{(1)}_t}$, $\textcolor{#FF6D00}{y^{(2)}_t}$, $\textcolor{#F23645}{y^{(3)}_t}$, $\textcolor{#AB47BC}{y^{(4)}_t}$ | the four lines MA 1 to MA 4 (outputs `ma_1` to `ma_4`) | price |
| $n_i$ | the four lengths | bars, default 20 / 50 / 100 / 200 |
| type | one average type for all four lines | default EMA |
| $x$ | the source (close by default) | price |

## Kernel, lag and noise

Each line is an ordinary MA (see its page); for the default EMA, $h^{(i)}_k = \alpha_i(1-\alpha_i)^k$ with
$\alpha_i = 2/(n_i + 1)$, lag $L_i = (n_i - 1)/2$ and $\mathrm{NRF} = 1/n_i$.

**The fan is a lag spectrum.** On a trend $x_t = a + bt$, once the transients have died out each linear line sits at
$y^{(i)}_t = x_t - b\,L_i$. The gaps between lines are therefore

$$
y^{(i)}_t - y^{(j)}_t = b\,(L_j - L_i),
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $b$ | the trend's slope | price per bar |
| $L_i, L_j$ | the lags of lines $i$ and $j$, $\frac{n-1}{2}$ for an EMA | 9.5, 24.5, 49.5, 99.5 bars |

proportional to the slope, with ratios fixed by the lengths. For EMA 20/50/100/200: price to MA 1 is $9.5b$, then
$15b$, $25b$ and $50b$ between consecutive lines. A widening fan means the slope is growing; equal order at all four
scales means the slope has the same sign over all four horizons. When the trend turns, the lines cross pairwise,
shortest first, each pair with the delay derived on the MA Cross page.

The same fan is also a set of four low-pass cut-offs. For an EMA, $\lvert H\rvert^2 = \frac{\alpha^2}{1 - 2(1-\alpha)\cos\omega + (1-\alpha)^2}$;
setting it to $\frac12$ gives

$$
\cos\omega_c = 1 - \frac{\alpha^2}{2(1-\alpha)}, \qquad P_c = \frac{2\pi}{\omega_c} \approx \pi\sqrt{n^2 - 1}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\omega_c$ | the $-3$ dB angular frequency | radians per bar |
| $P_c$ | the $-3$ dB period | bars (62.7 to 628 for the default lines) |
| $\alpha$, $n$ | the EMA constant and length of the line | $\alpha = \frac{2}{n+1}$ |

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
First valid bar index: the longest average's [warm-up](glossary:warm-up) (199 for EMA 200). The chart loads the longest line's extra
history, $25 \cdot 200 = 5{,}000$ bars, after which the EMA 200 seed weight is $(1-\alpha_4)^{5000} \approx e^{-50}$.

## Filter view
The drawer shows one set of plots per line (four entries), each with impulse, step, $\lvert H\rvert$ in dB and group
delay:

- **Impulse**: geometric decays starting at $\alpha_i$ (0.0952, 0.0392, 0.0198, 0.00995).
- **Step**: $1 - (1 - \alpha_i)^{k+1}$. The plot stops at 500 bars, where MA 4 has only reached 0.993.
- **Magnitude**: four nested low-pass curves; the $-3$ dB points of MA 3 and MA 4 lie beyond the 200-bar end of the
  axis (table above).
- **[Group delay](glossary:group-delay)**: tends to each line's lag at long periods (MA 1 is 8.60 at $P = 200$, MA 4 only 8.70, still far
  from its 99.5) and turns slightly negative at short periods, about $-0.5$ bars near $P = 2$.

## How to read it
- **Order.** MA 1 > MA 2 > MA 3 > MA 4 with price on top: an uptrend at every horizon; the reverse order: a
  downtrend. A partly ordered fan (short lines down, long lines still up) is a pullback or an early turn.
- **Spacing.** On a trend the gaps are $b(L_j - L_i)$: the fan's width measures the slope. A widening fan is an
  accelerating trend, a narrowing one a trend that is losing slope, typically before the lines cross.
- **Crossings.** At a turn the lines cross pairwise, shortest first; MA 1 crossing MA 2 is the early mark, MA 3 crossing
  MA 4 the late confirmation (about 100 bars late for EMA 200).
- **Price vs the fan.** Price pulling back into the fan and holding above MA 2 or MA 3 is a pullback inside an intact
  trend; price closing below MA 4 breaks the longest horizon.
- **Trend vs range.** In a trend the fan is ordered and open; in a range it is flat and tangled, with the lines
  crossing back and forth.
- **The lengths.** Each length sets one horizon. Closer lengths give narrower gaps and earlier but noisier crosses.

## Why it works
For each line, $x_t - y^{(i)}_t = \sum_j w^{(i)}_j r_{t-j}$ with $\sum_j w^{(i)}_j = L_i$ (the identity on the Moving
Average page). For an EMA the return weights are the [kernel](glossary:kernel)'s tail,
$w^{(i)}_j = \sum_{k > j} \alpha_i \beta_i^k = \beta_i^{\,j+1}$, so the gap between two lines is

$$
\textcolor{#E69500}{y^{(1)}_t} - \textcolor{#FF6D00}{y^{(2)}_t} = \sum_{j \ge 0} \big(\beta_2^{\,j+1} - \beta_1^{\,j+1}\big)\, r_{t-j}, \qquad \sum_{j \ge 0} \big(\beta_2^{\,j+1} - \beta_1^{\,j+1}\big) = L_2 - L_1 = 15.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#E69500}{y^{(1)}_t}$, $\textcolor{#FF6D00}{y^{(2)}_t}$ | MA 1 and MA 2 at bar $t$ | price |
| $\beta_i$ | the EMA decay of line $i$, $1 - \alpha_i$ | 0.905 (MA 1), 0.961 (MA 2) |
| $r_{t-j}$ | the return of bar $t - j$ | about $\pm 1$–2 % per bar |
| $L_2 - L_1$ | the total weight of past returns in the gap | 15 bars |

Every weight $\beta_2^{j+1} - \beta_1^{j+1}$ is positive (MA 2 decays more slowly), so **MA 1 above MA 2 means a
positively weighted sum of the last roughly 50 returns is positive**: an estimate of the recent [drift](glossary:drift). A fully ordered
fan says the same estimate is positive over four horizons.

On a [random walk](glossary:random-walk) the next returns are independent of that estimate: no [edge](glossary:edge). In the reversal scenario (drift
$+0.25$ % per bar, then $-0.25$ %) the order of the fan tells the rising half from the falling half; in the
[mean-reverting](glossary:mean-reversion) range a rising short line means price is above its mean, so the sign flips.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0],
 "rules": [
  {"label": "MA 1 above MA 2", "left": {"indicator": {"id": "ma_ribbon", "params": {}}, "output": "ma_1"}, "op": "gt",
   "right": {"indicator": {"id": "ma_ribbon", "params": {}}, "output": "ma_2"}},
  {"label": "MA 1 below MA 4", "left": {"indicator": {"id": "ma_ribbon", "params": {}}, "output": "ma_1"}, "op": "lt",
   "right": {"indicator": {"id": "ma_ribbon", "params": {}}, "output": "ma_4"}}
 ]}
```

With seed 1 (1000 bars, 10-bar horizon):

| Scenario | MA 1 above MA 2 | MA 1 below MA 4 |
|---|---|---|
| Reversal | $+2.27$ % ($+1.29$ to $+3.27$, n = 42) | $-2.80$ % ($-3.76$ to $-1.82$, n = 37) |
| Random walk | $+0.65$ % ($-1.11$ to $+2.44$, n = 32) | |
| Range | $-0.97$ % ($-2.09$ to $+0.17$, n = 52) | |

On the reversal the MA 1 above MA 2 rule is positive with an interval above zero on all of seeds 1–5 ($+1.48$ to
$+2.76$ %). One rule on one synthetic sample: not a backtest (no costs), sensitive to how many rules you try, and not
investment advice.

## Combine with
The ribbon is a **[trend filter](glossary:trend-filter)** at several horizons. Add a **[momentum](glossary:momentum) confirmation** (RSI above 50) and a **[trigger](glossary:trigger)**
(the MACD histogram turning positive, i.e. a short-term slope turning up):

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "MA 1 above MA 2", "left": {"indicator": {"id": "ma_ribbon", "params": {}}, "output": "ma_1"}, "op": "gt",
   "right": {"indicator": {"id": "ma_ribbon", "params": {}}, "output": "ma_2"}},
  {"label": "RSI 14 above 50", "left": {"indicator": {"id": "rsi", "params": {}}, "output": "rsi"},
   "op": "gt", "right": {"value": 50}},
  {"label": "MACD histogram crosses above 0", "left": {"indicator": {"id": "macd", "params": {}}, "output": "hist"},
   "op": "crosses_above", "right": {"value": 0}}
 ]}
```

With seed 1 on the reversal: RSI above 50 alone $+1.59$ % ($+0.48$ to $+2.70$, n = 51), the MACD cross alone
$-0.28$ % ($-1.78$ to $+1.24$, n = 34); the ribbon rule with the RSI $+2.46$ % ($+1.27$ to $+3.66$, n = 38), all
three $+2.89$ % ($+1.73$ to $+4.06$, n = 16). The trigger alone has no edge; inside the regime the ribbon found it
only picks fewer moments. On the range the ribbon and RSI pair loses, $-1.12$ % ($-2.19$ to $-0.03$, n = 42). One
sample, no costs, not investment advice.

## Differences vs TradingView
TradingView's built-in ribbon configures each of the four lines separately (type, source and length per line).
ChartLab uses one type and one source for all four, with four editable lengths, and any of the 15 types.

## Pitfalls
- The 200-length line needs 5,000 bars of extra history to converge (loaded automatically); on short histories its
  start differs from TradingView's.
- Spacing scales with the slope in price units: compare widths across symbols only as a fraction of price.
- The longest line reacts to a reversal about 100 bars late (EMA 200 lag 99.5); it confirms, it does not warn.

## Exercise
1. In the "Why it works" lab, switch to "MA 1 below MA 4" and then set the scenario to Range: why is the sign of each
   rule the opposite of the reversal's? Press the new-sample button: does it hold?
2. In the length lab, read the gap between MA 1 and MA 2 on the uptrend and divide it by $L_2 - L_1$: you get the
   slope $b$ per bar. Move length 1 from 20 to 40 and check that the gap shrinks to $b(24.5 - 19.5)$.
3. Start Replay on QQQ on 2022-01-03 (the start of the 2022 bear market) with the default ribbon. Step forward: in
   which order do the lines cross, how many bars after the first cross does MA 3 cross below MA 4, and is the fan
   ever fully ordered downwards?

```lab
{"kind": "replay", "symbol": "QQQ", "date": "2022-01-03", "indicators": [{"id": "ma_ribbon", "params": {}}]}
```
