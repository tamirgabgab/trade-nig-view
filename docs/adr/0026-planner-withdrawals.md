# ADR 0026 — The planner's withdrawals: one lot, a cost share, and a month as one event

- Status: Accepted (2026-11-27)

## Context
Phase J turns the Planner around: a starting capital, money taken out by a rule, and what is left over time
(`docs/WITHDRAWAL_PLAN.md`). J0 is the engine for a market account and the Withdraw tab. The user's choices:
- the fixed amount is what reaches the hand, and rises with the CPI by default;
- the percent is of the account, and it is **what is sold**: the income is what the tax and the costs leave;
- taxing every sale in full is a bound, since the purchases behind the capital are not known;
- beside the Market tab's mix, an **assumed yearly return**, so a plan can start today;
- the default cost share is 50 %, with both bounds always shown.

## Decision
- **A new pure module, `app/planner/withdraw.py`**, not an extension of `market.py`. The market account knows its
  deposits ahead and sells once, at the end; a withdrawal depends on what the account is worth that month, so it is
  a loop over months with a small state.
- **The core runs on a month grid.** `Grid` holds, per month date and asset: the value of one starting unit (net
  dividends reinvested), the cost of the dividends reinvested in the month, the index the cost is linked to, and the
  CPI. `sample()` builds it from daily bars (each month date reads the first bar on or after it); `assumed_grid()`
  builds it directly as (1 + r)^(k/12). The simulated worlds of J2 will feed the same core.
- **The unknown purchase history is one number.** Each asset starts as one lot whose cost is a share c of its value.
  Selling a fraction realises the same fraction of the cost left. c = 0 is the user's floor (net = 75 % of gross at
  a 25 % tax); c = 1 taxes only growth from the start. With one lot, first-in-first-out and average cost are the
  same, so the order of sale does not arise (it will, in J4, with lots from a Market-tab plan).
- **A month is one event on its date:** the account fee, the sale and its tax together, on month dates 1 to T (the
  first a month after the start, like a mortgage payment). This differs from the market account, which charges fees
  at calendar month ends and taxes everything at the end.
- **The tax of a sale** is on its gain after the sell commission, on the Market tab's base (nominal, real or the
  currency). A loss is carried forward and set against later gains; nothing is refunded.
- **The fraction for a net amount is a closed form.** What a sale leaves is piecewise linear in the fraction sold,
  with one kink where the carried loss is used up. A fraction above 1 sells everything and pays what there is: the
  first such month is the depletion month, and the rows go on to the horizon with nothing in them.
  - A sale that would leave less than half an agora sells everything, and a month short by less than that is paid in
    full: rounding dust is neither a balance nor a shortfall.
- **The percent rule** sells p/12 of the account each month (more only when the fee alone needs more). Its balance
  does not depend on the cost share; only the income does. So the two bounds are a band on the income under this
  rule, and on the balance and the depletion month under the fixed rule.
- **An assumed return** is an effective yearly rate in nominal shekels, compounded monthly. The "currency" tax base
  has no rate to follow there: the nominal one is used, with a warning.
- **API.** `POST /planner/withdraw` runs the plan three times (the cost share asked for, 0 and 1) and returns the
  three summaries and a row per month date with both bounds beside the plan.
- **The page.** A fourth tab, Withdraw. It prints the mix it will run and whose it is (with two options that is
  the one on screen), or that the mix is not used. A fixed amount leads with when the money ends, a percent with the
  income. The chart is two panels on one time axis (balance, income), each on its own scale, never two scales on one
  panel; the band is the plan at the two bounds.

## Verification
- **Known answers before the code:** a fixed amount at a constant growth is `mortgage.annuity()` in reverse (the
  balance of every month and the exact month it empties); the percent rule's closed form; the floor and the ceiling;
  a cost share in between, a carried loss and the kink by hand; the real base; reinvested dividends in the cost.
- **A scalar model** with the fraction found by bisection, on worlds with several assets, dividends, inflation,
  fees and a plan that runs out: equal to 1e-9, and every month's sale is the commission, the tax, the fee and the
  income.
- **Properties:** a lower cost share never pays more or lasts longer; under the percent rule the balance is the same
  for every cost share; the order of the months changes the end only under a fixed amount.
- **Against Phase H:** with nothing withdrawn, selling everything at the end leaves what the Market tab's account
  leaves, dividend tax and the real base included.
- **Through the stack:** an assumed return of zero is arithmetic anyone can check (1,000,000 less 10,000 a month),
  in the API tests and in the end-to-end run.

## Consequences
- One plan is three runs of a loop over its months: a 30-year plan is about a thousand steps, well under a second.
- The engine is not yet vectorised over realizations; J2 decides how many worlds a request runs and whether the loop
  needs a worlds axis.
- A deposit during the withdrawals, an apartment (J1) and a rule that changes with age are not in J0.
