# The apartment's ledger

The Apartment tab follows one apartment from the day it is bought to the day it is sold: what goes out, what comes
in, and what the owner would be left with if it were sold in any month on the way.

## What it answers

*"If I buy this apartment with this mortgage and sell it in ten years, what am I left with, and what yearly return
did my own money earn?"*

It answers for the apartment alone. Whether the same money would have done better in the market is the Compare
tab's question ([the same money rule](learn:same-money)).

## Formula

### The purchase

The owner pays the equity and the purchase costs out of pocket; the bank lends the rest.

$$
C_0 = \text{tax}(V_0) + (\text{lawyer} + \text{broker})\, V_0 + \text{renovation}, \qquad
L = V_0 - E
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $V_0$ | the price | ₪ |
| $E$ | the equity: the owner's own money in the price | ₪, at least 25 % of the price |
| $L$ | the loan, split into [tracks](learn:mortgage-tracks) | ₪ |
| $C_0$ | the purchase costs | ₪, about 3 % to 12 % of the price |
| $\text{lawyer},\ \text{broker}$ | the lawyer's and the broker's fees | share of the price, 0.5 % to 2.5 % each |
| $\text{tax}(V_0)$ | the purchase tax, by a bracket table | ₪ |

**A bracket table** taxes each slice of the price at its own rate:

$$
\text{tax}(V_0) = \sum_{j} \text{rate}_j \cdot \big(\min(V_0, \text{hi}_j) - \text{lo}_j\big)^{+}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $j$ | a bracket of the table | — |
| $\text{lo}_j,\ \text{hi}_j$ | the lower and the upper bound of bracket $j$ (the last bracket has no upper bound) | ₪ |
| $\text{rate}_j$ | the tax rate of bracket $j$ | 0 % to 10 % |
| $(x)^{+}$ | $x$ when it is positive, otherwise 0: a bracket the price does not reach adds nothing | ₪ |

### The value

$$
V_k = V_0 \cdot \frac{J_k}{J_0}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $k$ | months since the purchase; the sale is in month $T$ | — |
| $V_k$ | the apartment's value in month $k$ | ₪ |
| $J_k$ | the index the value follows: the CBS dwelling price index, or an assumed path | index |

With "Assumed growth" and no volatility, $J_k = (1 + g)^{k/12}$ for the yearly growth $g$ typed in.

### Each month

$$
\text{out}_k = M_k + \text{own}_k - \text{rent}_k, \qquad
\text{own}_k = \frac{\text{maint}\, V_k}{12} + \frac{\text{ins}}{12} \cdot \frac{\mathrm{CPI}_k}{\mathrm{CPI}_0}, \qquad
\text{rent}_k = \text{rent}_1 \cdot \frac{Y_{k-1}}{Y_0}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\text{out}_k$ | what the apartment costs its owner in month $k$; negative in a month the rent covers everything | ₪ |
| $M_k$ | the mortgage payment of the month, all tracks together | ₪ |
| $\text{own}_k$ | the owner costs: maintenance and insurance | ₪ |
| $\text{maint}$ | maintenance, a yearly share of the value | 0.3 % to 1 % a year |
| $\text{ins}$ | insurance, a yearly amount in shekels of the purchase day | ₪ a year |
| $\mathrm{CPI}_k$ | the consumer price index in month $k$; the insurance rises with it | index |
| $\text{rent}_k$ | the rent of month $k$ | ₪ |
| $\text{rent}_1$ | the rent of the first month (the field "Rent ₪ a month") | ₪ |
| $Y_k$ | what the rent grows with: the CPI, the apartment's value, or a fixed yearly rise | index |

**The rent counts in both modes.** When the apartment is rented out, the rent is received, less the vacant share
of the year and the tax on it: $\text{rent}_k (1 - \text{vacancy})(1 - \text{rate}_{\text{rent}})$. When the owner lives in
it, the rent is *saved*: it is what the owner would otherwise pay a landlord, so it is counted as money received.

### A sale in month k

$$
\mathrm{NW}_k = V_k (1 - \text{sell}) - B_k (1 + \text{early}) - \text{betterment}_k
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\mathrm{NW}_k$ | net worth: the cash left if the apartment were sold in month $k$ | ₪ |
| $\text{sell}$ | the selling costs (broker, lawyer) | share of the value, 1 % to 3 % |
| $B_k$ | what is still owed to the bank after the payment of month $k$ | ₪ |
| $\text{early}$ | the early-repayment fee | share of the balance, 0 % to 2 % |
| $\text{betterment}_k$ | the betterment tax on the real gain | ₪ |

**Betterment tax** is charged on the gain above inflation:

$$
\text{gain}_k = V_k (1 - \text{sell}) - (V_0 + C_0) \cdot \frac{\mathrm{CPI}_k}{\mathrm{CPI}_0}, \qquad
\text{betterment}_k = \text{rate}_b \cdot \theta_k \cdot \max(\text{gain}_k, 0)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\text{gain}_k$ | the real gain: the sale after its costs, less the cost of buying lifted by the index | ₪ |
| $\text{rate}_b$ | the betterment tax rate | 25 % |
| $\theta_k$ | the taxable share of the gain | 0 to 1 |

The taxable share is 1 for an additional home. For a **single home** it is
$\max(V_k - \text{ceiling}, 0) / V_k$: nothing below the exemption ceiling (₪5,008,000 in the built-in table). For a
home bought before 2014 and sold after it, it is also multiplied by the share of the holding days after 2014-01-01
(the linear rule).

### The return

The apartment's yearly return is the [XIRR](learn:xirr) of the owner's own cash:

$$
c_0 = -(E + C_0), \qquad c_k = -\text{out}_k \quad (1 \le k \le T), \qquad c_T \mathrel{+}= \mathrm{NW}_T
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $c_k$ | the owner's cash flow in month $k$: negative when money goes out | ₪ |
| $T$ | the month of the sale | months |

## Worked example

Price ₪2,000,000, equity ₪600,000, one fixed track of ₪1,400,000 at 4 % over 25 years; a single home; lawyer
0.6 %, broker 2.4 %; maintenance 0.5 %, insurance ₪1,500; the owner lives in it and saves a rent of ₪5,500 that
follows the CPI; inflation 2.5 %; the value grows 3 % a year; sold after 10 years with selling costs of 2.4 %.

**The purchase.** The single-home table taxes nothing up to ₪1,978,745 and 3.5 % above it:
$0.035 \cdot (2{,}000{,}000 - 1{,}978{,}745) =$ ₪744. With the lawyer and the broker (₪60,000),
$C_0 =$ **₪60,744**. The owner starts ₪660,744 out of pocket.

**Month 1.** The payment is ₪7,389.72; the owner costs are
$0.005 \cdot 2{,}004{,}933 / 12 + 1{,}500 / 12 \cdot 1.00206 =$ ₪960.65; the rent saved is ₪5,500. So
$\text{out}_1 = 7{,}389.72 + 960.65 - 5{,}500 =$ ₪2,850.36.

**The sale, month 120.**
- The value: $2{,}000{,}000 \cdot 1.03^{10} =$ ₪2,687,833.
- The balance still owed: ₪999,032.
- The real gain: $2{,}687{,}833 \cdot 0.976 - 2{,}060{,}744 \cdot 1.025^{10} = -14{,}602$. It is negative, so there
  is no betterment tax (and a single home under the ceiling would be exempt anyway).
- Net worth: $2{,}687{,}833 \cdot 0.976 - 999{,}032 =$ **₪1,624,293**.

**The return.** The XIRR of −₪660,744 at the start, 120 monthly flows and +₪1,624,293 at the end is
**6.46 % a year**, and 3.87 % above inflation.

**When there is a tax.** The same apartment as an additional home (purchase tax 8 %: ₪160,000) whose value grows
5 % a year ends at ₪3,257,789. The real gain is ₪337,815 and the tax is a quarter of it: ₪84,454.

## How to read it

- **Net worth is not the value.** The value is ₪2.69 million and the owner is left with ₪1.62 million: the bank is
  repaid first, and selling costs come off the top.
- **"Net worth if sold" has a row for every month**, so the first years show how long it takes to earn back the
  purchase and selling costs. In the example a sale leaves less than the ₪660,744 paid at the purchase
  for the first 14 months.
- **The return is on the owner's own money, not on the price.** The value grew 3 % a year and the owner earned
  6.46 %: most of the price was the bank's money, at 4 %, and the rent saved is income. Where each part of the
  return comes from is in [What the answer depends on](learn:what-the-answer-depends-on).
- **A saved rent is income.** Choose "Not counted" to see the apartment as a pure investment that pays nothing on
  the way; the return then drops sharply.

## Where it comes from

**Why the tax is on the real gain.** Suppose prices doubled and so did the apartment. The owner can buy with the
proceeds exactly what the purchase money bought: nothing was gained. So the cost of buying, $V_0 + C_0$, is first
lifted by the index, and only what the sale brings above that is taxed.

**Why leverage raises the return.** Ignore costs, rent and tax for a moment, and let the loan be interest-only at a
yearly rate $q$. After a year the apartment is worth $V_0(1 + g)$, the debt is still $L$, and the interest paid is
$qL$. The owner's gain is $gV_0 - qL$ on an equity of $E = V_0 - L$:

$$
\text{return on equity} = \frac{g V_0 - q L}{E} = g + (g - q)\,\frac{L}{E}
$$

With no loan the return is $g$. With a loan it moves away from $g$ by the gap $g - q$ times the leverage $L/E$: up
when the apartment grows faster than the loan costs, down when it grows slower. Borrowed money multiplies the
result in both directions. (In the example $g < q$; the return is above $g$ because the rent saved is added to the
gain.)

**Why a saved rent is counted.** Compare two people with the same cash flow needs: one owns and pays the mortgage,
the other rents the same apartment and pays the landlord. The owner's monthly cost is $M_k + \text{own}_k$; the
renter's is $\text{rent}_k$. What owning costs *more than renting* is the difference, which is $\text{out}_k$.
Counting the rent as income is the same as measuring the owner against the renter.

## Limits

- **Taxes are parameters, not the law.** The tables are defaults with a date (the Israel Tax Authority's directive
  1/2026). The law's conditions, such as the holding period or who may use the linear rule, are not modelled. This
  is not tax advice.
- **One apartment is not the index.** The dwelling price index is the average of thousands of sales; a single
  apartment moves more. A simulation can add that with "Own volatility".
- **No rent history.** The rent starts at the amount typed in and grows by a rule; there is no historical rent
  series.
- **Costs that are not asked for are not there:** moving, furniture, months of double housing, a renovation before
  the sale.
