# Withdrawals: what is left, and for how long

The Withdraw tab turns the Planner around. There is a capital, money comes **out** of it every month by a rule, and
the page shows how long that lasts, or what it pays, and what is left. This page is the month the engine runs, and
the two rules on top of it.

## What it answers

*"I have a million in the market. If I take ₪10,000 a month after tax, when does it end? And if I take 4 % a year
instead, what does that pay?"*

A withdrawal plan has two outputs, not one: **money taken** and **money left**. So each rule leads with its own
headline. A fixed amount can run out: the page says when, or that it lasts. A percent of the account shrinks with
the account but never stops by itself: the page leads with the income it pays.

## Formula

### The month as one event

Every month date $k = 1 .. T$ (the first one a month after the start) is one event: the account's fee, a sale of
the same fraction $\psi_k$ of every asset, and the tax of that sale.

$$
\begin{aligned}
\text{fee}_k &= \min\big(H_k,\ H_k\,(1 - (1 - \text{mgmt})^{1/12}) + \text{monthly}\big) \\[4pt]
\text{tax}_k &= \text{rate}_{\text{gains}} \cdot \max\big(\psi_k\,U_k - \text{carried}_{k-1},\ 0\big) \\[4pt]
\text{net}_k &= \psi_k\,(1 - \text{sell})\,H_k - \text{tax}_k - \text{fee}_k
\end{aligned}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $k$, $T$ | a month date, counted from the start; the plan's last one | months, 1 to 1,200 |
| $H_k$ | the account's value on month date $k$, before the month's sale; $H_0$ is the starting capital | ₪ |
| $\psi_k$ | the fraction of every asset sold in month $k$ | 0 to 1 |
| $\text{mgmt}$, $\text{monthly}$ | the Market tab's yearly management fee and fixed monthly fee | 0 to 2 % a year; ₪ a month |
| $\text{sell}$ | the Market tab's sell commission | 0 to 1 % |
| $U_k$ | the gain if all of the account were sold on date $k$: what it would bring after the commission, less its cost ([the cost of what is sold](learn:cost-basis)) | ₪, negative in a loss |
| $\text{carried}_{k-1}$ | a loss carried from earlier sales, set against this gain first | ₪, 0 or more |
| $\text{rate}_{\text{gains}}$ | the tax on a capital gain | 25 % |
| $\text{fee}_k$, $\text{tax}_k$, $\text{net}_k$ | the month's fee, its tax, and what reaches the hand | ₪ |

What the sale leaves after its tax pays the fee first; the rest is the income. Dividends are reinvested on the way,
net of their tax, and join the cost.

### A fixed amount, net in hand

The rule names what reaches the hand, $R$ in shekels of the first day. Month $k$ owes it raised by the CPI (the
default), or $R$ itself with the box unticked. The fraction is the one whose sale leaves that after its tax and the
fee:

$$
\begin{aligned}
R_k &= R \cdot \frac{\mathrm{CPI}_k}{\mathrm{CPI}_0} \\[4pt]
\psi_k &= \frac{R_k + \text{fee}_k}{(1 - \text{sell})\,H_k - \text{rate}_{\text{gains}} \cdot U_k}
\end{aligned}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $R$ | the amount asked for, net, in shekels of the first day | ₪ a month |
| $R_k$ | what month $k$ owes: $R$ raised by the CPI since the first day | ₪ |
| $\mathrm{CPI}_k$ | the consumer price index on month date $k$ (the Market tab's inflation) | index |

The second line holds while the gain is positive and no loss is carried; a carried loss puts a kink in it, which
[the cost page](learn:cost-basis) works through. A fraction above 1 sells everything and pays what there is.

### A percent of the account

The rule names a yearly share $\omega$ of the account, and a twelfth of it is **sold** every month. The income is
what that sale leaves:

$$
\psi_k = \max\Big(\frac{\omega}{12},\ \psi_k^{\text{fee}}\Big)
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\omega$ | the yearly share of the account sold: a percent a year divided by twelve each month, not an effective rate | 2 to 8 % a year |
| $\psi_k^{\text{fee}}$ | the fraction whose sale pays the month's fee alone (more is sold only when the fee needs it) | 0 to 1 |

So under this rule what is left does not depend on the cost share: only the income does.

### When the money ends

A month is **short** when a fixed amount is not paid in full, or when the account is empty with no apartment left.
The money ends at the first month of the run of short months that lasts to the end:

$$
k_{\text{end}} = \min\{\,k : \text{every month from } k \text{ to } T \text{ is short}\,\}
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $k_{\text{end}}$ | the month the money ends; none when the last month is paid in full | month, 1 to $T$ |

A short month followed by full ones again (before an apartment's sale) is counted and dated on its own, but it is
not the end.

### An apartment in the balance

An apartment the user already owns gives cash every month, $\text{cash}_k$: the rent received after its vacancy and
its tax, less the mortgage payment and the owner costs. Living in it gives no cash. The account owes, before the
withdrawal:

$$
D_k = \text{fee}_k - \text{cash}_k
$$

| Symbol | Meaning | Units / typical range |
|---|---|---|
| $\text{cash}_k$ | what the apartment gives in month $k$ while it is held; negative when its costs are more than its rent | ₪ |
| $D_k$ | what the account owes in month $k$ before the withdrawal: the fee and what the apartment does not pay itself | ₪ |
| $\mathrm{NW}_k$ | what the apartment's sale in month $k$ would leave: its value less the selling costs, the loan and its early-repayment fee, and the betterment tax ([the apartment's ledger](learn:rent-or-buy)) | ₪ |

A fixed rule sells for $R_k + D_k$, and invests a surplus of rent; a percent rule sells its twelfth (more when $D_k$
needs it) and adds $\text{cash}_k$ to the income. The apartment is kept, sold on a date, or sold when the account
cannot pay the month; whatever the role, it is sold the month the account cannot pay $D_k$. Its sale puts
$\mathrm{NW}_k$ into the account; a sale that owes more than it brings leaves a debt, paid first from what comes
after.

## Worked example

A capital of ₪1,000,000 that does not grow (an assumed return of 0 %), half of it cost, a 25 % tax, no fees, and
₪10,000 a month net, not indexed, from 2030-01-15 for ten years. A sale is half gain, so each month sells

$$
\psi_k H_k = \frac{10{,}000}{1 - 0.25 \times 0.5} = 11{,}428.57
$$

about **11,429** a month, of which **1,429** is tax. Eighty-seven months take 994,286. Month 88 finds **5,714**
left: sold, it brings **5,000** net, so it is short, and the money ends on **2037-05-15**. All in all **875,000**
reached the hand and **125,000** went in tax.

The same with all of the capital cost lasts 100 months: the money ends on 2038-06-15. With an apartment worth
2,000,000 (no costs, no growth, lived in), **sold when the account runs out**, the sale comes on **2038-06-15**, pays
the last twenty months, and **1,800,000** is left at the end.

Both can be retyped in the Withdraw tab: "An assumed yearly return" at 0 %, the Market tab's fees at 0.

## How to read it

- **A fixed amount** leads with *The money ends* or *Lasts*. The tax bounds beside it (a cost share of 0 % and
  100 %) show how much the unknown purchases could move that date.
- **A percent** leads with the income: the first month, the lowest month in shekels of the first day, the last.
  Its balance is the same at every cost share; its income is not.
- **The chart** shows the balance and the income over time, with a band between the two tax bounds.
- **With an apartment** the cards add what became of it and the net worth: what selling the account and the
  apartment would leave.

## Where it comes from

The net of a sale is linear in the fraction sold while its gain stays taxed at one rate. Selling $\psi_k$ of
everything brings $\psi_k (1 - \text{sell}) H_k$ and realises the gain $\psi_k U_k$, so

$$
\text{net}_k + \text{fee}_k = \psi_k \big((1 - \text{sell}) H_k - \text{rate}_{\text{gains}} \, U_k\big)
$$

and setting the left side to $R_k + \text{fee}_k$ gives the fraction above. The planner does not know the
purchases behind a capital typed in; the cost share stands for them, and [the cost page](learn:cost-basis) shows
why its two ends are bounds.

## Limits

- One sale a month, at the close of the first trading day on or after the month date; the sell commission stands
  for the spread too.
- The same fraction of every asset is sold, so the mix drifts with the market and is never traded back.
- Only cash counts: a rent saved by living in the apartment is not income here (in the Compare tab it is).
- A debt left by an apartment's sale bears no interest.
- Tax rules change, and the rates are fields. The numbers are a model, not advice.
