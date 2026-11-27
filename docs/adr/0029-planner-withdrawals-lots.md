# ADR 0029 — Known lots in a withdrawal plan, and two plans side by side

- Status: Accepted (2026-11-27)

## Context
J4 (`docs/WITHDRAWAL_PLAN.md`), run before J3 at the user's request. The user's answers:
- the lots come from the Market tab's plan: its deposits accumulate until its end date, and the withdrawals start
  on that day;
- lot-exact tax in the single plan only; history and the simulated worlds keep the cost share and its bounds;
- two withdrawal plans side by side, every Withdraw setting each option's own.

## Decision
- **First in, first out, per asset.** A sale still takes the same fraction of every asset (J0); within an asset it
  takes the oldest units first and realises their own cost. Money invested later (a rent surplus, an apartment's
  sale) is a new lot, sold last. The rule is regulation 5 of the 2002 capital-gain regulations as secondary sources
  quote it (a bank's explainer, a law-firm case summary, a tax forum); the regulation's text was not read, and the
  page says the order is a model.
- **One engine still (ADR 0028).** The loop's state gains a lot axis, `(realizations, lots, assets)`. One pooled lot
  is J0 to J2 with their closed form and their numbers; known lots take one more slot a month for new money.
- **The fraction for a net amount by bisection** with known lots. What a sale leaves rises with the fraction (a unit
  never costs more tax than it brings) but has a kink at every lot; sixty halvings reach the last bit of a double.
  A plan of 30 years from 120 lots of two assets measured 1.3 s a run, and the single plan runs twice (the months
  in reverse); 1,000 pooled worlds of 30 years still take 0.12 s.
- **The handover is exact.** `handover()` reads `run_market`'s lots on the plan's last day: a lot's units are its
  value there, and its cost is what the market account would tax it on (its indexed cost less the account fees its
  units already paid, which that account counts as proceeds). So selling everything on that day pays the Market
  tab's own tax; a test holds the two equal on both tax bases, commissions included.
- **The request carries the Market tab's plan** (`plan`: the body of `/planner/market`, whose end is the first
  day). The capital, the cost share and `market` are then not read; the account must grow by the mix. The answer has
  no floor and no ceiling, and says what was handed over.
- **History and worlds from a plan** use what it accumulated as one capital at its overall cost share (cost over
  value), with a note: the realizations do not carry lots (the user's choice).
- **Two plans side by side** reuse the planner's two options: `withdraw` and `withdrawOther` swap, copy and persist
  with the Market forms, behind the same switch. Run runs both and shows a table of the two; the full results, and
  any study, are of the option on screen.

## What the review settled
- **A handover on a day without a bar.** The market account is valued on the last bar on or before its end; the
  grid read the first bar on or after it, so a plan that ends on a weekend lost (or won) the move between the two
  for the whole plan. With lots, the grid's first day now reads the account's own bar.
- **Selling everything is exact** with lots (two sums of the same units differ in their last bit, which left a dust
  of units and a depletion month one too late).
- **A plan under water** shows its cost above 100 % of its value; the studies, whose one pooled capital cannot
  carry a loss, say so.
- **No more than 2,000 deposits** are handed over lot by lot, and a month with nothing to solve skips the bisection.
- **Simulate from a plan** grows by the mix whatever the hidden returns select holds.
- **Loading a saved scenario** with option B on screen no longer exchanges the two options' Withdraw settings.
- **The error is raised** when neither of the two options can run.

## Consequences
- With lots the cost share on the page is an outcome (the plan's cost over its value), not an input.
- Not built: typing lots by hand (a portfolio that exists already), lots inside the windows and the worlds, a
  choice of another order of sale.
