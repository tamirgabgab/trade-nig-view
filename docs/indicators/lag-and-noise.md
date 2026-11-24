# Lag and noise

Every moving average answers the same question, "where is the price, without the noise?", and every one of them
answers it late. Making it less late makes it noisier. This page makes both words exact, **lag** as the centre of mass
of the weights and **noise** as the [noise reduction factor](glossary:noise-reduction-factor), proves the trade-off for ordinary averages, and shows how
DEMA, TEMA, HMA, ZLEMA and LSMA escape it with negative weights and what they pay for that. Every number is measured
from the app's implementation (the Filter view); the individual pages derive each [kernel](glossary:kernel) in detail.

## Lag: the centre of mass
A linear average is a weighted sum of past prices, $y_t = \sum_{k \ge 0} h_k\,x_{t-k}$, with weights $h_k$ (the
**kernel**, or [impulse response](glossary:impulse-response)) that sum to 1. Feed it a straight trend $x_t = a + bt$:

$$
y_t = \sum_k h_k\,\bigl(a + b(t-k)\bigr) = a + b\,(t - \bar k),
\qquad
\bar k = \sum_k k\,h_k.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $y_t$ | the average at bar $t$ | price |
| $x_t$ | the input (close) | price |
| $h_k$ | weight of the bar $k$ bars ago, $\sum_k h_k = 1$ | — |
| $a,\ b$ | level and slope of the trend | price, price per bar |
| $\bar k$ | **lag**: the kernel's centre of mass | bars |

On any straight trend the average is the trend itself, $\bar k$ bars late, and it sits $b\,\bar k$ below the price in
an uptrend. That is the lag the Filter view reports, and it equals the [group delay](glossary:group-delay) at zero frequency. For the
$n$-bar [SMA](learn:sma) $\bar k = \frac{n-1}{2}$, for the [EMA](learn:ema) $\bar k = \frac{1-\alpha}{\alpha}$, for the
[WMA](learn:wma) $\frac{n-1}{3}$.

Lags combine simply. A cascade (an average of an average) adds them, and a weighted mix of averages mixes them:

$$
\bar k_{\,g * h} = \bar k_g + \bar k_h,
\qquad
\bar k_{\,\sum_i c_i h_i} = \sum_i c_i\,\bar k_{h_i}
\quad \Bigl(\textstyle\sum_i c_i = 1\Bigr).
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $g * h$ | the cascade: $h$ applied to the output of $g$ | kernel |
| $c_i$ | mixing coefficients, may be negative | sum 1 |
| $\bar k_{h}$ | lag of kernel $h$ | bars |

These two rules are all it takes to design a zero-lag average (below).

## Noise: the noise reduction factor
Feed the average pure noise instead, $x_t = \mu + \varepsilon_t$ with independent $\varepsilon_t$ of variance $\sigma^2$:

$$
\operatorname{Var}(y_t) = \sigma^2 \sum_k h_k^2,
\qquad
\mathrm{NRF} = \sum_k h_k^2.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\varepsilon_t$ | the noise at bar $t$, independent from bar to bar | price |
| $\sigma^2$ | its variance | price² |
| $\mathrm{NRF}$ | noise reduction factor: output variance over input variance | 0–1 for an average; $\frac1n$ for the SMA |

The output's standard deviation is $\sqrt{\mathrm{NRF}}$ times the input's: the SMA 9 ($\mathrm{NRF} = 1/9$) cuts
noise to a third. A low NRF means a smooth line that does not cross the price on every wiggle.

## The trade-off for ordinary averages
An ordinary average has **non-negative** weights, $h_k \ge 0$: it is a genuine mean of past prices, so it always
stays inside their range. For those kernels lag and noise cannot both be small.

**Zero lag is impossible.** If $h_k \ge 0$ and $\sum_k k\,h_k = 0$, every weight with $k \ge 1$ must be 0, so
$h = (1, 0, 0, \dots)$: the "average" is the price itself, with $\mathrm{NRF} = 1$.

**SMA and EMA share one curve.** The SMA has $\bar k = \frac{n-1}{2}$ and $\mathrm{NRF} = \frac1n$; the EMA has
$\bar k = \frac{1-\alpha}{\alpha}$ and $\mathrm{NRF} = \frac{\alpha}{2-\alpha}$. Eliminating $n$ or $\alpha$ gives the
same relation for both (and for the [SMMA](learn:smma), which is an EMA of length $2n-1$):

$$
\mathrm{NRF}_{\mathrm{SMA}} = \mathrm{NRF}_{\mathrm{EMA}} = \frac{1}{2\bar k + 1}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\bar k$ | lag | bars |
| $\frac{1}{2\bar k + 1}$ | the noise of an SMA or EMA with that lag | 1 at $\bar k = 0$, $\frac19$ at $\bar k = 4$ |

Halving the noise variance costs about twice the lag. This is why $\alpha = \frac{2}{n+1}$: it is the one EMA with the
same lag *and* the same noise as $\mathrm{SMA}_n$ (see [EMA](learn:ema#kernel-lag-and-noise)).

**The floor is the WMA, slightly below that curve.** The SMA/EMA curve is not the best a non-negative kernel can do.
Minimising $\sum_k h_k^2$ subject to $\sum_k h_k = 1$, $\sum_k k\,h_k = \bar k$ and $h_k \ge 0$ gives a straight line
clipped at zero, the [WMA](learn:wma#kernel-lag-and-noise) kernel. At lags $\bar k = \frac{n-1}{3}$:

$$
\mathrm{NRF}_{\mathrm{WMA}} = \frac{2(2\bar k + 1)}{(3\bar k + 1)(3\bar k + 2)}
\;\xrightarrow[\bar k \to \infty]{}\;
\frac{8}{9}\cdot\frac{1}{2\bar k + 1}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\mathrm{NRF}_{\mathrm{WMA}}$ | the lowest noise any non-negative kernel can have at lag $\bar k$ | about $\frac{4}{9\bar k}$ for long lags |
| $\frac{8}{9}$ | the WMA's advantage over SMA and EMA at equal lag | about 11 % less noise variance |

Measured at lag 4, all of them non-negative kernels:

| Average | Lag (bars) | NRF | NRF × (2·lag + 1) |
|---|---|---|---|
| $\textcolor{#2962FF}{\mathrm{SMA}}$ 9 | 4.000 | 0.1111 | 1.000 |
| $\textcolor{#FF6D00}{\mathrm{EMA}}$ 9 | 4.000 | 0.1111 | 1.000 |
| $\textcolor{#AB47BC}{\mathrm{SMMA}}$ 5 | 4.000 | 0.1111 | 1.000 |
| $\textcolor{#00BCD4}{\mathrm{WMA}}$ 13 | 4.000 | 0.0989 | 0.890 |

So the honest summary of the non-negative family is: the floor is about $\frac{8}{9}\cdot\frac{1}{2\bar k+1}$ (the
WMA's curve, exact at its lags and approached from above as the lag grows), with SMA and EMA on the curve just above
it. Lowering the lag of an ordinary average always raises its noise, and no choice of shape changes that by more
than about 11 %.

## Cutting lag with negative weights
The lag rules above show the way out. Mix two averages with coefficients that sum to 1 but are not both positive,
and the lags can cancel. [DEMA](learn:dema) subtracts an EMA of the EMA (lag $2\bar k$) from twice the EMA (lag
$\bar k$):

$$
\textcolor{#26A69A}{\mathrm{DEMA}} = 2E - E(E),
\qquad
\bar k = 2\,\bar k_E - 1 \cdot 2\,\bar k_E = 0.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $E$ | $\mathrm{EMA}_n$ of the price | price |
| $E(E)$ | $\mathrm{EMA}_n$ of $E$, lag $2\bar k_E$ | price |
| $\bar k_E$ | the EMA's lag, $\frac{n-1}{2}$ | bars |

The same bookkeeping gives every lag-compensated type: [TEMA](learn:tema) $3E - 3E(E) + E(E(E))$ has
$3 - 6 + 3 = 0$ times $\bar k_E$; [HMA](learn:hma) feeds $2\,\mathrm{WMA}_{n/2} - \mathrm{WMA}_n$ through a short WMA,
so its lag is $0$ at $n = 9$ and $0.67$ at $n = 20$ (where the integer half-lengths do not cancel exactly);
[ZLEMA](learn:zlema) feeds the EMA with $2x_t - x_{t-d}$, whose lag $-d$ cancels the EMA's $\frac{n-1}{2}$ (exactly
for odd $n$, to within half a bar for even $n$); [LSMA](learn:lsma) fits a straight line to the window and reads its
end, which has lag 0 by construction. Nesting also lengthens the [warm-up](glossary:warm-up): DEMA 9 has its first value at bar 16, TEMA 9
at bar 24 (see [Warm-up](learn:warm-up)).

**The price, part 1: noise.** For an $n$-bar window, the zero-lag kernel with the lowest noise solves the same
minimisation without $h_k \ge 0$: the weights come out as a straight line that goes negative at the old end, which is
exactly the least-squares line's endpoint, the LSMA (the Gauss–Markov theorem in filter form):

$$
\min_{\sum h = 1,\ \bar k = 0} \ \sum_{k<n} h_k^2 = \frac{2(2n-1)}{n(n+1)} \approx \frac{4}{n}.
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $n$ | window length | bars |
| $\frac{2(2n-1)}{n(n+1)}$ | the LSMA's NRF: no $n$-bar zero-lag average is quieter | 0.3778 at $n = 9$ |
| $\frac{4}{n}$ | its large-$n$ value: four times the SMA's $\frac1n$ | — |

Removing the lag of an $n$-bar window costs at least about four times the noise variance (twice the standard
deviation) of the plain $n$-bar average.

**The price, part 2: overshoot.** Split the weights into their positive and negative parts. The [step response](glossary:step-response), the
running sum of the weights, can never exceed the sum of the positive ones, and the gain at any frequency can never
exceed the sum of the absolute values:

$$
s_k = \sum_{j \le k} h_j \le 1 + N,
\qquad
\bigl\lvert H(e^{j\omega}) \bigr\rvert = \Bigl\lvert \sum_k h_k e^{-j\omega k} \Bigr\rvert \le \sum_k \lvert h_k \rvert = 1 + 2N,
\qquad
N = \sum_k \max(-h_k, 0).
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $s_k$ | step response: the output $k$ bars after the price jumps from 0 to 1 | settles at 1 |
| $N$ | total negative weight | 0 for ordinary averages, 0.1–0.3 for the zero-lag ones |
| $H(e^{j\omega})$ | [frequency response](glossary:frequency-response): gain and phase for a cycle of period $2\pi/\omega$ | — |
| $\omega$ | angular frequency | rad per bar, $0$ to $\pi$ |

With $N = 0$ an ordinary average never overshoots a step and never amplifies a cycle. With $N > 0$ it can do both,
and the zero-lag types do. Measured at $n = 9$ (from the moving-average pages):

| Average ($n = 9$) | Lag (bars) | NRF | Step peak | Peak gain |
|---|---|---|---|---|
| $\textcolor{#2962FF}{\mathrm{SMA}}$ | 4.000 | 0.1111 | 1 | none (≤ 0 dB) |
| $\textcolor{#FF6D00}{\mathrm{EMA}}$ | 4.000 | 0.1111 | 1 | none |
| $\textcolor{#00BCD4}{\mathrm{WMA}}$ | 2.667 | 0.1407 | 1 | none |
| $\textcolor{#26A69A}{\mathrm{DEMA}}$ | 0 | 0.2538 | 1.107 | +0.96 dB at $P \approx 42$ |
| $\textcolor{#EC407A}{\mathrm{TEMA}}$ | 0 | 0.3822 | 1.147 | +1.53 dB at $P \approx 26$ |
| $\textcolor{#AFB42B}{\mathrm{ZLEMA}}$ | 0 | 0.3735 | 1.181 | +1.05 dB at $P \approx 21$ |
| $\textcolor{#7E57C2}{\mathrm{LSMA}}$ | 0 | 0.3778 | 1.267 | +2.09 dB at $P \approx 16$ |
| $\textcolor{#F9A825}{\mathrm{HMA}}$ | 0 | 0.4418 | 1.267 | +2.27 dB at $P \approx 13.5$ |

Every zero-lag type pays 2.3 to 4 times the SMA's noise variance and overshoots a step by 11 % to 27 %. At a turn
that overshoot is a line that swings past the price and has to come back: a "signal" made by the filter, not by the
market.

## The filter view
The same facts in the frequency domain, where the Filter view draws them from the implementation:
- **Magnitude.** Ordinary averages are low-pass filters with gain at most 1 (0 dB) everywhere. The zero-lag types
  have a bump above 0 dB at medium periods: cycles there come out *larger* than they went in.
- **Group delay.** At very long periods it equals the lag $\bar k$; elsewhere it varies with the period. Zero-lag
  types have zero delay only at the longest periods; medium cycles are still shifted, and near the bump they are
  amplified as well.
- **Impulse and step.** The impulse response is the kernel itself, so negative weights are visible as stems below
  zero, and the step response shows the overshoot.

The EMA 9 and the HMA 9 side by side (open each one's compare option to overlay the other):

```lab
{"kind": "filter", "indicator": "ema", "params": {"length": 9}}
```

```lab
{"kind": "filter", "indicator": "hma", "params": {"length": 9}}
```

Same length, very different filters: lag 4 against 0, NRF 0.111 against 0.442, a monotone roll-off against a +2.27 dB
bump near 13.5 bars.

## Lag and noise on a chart
Noise shows up on a chart as **[whipsaws](glossary:whipsaw)**: the price crossing the line back and forth. A line that hugs the price
(little lag) leaves a small, rapidly changing gap between the two, so the sign of the gap flips often. Count the
crosses on the same [random walk](glossary:random-walk), one rule at a time:

```lab
{"kind": "combo", "scenario": "random_walk", "horizon": 1, "on": [0],
 "rules": [
  {"label": "Close crosses above SMA 20", "left": {"price": "close"}, "op": "crosses_above",
   "right": {"indicator": {"id": "sma", "params": {"length": 20}}, "output": "ma"}},
  {"label": "Close crosses above DEMA 20", "left": {"price": "close"}, "op": "crosses_above",
   "right": {"indicator": {"id": "dema", "params": {"length": 20}}, "output": "ma"}},
  {"label": "Close crosses above HMA 20", "left": {"price": "close"}, "op": "crosses_above",
   "right": {"indicator": {"id": "hma", "params": {"length": 20}}, "output": "ma"}}
 ]}
```

With seed 1 (1000 bars) the close crosses above the SMA 20 60 times, the DEMA 20 90 times and the HMA 20 114 times
(with a 1-bar [horizon](glossary:horizon) no cross is skipped). For seeds 1–5 the counts are 58–76, 85–105 and 104–114: the lower the
lag, the more crosses, on every sample. None of the three has an [edge](glossary:edge) on a random walk (no interval excludes zero
with seed 1): more crosses are not more information, only more trades.

The overshoot is easiest to see at a reversal. Move the HMA's length and watch the line run past the top before it
turns:

```lab
{"kind": "param", "indicator": "hma", "vary": "length", "min": 2, "max": 100, "params": {"length": 20},
 "scenario": "reversal"}
```

## Choosing
- **Compare at equal lag, not equal length.** "EMA 20 is faster than SMA 20" is true, but EMA 20 and SMA 20 have the
  same lag and noise. A WMA of length $3\bar k + 1$ is the quietest ordinary average for a given lag.
- **A trend filter wants low noise.** A state such as "close above the average" that should last for weeks needs a
  low NRF; lag is acceptable there ([SMA](learn:sma), [EMA](learn:ema), [WMA](learn:wma)).
- **A trigger wants low lag**, and must live with whipsaws and overshoot ([HMA](learn:hma), [DEMA](learn:dema),
  [ZLEMA](learn:zlema)). Pair it with a slow filter ([Combining indicators](learn:combinations)).
- **Adaptive averages** ([KAMA](learn:kama), [McGinley](learn:mcginley), [VWMA](learn:vwma)) move along the
  trade-off with the data: their weights depend on the price or the volume, so they have no fixed kernel, lag or
  NRF. See [Moving Average](learn:moving-average#kernel-lag-and-noise) for all fifteen types in one table.
- **No average predicts.** On a random walk every average, fast or slow, has no edge; lag and noise only decide how
  late and how often a rule reacts to what has already happened.

## Exercise
1. In the combo lab, switch the scenario to `uptrend`. Do the cross counts keep their order? Then raise the horizon
   to 10: why do the counts drop (see the [event-study](glossary:event-study) note in [Combining indicators](learn:combinations))?
2. In the HMA lab, find the length at which the overshoot after the top of `reversal` looks largest compared with the
   noise. Then open the HMA's filter lab above with that length in mind: which period does its gain bump sit at,
   relative to the length?
3. Replay the February 2020 top with a slow and a fast average:

```lab
{"kind": "replay", "symbol": "SPY", "date": "2020-02-12",
 "indicators": [{"id": "sma", "params": {"length": 20}}, {"id": "hma", "params": {"length": 20}}],
 "steps": ["Start in Replay and step forward bar by bar.",
  "Note the bar on which the close first falls below the HMA 20, and the bar on which it falls below the SMA 20.",
  "Keep stepping through March and count how often the close crosses each line.",
  "At the low, which line turns up first, and does it run past the price on the way?"],
 "reveal": "In a sharp drop the close can fall below both lines on the same bar: a cross depends on the distance between price and line, not only on the lag. The lag shows in the turns: the HMA 20 turns down within a few bars of the top, while the SMA 20 keeps rising or flattens for a while, because its centre of mass is 9.5 bars back and still sits on pre-top prices. In the volatile weeks that follow, the close typically crosses the HMA far more often than the SMA, and after the low the HMA can swing past the price before settling: the overshoot its negative weights buy. Count rather than trust this description: it is one episode."}
```

More exercises: [Guided exercises](learn:guided-exercises).
