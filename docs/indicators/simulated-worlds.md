# Simulated worlds

History happened once. "Simulate" runs the same plan through a thousand histories that *could* have happened, and
shows how the two options are spread across them. This page explains how such a world is made.

## What it answers

*"I have one past. How bad, and how good, could the next twenty years be for each option?"*

A **world** is one possible history of everything the plan depends on: the market, the apartment's value, the
consumer price index and the Bank of Israel rate, month by month. Both options live through the same world, so in
every world there is a winner. The Planner offers two ways to make worlds:

- **Block bootstrap:** cut real history into blocks and paste them in a new order.
- **Monte Carlo:** replace the market by a simple model with two numbers, a mean and a volatility.

One rule holds for both: a series its tab marks "historical" is resampled from history, and one marked "assumed" is
drawn from its model. The method decides only what the **market** is.

## Formula

### A modelled series

A modelled series (the market under Monte Carlo, an apartment's assumed value) moves by one random step a month:

$$
x_k = \frac{\ln(1 + \mu)}{12} - \frac{\sigma^2}{24} + \frac{\sigma}{\sqrt{12}}\, z_k, \qquad
G_k = G_{k-1}\, e^{x_k}, \qquad G_0 = 1
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $k$ | the month | — |
| $x_k$ | the log step of month $k$: the series is multiplied by $e^{x_k}$ | log growth, about ±5 % for a stock index |
| $G_k$ | the level of the series, as a multiple of where it started | ratio |
| $\mu$ | the **expected** yearly growth: the average of $G_{12} - 1$ over many worlds | per year, 4 % to 10 % for a stock index |
| $\sigma$ | the yearly volatility: the standard deviation of a year's log growth | per year, about 16 % for a stock index, 5 % for dwelling prices |
| $z_k$ | the shock of month $k$: a standard normal draw (mean 0, standard deviation 1), independent between months | — |

The three terms are the drift, a correction that keeps the average growth at $\mu$ whatever the volatility (see the
derivation), and the month's noise.

### What the model implies for a year

$$
\mathbb{E}[G_{12}] = 1 + \mu, \qquad \operatorname{median}(G_{12}) = (1 + \mu)\, e^{-\sigma^2 / 2}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\mathbb{E}[G_{12}]$ | the average growth over a year, across all worlds | ratio |
| $\operatorname{median}(G_{12})$ | the growth of the middle world: half the worlds do better, half worse | ratio |

The median is below the mean: a few very good worlds pull the average up, and a typical world sees less.

### Estimating the market from its history

With "Estimate the market from the mix's history" ticked, $\mu$ and $\sigma$ are fitted to the mix's own monthly
growth in shekels (dividends included, the weights restored every month):

$$
\sigma = \operatorname{sd}(x) \sqrt{12}, \qquad \mu = e^{\,12\,(\bar x + \operatorname{sd}(x)^2 / 2)} - 1
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\bar x$ | the mean of the mix's monthly log growths | per month, about 0.5 % |
| $\operatorname{sd}(x)$ | their standard deviation (the sample one, dividing by the count less one) | per month, about 4 % |

### Two series that move together

A modelled apartment can be tied to a modelled market by a correlation:

$$
z_k^{\text{home}} = \rho\, z_k^{\text{market}} + \sqrt{1 - \rho^2}\; z_k^{\text{own}}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\rho$ | the correlation between the apartment's monthly shocks and the market's | −1 to 1; the field's default is 0 |
| $z_k^{\text{market}}$ | the market's shock in month $k$ | — |
| $z_k^{\text{own}}$ | a shock of the apartment's own, independent of the market | — |
| $z_k^{\text{home}}$ | the shock that drives the apartment's value | — |

### A block-bootstrap world

History is laid out as a table: one row a month, one column for each series being resampled. A world is built from
blocks of $\lambda$ consecutive rows:

$$
\text{world months} = \underbrace{h_1,\ h_1 + 1,\ \dots,\ h_1 + \lambda - 1}_{\text{block 1}},\ \underbrace{h_2,\ \dots,\ h_2 + \lambda - 1}_{\text{block 2}},\ \dots
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\lambda$ | the block length (the field "Block length (months)") | months, 12 by default |
| $h_1, h_2, \dots$ | the month of history each block starts at, each drawn evenly from all the months a whole block fits in | — |

A month of the world is one whole row of history: every series takes its growth from the **same** real month.
Growth rates are pasted (the price of an asset, the CPI, the dwelling index); the Bank of Israel rate is pasted as
a **level**, so a month of high inflation comes with the high rate it really had.

### One apartment is not the index

An apartment that follows a dwelling index can get a volatility of its own:

$$
V_k = V_0 \cdot \frac{J_k}{J_0} \cdot \exp\!\left(\sum_{j=1}^{k} \Big(-\frac{\sigma_{\text{own}}^2}{24} + \frac{\sigma_{\text{own}}}{\sqrt{12}}\, z_j^{\text{own}}\Big)\right)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $V_k$ | the apartment's value in month $k$ of the world; $V_0$ is the price | ₪ |
| $J_k$ | the dwelling index in that month of the world | index |
| $\sigma_{\text{own}}$ | the field "Own volatility % a year" | per year, 5 % to 10 % |

It is a modelled series with $\mu = 0$: on average the apartment still follows its index, but it wanders around it.

## Worked example

**One step.** A market with $\mu = 7\,\%$ and $\sigma = 16\,\%$:
$\ln(1.07)/12 = 0.005638$, $\sigma^2/24 = 0.001067$, $\sigma/\sqrt{12} = 0.046188$.

| Shock $z$ | Log step $x$ | The month's growth |
|---|---|---|
| −1 (a bad month) | −0.04162 | −4.08 % |
| 0 (an ordinary month) | +0.00457 | +0.46 % |
| +1 (a good month) | +0.05076 | +5.21 % |

**A year.** Twelve ordinary months ($z = 0$) compound to +5.64 %, not +7 %. That is the median year:
$1.07 \cdot e^{-0.0128} - 1 = 5.64\,\%$. The mean over many worlds is still 7 %; in a check of 40,000 simulated
years it came out at 6.85 %, within its sampling error.

**An estimate.** Six monthly log growths of +3 %, −2 %, +5 %, +1 %, −4 % and +2 % have $\bar x = 0.833\,\%$ and
$\operatorname{sd}(x) = 3.312\,\%$. So $\sigma = 3.312\,\% \cdot \sqrt{12} = 11.47\,\%$ and
$\mu = e^{12(0.008333 + 0.000548)} - 1 = 11.25\,\%$.

**A tied shock.** With $\rho = 0.5$, a market shock of +1 and an own shock of −0.4 give the apartment
$0.5 \cdot 1 + 0.866 \cdot (-0.4) = +0.154$: pulled up by the market, held back by its own bad month.

## How to read it

- **The histogram** shows, for each option, how many worlds ended in each range. The two handles count the worlds
  between them; see [Risk metrics](learn:risk-metrics).
- **"History resampled: N months"** and **"Independent terms in it"** say how much real history the thousand
  worlds were cut from. A thousand worlds made from 25 years of data are still 25 years of data
  ([Overlapping windows](learn:overlapping-windows)).
- **"Modelled market: 7 % a year, σ 16 %"** is the Monte Carlo market, with whether it was estimated or typed in.
- **Choose the method by what you trust.** The bootstrap keeps what really happened together (crashes, dividends,
  the rate that came with each inflation) but cannot show anything history did not contain. The model can, but it
  knows nothing of crashes or of calm years following calm years.
- **The same seed gives the same worlds**, so two simulations differ only by what you changed.

## Where it comes from

**Why the $-\sigma^2/24$.** A year's log growth is the sum of twelve steps: $X = \sum_{k=1}^{12} x_k$. The sum of
independent normal shocks is normal, so $X$ is normal with

$$
\text{mean} = \ln(1 + \mu) - \frac{\sigma^2}{2}, \qquad \text{variance} = 12 \cdot \frac{\sigma^2}{12} = \sigma^2
$$

The growth itself is $G_{12} = e^{X}$. For a normal $X$, the average of $e^{X}$ is
$e^{\text{mean} + \text{variance}/2}$ (the mean of a lognormal). So

$$
\mathbb{E}[G_{12}] = e^{\ln(1 + \mu) - \sigma^2/2 + \sigma^2/2} = 1 + \mu
$$

Without the correction the average growth would be $(1 + \mu)\,e^{\sigma^2/2}$: a more volatile market would earn
more on average just for being volatile. With it, "7 %" means the same thing at any volatility, and the same thing
for the market as for an apartment's assumed growth.

**Why the median is lower.** The median of $e^{X}$ is $e^{\text{median}(X)} = e^{\text{mean}}$, because the exponential keeps
the order of values and a normal's median is its mean. With the mean $\ln(1 + \mu) - \sigma^2/2$ this is $(1 + \mu)e^{-\sigma^2/2}$.

**Why the estimate inverts it.** From monthly log growths with mean $\bar x$ and variance $\operatorname{sd}(x)^2$, a year has mean
$12\bar x$ and variance $12 \operatorname{sd}(x)^2$. Matching the two lines above: $\sigma^2 = 12 \operatorname{sd}(x)^2$ and
$\ln(1 + \mu) - \sigma^2/2 = 12\bar x$, which gives $\mu = e^{12(\bar x + \operatorname{sd}(x)^2/2)} - 1$.

**Why $\sqrt{1 - \rho^2}$.** The tied shock must still have variance 1, or the apartment's volatility would change
with $\rho$. The two parts are independent, so their variances add: $\rho^2 + (1 - \rho^2) = 1$. And its covariance
with the market's shock is $\rho$, which with unit variances is the correlation.

**Why blocks.** Drawing single months at random would destroy everything that lasts longer than a month: a crash
and its recovery, a run of rising rates. A block keeps twelve consecutive months as they were, so anything shorter
than a block survives. The price is a jump where two blocks meet, most visible in the Bank of Israel rate.

## Limits

- **The model has no crashes and no memory.** Real markets have fat tails and volatility that comes in bursts; a
  lognormal with independent months has neither. It also pays no dividend tax: its growth is the total return.
- **The bootstrap cannot leave history.** Its worst world is made of the worst blocks that really happened.
- **The rate jumps between blocks.** A world can step from a 10 % rate to a 0.25 % rate in one month.
- **The correlation ties only two modelled series.** With a resampled market the months are history's own, and
  the field has no effect; the page says so.
- **The simulation's interval is not your uncertainty.** It shrinks with more worlds, and says nothing of how
  little history there was to draw them from.
