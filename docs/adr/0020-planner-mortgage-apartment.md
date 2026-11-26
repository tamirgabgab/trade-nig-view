# ADR 0020 — The planner's mortgage and apartment

- Status: Accepted (2026-11-26)

## Context
Phase H compares an apartment with the stock market. H2 builds the apartment side: a purchase with equity and a
mortgage, the months of owning it, and the sale. The user's choices:
- a mix of up to three tracks; each is fixed, prime or variable, and a fixed or variable one may be CPI-linked;
- four repayment types (Spitzer, equal principal, grace, balloon), the grace chosen per track;
- the Bank of Israel rate from history or assumed, with a shock to test the payments;
- the value from the CBS dwelling index or from an assumed growth;
- a rent switch (live in it, rent it out, not counted); the rent grows with the CPI by default;
- purchase-tax and betterment-tax tables with built-in defaults, editable and saved under a name.

## Decision
- **Three pure modules in `app/planner`**, with the formulas in their docstrings:
  - `mortgage`: tracks and their amortization tables;
  - `home`: the purchase, the monthly flows, the sale and the net worth;
  - `home_data`: the monthly series (the anchor rate, the dwelling index) from `app/macro`.
- **Time is monthly.** Month k runs from the purchase day moved by k − 1 months to the same day moved by k. The sale
  is on the last whole month before the end date.
- **A track's rate.** The monthly rate is the yearly one over 12, as banks quote it.
  - *Fixed:* the stated rate.
  - *Prime:* the Bank of Israel rate at the start of the month + 1.5 % + the track's spread.
  - *Variable:* the stated rate, moved at every reset by the change in the Bank of Israel rate since the start.
  - A rate never falls below zero.
- **CPI linkage.** The balance is multiplied each month by the CPI's rise over the month. The index of the payment
  month is used, not the "known index" of about six weeks earlier.
- **Repayment.** Spitzer recomputes the annuity every month on the balance and the months left, so a reset or the
  linkage moves the payment; with a constant rate it is the textbook constant payment. Equal principal pays the
  balance over the months left plus the interest. Grace pays only the interest (or nothing, the interest joining
  the balance) for its months, then Spitzer. A balloon is a grace of all months but the last.
- **The apartment.**
  - *The purchase.* The purchase tax by a bracket table, the lawyer and the broker as fractions of the price, and a
    renovation.
  - *Each month.* The mortgage payment; maintenance as a yearly fraction of the value; insurance as a yearly amount
    that follows the CPI; and the rent, saved or received (less vacancy and the rent tax when rented out).
  - *The value.* The price times an index's ratio to the purchase day: a dwelling index (interpolated geometrically
    inside its dates) or an assumed lognormal path.
  - *A sale.* Net worth = value × (1 − selling costs) − balance × (1 + early-repayment fee) − betterment tax. It is
    computed for every month, as if sold then.
  - *The return.* The XIRR of the owner's cash: equity and purchase costs out; each month the rent less the payment
    and the costs; the net worth at the end. A saved rent counts as money received.
- **Taxes are parameters, not law.**
  - *Purchase tax* is a bracket table. The built-in ones (a single home; an additional home) hold the amounts of the
    Israel Tax Authority's directive 1/2026.
  - *Betterment tax* is a rate on the real gain (the cost indexed by the CPI), a single-home exemption up to a
    ceiling, and the linear rule for a home bought before 2014 and sold after it; or a custom bracket table on the
    gain. A table's last bracket has no upper bound.
  - The law's conditions (the holding period, who may use each rule) are not modelled. The page says so.
- **Saved tables live in the browser** (`chartlab.planner.home`), beside the form. The plan proposed the backend's
  document store; the browser needs no API and no migration, and H4's saved scenarios can move both together.
  - A form names its table and holds its edits. The table itself is resolved when a plan runs: Run waits for the
    built-in tables, and a table that is no longer there reads as the first built-in one, never as "no tax".
- **API.**
  - `GET /api/planner/tax-presets`: the built-in tables with their source and date.
  - `POST /api/planner/home`: the summary, a row per track, the whole schedule, the months until the sale, warnings.
  - A plan that cannot run is a 422 `invalid_plan`; missing macro data is a 503.
  - Past the published CPI or Bank of Israel rate the last value is held, with a warning: one text when the sale
    is past it, another when only the schedule after the sale is.
- **The page.** The Planner has two tabs, Market and Apartment. Both stay mounted, so each keeps its results. The
  inflation fields are shared.

## Verification
- **Tracks:** the closed-form Spitzer payment and balance; equal principal; partial and full grace; the balloon; a
  linked track equals the unlinked one times the index; prime and variable against hand-computed rates.
- **A golden scalar loop** per track (hypothesis): the same table to 1e-9, the principal sums to the loan, the
  balance ends at zero and is never negative.
- **The apartment:** bracket taxes against the published examples (20,538 on 2.5 million for a single home; 200,000
  for an additional one), the betterment cases, a cash purchase, leverage, and the monthly flows by hand.
- **The API:** 600,000 at 4 % over 20 years pays 3,635.88 a month; published indices are used as ratios to the
  purchase day (linkage, rent, insurance, value).

## Consequences
- + The apartment side is usable alone, and every month has a "net worth if sold now".
- − The model is monthly: a mid-month sale, the known-index lag and banks' rounding are not modelled, so a payment
  can differ from a bank's by a few shekels.
- − A variable track follows the Bank of Israel rate, not the bond yields banks use as anchors.
- − Tax tables are defaults with a date. An additional home's table is a temporary provision until 2026-12-31.
- − The district dwelling indices start in 2017-10; earlier plans need the national index or an assumption.
