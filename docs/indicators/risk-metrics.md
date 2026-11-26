# Risk metrics

A simulation gives each option a thousand end values, not one. This page explains the numbers the Planner draws
from them: how bad the bad worlds are, how much you might regret a choice, and what the road looked like on the way.

## What it answers

*"Option A ends higher in most worlds. But what happens in the worlds where it goes wrong, and can I live with the
road there?"*

The mean and the probability of winning say who is ahead on average. Risk is about the rest: the tail, the regret,
and the path. Two options with the same median can be very different to live with.

## Formula

Throughout, an option has $N$ end values $W^{(1)}, \dots, W^{(N)}$, one per world, in real shekels (shekels of the
first day).

### The bad tail

$$
Q_p = \text{the value that } p \text{ of the worlds end below}, \qquad
\mathrm{CVaR}_{5\,\%} = \frac{1}{N_{\text{worst}}} \sum_{w \,\in\, \text{worst}} W^{(w)}, \quad N_{\text{worst}} = \lceil 0.05\, N \rceil
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $N$ | the number of worlds | 1,000 by default |
| $W^{(w)}$ | the option's end value in world $w$ | ₪ |
| $Q_p$ | the percentile $p$: $Q_{50\,\%}$ is the median, $Q_{5\,\%}$ the value one world in twenty ends below | ₪ |
| $N_{\text{worst}}$ | the number of worlds in the worst 5 %, rounded up | 50 of 1,000 |
| $\mathrm{CVaR}_{5\,\%}$ | the *average* of the worst 5 % of worlds: how bad it is when it is bad | ₪, never above $Q_{5\,\%}$ |

Between two neighbouring values a percentile is interpolated in a straight line.

### Ending below the money put in

$$
P(\text{shortfall}) = \frac{\#\{w : W^{(w)} < \text{money put in}^{(w)}\}}{N}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\text{money put in}^{(w)}$ | everything the option spent in world $w$, in the same real shekels | ₪ |
| $P(\text{shortfall})$ | the share of worlds that end with less than was put in | 0 % to 100 % |

### Regret

$$
\text{regret}^{(w)} = \max\big(W_{\text{other}}^{(w)} - W_{\text{chosen}}^{(w)},\ 0\big)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $W_{\text{chosen}}^{(w)}$ | the end value of the option you chose, in world $w$ | ₪ |
| $W_{\text{other}}^{(w)}$ | what the other option ended at in the same world | ₪ |
| $\text{regret}^{(w)}$ | what the other option would have added; 0 in a world where you chose right | ₪ |

The table shows its mean and its 95 % percentile.

### The certainty equivalent

$$
\mathrm{CE} = \left( \frac{1}{N} \sum_{w=1}^{N} \big(W^{(w)}\big)^{1 - \gamma} \right)^{\frac{1}{1 - \gamma}}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\mathrm{CE}$ | the **sure** amount worth as much to you as this whole spread of outcomes | ₪, at most the mean |
| $\gamma$ | risk aversion: how much more a lost shekel hurts than a gained one pleases | 2 in the Planner; 0 is indifference to risk |

With $\gamma = 2$ this is the harmonic mean of the end values. It is undefined when any world ends at zero or
below; the table then says "Ruin".

### The share between the handles

$$
\hat p = \frac{\#\{w : a \le W^{(w)} \le b\}}{N}, \qquad
\text{interval} = \frac{\hat p + \dfrac{1.96^2}{2N} \pm 1.96 \sqrt{\dfrac{\hat p (1 - \hat p)}{N} + \dfrac{1.96^2}{4N^2}}}{1 + \dfrac{1.96^2}{N}}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $a,\ b$ | the two handles of the histogram, "Lower bound a" and "Upper bound b" | ₪, or % for a return |
| $\hat p$ | the share of worlds that end between the handles | 0 % to 100 % |
| $\text{interval}$ | the 95 % Wilson interval of that share: the simulation's own sampling error | two shares |
| $1.96$ | the point a standard normal exceeds with probability 2.5 % | — |

### One world's path

$$
\text{drawdown} = \max_{k} \frac{\text{peak}_k - \mathrm{NW}_k}{\text{peak}_k}, \qquad \text{peak}_k = \max_{j \le k} \mathrm{NW}_j
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\mathrm{NW}_k$ | the option's net worth in month $k$: the apartment's value less its loan, plus the account's value | ₪ |
| $\text{peak}_k$ | the highest net worth reached up to month $k$ | ₪ |
| $\text{drawdown}$ | the deepest fall from a peak, as a share of that peak | 0 % to 100 % |

$$
y_t = \frac{\mathrm{NW}_{t} - \mathrm{NW}_{t-1} - D_t}{\mathrm{NW}_{t-1} + D_t / 2}, \qquad
\text{Sharpe} = \frac{\bar y}{\operatorname{sd}(y)}, \qquad
\text{Sortino} = \frac{\bar y}{\sqrt{\frac{1}{n_y}\sum_t \min(y_t, 0)^2}}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $t$ | a year of the plan; $n_y$ is the number of years | — |
| $\mathrm{NW}_t$ | the net worth at the end of year $t$ | ₪ |
| $D_t$ | the money put in during year $t$ | ₪ |
| $y_t$ | the return of year $t$ with the money put in taken out (modified Dietz) | per year |
| $\bar y,\ \operatorname{sd}(y)$ | the mean and the standard deviation of the yearly returns | per year |
| $\text{Sharpe}$ | return per unit of volatility | usually −1 to 2 |
| $\text{Sortino}$ | return per unit of *losing* volatility: only the losing years are in the denominator | usually higher than Sharpe |

Both are measured against a return of zero, not against a risk-free rate.

## Worked example

Twenty worlds, end values in thousands of shekels, sorted:

820, 910, 950, 1,010, 1,040, 1,080, 1,120, 1,150, 1,190, 1,230, 1,260, 1,300, 1,340, 1,380, 1,430, 1,480, 1,540,
1,620, 1,730, 1,900. The money put in was 1,000 in every world.

- **Median:** between the 10th and the 11th value: $(1{,}230 + 1{,}260)/2 =$ 1,245.
- **5 % percentile:** 905.5, interpolated between the two worst worlds (820 and 910).
- **CVaR 5 %:** $N_{\text{worst}} = \lceil 0.05 \cdot 20 \rceil = 1$, so it is the single worst world: 820.
- **Shortfall:** three worlds (820, 910, 950) end below 1,000: 15 %.
- **Certainty equivalent ($\gamma = 2$):** the harmonic mean is 1,216, against an ordinary mean of 1,274. The risk
  costs this investor 58: a sure 1,216 is worth as much as the gamble.
- **Between the handles** $a = 1{,}000$ and $b = 1{,}500$: 13 of 20 worlds, $\hat p = 65\,\%$, with a Wilson
  interval of 43 % to 82 %. Twenty worlds say little; with a thousand the interval is a few points wide.

**A path.** A net worth of 100, 120, 90, 110, 130, 104 peaks at 120 and falls to 90: a drawdown of
$(120 - 90)/120 = 25\,\%$. The later fall from 130 to 104 is 20 %, so the first one stands.

**Yearly returns.** Net worth of 500, 560, 640, 610 and 720 at the year ends, with 40 put in each year. The first
year: $(560 - 500 - 40) / (500 + 20) = 3.85\,\%$. The four years give 3.85 %, 6.90 %, −10.61 % and 11.11 %: a mean
of 2.81 % and a standard deviation of 9.43 %, so Sharpe is 0.30. Only one year loses, so Sortino is
$2.81 / \sqrt{10.61^2 / 4} = 0.53$.

## How to read it

- **Compare the 5 % percentile and CVaR of the two options before their medians.** The option with the higher
  median can have a much worse tail; that is what leverage does.
- **Regret is asymmetric.** A small mean regret with a large 95 % percentile means: usually you lose little by
  this choice, but when you are wrong you are very wrong.
- **Dominance.** "First order" means one option is better in *every* part of the distribution: anyone who prefers
  more money prefers it. "Second order" means every risk-averse investor prefers it. "Neither dominates" is the
  usual answer, and it means the choice depends on your own attitude to risk.
- **The certainty equivalent puts one price on risk.** Compare the two options' certainty equivalents: the higher
  one is the better choice for an investor with $\gamma = 2$.
- **"Apartment below its loan at some point"** is the share of worlds with negative equity in some month, and
  **"A payment above the share of income"** the share in which a mortgage payment passed the stress share of your
  income (which rises with the CPI).
- **Net worth on the way is before any exit cost or tax**: the apartment's value less its loan, plus the account
  at market value. It is one basis for both options, not what a sale that month would leave.

## Where it comes from

**Why CVaR and not only a percentile.** The 5 % percentile says where the bad tail *starts*. Two options can share
it while one of them falls much further beyond it. CVaR averages everything beyond it, so it sees how deep the tail
goes.

**The certainty equivalent.** Give an end value $W$ a "usefulness" that grows more slowly as $W$ grows:

$$
U(W) = \frac{W^{1 - \gamma}}{1 - \gamma}
$$

For $\gamma > 0$ each extra shekel adds less than the one before, so a loss hurts more than an equal gain pleases:
that is risk aversion. The average usefulness of the spread is $\bar U = \frac1N \sum_w U(W^{(w)})$. The certainty
equivalent is the sure amount with exactly that usefulness: solve $U(\mathrm{CE}) = \bar U$,

$$
\frac{\mathrm{CE}^{1 - \gamma}}{1 - \gamma} = \frac{1}{N}\sum_w \frac{(W^{(w)})^{1-\gamma}}{1 - \gamma}
\quad\Longrightarrow\quad
\mathrm{CE} = \left(\frac1N \sum_w (W^{(w)})^{1-\gamma}\right)^{\frac{1}{1-\gamma}}
$$

With $\gamma = 2$ the power is $-1$: $\mathrm{CE} = N / \sum_w (1/W^{(w)})$, the harmonic mean. With $\gamma = 0$
it is the ordinary mean (no aversion), and as $\gamma \to 1$ it becomes the geometric mean. A single world at zero
makes $1/W$ infinite: no sure amount compensates for ruin, which is why the table says so instead of a number.

**Why Wilson's interval.** The plain interval $\hat p \pm 1.96\sqrt{\hat p(1 - \hat p)/N}$ breaks near 0 and 1: at
$\hat p = 0$ it has no width at all, as if a thousand worlds proved the event impossible. Wilson's form asks which
true shares $p$ would make the observed $\hat p$ unsurprising, $|\hat p - p| \le 1.96\sqrt{p(1 - p)/N}$, and solves
that for $p$. It stays inside 0 to 1 and never collapses.

**Why modified Dietz.** A year's growth of net worth includes the money that was put in that year, which is not a
return. Taking $D_t$ out of the numerator removes it. The money arrived through the year, so on average it was
there for half of it: $D_t/2$ is added to the base it earned on.

## Limits

- **The metrics describe the worlds, not the future.** They are exactly as good as the worlds
  ([Simulated worlds](learn:simulated-worlds)).
- **Dominance is tested on the samples as they are.** Sampling noise in a tail can break a dominance that holds in
  truth, so "neither" is the cautious answer.
- **$\gamma = 2$ is a convention.** Your own aversion may differ, and with it which option has the higher
  certainty equivalent.
- **Sharpe and Sortino use yearly returns of net worth**, with a last partial year left out. For an apartment the
  first year is charged the purchase costs.
- **The Wilson interval is the simulation's own error.** It shrinks with more worlds and says nothing of how
  little history they were cut from.
