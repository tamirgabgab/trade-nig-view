# Value at Risk and Expected Shortfall (`var_bands`)

How much can a position lose by the next bar, week or month, with 90, 95 or 99 % confidence, and how much on
average when that line is crossed? **VaR Bands** draws the next bar's limits on the chart and marks every close
outside them. The **Risk** tab compares four ways of computing the risk for both directions, and tests each one on
the past.
- **The directions:** a fall for a long position, a rise for a short one.
- **The four methods:** normal, Cornish–Fisher, historical (FHS) and extreme-value (EVT).

It is a research tool, not investment advice.

## What it measures
Two numbers per level:
- **VaR** answers "a loss larger than this happens only $(1 - L)$ of the time".
- **ES**, the Expected Shortfall, answers "and when it happens, how bad on average".

A VaR says nothing about the losses beyond it: two strategies with the same VaR can have very different crashes.
That is why regulators moved to ES.

Move the confidence on the volatility regime: the bands widen with the second, wilder half, and about $1 - L$ of
the closes fall outside them.

```lab
{"kind": "param", "indicator": "var_bands", "vary": "window", "min": 100, "max": 1000, "scenario": "volatility_regime"}
```

## Formula
**Standardised returns.** Each return is divided by the volatility known before it: the per-bar Yang–Zhang
volatility over a month ([Historical Volatility](learn:historical-volatility)). Over $h$ bars:

$$
z_{t,h} = \frac{\ln(C_{t+h}/C_t)}{\sigma_t \sqrt h}, \qquad \ell = -z \ (\text{long}), \quad \ell = z \ (\text{short})
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $C_t$ | close of bar $t$ | price |
| $\sigma_t$ | per-bar volatility at $t$ | log return, about 1–2 % daily |
| $h$ | the horizon: 1 bar, a week or a month (calendar, in bars) | bars |
| $z_{t,h}$ | the $h$-bar return in units of the volatility of its time | about $\pm 3$ |
| $\ell$ | the loss of a long (a fall) or a short (a rise) | standard units |

The $h$-bar returns are the real ones (not one bar times $\sqrt h$), so fat tails and the way returns follow each
other over $h$ bars stay in. VaR and ES of $\ell$ at level $L$ are turned into prices with today's volatility:
$\text{fall} = 1 - e^{-\ell\,\sigma_T\sqrt h}$ (long), $\text{rise} = e^{\ell\,\sigma_T\sqrt h} - 1$ (short).

**The four methods**, with $m$, $s$, $g_1$, $g_2$ the mean, standard deviation, skewness and excess kurtosis of
$\ell$ and $z_L$ the normal quantile:

$$
\begin{aligned}
\text{Normal:}\quad & \mathrm{VaR} = m + s z_L, \qquad \mathrm{ES} = m + s\,\frac{\varphi(z_L)}{1 - L} \\
\text{Cornish–Fisher:}\quad & z_L \to z_L + \frac{(z_L^2 - 1) g_1}{6} + \frac{(z_L^3 - 3z_L) g_2}{24} - \frac{(2z_L^3 - 5z_L) g_1^2}{36} \\
\text{FHS:}\quad & \mathrm{VaR} = Q_L(\ell), \qquad \mathrm{ES} = \text{mean of } \ell \ge \mathrm{VaR} \\
\text{EVT:}\quad & \mathrm{VaR} = u + \frac{\beta}{\xi}\left[\left(\frac{N}{N_u}(1 - L)\right)^{-\xi} - 1\right], \qquad \mathrm{ES} = \frac{\mathrm{VaR} + \beta - \xi u}{1 - \xi}
\end{aligned}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $L$ | the confidence | 0.90, 0.95, 0.99 |
| $\varphi$ | the standard normal density | — |
| $Q_L$ | the empirical quantile (linear interpolation) | standard units |
| $u$ | the EVT threshold: the 90th percentile of the losses | about 1.3 |
| $N,\ N_u$ | all the losses, and those above $u$ | counts |
| $\xi,\ \beta$ | shape and scale of the generalised Pareto tail above $u$ | $\xi$: $> 0$ a power-law (fat) tail, $< 0$ a bounded one |

The Pareto tail is fitted by probability-weighted moments (Hosking and Wallis), a closed form: with $a_0$ the mean
exceedance and $a_1$ its mean weighted by the share of larger ones, $\xi = 2 - a_0/(a_0 - 2a_1)$,
$\beta = 2a_0a_1/(a_0 - 2a_1)$. EVT extrapolates the tail beyond the data; FHS can never predict a loss larger than
the largest one seen.

**The bands** on the chart are FHS for the next bar, over the last $W$ standardised returns. At bar $t$:

$$
\textcolor{#F23645}{\text{lower}_{t+1}} = C_t\, e^{\sigma_t Q_{1-L}(z)}, \qquad \textcolor{#F23645}{\text{upper}_{t+1}} = C_t\, e^{\sigma_t Q_L(z)}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $W$ | the history of standardised returns used | bars (default 500) |
| $z$ | $r_s / \sigma_{s-1}$ for the last $W$ bars | standard units |

The bands are drawn on the bar they forecast, so a close outside them is a breach of the 1-bar VaR: an arrow up
above, down below.

## Defaults
| Param | Default | Why |
|---|---|---|
| Confidence | 95 % | a breach every 20 bars, often enough to judge it by eye |
| History | 500 bars | two years of daily bars: enough tail without forgetting regimes |
| Volatility length | 21 | a trading month, as the volatility engine |

## Warm-up
First valid bar index: $n + W + 1$ (the volatility, then $W$ standardised returns, then one bar of offset): 522
with the defaults.

## The Risk tab
- **VaR and ES** for 1 bar, a week and a month, by method and level, for the side you pick (Long or Short), in % and
  in price.
- **Backtests** of the 1-bar VaR over the last 1,000 bars, refitted every 20 on the past only:
  - the breaches against the expected count;
  - **Kupiec** (is the rate right?) and **Christoffersen** (do breaches come in clusters?), as p-values;
  - **Acerbi–Székely $Z_2$** for the ES, with its p-value from 500 simulations of the model itself.
- **The tails:** $\xi$ of each side (the left tail is usually the fatter one).

```lab
{"kind": "risk", "scenario": "accumulation"}
```

## How to read it
- **VaR 95 % of 2 %:** on 1 day in 20 the loss is larger than 2 %. **ES of 3 %:** those days lose 3 % on average.
- **The gap between VaR and ES** is the tail: about 1.25 times for a normal tail at 95 %, more for fat tails.
- **Horizons:** a month's VaR is not a day's times $\sqrt{21}$ when returns trend or revert; the tab measures it.
- **A p-value below 0.05** rejects the method on this history: too many or too few breaches (Kupiec), clustered
  breaches (Christoffersen), or losses beyond the VaR larger than the ES says ($Z_2$).
- **Sizing:** a position whose 99 % one-day VaR equals the most you accept to lose on a bad day.

## Why it works
**Volatility first, shape second.** Returns divided by their own volatility are far closer to identically
distributed than raw returns: the bands widen at once when volatility rises, and the shape of the tails is
learnt from all the history. This is filtered historical simulation, the standard in bank risk systems.

**Backtests on synthetic stocks** (3,000 bars, the last 1,000 scored, long side, 99 %: 10 breaches expected;
seeds 1–3):

| Scenario | Normal | Cornish–Fisher | FHS | EVT |
|---|---|---|---|---|
| `random_walk` | 11–13 | 11–12 | 9–11 | 10–11 |
| `shock` (one −15 % gap) | 9–11 | **0** (Kupiec p 0.00) | 9–11 | 8–10 |
| `volatility_regime` | 10–13 | 10–11 | 9–11 | 10–11 |
| `accumulation` (calm and wild phases) | **15–16** (ES $Z_2$ p 0.02–0.04) | 10–13 | 9–13 | 10–13 |

- **Cornish–Fisher on `shock`:** one extreme bar inflates the skewness and the kurtosis, and the expansion turns
  absurd. Its 99 % VaR was so wide that nothing broke it. A correction built on moments is only as robust as the
  moments.
- **The normal on `accumulation`:** returns come in calm and wild phases, which make the standardised returns'
  tails fatter than normal. Too many breaches, and its ES too small.
- **FHS and EVT** passed every case. EVT matters most beyond the data (99.5 % and up), where FHS stops at the worst
  loss seen.

## Combine with
- **Historical Volatility** ([page](learn:historical-volatility)): the volatility these numbers scale by; a squeeze
  there means today's VaR is small, and likely to grow.
- **Trade plan** ([page](learn:trade-plan)): the loss when stopped, against the VaR of the holding time.
- **ATR** ([page](learn:atr)): a stop beyond the 99 % one-bar VaR is rarely hit by noise alone.

## Differences vs TradingView
TradingView has no built-in VaR indicator. The bands here are the 1-bar FHS VaR of the close, drawn one bar ahead;
community scripts usually draw a normal VaR from close-to-close volatility, which on these tests is the least
reliable at 99 %.

## Pitfalls
- **The VaR is not the worst case.** At 99 %, one bar in a hundred is worse, and the ES is only their mean.
- **Regime change.** A history without a crash cannot show one; the volatility scaling helps only once the first
  violent bars have arrived.
- **Overlapping $h$-bar returns** for a week or a month: thousands of them, but far fewer independent ones; the
  month's tails are the least certain numbers in the tab.
- **Gaps:** the 1-bar VaR includes them (close to close), but a stop does not protect against them.

## Exercise
1. In the widget, switch the scenario to `shock`: find Cornish–Fisher's 99 % breaches and Kupiec p-value. Why does
   one bar break it, and not FHS?
2. On a daily chart, add VaR Bands at 99 % and count the arrows over the last year: about 2.5 on each side is
   right. More arrows on the downside than the upside is a fat left tail.

```lab
{"kind": "replay", "symbol": "SPY", "date": "2020-02-14",
 "steps": ["Add VaR Bands (FHS) at 99 % and open the Risk tab on the Long side.",
           "Note the 1-bar and 1-month VaR 99 % in %.",
           "Step forward 30 bars with Shift+Right: count the down arrows and watch the bands."],
 "reveal": "Bands made in a calm market are narrow, so the first crash bars tend to break them, often several days running: a cluster of breaches, which is what Christoffersen's test catches. As the volatility estimate rises the bands widen several times over, and the breaches become rare again. A VaR scaled by recent volatility reacts fast, but only after the first violent bars."}
```
