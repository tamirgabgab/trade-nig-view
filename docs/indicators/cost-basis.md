# The cost of what is sold

A withdrawal sells part of the account every month, and the tax is on the **gain** of what is sold: what it brings
less what it cost. A capital typed into the Withdraw tab comes from purchases the Planner never saw, so its cost is
not known. This page is how the Planner stands in for it, why the two ends of that stand-in are bounds, and what it
does instead when the purchases are known.

## What it answers

*"My portfolio is worth a million. Some of it I bought fifteen years ago, some last year. What tax will my
withdrawals pay?"*

Somewhere between two bounds. If all of it is gain, every sale pays the full rate on all of it: at a 25 % tax, at
least 75 % of what is sold reaches the hand. If all of it is cost, only the growth from now on is taxed. The Planner
runs the plan at the cost share entered and at both ends, and shows the three side by side. When the account is
what the Market tab's plan accumulated, the purchases are known, and the tax is each lot's own.

## Formula

### One lot at a cost share

A capital typed in is one lot per asset whose cost is a share $\eta$ of its value. Selling a fraction of it realises
the same fraction of its cost:

$$
\begin{aligned}
\text{cost}_0 &= \eta \, H_0 \\[4pt]
U_k &= (1 - \text{sell}) \, H_k - \text{cost}_k \\[4pt]
\text{cost}_{k} &\leftarrow (1 - \psi_k) \, \text{cost}_k \quad \text{after the sale}
\end{aligned}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\eta$ | the cost share: the part of the starting capital that was paid for it; the rest is gain not yet taxed | 0 to 1, 50 % by default |
| $H_0$, $H_k$ | the starting capital, and the account's value on month date $k$ | ₪ |
| $\text{cost}_k$ | the cost of what the account holds on date $k$, raised by the index of the tax base (1, the CPI, or the dollar's rate) and by the dividends reinvested | ₪ |
| $U_k$ | the gain if all of it were sold on date $k$ | ₪ |
| $\psi_k$ | the fraction sold in month $k$ | 0 to 1 |
| $\text{sell}$ | the sell commission | 0 to 1 % |

With one lot, first in, first out and the average cost are the same thing, so the order of sale does not arise.

### The two bounds

At $\eta = 0$ everything sold is gain, and at $\eta = 1$ the capital was bought on the first day:

$$
\begin{aligned}
\eta = 0: &\quad \text{net} = (1 - \text{rate}_{\text{gains}}) \cdot \text{what a sale brings} \\[4pt]
\eta = 1: &\quad \text{only growth since the first day is taxed}
\end{aligned}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\text{rate}_{\text{gains}}$ | the tax on a capital gain | 25 % |
| $\text{net}$ | what reaches the hand from a sale | ₪ |

Every real history lies between the two, so the page shows the plan at both beside the cost share entered.

### A loss carried forward

A sale at a loss pays nothing and is never refunded; the loss is carried and set against later gains first:

$$
\begin{aligned}
\text{tax}_k &= \text{rate}_{\text{gains}} \cdot \max\big(\psi_k U_k - \text{carried}_{k-1},\ 0\big) \\[4pt]
\text{carried}_k &= \max\big(\text{carried}_{k-1} - \psi_k U_k,\ 0\big)
\end{aligned}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\text{carried}_k$ | the loss not yet used, after month $k$ | ₪, 0 or more |
| $\text{tax}_k$ | the tax of month $k$'s sale | ₪ |

So what a sale leaves is linear in $\psi_k$ until the carried loss is used up, and linear again after it, with a
steeper slope: one kink, and the fraction for a net amount is solved on either side of it.

### Known lots, first in, first out

When the account is what the Market tab's plan accumulated, each deposit is a lot of its own, with its units and its
cost. A sale still takes the same fraction of every asset; inside an asset it takes the **oldest** units first:

$$
\text{gain of the sale} = \psi_k \, (1 - \text{sell}) \, H_k - \sum_j \text{cost}_j \cdot \frac{\text{sold}_j}{\text{units}_j}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $j$ | a lot, oldest first within each asset | — |
| $\text{units}_j$, $\text{cost}_j$ | what lot $j$ holds, and its cost raised by the index of the tax base | units; ₪ |
| $\text{sold}_j$ | the units the sale takes from lot $j$: all of the older lots first, then part of this one | units |

What a sale leaves now has a kink at every lot, but it still rises with $\psi_k$, so the fraction is found by
halving the interval sixty times. Money put in later (a rent surplus, an apartment's sale) is a new lot, sold last.

On the day of the handover a lot's cost is what the Market tab would tax it on, so selling everything that day pays
exactly the Market tab's tax:

$$
\text{cost}_j = (1 - \text{sell}) \cdot \text{value}_j - \text{gain}_j
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\text{value}_j$, $\text{gain}_j$ | deposit $j$'s value on the plan's last day, and the gain the Market tab taxes it on (its account fees counted as proceeds) | ₪ |

## Worked example

An asset at ₪1 that does not move, two lots of 1,000 units: the first cost 400, the second 1,000. The tax is 25 %,
there are no fees, and ₪425 a month must reach the hand.

| Account | Sold | Tax |
|---|---|---|
| First in, first out | 500 units of the first lot | 75 |
| One lot at its overall cost share, 1,400 / 2,000 = **70 %** | **459** | **34** |
| One lot, all of it gain ($\eta = 0$) | **567** | **142** |
| One lot, all of it cost ($\eta = 1$) | 425 | 0 |

The oldest lot is mostly gain, so first in, first out pays more tax now than one lot at the same overall cost share,
and less later, when the second lot is sold at cost. A single lot sells $425 / (1 - 0.25\,(1 - \eta))$; the first in,
first out sale is $500 - 0.25 \times (500 - 200) = 425$.

The lots cannot be typed into the Planner: they come from a Market plan on real prices. The single lot can, with
"A capital I enter", an assumed return of 0 % and the cost share.

## How to read it

- **The tax bounds table** in the results is the plan at 0 %, at the cost share entered, and at 100 %. For a fixed
  amount the bounds differ in how long the money lasts; for a percent, in the income.
- **From a Market plan** there are no bounds: the tax is known lot by lot, and the card *The account* says what was
  handed over and its cost as a share of its value. That share can be above 100 % when the plan is at a loss.
- **The studies** (history, worlds) run one lot at the plan's overall cost share: they say so on the page.

## Where it comes from

Selling a fraction $\psi_k$ of one lot realises $\psi_k$ of its gain, so what the sale leaves is $\psi_k ((1 - \text{sell}) H_k - \text{rate}_{\text{gains}} U_k)$, and a lower cost share means a larger
$U_k$ and a smaller net: the bounds are the ends of a line. For identical securities bought on different days, the
order of sale is first in, first out unless the seller proves which ones were sold (regulation 5 of the 2002
regulations on the capital gain of a traded security, as secondary sources quote it; the regulation's own text was
not read for this page).

## Limits

- The cost share is a guess the user makes: the bounds are always shown so it cannot hide.
- The order of sale is first in, first out only; another order cannot be chosen.
- A loss is carried within the plan; losses from outside it are not known.
- The surtax on high incomes is not modelled. Tax rules change; the numbers are a model, not tax advice.
