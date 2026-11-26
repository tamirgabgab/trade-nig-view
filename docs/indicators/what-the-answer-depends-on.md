# What the answer depends on

"The apartment ends ₪400,000 behind" is an answer. This page is about the section under it: *why* that is the
answer, which of your inputs it rests on, and how easily it would flip.

## What it answers

*"Where does the apartment's return actually come from? Which of my assumptions matters most? If I had to sell
early, or in a hurry, would the answer be the same?"*

Five tools, each for one of these:
- **the return by source** splits the apartment's yearly return into appreciation, rent, the mortgage and costs;
- **breakeven rates** find the value of one input at which the two options end equal;
- **the sensitivity** moves one input a little and reports how far the answer moves;
- **who leads, and from when** follows both options over every month you might sell in;
- **liquidity** shows what a forced sale would leave.

## Formula

### The return by source

The apartment's return is recomputed with some of its four sources switched off, and each source is credited with
what it adds:

$$
\begin{aligned}
\phi_j &= \sum_{K \subseteq \text{sources} \setminus \{j\}} \text{weight}_K \cdot \Big( v\big(K \cup \{j\}\big) - v(K) \Big) \\[4pt]
\text{weight}_K &= \frac{\lvert K \rvert!\,\big(4 - \lvert K \rvert - 1\big)!}{4!}
\end{aligned}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\text{sources}$ | the four sources: appreciation, rent, leverage (the mortgage), costs and taxes | — |
| $j$ | one of the sources | — |
| $K$ | a set of *other* sources that are switched on | — |
| $\lvert K \rvert$ | how many sources are in $K$ | 0 to 3 |
| $v(K)$ | the apartment's yearly return ([XIRR](learn:xirr)) with only the sources in $K$ switched on | per year |
| $v(K \cup \{j\}) - v(K)$ | what source $j$ adds when it is switched on after the sources in $K$ | points of yearly return |
| $\text{weight}_K$ | the share of the 24 possible orders in which exactly the sources in $K$ are switched on before source $j$ | 1/12 to 1/4 |
| $\phi_j$ | the share of source $j$: its average addition over every order of switching the four on (the Shapley value) | points of yearly return |

"Switched off" means: no appreciation (the value stays at the price), no rent, no loan (bought in cash), no costs
and taxes. With all four off the apartment is bought and sold at one price and earns exactly nothing, so
$v(\varnothing) = 0$.

### Breakeven

A breakeven rate is the value $\beta^*$ of one input at which the two options end equal:

$$
\Delta(\beta^*) = W_A(\beta^*) - W_B(\beta^*) = 0
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\beta$ | the input being searched: the apartment's constant yearly appreciation, the market's constant yearly return, a number of points added to every track's rate, or a multiple of the rent | — |
| $\Delta(\beta)$ | the difference of the end values when that input is $\beta$ and everything else is as entered | ₪ |
| $\beta^*$ | the breakeven value | — |

It is found by bisection, as the XIRR is. "None in range" means $\Delta$ has the same sign over the whole range
searched: no value of that input alone flips the answer.

### The sensitivity

One input is moved by a step $\delta$, down and up, and the change of the answer is reported:

$$
\text{effect}(\delta) = \Delta(\text{input moved by } \delta) - \Delta(\text{as entered})
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\delta$ | the step: 1 point a year for appreciation, the market return and the mortgage rates; 10 % for the rent; 5 points for the tax rates | — |
| $\text{effect}(\delta)$ | how much "A minus B" changes at the end | ₪ |

A move **tilts** the path in use, it does not replace it. An apartment's value and an asset's price become

$$
\begin{aligned}
V_k' &= V_k\,(1 + \delta)^{k/12} \\[4pt]
\text{price}_d' &= \text{price}_d\,(1 + \delta)^{\tau_d}
\end{aligned}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $V_k,\ V_k'$ | the apartment's value in month $k$, as entered and moved | ₪ |
| $\text{price}_d,\ \text{price}_d'$ | an asset's price on day $d$, as entered and moved | price |
| $\tau_d$ | the time of day $d$ from the first day | years |

So history stays history, with its crashes, only a little steeper or flatter.

### A forced sale

$$
\begin{aligned}
\mathrm{NW}^{\text{forced}} ={}& V_T\,(1 - \kappa)(1 - \text{sell}) - B_T\,(1 + \text{early}) \\[4pt]
& - \text{betterment}\big(V_T (1 - \kappa)\big)
\end{aligned}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\kappa$ | the forced-sale discount: how far below its value the apartment sells when it must sell now | 10 % by default |
| $V_T,\ B_T$ | the apartment's value and the loan's balance at the sale | ₪ |
| $\text{sell},\ \text{early}$ | the selling costs and the early-repayment fee ([the apartment's ledger](learn:rent-or-buy)) | shares |
| $\text{betterment}(\cdot)$ | the betterment tax, recomputed on the lower price | ₪ |

### Do the two move together

$$
\begin{aligned}
\hat\rho &= \operatorname{corr}(y^{\text{home}}, y^{\text{market}}) \\[4pt]
\text{interval} &= \tanh\!\left(\operatorname{artanh}(\hat\rho) \pm \frac{1.96}{\sqrt{n_y - 3}}\right)
\end{aligned}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $y^{\text{home}}_t,\ y^{\text{market}}_t$ | the **yearly** growth of the dwelling price index and of the market mix in shekels, year $t$ | per year |
| $n_y$ | the number of whole years both series have | at least 4 |
| $\hat\rho$ | their correlation | −1 to 1 |
| $\text{interval}$ | its 95 % interval (Fisher's) | two correlations |

## Worked example

**The return by source, with two sources.** To see the rule without 15 runs, take only appreciation and leverage.
Suppose the four possible apartments return:

| Switched on | Yearly return $v$ |
|---|---|
| nothing | 0 % |
| appreciation only (bought in cash) | 3 % |
| leverage only (a loan on a flat value) | −1 % |
| both | 5 % |

There are two orders of switching them on:
- appreciation first: it adds $3 - 0 = 3$, then leverage adds $5 - 3 = 2$;
- leverage first: it adds $-1 - 0 = -1$, then appreciation adds $5 - (-1) = 6$.

Averaging over the two orders: appreciation $(3 + 6)/2 =$ **4.5 points**, leverage $(2 - 1)/2 =$ **0.5 points**.
They add up to the 5 % of the whole apartment. Note what the average did to leverage: it is worth +2 points once
the apartment appreciates and −1 when it does not, and its share is the mean of the two.

**The sensitivity.** A tilt of +1 point a year for 10 years multiplies the last month's value by $1.01^{10} =$
1.1046: an apartment worth ₪2,687,833 at the sale is worth ₪2,969,040 in the moved run.

**A forced sale.** An apartment worth ₪2,687,833 with ₪999,032 still owed, selling costs of 2.4 % and no tax, sold
at a 10 % discount, leaves $2{,}687{,}833 \cdot 0.9 \cdot 0.976 - 999{,}032 =$ ₪1,361,961, against ₪1,624,293 in a
normal sale: ₪262,332 less. A 10 % discount on the price took 16 % of the owner's money.

**Who leads.** Exits checked at months 12, 24, 36, 48 and 60 with A ahead in the third and the fifth: A leads at
the end, stays ahead from month 60 (it was behind at month 48), and leads in 40 % of the exits.

**The interval of a correlation.** Twenty years with $\hat\rho = 0.30$:
$\operatorname{artanh}(0.30) = 0.3095$, and $1.96 / \sqrt{17} = 0.4754$, so the interval is
$\tanh(-0.1659)$ to $\tanh(0.7849)$: **−0.16 to 0.66**. Twenty years cannot tell a weak negative link from a
strong positive one.

## How to read it

- **The four shares add up to the apartment's return** (to the rounding shown). That is what the averaging over
  orders buys.
- **The mortgage's share can be negative even when borrowing pays.** It also counts the orders in which the
  apartment does not yet earn its rent or its appreciation, and there a loan only costs.
- **Compare each breakeven rate with what you expect.** "The apartment needs 6.25 % a year of appreciation to
  match the market" is a question you can judge; the Planner makes no forecast.
- **The tornado chart** sorts the inputs by how far they move the answer. The top bar is the assumption to think
  hardest about. A bar that crosses zero far enough to flip the sign of "A minus B" means that input alone decides
  the winner.
- **Breakeven replaces, sensitivity tilts.** A breakeven appreciation is a *constant* growth that replaces the
  value path; a sensitivity move keeps the path and leans it. They answer different questions and need not agree.
- **"Stays ahead from month N"**: sold in any later month that was checked, the leader at the end is still ahead.
  A late N means the answer depends on holding to the end.
- **Read the correlation as rough.** Its interval is wide by nature; a low correlation is what makes holding both
  options reduce risk (the table "The same money in both" in a simulation).

## Where it comes from

**Why not switch one source off at a time?** Because the sources multiply each other. Leverage magnifies whatever
the apartment earns; it has no return of its own. In the example, switching appreciation off costs
$5 - (-1) = 6$ points and switching leverage off costs $5 - 3 = 2$ points: 8 points "explained" out of a return of
5. One-at-a-time shares do not add up.

**Why the average over orders does.** Fix one order, say appreciation (app), then leverage (lev). The additions along it
telescope:

$$
\big(v(\{\text{app}\}) - v(\varnothing)\big) + \big(v(\{\text{app}, \text{lev}\}) - v(\{\text{app}\})\big) = v(\{\text{app}, \text{lev}\}) - v(\varnothing)
$$

Every order sums to the same total, the full return minus the empty one, so the average of the orders does too.
The Shapley value is that average; $\text{weight}_K$ in the formula is just the share of the 24 orders in which
exactly the sources in $K$ come before source $j$.

**Why bisection finds a breakeven.** If $\Delta$ is positive at one end of a range and negative at the other, and
changes smoothly in between, it is zero somewhere inside. Halving the range and keeping the half where the sign
changes closes in on that point. The market-return breakeven need not be unique: the apartment's surplus months are
invested in the market too, so both sides move with it.

**Why a discount hurts the owner more than its size.** The bank is repaid in full whatever the price. So the whole
discount $\kappa V_T (1 - \text{sell})$ comes out of the owner's part, which is smaller than the price:

$$
\frac{\text{loss}}{\mathrm{NW}} = \frac{\kappa\, V_T (1 - \text{sell})}{V_T (1 - \text{sell}) - B_T}
$$

(when there is no tax to offset it). With half the value still owed, a 10 % discount is a 20 % loss.

**Why $\operatorname{artanh}$.** A correlation is squeezed between −1 and 1, so its sampling error is lopsided near
the ends. Fisher's transform $\operatorname{artanh}(\hat\rho)$ stretches it onto the whole line, where the error is
close to normal with standard deviation $1/\sqrt{n_y - 3}$. The interval is built there and mapped back with $\tanh$.

## Limits

- **The shares are an accounting convention.** Another fair-sounding rule would split the return differently; the
  Shapley value is the one that adds up and treats the sources alike.
- **One input at a time.** The sensitivity and the breakeven rates hold everything else fixed, though in life
  rates, prices and rents move together.
- **Exits are checked every few months**, not every month, so "stays ahead from" is right to within that step.
- **The discount is a guess.** Nobody knows what a forced sale costs until it happens; 10 % is a field, not a fact.
- **Yearly correlation from a few decades** has a wide interval, and monthly returns of a smoothed price index
  would read near zero whatever the truth: that is why years are used.
