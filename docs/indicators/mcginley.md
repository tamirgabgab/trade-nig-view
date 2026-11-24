# McGinley Dynamic (`mcginley`)

An exponential average whose gain is set by the ratio of price to the average itself: it slows down when price runs
above it and speeds up when price falls below it. Use it as a trend line that hugs falling prices and [lags](glossary:lag) rising ones
less nervously than a fixed EMA.

## What it measures
A trend line that keeps close to price on sell-offs and gives rising prices more room before it follows. It answers
"where is the trend, if declines deserve a faster reaction than rallies?". Price crossing it, and its slope, are read
like an EMA's.

Move the length on the `shock` scenario: at the −15 % [gap](glossary:gap) the line follows faster than an EMA at rest would,
because price below the line raises its gain.

```lab
{"kind": "param", "indicator": "mcginley", "vary": "length", "min": 3, "max": 60, "scenario": "shock"}
```

## Formula

With $r_t = x_t / \textcolor{#FB8C00}{M_{t-1}}$:

$$
\textcolor{#FB8C00}{M_t} = \textcolor{#FB8C00}{M_{t-1}} + \frac{x_t - \textcolor{#FB8C00}{M_{t-1}}}{n\,r_t^{4}}, \qquad
\textcolor{#FB8C00}{M_{n-1}} = \mathrm{EMA}_n(x)_{n-1}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\textcolor{#FB8C00}{M_t}$ | the McGinley Dynamic at bar $t$ | price |
| $x_t$ | source price | price, $> 0$ |
| $r_t$ | ratio of price to the previous value of the line | around 1 (0.9 = price 10 % below) |
| $n$ | length | 1–5000, default 14 |
| $\mathrm{EMA}_n(x)$ | ChartLab's EMA (SMA-seeded), used as the seed and fallback | price |

Equivalently $M_t = M_{t-1} + c_t\,(x_t - M_{t-1})$ with the data-dependent gain $c_t = 1/(n\,r_t^4)$. Wherever
$M_{t-1}$ is undefined the value is $\mathrm{EMA}_n(x)_t$ (Pine's `na(mg[1]) ? ta.ema(...)` rule).

## Kernel, lag and noise

**No [impulse response](glossary:impulse-response).** The gain $c_t$ depends on the input, so superposition fails:
$f(x_1 + 2x_2) \ne f(x_1) + 2f(x_2)$, and a unit impulse on a zero baseline is not even defined ($r = x/M$ needs
$M > 0$). The filter is scale-equivariant, $f(ax) = a\,f(x)$ for $a > 0$ (only the ratio enters), but not
shift-equivariant: adding a constant to every price changes every $r_t$. What replaces the [kernel](glossary:kernel) is the **local
behaviour**: freeze $r$ and the recursion is a first-order EMA.

**Local EMA.** With $r$ fixed, $c = 1/N$ where

$$
N(r) = n\,r^4
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $N(r)$ | the equivalent Wilder (RMA) length at a frozen ratio $r$ | bars; $n$ at rest |
| $r$, $n$ | ratio and length as above | |

That is a Wilder ([RMA](glossary:rma)) length $N$, i.e. an EMA in the $\alpha = 2/(m+1)$ convention with $m = 2N - 1$, lag
$(1-c)/c = N - 1$ and $\mathrm{NRF} = c/(2-c) = 1/(2N-1)$.

- **At rest** ($x \approx M$, $r = 1$): $c = 1/n$. A length-14 McGinley is an $\mathrm{RMA}_{14} \equiv \mathrm{EMA}_{27}$,
  lag 13 bars, about twice the lag of $\mathrm{EMA}_{14}$ (6.5 bars). The length is not an EMA length.
- **Sensitivity**: $\partial \ln c / \partial \ln r = -4$. A gap of $+1\%$ cuts the gain by about $4\%$.
- **Price above** ($r > 1$): $N$ grows, the line slows. A 10 % up-step ($r = 1.1$) gives $c = 1/(14 \cdot 1.4641) = 0.0488$.
- **Price below** ($r < 1$): $N$ shrinks, the line speeds up. A 10 % down-step ($r = 0.9$) gives
  $c = 1/(14 \cdot 0.6561) = 0.1089$, against a constant $0.1333$ for $\mathrm{EMA}_{14}$.

**Lag on a steady trend.** On a ramp of slope $b$ the line settles where its per-bar increment equals $b$. With the
gap $g = x_t - M_{t-1}$, equilibrium $c\,g = b$ gives $g = b\,n\,r^4$ and a lag behind the line of

$$
L = \frac{x_t - \textcolor{#FB8C00}{M_t}}{b} = n\,r^4 - 1 \approx (n - 1) + 4n^2\,\frac{b}{x}, \qquad
r = 1 + \frac{g}{\textcolor{#FB8C00}{M}}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $L$ | lag of the line behind a steady ramp | bars; 13.41 at $n = 14$, slope 0.1 at price 201 |
| $b$ | slope of the ramp | price per bar |
| $g$ | gap $x_t - M_{t-1}$ at equilibrium | price |
| $b/x$ | relative slope | per bar |

The lag depends on the **relative** slope $b/x$: longer in up-trends, shorter in down-trends. For $n = 14$ and a slope
of 0.1 per bar at a price near 201 the fixed point is $L = 13.41$ bars (the first-order formula gives 13.39).

**Overshoot.** The gain exceeds 1, so the line jumps past the price, when $n\,r^4 < 1$, i.e.
$r < n^{-1/4}$: for $n = 14$ a one-bar drop of more than 48.3 %. The new level is
$M_{t-1}\left(1 + \frac{r - 1}{n r^4}\right)$, which is $\le 0$ when $1 - r \ge n r^4$: for $n = 14$ a drop of
55.4 % or more ($n = 1$: 27.55 %). Large up-moves do the opposite: $c \to 0$ and the line almost freezes.

## Defaults
| Param | Default | Why |
|---|---|---|
| Length | 14 | TradingView default |
| Source | close | TradingView default |
| Offset | 0 | Display shift, $\ge 0$ |

## Warm-up
First valid bar index: $n - 1$ (13 at the default). The first value is the EMA seed, which in ChartLab is the SMA of
the first $n$ bars (see the EMA page). Near rest the seed's weight fades like $(1 - 1/n)^k$, so the chart loads
$\max(25n, 250)$ bars of extra history (350 at $n = 14$).

## Filter view
Only the **step** and **ramp** responses are shown, with the reason: the smoothing depends on the input
(superposition fails), so there is no single impulse or [frequency response](glossary:frequency-response). Both inputs sit at price-like levels
because the ratio $x/M$ matters.

- **Step** 100 to 110 (+10 %): 4.88 % of the step on the first bar, 50 % after 12 bars, 90 % after 36, 99 % after
  68 (bar 0 is the step bar). A 10 % *down*-step (not plotted) moves 10.9 % on the first bar and reaches 90 % after 26
  bars: the asymmetry is the $r^4$ term.
- **Ramp lag**: 13.41 bars for a ramp of 0.1 per bar starting at 100, read where price is about 201. On a steeper
  relative slope the lag grows (formula above).

## How to read it
- **Price above or below the line.** The main reading, as for an EMA. For this recursion it is exactly the same as
  the slope (see "Why it works"): price above the line and the line rising are one signal, not two.
- **Slope.** Rising while price is above, falling while price is below. Its speed depends on the side: a fall below
  the line is followed faster than a rise above it.
- **Crossings.** A down-cross comes sooner after a peak than the up-cross after a trough of the same size, so the
  two kinds of crossing have different delays.
- **Distance from price.** On a steady up-trend the gap grows with the relative slope ($4n^2\,b/x$ bars of extra
  lag); in a sell-off it stays small.
- **Trend vs range.** In a trend it lags like an EMA 27 (at $n = 14$), more in fast rallies; in a range it hugs the
  lower swings more than the upper ones.
- **The length.** At rest the line is an EMA of length $2n - 1$, so the length sets the lag ($n - 1$ bars) and the
  noise ($\mathrm{NRF} = 1/(2n-1)$).

## Why it works
**Price above the line is the line rising.** From the recursion, both quantities are multiples of the same gap:

$$
\textcolor{#FB8C00}{M_t} - \textcolor{#FB8C00}{M_{t-1}} = c_t\,\big(x_t - \textcolor{#FB8C00}{M_{t-1}}\big), \qquad
x_t - \textcolor{#FB8C00}{M_t} = (1 - c_t)\,\big(x_t - \textcolor{#FB8C00}{M_{t-1}}\big)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $c_t$ | the bar's gain $1/(n\,r_t^4)$ | between 0 and 1 except after a drop of more than 48 % at $n = 14$ |
| $x_t - \textcolor{#FB8C00}{M_{t-1}}$ | gap between price and the previous value of the line | price |

While $0 < c_t < 1$ both have the sign of $x_t - M_{t-1}$, so "close above McGinley" and "McGinley rising" fire on
the same bars. The same holds for every EMA and for KAMA.

**How sharp the test is.** On a [random walk](glossary:random-walk) with [drift](glossary:drift) $b$ and increment noise $\sigma$, an EMA of length $m$ has the
trend-detection ratio (LSMA page) $\rho = \sqrt{(2-c)/c} = \sqrt m$, so $P(x_t > \text{EMA}) = \Phi(\sqrt m\,b/\sigma)$.
McGinley 14 at rest is an EMA 27: $\rho = 5.20$, against 3.74 for an EMA 14; on a rally its gain falls and $\rho$
rises further. On `reversal` ($b/\sigma = 0.21$) that predicts $P = 0.86$ for EMA 27 and $0.78$ for EMA 14, and 10-bar
[edges](glossary:edge) of about $10\,b\,(2P - 1)$ = 1.8 % and 1.4 %. On a random walk without a turn there is no edge at all: the
future increments are independent of everything the line has seen.

The lab, seed 1, 1000 bars, [horizon](glossary:horizon) 10, `reversal`: close above McGinley 14 +1.65 % ([95 % interval](glossary:confidence-interval) +0.61 % to
+2.69 %, n = 55), close above EMA 27 +1.85 % (+0.69 % to +3.01 %, n = 49), close above EMA 14 +0.60 % (−0.49 % to
+1.68 %, n = 64). McGinley 14 behaves like the EMA 27, not like the EMA 14. Over seeds 1 to 5 the McGinley rule is
positive in four (+0.86 % to +1.65 %, interval above 0 in three) and near 0 in seed 2, where none of the three rules
shows anything. On `random_walk` all three are inside the noise. One rule on one sample: not a backtest and not
investment advice.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0],
 "rules": [
  {"label": "Close above McGinley 14", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "mcginley", "params": {}}, "output": "ma"}},
  {"label": "Close above EMA 27", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "ema", "params": {"length": 27}}, "output": "ma"}},
  {"label": "Close above EMA 14", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "ema", "params": {"length": 14}}, "output": "ma"}}
 ]}
```

## Combine with
- **SMA 200 as the [trend filter](glossary:trend-filter)**: a slow, sharp test of the long trend ($\rho = 12.2$).
- **Close above McGinley 14 as the trigger**: a medium-term trend that drops out quickly on sell-offs.
- **RSI 14 above 50 as a confirmation**: the balance of recent gains and losses; on a trending random walk it repeats
  the trigger's information, so expect little.

With seed 1 on `reversal` (horizon 10): close above SMA 200 +1.48 % (−0.05 % to +3.01 %, n = 36); filter and
trigger together +2.08 % (+0.60 % to +3.57 %, n = 31); adding RSI 14 above 50 gives +1.96 % (n = 29), no gain. The
pair is positive for seeds 1 to 5 (+1.20 % to +2.43 %, interval above 0 in three). On `random_walk` it has no edge
(seed 1: +0.73 %, −0.97 % to +2.43 %, n = 28). One sample, no costs; not investment advice.

```lab
{"kind": "combo", "scenario": "reversal", "horizon": 10, "on": [0, 1],
 "rules": [
  {"label": "Close above SMA 200", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "sma", "params": {"length": 200}}, "output": "ma"}},
  {"label": "Close above McGinley 14", "left": {"price": "close"}, "op": "gt",
   "right": {"indicator": {"id": "mcginley", "params": {}}, "output": "ma"}},
  {"label": "RSI 14 above 50", "left": {"indicator": {"id": "rsi", "params": {}}, "output": "rsi"}, "op": "gt",
   "right": {"value": 50}}
 ]}
```

## Differences vs TradingView
- Same recursion as TradingView's built-in script, including the EMA fallback wherever the previous value is `na`;
  the seed is ChartLab's EMA (SMA-seeded), so the first few dozen bars can differ slightly.
- A zero divisor (price 0) gives no value for one bar and the next bar re-seeds from the EMA, as in Pine. An overflow
  of $r^4$ gives an infinite divisor and a zero step, as with IEEE arithmetic in Pine.
- **Deliberate deviation**: when a one-bar drop pushes the level to $\le 0$, Pine continues from the negative value
  and oscillates through values like $\pm 10^{200}$ that wreck the price scale. ChartLab replaces a level $\le 0$ by
  $\mathrm{EMA}_n(x)_t$ on that bar (the same fallback Pine uses after `na`, without the gap). Wherever Pine's level
  stays positive the values are identical.

## Pitfalls
- Length 14 does not mean "like EMA 14": at rest it is as slow as EMA 27.
- Not shift-invariant: an index quoted with an offset, or a spread series, gives a different line. Scale-invariant
  only, and undefined for non-positive prices.
- The asymmetry is built in: it lags rallies more than declines. Do not compare up-crosses and down-crosses as if
  they had the same delay.
- "Price above" and "line rising" are the same rule here; requiring both adds no confirmation.

## Exercise
1. In the "Why it works" lab on `reversal`, compare the three rules, then press the new-sample button a few times.
   Does McGinley 14 stay closer to EMA 27 or to EMA 14? Explain with $\rho = \sqrt m$.
2. In the first lab on `shock`, set the length to 14 and look at the gap bar. By the local-EMA rule the gain at
   $r = 0.85$ is $1/(14 \cdot 0.85^4) = 0.137$, against $1/14 = 0.071$ at rest: how much of the gap does the line
   close on that bar, and how many bars until it has caught up? Repeat at length 40.
3. Start the replay on SPY on 19 February 2020, the market top before the COVID crash, with McGinley 14 and EMA 27.
   Step through the fall: which line follows price down faster, and which one reacts sooner in the rebound after
   23 March?

```lab
{"kind": "replay", "symbol": "SPY", "date": "2020-02-19",
 "indicators": [{"id": "mcginley", "params": {}}, {"id": "ema", "params": {"length": 27}}]}
```
