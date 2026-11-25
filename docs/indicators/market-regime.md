# Market regime: trend or mean reversion (`variance_ratio`)

Is this market trending (a move tends to be followed by another in the same direction), random, or mean-reverting
(a move tends to be undone)? The answer decides which tools to trust: breakouts and moving-average crosses in a
trend, oversold buys and band fades in a range. Three indicators and a tab answer it with a significance test:
- **Variance Ratio** (`variance_ratio`): a pane with the test statistic.
- **Hurst Exponent** (`hurst_dfa`): a pane with the persistence of the returns.
- **Market Regime** (`regime`): a tint behind the bars.
- **The Regime tab:** the test with a bootstrap p-value, the multifractal spectrum, the regime map, and whether the
  rules really worked better in their own regime.

It is a research tool, not investment advice.

## What it measures
The question it answers: "do this market's returns remember their past?" On a [random walk](glossary:random-walk)
they do not. Then the variance of the move over $q$ bars is exactly $q$ times the variance of one bar.
- **Positive autocorrelation (momentum):** the $q$-bar moves are larger than that.
- **Negative autocorrelation (mean reversion):** they are smaller.

The `regimes` scenario has momentum in its first half and mean reversion in its second. Watch the statistic cross the
5 % lines.

```lab
{"kind": "param", "indicator": "variance_ratio", "vary": "length", "min": 64, "max": 250, "params": {"length": 150}, "scenario": "regimes"}
```

## Formula
Over the last $W$ log returns (a calendar year of bars; default 252), with mean $\mu$, deviations $d_k = r_k - \mu$
and the overlapping $q$-bar sums $S_k$:

$$
VR(q) = \frac{\hat\sigma^2_q}{\hat\sigma^2_1}, \qquad
\hat\sigma^2_1 = \frac{\sum d_k^2}{W-1}, \qquad
\hat\sigma^2_q = \frac{\sum_k (S_k - q\mu)^2}{q\,(W-q+1)(1 - q/W)}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $W$ | the window | bars, 64–5000 (default 252) |
| $q$ | the aggregation: 2, 4, 8 and 16 bars | bars |
| $VR(q)$ | the variance ratio | 1 random, $> 1$ trend, $< 1$ reversion; for AR(1) returns $VR(2) = 1 + \phi$ |

Lo and MacKinlay's statistic is robust to changing volatility, which every market has:

$$
\delta_j = \frac{W \sum_{k > j} d_k^2 d_{k-j}^2}{(\sum d_k^2)^2}, \qquad
\theta(q) = \sum_{j=1}^{q-1} \left[\frac{2(q-j)}{q}\right]^2 \delta_j, \qquad
\textcolor{#2962FF}{z^*(q)} = \frac{\sqrt W\,(VR(q) - 1)}{\sqrt{\theta(q)}}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\delta_j$ | the asymptotic variance of the lag-$j$ autocorrelation, under any volatility pattern | about 1 |
| $\theta(q)$ | the variance of $\sqrt W (VR(q) - 1)$ | 1 at $q = 2$ |
| $z^*(q)$ | standard normal for a random walk | about $\pm 2$ |

**Chow–Denning.** Testing four $q$ at 5 % each would find "something" far more often than 5 % of the time. The joint
test uses $\max_q |z^*(q)|$ against the studentised maximum modulus: 2.49 at 5 % for four ratios. The pane draws the
$z^*$ with the largest modulus, signed, between the dashed $\pm 2.49$ lines.

**The regime** tints the bars: blue where $z \ge 2.49$ (trend), orange where $z \le -2.49$ (reversion).

**Hurst by DFA.** The profile of the window's returns $Y_k = \sum_{i \le k} d_i$ is cut into boxes of $s$ bars; a
line is fitted in each box:

$$
F(s) = \sqrt{\frac{1}{n_s s} \sum_{b} RSS_b(s)}, \qquad \ln F(s) = c + \textcolor{#FF6D00}{H} \ln s
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $RSS_b(s)$ | residual sum of squares of the line in box $b$ | — |
| $n_s$ | boxes of $s$ bars in the window | $W / s$ |
| $H$ | the Hurst exponent | 0.5 random, $> 0.5$ persistent, $< 0.5$ anti-persistent |

The scales are 8, 16, 32 and 64 bars (those with at least four boxes). The fitted lines make DFA immune to drifts,
which fool the classic rescaled range.

## Defaults
| Param | Default | Why |
|---|---|---|
| Length (all three) | 252 | a year of daily bars: about 250 returns for the test, enough power for a correlation of 0.2 |

## Warm-up
First valid bar index: $W$ (a full window of returns): 252 by default.

## The Regime tab
- **The test now:**
  - $VR(q)$ and $z^*(q)$ for each $q$, and the Chow–Denning statistic.
  - Its **wild-bootstrap** p-value: the window's returns times random signs, 999 times. That keeps each return's size,
    so volatility clusters and fat tails stay, and destroys their order.
  - The asymptotic p-value, for comparison.
- **Hurst:** on the window, against its 5–95 % range on 199 shuffles of the window (the random-walk null), and on the
  whole history.
- **MF-DFA:** the generalised exponents $H(q)$ for $q = -2 \dots 4$ (below).
- **The map:** the regime (trend, random, reversion) by volatility (the [volatility](learn:historical-volatility)
  percentile above or below 50). It shows the history's share of bars in each cell, and where today is.
- **The event study:** four long rules, with the regime each signal bar had. The forward 10-bar return after the
  signals is compared with all bars of the same regime.
  - **Two trend rules:** EMA 20 crossing above EMA 50; a close crossing above the upper Bollinger band.
  - **Two reversion rules:** RSI crossing below 30; a close crossing below the lower band.

```lab
{"kind": "regime", "scenario": "regimes"}
```

## How to read it
- **$z$ above 2.49:** the last year's returns had momentum, significantly. Trend-following tools have the wind
  behind them; fading moves is swimming against it.
- **$z$ below −2.49:** moves tended to be undone. Oversold buys, band fades and range trading fit.
- **Between:** no evidence either way. Most of the time, for most liquid markets.
- **H** says the same with another lens: above its shuffle band, persistence; below it, anti-persistence. The
  variance ratio is the more powerful at short lags, DFA at long ones.
- **The bootstrap p-value** is the one to trust: the asymptotic one assumes far more data than a year.

## Why it works
**The test on known processes.** For AR(1) returns $r_t = \phi r_{t-1} + \varepsilon_t$, $VR(2) = 1 + \phi$
(checked to ±0.03 on 20,000 returns for $\phi = -0.3, 0, 0.3$). Without memory, $z^*$ has a standard deviation of 1.0
(±0.15) over 200 samples of 500 returns.

**The `regimes` scenario** ($\phi = +0.25$ then $-0.25$, seeds 1–3, 3,000 bars):
- **Detection:** the regime tint marks 82–100 % of the momentum half's bars as trend, and 80–97 % of the second
  half's as reversion.
- **The test at the last bar** (a year of reversion): $z$ from −2.6 to −5.0, bootstrap p 0.001–0.037: rejected
  each time, but by far less than a textbook $\phi$ suggests over one year.
- **DFA on the same year:** H between 0.44 and 0.49, inside the shuffle band of 0.39–0.64 each time. At this
  window the variance ratio has more power; with 1,500 bars (the reversion year closer to the start of its half)
  H fell to 0.24–0.51.

**False alarms.** On `random_walk`, `uptrend` and `volatility_regime` (seeds 1–5) the tint marks 0–9 % of the bars:
about the 5 % the test allows, but in stretches, because neighbouring windows share most of their returns. A tint
lasting a few weeks on a random market is normal; the bootstrap p-value and the event study are the checks.

**Does the regime change what works?** On `regimes` (seeds 1–5, 10-bar forward returns, edge = minus the mean of
all bars in the same regime):

| Rule (long) | In a trend | In a reversion | Signals |
|---|---|---|---|
| Close crosses below the lower band | −0.97 % | +0.37 % | 157 / 211 |
| RSI crosses below 30 | +0.26 % | +1.34 % | 108 / 34 |
| EMA 20 crosses above EMA 50 | +0.46 % | +0.14 % | 60 / 65 |
| Close crosses above the upper band | +0.01 % | −0.19 % | 179 / 194 |

- **The reversion rules depend on the regime:** buying weakness pays in a reverting market and costs in a trending
  one.
- **The trend rules show little at 10 bars:** the EMA cross varies from −2.5 % to +4.0 % between seeds.

The seeds disagree often enough that one market's table is a hint, not a law. Read the $t$ column before
believing an edge, and see [multiple testing](learn:combinations#overfitting-and-multiple-testing).

**MF-DFA: moments of every order.** With $F_q(s) = \big[\frac{1}{n_s}\sum_b (RSS_b/s)^{q/2}\big]^{1/q}$:
- **The exponents:** $H(q)$ is the log-log slope for each order $q$. Negative $q$ weighs the calm boxes, large $q$
  the wild ones.
- **The width** $\Delta h = H(-2) - H(4)$ is about 0 for Gaussian returns (below 0.1 on 4,096 normal draws).
- **What a wide spectrum means:** it is clearly larger when big moves come in bursts. Big and small moves then scale
  differently, and a single $H$, or a single volatility, describes the market less well.

## Combine with
- **Historical Volatility** ([page](learn:historical-volatility)): the other axis of the map; trend in calm markets
  and reversion in wild ones behave differently.
- **Combining indicators** ([page](learn:combinations)): the regime is a filter for a rule, decided before the rule.
- **RSI**, **Bollinger Bands**, **MA Cross**: the rules the event study scores.

## Differences vs TradingView
TradingView has no built-in variance ratio or DFA Hurst; community "Hurst" scripts usually use the rescaled range,
which a drift biases upward, and report no significance.

## Pitfalls
- **A year is short.** The test has power for autocorrelations of about 0.15–0.2; weaker memory goes unseen.
- **Overlap.** The rolling statistic moves slowly, and a false alarm lasts weeks.
- **Regimes end.** A significant past year is not a forecast; the tint changes only after enough new bars.
- **Costs.** An edge of a fraction of a percent per signal can vanish in spreads and commissions.

## Exercise
1. In the widget, compare `regimes` with `random_walk`: the bootstrap p-value, H against its shuffle band, and the
   event-study table. Which rows change sign between the trend and the reversion columns?
2. On a daily stock, add the three indicators: how much of the last ten years was tinted? Is that more than the
   5 % a random walk would give?

```lab
{"kind": "replay", "symbol": "SPY", "date": "2021-06-01",
 "steps": ["Add Variance Ratio, Hurst Exponent and Market Regime; open the Regime tab.",
           "Note the bootstrap p-value and the label.",
           "Step forward 60 bars with Shift+Right and watch the statistic and the tint."],
 "reveal": "Broad equity indices usually sit between the lines: their daily returns carry almost no memory over a year, and the tab says 'random' most of the time. A tint, when it appears, deserves the bootstrap p-value and the event study before any trading conclusion."}
```
