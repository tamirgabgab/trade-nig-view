# The same money rule

The Compare tab sets two options side by side: an apartment against a market account, one apartment against
another, one mix against another. For the comparison to mean anything, both options must put in **the same money
on the same days**. This page is the rule that makes that so.

## What it answers

*"An apartment needs ₪660,000 on day one and a few thousand every month. A market account needs whatever I choose
to deposit. How can the two be compared?"*

By giving both the same wallet. Whatever one option has to spend and the other does not, the other invests. Then
the only difference left between them is what each did with the same money, and it shows up in one number: the end
value.

## Formula

### What both spend

Each option has spending of its own. On every day $d$ before the end, both spend the larger of the two:

$$
F(d) = \max\big(f_A(d),\ f_B(d),\ 0\big)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $A$, $B$ | the two options | — |
| $d$ | a day on which either option spends something | calendar day |
| $f_A(d)$ | option A's **own** spending on day $d$: an apartment's equity and purchase costs on the purchase day and its monthly cost afterwards; a market account's own deposits. Negative in a month in which the rent covers more than the apartment costs | ₪ |
| $f_B(d)$ | the same for option B | ₪ |
| $F(d)$ | what **both** options spend on day $d$ | ₪, never negative |

### The top-up

An option whose own spending is below $F(d)$ invests the rest in its market account:

$$
\begin{aligned}
u_A(d) &= F(d) - f_A(d) \ \ge 0 \\[4pt]
u_B(d) &= F(d) - f_B(d) \ \ge 0
\end{aligned}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $u_A(d)$ | option A's top-up on day $d$: money it invests in its own mix only to match the other option | ₪ |
| $u_B(d)$ | the same for option B | ₪ |

So $f_A(d) + u_A(d) = F(d) = f_B(d) + u_B(d)$ on every day: the two ledgers of money put in are identical. An
option with nothing of its own (a market account without deposits) has $f = 0$ and invests all of $F(d)$: it is a
**mirror** of the other option.

### The end

Everything is sold on one day. That day's own bills are paid in cash, not invested:

$$
W_A = \mathrm{NW}_A + \text{account}_A - f_A(d_{\text{end}})
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $W_A$ | option A's end value: cash after every cost and tax | ₪ |
| $\mathrm{NW}_A$ | the net worth of A's apartment at the sale ([the apartment's ledger](learn:rent-or-buy)); 0 without one | ₪ |
| $\text{account}_A$ | the value of A's market account after selling costs and capital-gains tax; 0 without one | ₪ |
| $f_A(d_{\text{end}})$ | A's own spending on the last day (the last mortgage payment, for example) | ₪ |

The comparison's headline is the difference, and each option's yearly return is the [XIRR](learn:xirr) of the
shared spending going out and its end value coming in:

$$
\begin{aligned}
\Delta &= W_A - W_B \\[4pt]
0 &= -\sum_{d} F(d)\,(1 + r_A)^{-\tau_d} + W_A\,(1 + r_A)^{-\tau_{\text{end}}}
\end{aligned}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\Delta$ | how much more option A ends with than option B | ₪ |
| $r_A$ | option A's yearly return | per year |
| $\tau_d$ | the time of day $d$ from the first day | years |

## Worked example

**A mirror.** Option A deposits ₪100,000 on 2020-01-15 and ₪50,000 a year later into a mix that grows 5 % a year.
Option B has no deposits of its own and holds a mix that grows 8 % a year. No fees, no tax; everything is sold on
2022-01-15.

| Day | $f_A$ | $f_B$ | $F$ | A's top-up | B's top-up |
|---|---|---|---|---|---|
| 2020-01-15 | 100,000 | 0 | 100,000 | 0 | 100,000 |
| 2021-01-15 | 50,000 | 0 | 50,000 | 0 | 50,000 |

Both put in ₪150,000 on the same two days. A ends with
$100{,}000 \cdot 1.05^{2.0014} + 50{,}000 \cdot 1.05^{0.9993} =$ ₪162,756 and B with the same sum at 8 %:
₪170,649. So $\Delta = -7{,}894$, and the returns are exactly 5.00 % and 8.00 %: each option earns the rate of the
mix its money was in.

**A month of surplus.** An apartment bought for ₪1,000,000 with ₪400,000 of equity pays ₪2,500 a month to the bank
and is rented out for ₪4,000. Its own spending is ₪400,000 on the first day and then $2{,}500 - 4{,}000 = -1{,}500$
every month: it has ₪1,500 to spare.

| Day | $f_A$ (apartment) | $f_B$ (mirror) | $F$ | A's top-up | B's top-up |
|---|---|---|---|---|---|
| purchase | 400,000 | 0 | 400,000 | 0 | 400,000 |
| every month after | −1,500 | 0 | 0 | 1,500 | 0 |

Nobody takes cash out before the end: the apartment's side invests its ₪1,500 itself, and the mirror, which has no
rent, puts in nothing more.

**Spending on different days does not cancel.** Option A deposits ₪10,000 on day 0 and option B deposits ₪10,000
on day 30. Then $F = 10{,}000$ on both days, and each option puts in ₪20,000: its own deposit on one day and a
top-up on the other. The page warns when this adds more than 0.5 % to the money put in.

## How to read it

- **"Put in by each"** is $\sum F(d)$: one number, because it is the same for both options.
- **"Of the money put in, ₪… matched the other option"** under an end value is that option's total top-up
  $\sum u(d)$. For a mirror it is everything.
- **The higher end value is the better option, and also the higher return.** The two cannot disagree, because both
  put in the same money on the same days.
- **"Apartment and account"** as an option's name means it has an apartment *and* makes its own deposits. Its
  top-ups go into the same account.
- **Two mixes.** Each option invests in its own Market tab's mix. If the mixes differ, part of $\Delta$ is the
  difference between the mixes and not between an apartment and a market; the page warns about it.

## Where it comes from

**Why not just compare the returns?** A return is a rate; it says nothing about how much money earned it. An
apartment that turns ₪660,000 into ₪1.6 million and an account that turns ₪10,000 into ₪30,000 cannot be ranked by
their rates alone. Making both spend the same money on the same days removes the question: with identical outflows,
the present value of the outflows is the same function of $r$ for both, so

$$
W_A > W_B \iff r_A > r_B
$$

(the XIRR equation's left side rises with $W$ and falls with $r$, so a larger $W$ needs a larger $r$ to bring it
back to zero).

**Why the maximum.** The option that spends more on a day sets what the day costs; the other can always invest the
gap. The opposite, letting the cheaper option set the spending, would require the dearer one to spend less than it
must, which is impossible for a mortgage payment. Including 0 in the maximum means a day on which both options have
a surplus costs nothing: each simply invests its own surplus.

**Why the mirror earns exactly its mix's return.** A mirror's only flows are its top-ups going into its account
and the account's value coming out. If the mix grows at a constant rate $g$ with no fees or tax, each top-up $u$
made at time $\tau$ becomes $u(1 + g)^{\tau_{\text{end}} - \tau}$, which is precisely the savings account of the
[XIRR page](learn:xirr#where-it-comes-from) at rate $g$. So its XIRR is $g$: 8.00 % in the example.

## Limits

- **The day-by-day rule adds money when the two options spend on different days.** It is exact about equality and
  generous about the total. Matching by month instead would blur which option had the money when.
- **The top-up goes into the option's own mix**, at that mix's fees and tax. An apartment option with a costly mix
  is charged for it.
- **One end day for everything.** Two apartments must be bought on the same day of the month so that both are sold
  on it after whole months.
- **Deposit times of day are not used** in a comparison: each deposit buys at its day's bar.
