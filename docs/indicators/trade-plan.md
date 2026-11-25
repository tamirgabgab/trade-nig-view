# Trade plan

The Trade plan tool answers the question a trader asks before every trade: with this entry, this target and this
stop, held for at most this long, how often does the target come first, and what is the trade worth on average? Draw
it with three clicks (**Forecasting and measurement tools → Trade plan**):
- **The entry:** its bar and price.
- **The target:** its time is the holding time.
- **The stop.**

The **Trade plan** tab shows the numbers. They come from the market's own history, not from a formula; it is a
research tool, not investment advice.

## How the chances are measured

**The paths.** Every bar $s$ in the history before the entry, with $h$ bars after it, gives one path: the next $h$
bars' open, high, low and close as [log returns](glossary:log-return) against $C_s$. Each path is divided by the
[volatility](glossary:volatility) at $s$ and multiplied by today's (Yang–Zhang over a month, the
[Historical Volatility](learn:historical-volatility) engine):

$$
\tilde x_{s,j} = \frac{\hat\sigma_T}{\hat\sigma_s}\,\ln\frac{X_{s+j}}{C_s}, \qquad X \in \{O, H, L, C\},\ j = 1 \dots h
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $s$ | a past bar, with $s + h \le T$ | bar index |
| $T$ | the entry's bar | bar index |
| $\hat\sigma_s,\ \hat\sigma_T$ | the per-bar volatility at $s$ and today | log return, about 1–2 % daily |
| $\tilde x_{s,j}$ | the path's bar $j$, at today's volatility | log return |

So a calm stretch's path is stretched and a crash's path shrunk to today's conditions. A path keeps everything
real inside it:
- the gaps;
- the fat tails;
- the bursts of volatility within the path.

Every window is used once: the result is the same every time (no random draws), and on daily stocks there are
thousands of paths.

**The entry.** At the close of the entry bar, the plan starts at once. Any other price is an order that fills only
when a later bar reaches it (a gap through it fills at the open). The tab shows P(fill); every other number is given
the fill.

**The exits.** From the bar after the fill, the first bar whose high reaches the target or whose low reaches the stop
ends the trade.
- **A gap beyond a level** (the open already past it) exits at the open. That is why the "loss when stopped" can be
  worse than −1R.
- **No exit by bar $h$:** the trade ends at that bar's close.

**A bar that touches both.** The bar's high reaches the target and its low the stop: which came first? The tool uses
the **Brownian bridge**: a Brownian motion from the bar's open to its close that touches both levels, with the
variance the bar's own range implies ([Parkinson](learn:historical-volatility)). In units of that volatility, with
the target $a$ above the open, the stop $b$ below it and the close at $x$:

$$
P(\text{target first}) = \frac{U}{U + D}, \qquad
U = \int_0^1 f_a(t)\, g_{a \to -b}(x, 1 - t)\, dt, \qquad
f_a(t) = \sum_{k=-\infty}^{\infty} \frac{a + 2kw}{\sqrt{2\pi t^3}}\, e^{-(a + 2kw)^2 / 2t}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $a,\ b$ | distance from the open to the target and to the stop | bar volatilities, 0 to 1.7 |
| $x$ | the close against the open | bar volatilities |
| $w = a + b$ | the width of the band | bar volatilities |
| $f_a(t)$ | density of leaving the band through the target at time $t$ (images of the two levels) | per unit time |
| $g_{a \to -b}(x, 1 - t)$ | density of going from the target to the close $x$ in the rest of the bar, touching the stop (reflection) | — |
| $D$ | the same with the stop first | — |

Checked against simulated bridges (1,000 steps, continuity-corrected levels): within 2 points. The tab also shows
the bounds with every such bar given to the stop or to the target. They are within a fraction of a point unless the
levels sit inside a typical bar.

**The fill bar.** A stop touched on the bar that filled the order counts (the price had to pass the entry to reach
it). A target touched on that bar counts only for an order above the close (the price had to rise through the entry
first); otherwise it may have come before the fill and is not counted. This leans to the cautious side.

## Reading the tab

- **Chances.**
  - P(fill), and given the fill: P(target first), P(stop first), P(neither) by bar $h$, the mean bars to the exit.
  - **Expected result:** in R, the planned risk $|{\rm entry} - {\rm stop}|$, and in % of the entry. R is measured
    on the prices: a short's gain is the fall of the price.
- **Loss when stopped:** −1R when the stop fills at its level; below −1R by the gaps through it. A stock that gaps
  a lot (see the overnight share in the Volatility tab) pays more for a stop.
- **Kelly:**
  $$
  f^* \approx \frac{E[R]}{E[R^2]}
  $$
  It is the fraction of the account to risk per trade that maximises the long-run growth, if the odds were exact.
  They are not: real traders use a fraction of it. "0 (no edge)" when the expected result is not positive.
- **Position size:** the account and the risk % (saved on the drawing) give the shares: account × risk % / |entry −
  stop|.
- **Brownian reference:** the textbook gambler's ruin with the history's drift $\mu$ and today's volatility, with no
  time limit:
  $$
  P(\text{target first}) = \frac{1 - e^{-2\mu D/\sigma^2}}{1 - e^{-2\mu (U + D)/\sigma^2}}
  $$

  | Symbol | Meaning | Units / typical range |
  |---|---|---|
  | $U,\ D$ | log distances from the entry to the target and to the stop | log return |
  | $\mu,\ \sigma$ | drift and volatility per bar | log return |

  Without drift it is $D / (U + D)$: a target twice as far as the stop is hit first one time in three. When the paths
  disagree with it, the history has fat tails, gaps, or a drift the formula does not see.
- **Expected R by distance:** the same plan for target and stop distances of 0.25 to 3 times $\sigma\sqrt h$, the
  typical move over the holding time; the drawn plan's cell is outlined. It shows at once whether a wider stop or a
  closer target would have paid better in this market.
- **Calibration out of sample:** at each of the last 500 bars, the 36 plans of the heat map (entered at the close),
  with P(target first) from the paths that had ended by then, against what that bar's own path did.
  - **Reliability diagram:** forecasts in 10 % bins; dots on the diagonal mean "30 % happened 30 % of the time".
  - **Brier score:** the mean squared error of the forecasts, against the one of the base rate (the same probability
    for every plan).
- **What happened:** for a plan drawn in the past, its real outcome (in a replay, only up to the cursor).

## Is it right? The checks

On a [random walk](glossary:random-walk) without drift (Brownian bars, the second half mirroring the first, so the
sample has no drift at all), with $h = 60$:

| Target / stop (log) | P(target first) measured | Gambler's ruin | P(neither) |
|---|---|---|---|
| +0.06 / −0.03 | 33.6 % | 33.3 % | 4.0 % |
| +0.03 / −0.03 | 50.0 % | 50.0 % | 0.0 % |
| +0.03 / −0.06 | 62.4 % | 66.7 % | 3.9 % |

The last row is below the formula because 4 % of the plans run out of time first: the formula has no time limit.

Calibration on synthetic stocks (3,000 bars, entry at bar 2,500, seeds 1–3): the Brier score is 0.13–0.18 against
0.20–0.23 for the base rate on `random_walk`, `accumulation` and `shock`. The bins with at least 1,000 forecasts are
off the diagonal by 2–7 points for seeds 1 and 3 and by 16 for seed 2. A random walk's sample drift changes along
its history, and the paths carry the drift of their time. On `shock` the gap bar makes the mean loss when stopped
−1.02R to −1.03R, against −1.00R on the others.

## Pitfalls

- **The drift is the history's.** A stock that rose for ten years gives paths that rise; that is a fact about the
  past, not a promise. Compare with the Brownian reference and read the calibration.
- **Overlapping paths.** Neighbouring windows share most of their bars: 6,000 paths are far fewer independent
  outcomes. The chances are averages over the history, not tight estimates.
- **Volatility scaling.** Today's volatility is estimated, and a regime that never happened in the history cannot be
  rescaled into one.
- **Slippage and costs** are not included, apart from the gaps.
- **Intraday bars:** the paths run across nights and weekends as the bars do; on 1h charts a plan of 20 bars spans
  about three sessions.

## Exercise

1. Draw a long plan on a daily stock: entry at a close, target 2 ATR up, stop 1 ATR down, 20 bars. Read P(target
   first) and the Brownian reference: which is higher, and what does the heat map say about a stop of 1.5 instead of
   1 times σ√h?
2. Replay a past month and draw the same plan at its first bar; step to the end and compare "What happened" with the
   chances the tab gave.

```lab
{"kind": "replay", "symbol": "SPY", "date": "2022-06-01",
 "steps": ["Pick the Trade plan tool and draw a long plan at the cursor bar: entry at the close, target about 4 % up, 20 bars later, stop about 2 % down.",
           "Note P(target first), the expected R and the loss when stopped.",
           "Step forward 20 bars with Shift+Right and read What happened."],
 "reveal": "One outcome is not a test of a probability: if the tab said 35 % and the target came first, a 35 % chance happened; if the stop did, a 65 % one. Mid-2022 fell hard, and the paths carry the history's upward drift, so a long plan's odds may have been too kind then. The test is the calibration diagram, over 18,000 past plans."}
```
