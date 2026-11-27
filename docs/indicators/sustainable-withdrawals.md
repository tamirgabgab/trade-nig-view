# How much can be taken

One withdrawal plan on one history says what happened once. Run it on every start history allows, or on many
simulated worlds, and it says how often the plan lasts, what is usually left, and how much could be taken a month
and still last in most of them. This page is what the Withdraw tab's *Run history* and *Simulate* report.

## What it answers

*"How much can I take a month from my capital and still be fairly sure it lasts thirty years?"*

The **sustainable amount**: the largest fixed amount that lasts in a share of the realizations you choose, 95 % by
default. Beside it, the share of the realizations still paying in each year, a histogram of what is left at the
end, and for a percent rule the spread of the income year by year.

## Formula

### Still paying

A realization $w$ (a window of history or a simulated world) lasts when its last month is paid in full; its money
ends in month $k_{\text{end},w}$ otherwise ([withdrawals](learn:withdrawals)). The share still paying at month $k$:

$$
\text{paying}(k) = \frac{1}{N} \cdot \#\big\{\, w : k_{\text{end},w} \text{ is none, or later than } k \,\big\}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $w$, $N$ | a realization, and how many there are | 1 to 5,000 |
| $k_{\text{end},w}$ | the month realization $w$'s money ends; none when its last month is paid in full | month |
| $\text{paying}(k)$ | the share of the realizations still paying in full at month $k$; $\text{paying}(T)$ is the share that lasts | 0 to 1 |

The page reads it at the start, at every year's end and on the last month, at the cost share entered and at both
tax bounds.

### The sustainable amount

Lasting can only get harder as the amount rises, so the largest amount that still lasts in a share $\alpha$ of the
realizations is found by halving an interval until it is half a shekel wide:

$$
R^* = \max\big\{\, R : \text{paying}_R(T) \ge \alpha \,\big\}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $R$ | a fixed amount a month, net, in shekels of the first day | ₪ |
| $\text{paying}_R(T)$ | the share that lasts when the plan takes $R$ | 0 to 1 |
| $\alpha$ | the share of the realizations the amount must last in | 50 to 100 %, 95 % by default |
| $R^*$ | the sustainable amount, at the cost share entered | ₪ a month |

### The order of the months

The same months of the market in reverse order, the CPI as it was. With no fees and no tax on the way, a percent
rule ends where it would have ended anyway, because its balance is a product of the months:

$$
H_T = H_0 \cdot \prod_{k=1}^{T} \text{growth}_k \cdot \Big(1 - \frac{\omega}{12}\Big)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $H_0$, $H_T$ | the account at the start and at the end | ₪ |
| $\text{growth}_k$ | what one shekel in the market on date $k - 1$ is worth on date $k$ | about 0.9 to 1.1 |
| $\omega$ | the percent rule's yearly share sold | 2 to 8 % a year |

A fixed amount sells more units after a fall than after a rise, so for it the order matters: bad years first cost
more than the same years last. That is the **sequence risk**, and the tab's table *The order of the months* shows it
for the plan on screen.

### The income by year

For a percent rule, each realization's mean monthly income of each year, in shekels of the first day, and over the
realizations its percentiles:

$$
\text{fan}_t = \big(Q_5,\ Q_{25},\ Q_{50},\ Q_{75},\ Q_{95}\big) \ \text{of year } t\text{'s mean monthly income}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $t$ | a year of the plan | 1 to 100 |
| $Q_p$ | the percentile $p$ over the realizations | ₪ a month |
| $\text{fan}_t$ | the five percentiles of year $t$, drawn as two bands around the median | ₪ a month |

### How much evidence there is

Windows of history overlap, and worlds are cut from the same history, so neither holds as many independent terms
as it has realizations ([overlapping windows](learn:overlapping-windows), [simulated worlds](learn:simulated-worlds)):

$$
n_{\text{eff}} = \frac{S + T}{T}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $S$ | the span of the starts, or the months of history a bootstrap is cut from | months |
| $T$ | the plan's term | months |
| $n_{\text{eff}}$ | about how many separate terms the windows, or the history, hold | 1 to 10 |

## Worked example

Two worlds of ten years from **1,200,000**, all of it cost. In one the account never moves; in the other it halves
in the first month and never moves again. ₪10,000 a month lasts in the first and not in the second, which holds
only 600,000; ₪5,000 lasts in both. So:

| Target share $\alpha$ | Sustainable amount $R^*$ |
|---|---|
| 100 % (both) | **5,000** |
| 50 % (one of two) | **10,000** |

The order of the months, taxes aside: 100,000 in a market that rises 50 % and then falls 50 %, and the same two
months the other way round.

| Rule | As it happened | In reverse |
|---|---|---|
| 10,000 a month | **60,000** left | **50,000** left |
| 120 % a year (10 % a month) | **60,750** left | **60,750** left |

$$
100{,}000 \times 1.5 \times 0.9 \times 0.5 \times 0.9 = 60{,}750
$$

## How to read it

- **Lasts in** is $\text{paying}(T)$ at the cost share entered; its note gives the two tax bounds.
- **The histogram** counts what is left at the end, as a percent of the start or in shekels. The ones that ran out
  are a bar of their own; with an apartment they still hold its worth and stay among the bars.
- **Still paying, by year** falls where realizations run out; the band is the two tax bounds.
- **Independent terms** says how much of that to believe: for example, 179 windows of ten years from 25 years of
  bars are about 2.5 separate terms, not 179.

## Where it comes from

The question is the one W. Bengen asked of US history in 1994: an inflation-indexed withdrawal of about 4 % of the
starting capital lasted thirty years from every start he tried. P. Cooley, C. Hubbard and D. Walz (1998, the
"Trinity study") turned it into success rates; W. Pfau (2010) found the same rate much less safe outside the United
States. Those numbers are for US data and are not carried into the Planner: it runs the user's own mix, on the
user's own history or worlds. The bisection works because $\text{paying}_R(T)$ can only fall as $R$ rises: a larger
amount sells more of every month, and a realization that runs out at $R$ runs out at every larger amount.

## Limits

- History is short: for 20 or 30 years it is an illustration, not evidence, and the bootstrap inherits that.
- A modelled market is lognormal; real markets fall harder than such a model does.
- From a Market plan the studies use one capital at its overall cost share, not its lots.
- The sustainable amount is at the cost share entered; at a lower one it is lower.
- The numbers are a model, not advice.
