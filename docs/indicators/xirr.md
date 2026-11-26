# Yearly return (XIRR)

Every "yearly return" the Planner shows (of a market account, of an apartment, of each option in a comparison) is an
XIRR: the one yearly rate at which the money put in, each amount on its own day, would have grown to what came out.

## What it answers

*"I put money in on several days and ended with W. What yearly rate did my money earn?"*

A plan has many deposits. Dividing the end value by the total deposited ignores **when** each shekel went in: a
shekel deposited last month had a month to grow, not ten years. XIRR weighs every flow by its time.

## Formula

The XIRR is the rate $r$ that makes the present value of all the flows zero:

$$
\sum_{j=0}^{J} c_j \,(1 + r)^{-\tau_j} = 0, \qquad \tau_j = \frac{d_j - d_0}{365.25}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $c_j$ | cash flow number $j$: **negative** for money put in, **positive** for money received (the end value is the last one) | ₪ |
| $d_j$ | the day of flow $j$; $d_0$ is the first day | calendar day |
| $\tau_j$ | the time of flow $j$ from the first day | years (a year is 365.25 days) |
| $r$ | the XIRR: an *effective* yearly rate, so money grows by $(1 + r)^{\tau}$ over $\tau$ years | per year, about −10 % to +20 % |
| $J$ | the number of the last flow | — |

There is no closed form for $r$ when there are more than two flows. The Planner finds it by bisection: it halves an
interval that holds the root until it is narrower than $10^{-12}$.

**The real return** is the same equation on flows in shekels of the first day:

$$
\sum_{j=0}^{J} \frac{c_j}{\mathrm{CPI}_j / \mathrm{CPI}_0}\,(1 + r_{\text{real}})^{-\tau_j} = 0
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\mathrm{CPI}_j$ | the consumer price index on the day of flow $j$ | index |
| $\mathrm{CPI}_j / \mathrm{CPI}_0$ | how much prices rose from the first day to flow $j$ | ratio, 1 on the first day |
| $r_{\text{real}}$ | the yearly return above inflation | per year |

## Worked example

Three flows:

| Day | Flow $c_j$ | $\tau_j$ (years) |
|---|---|---|
| 2020-01-01 | −₪100,000 (a deposit) | 0 |
| 2021-01-01 | −₪50,000 (a deposit) | 366 / 365.25 = 1.0021 |
| 2022-01-01 | +₪180,000 (the end value) | 731 / 365.25 = 2.0014 |

Try two rates in the left side of the formula:
- at $r = 10\,\%$: $-100{,}000 - 50{,}000 \cdot 1.10^{-1.0021} + 180{,}000 \cdot 1.10^{-2.0014} = +3{,}295$;
- at $r = 12\,\%$: the same sum is $-1{,}160$.

The sign changes between them, so the root is in between. Bisection gives **r = 11.47 %**.

Compare with the two shortcuts people use:
- "I put in 150,000 and got 180,000": +20.00 %, which is not a yearly rate at all;
- $(180{,}000 / 150{,}000)^{1/2} - 1 = 9.54\,\%$ a year, which pretends all 150,000 was in for two years. Half of the
  second deposit's money was in for one year only, so the true rate is higher: 11.47 %.

With inflation of 2.5 % a year the prices rose by 1.025 and 1.0506 on the two later days, the real flows are
−100,000, −48,780 and +171,327, and the **real return is 8.75 %**.

## How to read it

- **It is the rate of a savings account that would have matched the plan.** Deposit the same amounts on the same
  days at 11.47 % a year, compounded, and the account ends at exactly ₪180,000.
- **Compare it across options, not only against a number.** In a comparison both options put in the same money on
  the same days ([the same money rule](learn:same-money)), so the option with the higher end value always has the
  higher XIRR.
- **A dash** means no rate solves the flows: nothing was put in, or nothing came out.
- **−100 %** in a comparison means the option ended with nothing or with a debt. No rate describes that, so the
  Planner reports a total loss; this keeps a wiped-out case inside the medians instead of dropping it.

### Three kinds of yearly rate

The Planner uses three different things that are all called "a yearly rate". They are not interchangeable:

| Kind | Where | What 4 % means |
|---|---|---|
| **Effective** rate $r$ | every return the Planner reports (XIRR) | ₪100 becomes ₪104.00 after one year |
| **Quoted** rate $q$ | a mortgage track ([Mortgage tracks](learn:mortgage-tracks)) | the bank charges $q/12$ every month, so ₪100 of debt becomes $100 \cdot (1 + 0.04/12)^{12} =$ ₪104.07: 4.07 % effective |
| **Expected growth** $\mu$ | a modelled market or apartment value ([Simulated worlds](learn:simulated-worlds)) | the *average* over many worlds grows 4 % a year; a typical (median) world grows less, by about $\sigma^2/2$ |

## Where it comes from

**One deposit.** With a single deposit $D$ on day $d_0$ and an end value $W$ after $\tau$ years, the equation is
$-D + W(1 + r)^{-\tau} = 0$, so

$$
r = \left(\frac{W}{D}\right)^{1/\tau} - 1
$$

which is the ordinary compound growth rate (CAGR). XIRR is its extension to many deposits.

**Many deposits.** Suppose every deposit sat in an account that pays $r$ a year. A deposit $D_j$ made at time
$\tau_j$ has $\tau_J - \tau_j$ years to grow, so the account ends at $\sum_j D_j (1 + r)^{\tau_J - \tau_j}$. Ask for
the $r$ at which that equals the real end value $W$:

$$
\sum_j D_j (1 + r)^{\tau_J - \tau_j} = W
$$

Divide both sides by $(1 + r)^{\tau_J}$ and move everything to one side, writing $c_j = -D_j$ for the deposits and
$c_J = +W$: this is exactly the formula above. So the XIRR is the savings rate that reproduces the plan.

**Why bisection works.** When all the money goes in before any comes out, the left side of the formula falls as
$r$ rises (a higher rate shrinks the later, positive flow more than the earlier, negative ones). A function that
only falls crosses zero once, so there is one root and halving the interval finds it.

**Real and nominal.** If prices rise by a constant $\pi$ a year, dividing a flow at time $\tau_j$ by
$(1 + \pi)^{\tau_j}$ turns $(1 + r)^{-\tau_j}$ into $\big((1 + r)/(1 + \pi)\big)^{-\tau_j}$, so

$$
1 + r_{\text{real}} = \frac{1 + r}{1 + \pi}
$$

In the example $1.1147 / 1.025 = 1.0875$: the 8.75 % above. It is not $r - \pi$ (that would be 8.97 %).

## Limits

- **One number hides the path.** Two plans with the same XIRR can differ wildly in risk on the way; see
  [Risk metrics](learn:risk-metrics).
- **Several roots are possible** when money goes in *after* money came out (a rent surplus early, a big payment
  late). The Planner returns the root in its search range (−99.99 % to +10,000 %); for the apartment and the market
  account, whose money goes in first, there is only one.
- **A year is 365.25 days.** Excel's XIRR uses 365, so its answer differs in the third or fourth digit.
- **Short plans exaggerate.** A gain of 2 % in one month is an XIRR of about 27 %: a rate, not a forecast.
