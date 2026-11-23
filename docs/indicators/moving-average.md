# Moving Average, any type (`ma`)

One entry that computes any of ChartLab's 15 moving averages, picked by the MA type input. Use it to compare averages
on the same chart by switching the type, without adding a new indicator each time.

## Formula

$$
y_t = \mathrm{MA}^{\text{type}}_n(x)_{t - o}, \qquad \text{type} \in \{\text{SMA, EMA, WMA, SMMA, DEMA, TEMA, HMA, LSMA, ALMA, SWMA, VWMA, McGinley, KAMA, T3, ZLEMA}\}
$$

with $o \ge 0$ the plot offset. Each type is the same implementation as its dedicated indicator (see its page).
Types with extra inputs use their defaults here: ALMA offset 0.85 and sigma 6, KAMA fast 2 and slow 30 (the length is
the efficiency length), T3 volume factor 0.7, LSMA offset 0. SWMA ignores the length (fixed 4 taps).

## Kernel, lag and noise

The types fall into three classes (the verification classes of the harness):

- **Non-negative kernels** (SMA, EMA, WMA, SMMA, ALMA, SWMA): $h_k \ge 0$, so the output stays inside the window's
  range, never overshoots, and lag and NRF cannot both be small.
- **Lag-compensated** (DEMA, TEMA, HMA, LSMA, ZLEMA, T3): negative weights cancel the first moment (lag 0 for all but
  T3), paying with a larger NRF and overshoot at turns.
- **Data-dependent** (VWMA, McGinley, KAMA): no fixed kernel; the weights depend on volume or on the price itself.

For a linear type the lag is the kernel's centre of mass $\bar k = \sum_k k\,h_k$ (exact on any straight line:
$x_t = a + bt \Rightarrow y_t = a + b(t - \bar k)$) and the noise reduction factor is $\mathrm{NRF} = \sum_k h_k^2$.
Measured with this indicator at the default length $n = 9$:

| Type | Warm-up | Lag (bars) | NRF | Step peak |
|---|---|---|---|---|
| SMA | 8 | 4.000 | 0.1111 | 1 |
| EMA | 8 | 4.000 | 0.1111 | 1 |
| WMA | 8 | 2.667 | 0.1407 | 1 |
| SMMA (RMA) | 8 | 8.000 | 0.0588 | 1 |
| DEMA | 16 | 0 | 0.2538 | 1.107 |
| TEMA | 24 | 0 | 0.3822 | 1.147 |
| HMA | 10 | 0 | 0.4418 | 1.267 |
| LSMA | 8 | 0 | 0.3778 | 1.267 |
| ALMA | 8 | 1.557 | 0.2334 | 1 |
| SWMA | 3 | 1.500 | 0.2778 | 1 |
| T3 | 48 | 3.600 | 0.1046 | 1.120 |
| ZLEMA | 12 | 0 | 0.3735 | 1.181 |
| VWMA | 8 | 4.000 (ramp, constant volume) | — | 1 |
| McGinley | 8 | 8.167 (ramp) | — | 1 |
| KAMA | 9 | 1.250 (ramp) | — | 1 |

The table is the lag-versus-noise trade-off in one place: SMA and EMA share lag 4 and NRF $1/9$ (that is why
$\alpha = 2/(n+1)$); every zero-lag type pays 2.3 to 4 times the SMA's noise variance; SMMA halves the noise for twice
the lag. The adaptive rows are ramp lags at price level 100 and slope 0.1 per bar, not kernel moments (see the
McGinley and KAMA pages for why).

## Defaults
| Param | Default | Why |
|---|---|---|
| MA type | SMA | Most common |
| Length | 9 | TradingView default for most MA built-ins |
| Source | close | TradingView default |
| Offset | 0 | Display shift, $\ge 0$ |

## Warm-up
First valid bar index: that of the chosen type, plus the offset (column "Warm-up" above for $n = 9$). Extra history:
$\max(25n, 250)$ bars for most types, $\max(50n, 250)$ for T3, and $\lfloor 25/s^2 \rfloor + n$ for KAMA (6,015 at
$n = 9$). HMA needs $n \ge 2$.

## Filter view
The drawer follows the chosen type:

- **Linear types**: impulse response (stems), step response, $\lvert H\rvert$ in dB vs period on a log axis from 2 to
  200 bars, and group delay. FIR types show their exact spectral zeros as deep notches (SMA 9 has zeros at periods
  $9/j$: 9, 4.5, 3, 2.25; the plot floors at $-120$ dB where a grid point lands on one); lag-compensated types show overshoot in the step and a magnitude bump above
  0 dB.
- **VWMA, McGinley, KAMA**: step and ramp responses only, with the reason (volume weights change from bar to bar, or
  the smoothing depends on the input, so superposition fails). VWMA is measured at constant volume, where it equals
  the SMA.

## What it measures
The trend of the source over roughly the chosen length, with the lag and smoothness of the chosen type.

## Differences vs TradingView
- This entry is a ChartLab convenience; compare each type with the matching TradingView built-in (see each type's page).
- KAMA, T3 and ZLEMA are not TradingView built-ins (decision D4); they follow TA-Lib (KAMA, T3) or Ehlers and Way
  (ZLEMA).
- The type's own extra inputs (ALMA, KAMA, T3, LSMA) are fixed at their defaults here.

## Pitfalls
- To change ALMA's offset or sigma, KAMA's fast or slow length, or T3's volume factor, use the dedicated indicator.
- "Length" means different things: an EMA length for EMA, the efficiency window for KAMA, the per-stage length for T3
  (warm-up $6(n-1)$), and nothing for SWMA.
- Comparing types at the same length compares different lags; compare at equal lag (or equal NRF) instead.
