# ADR 0027 — An owned apartment in a withdrawal plan: cash only, through `run_home`

- Status: Accepted (2026-11-27)

## Context
J1 adds an apartment the user already owns to the Withdraw tab (`docs/WITHDRAWAL_PLAN.md`). The user's answers:
- the apartment is typed in a short section of its own in the Withdraw tab, not read from the Apartment tab, whose
  form describes a purchase;
- its mortgage is none or one track (what is left, a fixed rate, the months left, linked or not);
- betterment tax by the Apartment tab's default (a single home, exempt up to the ceiling) or 25 % of the real gain,
  with two optional fields: what it cost and when it was bought;
- a kept apartment whose costs the account cannot pay is sold that month.

## Decision
- **`run_home` gives the apartment's two series**, read as "today": the price is its value on the first day, no
  purchase tax or costs, the loan one fixed-rate track. `HomePlan` gains two optional fields, `cost` (in shekels of
  the first day) and `bought` (for the linear rule); without them nothing changes for the Apartment tab. The API
  indexes a cost given in shekels of its purchase day by the published CPI from that day to the first day (held at
  its last value past it, with a warning).
- **The engine takes the apartment as two arrays**, `cash` (rent received less the mortgage payment and the owner
  costs) and `worth` (what a sale would leave: `run_home`'s net worth), with its role and sale month. It knows
  nothing of rent, loans or betterment, so the J2 worlds can feed it the same way.
- **Cash only.** A rent saved by living in the apartment is not cash; in Phase H it counts as income, here it does
  not. The rent follows the CPI.
- **The month's order:** the fee and what the apartment does not pay itself come first, then the withdrawal.
  - A fixed rule sells for the amount and that duty. A rent surplus over both is invested at the plan's weights.
  - A percent rule sells its twelfth, or more when the duty needs more; its income is that sale's net plus the
    apartment's cash. So "the balance of a percent rule ignores the cost share" now holds only while the twelfth
    pays the duty, and the page says so.
- **The sale:** on a date; when the account cannot pay the month in full (the withdrawal included); or, whatever the
  role, when it cannot pay the duty (a forced sale, with a warning). The sale's month still has its cash. A positive
  worth is invested; a negative one (the loan above the value) is paid from the account.
- **Money invested** buys the plan's weights with the Market tab's buy commission, as a new lot whose cost includes
  the commission (as an H1 deposit). The deposit fee does not apply: this is not a deposit into a fund.
- **The capital may be zero** with an apartment. **Depletion** is unchanged for a fixed amount (a month not paid in
  full); under a percent rule an empty account is the end only when no apartment is left.
- **What is left** is the account plus the apartment's worth while it is held; the liquidation includes it.

## What the review settled
- **A sale that leaves a debt keeps it.** When the loan and the selling costs are above the value and the account
  cannot pay the gap, what is still owed is carried to the next months, paid first, and shown as the apartment's
  negative worth (and in the net worth) until it is. It used to vanish, so a sale read as a gain.
- **A cost shortfall is a forced sale whatever the role.** It is tested before "when empty", which under a percent
  rule is the same test, so the forced-sale warning appears there too.
- **The net worth is what selling both would leave**, after the account's commission and tax and the apartment's
  costs and betterment tax: the liquidation. It was the account before its tax plus the apartment after its own.
- **One of the cost and the purchase day is sent as typed**, so the API says the other is missing, instead of the page
  dropping it unsaid.
- **No note on a loan schedule past the plan**: the engine never reads those months.

## Consequences
- A golden scalar model in the tests runs the same plan with bisection for every fraction, across the three roles
  and both rules, with random apartment cash and worth, and matches the engine to `rtol=1e-9`.
- The three cost-share runs may sell the apartment on different months; each summary says when and why.
- Not in J1: an apartment whose value follows a district index, a loan with prime or variable tracks, selling part
  of it, a loan against it. The percent of a percent rule stays of the account alone (the user's answer to the plan's
  question 3).
