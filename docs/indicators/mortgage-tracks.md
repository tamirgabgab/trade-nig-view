# Mortgage tracks

A mortgage in Israel is a mix of **tracks**. Each track is a loan of its own, with its own rate rule and its own way
of repaying. The Apartment tab takes up to three tracks, builds the monthly table of each one, and adds them up.

## What it answers

*"What will I pay each month, how much of it is interest, and what do I still owe on the day I sell?"*

Two questions decide a track:
- **How is its rate set?** Fixed for the whole term, tied to the Bank of Israel rate (prime), or reset every few
  years (variable). A fixed or a variable track can also be linked to the consumer price index.
- **How is it repaid?** A level payment (Spitzer), equal principal, a grace period, or everything at the end
  (balloon).

## Formula

### The rate of a month

Banks quote a **yearly** rate and charge one twelfth of it every month:

$$
i_k = \frac{q_k}{12}
$$

The quoted rate $q_k$ of month $k$ is known at the start of that month and depends on the track's kind:

$$
q_k =
\begin{cases}
q & \text{fixed} \\
\mathrm{BoI}_{k-1} + 1.5\,\% + s & \text{prime} \\
q_1 + \mathrm{BoI}_{p(k)} - \mathrm{BoI}_0 & \text{variable}
\end{cases}
\qquad q_k \ge 0
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $k$ | the number of the month, from 1 to $n$; month $k$ runs from month date $k-1$ to month date $k$ | — |
| $n$ | the term of the track | months, 48 to 360 |
| $q_k$ | the *quoted* yearly rate of month $k$ | per year, 2 % to 8 % |
| $i_k$ | the monthly rate actually charged | per month, about 0.2 % to 0.7 % |
| $q$ | a fixed track's rate (the field "Rate %") | per year |
| $q_1$ | a variable track's rate in its first period (the same field) | per year |
| $s$ | a prime track's spread (the same field; often negative, such as −0.5 %) | per year |
| $\mathrm{BoI}_{k}$ | the Bank of Israel rate on month date $k$; $\mathrm{BoI}_0$ is the one on the purchase day | per year |
| $p(k)$ | the month date on which month $k$'s reset period began: 0, then every "reset years" | — |

Prime is by definition the Bank of Israel rate plus 1.5 %. A variable track keeps its rate for a whole period and
then moves by as much as the Bank of Israel rate moved since the loan began. No rate goes below zero.

### One month of a track

Every month does the same four things to the balance:

$$
B_k^{+} = B_{k-1} \cdot \frac{\mathrm{CPI}_k}{\mathrm{CPI}_{k-1}} \quad (\text{linked tracks only}), \qquad
\text{interest}_k = B_k^{+}\, i_k, \qquad
B_k = B_k^{+} + \text{interest}_k - M_k
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $B_{k-1}$ | the balance after the payment of the month before; $B_0 = L$ | ₪ |
| $L$ | the amount of the track (its share of the loan) | ₪ |
| $B_k^{+}$ | the balance at the start of month $k$, after the linkage; equal to $B_{k-1}$ on a track that is not linked | ₪ |
| $\mathrm{CPI}_k$ | the consumer price index on month date $k$ | index |
| $\text{interest}_k$ | the interest of the month | ₪ |
| $M_k$ | the payment of the month | ₪ |
| $B_k$ | the balance after the payment; the last one, $B_n$, is zero | ₪ |

The part of the payment that is not interest reduces the debt: $\text{principal}_k = M_k - \text{interest}_k$. The
rise of the balance by the index, $B_k^{+} - B_{k-1}$, is the month's **linkage**: it is added to the debt, not paid
that month.

### The payment, by repayment type

**Spitzer** (a level payment) repays what is owed over the months that are left:

$$
M_k = \frac{B_k^{+}\, i_k}{1 - (1 + i_k)^{-m_k}}, \qquad m_k = n - k + 1
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $m_k$ | the number of payments left, this one included | months |
| $M_k$ | the payment; with a rate that never changes and no linkage it is the same every month | ₪ |

It is recomputed every month. So when the rate is reset or the index lifts the balance, the payment follows by
itself. At a zero rate it is simply $B_k^{+} / m_k$.

**Equal principal** repays the same share of the debt every month, plus that month's interest:

$$
M_k = \frac{B_k^{+}}{m_k} + B_k^{+}\, i_k
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $B_k^{+} / m_k$ | the principal of the month: what is owed over the payments left | ₪ |

The payment starts higher than Spitzer's and falls every month, and less interest is paid in total.

**Grace** pays only the interest ($M_k = \text{interest}_k$) for the first "grace months", so the balance does not
move; with "interest accrues" ticked it pays nothing and the interest joins the balance. Then it is Spitzer over the
months left. **Balloon** is a grace of all the months but the last: the whole loan is repaid in the last payment.

### The stress test

The table "If the Bank of Israel rate rose" runs the same loan again with a higher rate from the second month on:

$$
\mathrm{BoI}_k' = \mathrm{BoI}_k + \delta \quad \text{for } k \ge 1, \qquad \mathrm{BoI}_0' = \mathrm{BoI}_0
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\delta$ | the rise tried | 1, 2 and 3 points of yearly rate |
| $\mathrm{BoI}_k'$ | the Bank of Israel rate used in the stressed run | per year |

Month 1's rate was already set on the purchase day, so it does not move. A prime track pays more from month 2; a
variable track from its next reset; a fixed track never.

## Worked example

**A fixed track.** ₪600,000 at 4 % for 20 years, Spitzer, not linked: $L = 600{,}000$, $n = 240$,
$i = 0.04 / 12 = 0.003333$.

- The payment: $M = 600{,}000 \cdot 0.003333 / (1 - 1.003333^{-240}) =$ **₪3,635.88**, every month.
- Month 1: interest $600{,}000 \cdot 0.003333 =$ ₪2,000.00, so principal ₪1,635.88, and the balance falls to
  ₪598,364.12.
- After 24 months the balance is ₪559,196: two years of payments (₪87,261) repaid only ₪40,804 of debt.
- Over the whole term the interest is ₪272,612.

**The same loan with equal principal.** The first payment is $600{,}000 / 240 + 2{,}000 =$ ₪4,500.00 and the last
is ₪2,508.33. The interest over the term is ₪241,000: less, because the debt falls faster.

**A prime track.** With the Bank of Israel rate at 4 % and a spread of −0.5 %, the quoted rate is
$4 + 1.5 - 0.5 = 5\,\%$ and the first payment on ₪600,000 over 20 years is ₪3,959.73.

**The stress test on it.** If the Bank of Israel rate rises by 2 points, the rate is 7 % from month 2. Spitzer
recomputes on the ₪598,540 still owed over the 239 months left: **₪4,649.40** a month, ₪689.67 more.

**A variable track.** 4 % for the first five years, then the Bank of Israel rate has gone from 4 % to 6 %. The
rate becomes $4 + 6 - 4 = 6\,\%$ at month 61, and the payment jumps from ₪3,635.88 to ₪4,147.92.

**A linked track.** ₪600,000 at 3 % with inflation of 2.5 % a year. In month 1 the index adds ₪1,235.90 to the
debt before any interest. The first payment is ₪3,334.44, only a little above the ₪3,327.59 of the same track
without linkage, but it rises with the index every month and the last one is ₪5,452.64. After a year the debt is
₪592,209, against ₪577,765 without linkage.

## How to read it

- **"First rate"** in the tracks table is the quoted rate of month 1. For a prime track it already includes the
  1.5 % and the spread.
- **"Interest, whole term" and "Linkage, whole term"** are sums of shekels paid in different years. They show which
  track is expensive, not what it costs in today's money.
- **A low first payment is not a cheap loan.** A linked track starts low because its rate is a *real* rate; the
  index is charged on top, through the balance. Compare tracks by the whole table or by the apartment's
  [yearly return](learn:xirr), not by the first payment.
- **The stress table's highest payment is over the whole term of the loan**, not only until the sale. A variable
  track that resets after the planned sale would otherwise show no risk at all, and plans change.
- **A quoted 4 % is 4.07 % effective**, because it is charged monthly; see
  [the three kinds of yearly rate](learn:xirr#three-kinds-of-yearly-rate).

## Where it comes from

**The level payment.** Take a rate $i$ that never changes and no linkage, and ask for one payment $M$ that brings
the balance to zero after $n$ months. Each month the balance grows by the interest and falls by the payment:

$$
B_k = B_{k-1}(1 + i) - M
$$

Apply it $k$ times, starting from $B_0 = L$:

$$
B_k = L(1 + i)^k - M\big[(1+i)^{k-1} + \dots + (1+i) + 1\big] = L(1 + i)^k - M\,\frac{(1+i)^k - 1}{i}
$$

(the bracket is a geometric series). Setting $B_n = 0$ and solving for $M$:

$$
M = \frac{L\, i\,(1+i)^n}{(1+i)^n - 1} = \frac{L\, i}{1 - (1 + i)^{-n}}
$$

That is Spitzer's payment. The second line also gives the balance on any month without building the table: for
the example, $B_{24} = 600{,}000 \cdot 1.003333^{24} - 3{,}635.88 \cdot (1.003333^{24} - 1)/0.003333 =$ ₪559,196.

**Why recomputing every month is the same thing.** After $k - 1$ payments the debt is $B_{k-1}$ with $m_k$ months
left. The level payment that repays *that* debt over *those* months is the formula with $L \to B_{k-1}$ and
$n \to m_k$. With a constant rate this gives the same $M$ every month, so one rule serves the fixed track and,
unchanged, the tracks whose rate or balance moves.

**Why early payments are mostly interest.** Interest is charged on what is still owed. At the start nearly all of
$L$ is owed, so the interest $L\,i$ takes most of $M$ (₪2,000 of ₪3,636 above); near the end little is owed and
nearly all of $M$ is principal.

## Limits

- **The model is monthly.** Banks use the "known index" (published about six weeks earlier) and their own rounding;
  the Planner uses the index of the payment month. A payment can differ from the bank's by a few shekels.
- **A variable track follows the Bank of Israel rate.** Real variable tracks are tied to bond yields or to the
  banks' average mortgage rate, which move with it but not one for one.
- **The stress test moves the rate alone.** The index, the apartment's value and the rent stay as entered, although
  in life a higher rate usually comes with other changes.
- **Early-repayment fees** are one percentage of the balance (a field), not the law's formula.
