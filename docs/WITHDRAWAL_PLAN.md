# Phase J — Withdrawals: plan (2026-11-27)

The user's goal: the mirror image of Phase H. There, money goes in and the Planner shows how the capital grows. Here
there is a **starting capital**, money comes **out** by a rule, and the Planner shows **how much is left over time**.
This phase runs next, before Phase K (synthetic symbols and completions) and Phase 4 (the user's order,
2026-11-27), and extends the Planner; Phases 4 and 5 keep their numbers.

Status: **J0 approved; J1 done (2026-11-27, ADR 0026, ADR 0027); J2 is next.** The user's answers are under "Decided" at the end.

## What the user asked for
- A **Withdraw** tab in the Planner.
- A **starting capital** with some balance between an apartment, stocks, or both.
- A **withdrawal rule**: a percent of what there is, or a fixed amount.
- **What is left over time.**
- **Tax:** the capital in the market may come from many purchases on many dates, which the Planner does not know.
  So taxing a whole sale at 25 % is a bound: at least 75 % of what is sold reaches the hand.
- **Time windows** as in Phase H: the same plan started on every date history allows.

Not asked for, and not in the rounds below: pension funds, study funds (קרן השתלמות), annuities, age-based rules.
They are listed under "Later, if wanted".

## What a result is
A withdrawal plan has two outputs, not one: **money taken** and **money left**. End wealth alone would rank first the
plan that withdraws least, and the withdrawals of a percent rule alone never empty the account (a fee larger than
what is left can, and the page then says when). So each rule has its own headline:

| Rule | It can | Headline of one plan | Headline of many realizations |
|---|---|---|---|
| Fixed amount | run out | the month the money ends, or what is left at the horizon | the chance it lasts, and when it ends if not |
| Percent of what there is | shrink; end only by its fees | the income path and its lowest real month | the spread of the income, and of what is left |

Both always show: the balance over time, the income actually received each month (nominal and in shekels of the
first day), the tax paid, and the total taken.

## The model

### Time
Monthly, like the apartment: month date k is the start day moved by k months, for a horizon of T months. The
withdrawals are on month dates 1 to T (the first one a month after the start, as a mortgage's first payment), and
the month's fee, sale and tax are all on that date. A sale is at that day's close (the bar on or after it), as a
deposit buys in H1.

### The return of the account
- **The Market tab's mix:** its symbols over history, so the start is in the past.
- **An assumed yearly return** (the user, 2026-11-27): one number, an effective yearly rate in nominal shekels,
  compounded monthly as the apartment's assumed growth is. A plan can then start today. Volatility comes with the
  simulation (J2).

### The account
The mix, the USD/ILS switch, the fees and the tax settings are those of the Market tab (one mix for both, unless
the user decides otherwise: question 6). New inputs: the **starting capital** in shekels and its **cost share**.

- Dividends are reinvested net of their tax and join the cost basis, as in H1 (`market.growth`).
- Account fees are charged on the month dates, with the withdrawal (H1 charges them at calendar month ends and
  taxes everything at the end; here the sale, its tax and the fee are one event).
- A withdrawal sells the **same fraction of every asset**, so the mix drifts with the market and is never traded
  back (no rebalancing trades, hence no tax from them). Selling the overweight asset first is "later".

### Tax: the user's bound, made into one number
The Planner does not know the purchase history, so each asset starts as **one lot** whose cost is a share c of its
starting value:

    basis_0 = c × value_0,   0 ≤ c ≤ 1

Selling a fraction φ of an asset realises the same fraction of its remaining basis:

    gain = φ × (value − basis),   basis ← (1 − φ) × basis

- **c = 0:** everything sold is gain. Net = (1 − τ) × gross: the user's floor, 75 % at τ = 25 %.
- **c = 1:** the capital was bought on the first day. Only growth from then on is taxed: the ceiling.
- The truth is between them, and the page always shows the plan under both bounds beside the chosen c.

With one lot per asset, FIFO and average cost are the same thing, so the order of sale does not arise.

Other conventions (the existing ones, extended):
- **The base of the gain** is the Market tab's: nominal, real (the basis rises with the CPI: Israeli law taxes the
  real gain) or linked to the currency.
- **Losses** are carried forward and offset later gains; a loss is never refunded.
- **The sell commission** comes off the proceeds before the tax, as at the end of an H1 plan.

### The amount: net in hand (the fixed rule)
The user plans by what reaches the hand. For a net amount N the Planner solves for the fraction to sell. With one
lot per asset the net of selling φ of everything is piecewise linear in φ, with one kink where a loss carried
forward is used up, so it is a closed form:

    N = φ × Σ_a value_a (1 − sell) − τ × max( φ × Σ_a [value_a (1 − sell) − basis_a] − carried loss, 0 )

The month's fee is paid out of the same sale.

### The two rules
- **Fixed amount:** a net amount N in shekels of the first day. With indexation on (the default) month k pays
  N × CPI_k / CPI_0, so its buying power is constant; with it off, N every month.
- **Percent:** the fraction **sold** each month is p / 12, for a yearly percent p of the account (the user,
  2026-11-27). The income is what is left of that sale after the commission, the tax and the fee.
  - So under this rule the balance does not depend on the cost share at all; only the income does. The two tax
    bounds are a band on the **income** here, and on the **balance and the depletion month** under the fixed rule.

### When the money ends
A month the account cannot pay in full pays what is left and is marked as the **depletion month**; later months pay
nothing (unless an apartment is then sold, below). Net worth never goes below zero from withdrawals.

### The apartment in the balance (question 4)
An apartment the user **already owns**, taken from the Apartment tab's form read as "today": its value, what is
still owed on its tracks, its rent and owner costs. No purchase tax or purchase costs.

- **Cash, not saved rent.** In Phase H a saved rent counts as income. Here only cash counts: rent received (less
  vacancy and its tax) pays part of the withdrawal; the mortgage payment and the owner costs are paid from the
  account on top of it. An owner who lives in the apartment gets no cash from it.
- **Its sale:** never, on a date, or when the account is empty. The net proceeds (selling costs, the loan,
  betterment tax) go into the account as a new lot with c = 1.
- **Betterment tax** has the same unknown-basis problem as the lots. `HomePlan` takes its cost and its "bought on"
  from the plan's own start, so an owned apartment needs two new optional fields (what it cost, when it was
  bought). Without them: the single-home exemption as today, or a cost share as for the account.
- The apartment is not sold in parts, and no loan is taken against it.

## Many realizations
The same three sources as Phase H, through the same code (`scenario_data.Change`, `paths.make_world`, `study`):

- **Windows of history:** the plan shifted by whole months; a window that would run past the published data is
  refused; the youngest asset limits the starts.
- **Block bootstrap** and **Monte Carlo:** the worlds of H3b, unchanged.

### How much history there is (printed here on purpose)
The Israeli CPI and the dwelling index are used from 1994-01, about 391 months to mid-2026. The independent terms a
study holds are (S + T) / T = 391 / T:

| Horizon T | Starts possible | Independent terms |
|---|---|---|
| 10 years | about 271 months of starts | 3.3 |
| 20 years | about 151 | 1.6 |
| 30 years | about 31 | 1.1 |

So for a 20 or 30 year withdrawal plan, **history is an illustration, not evidence**, and the bootstrap, which cuts
its worlds from the same 32 years, inherits that. The page will say so beside every probability, as H3a does.
Without an apartment and with assumed inflation a plan can start as early as its assets allow (SPY: 1993).

### What is reported
- **Fixed amount:** P(it lasts T), with a tie-free definition (the last month paid in full); the distribution of
  the depletion month; a **survival curve** (the share of realizations still paying, by year); what is left at T
  (percentiles, real).
- **Percent:** the income by year as a fan (5, 25, 50, 75, 95 %), the lowest real monthly income of each
  realization, what is left at T.
- **Both:** total taken (real), tax paid, the worst drawdown of the balance (`risk.max_drawdown`).
- **The sustainable amount:** the largest fixed starting amount that lasts T in a chosen share of the realizations
  (95 % by default), by bisection as the breakeven rates are found: lasting is monotone in the amount.
- **Sequence risk, shown:** the same realization with its months in reverse order. Under the percent rule what is
  left is the same; under a fixed amount it is not.

## Tax and market facts used (parameters, with source and date)
Defaults to start from, each a field. **Not tax advice.**

| Fact | Value | Source, read 2026-11-27 | State |
|---|---|---|---|
| Capital gains, individuals, securities | 25 % of the real gain | PwC Tax Summaries, Israel | already a field |
| Inflationary part of a gain | exempt (the real gain is taxed) | Income Tax Ordinance §88, via secondary sources | the "real" base |
| Losses | offset gains, carried forward | PwC Tax Summaries | new: the carried loss |
| Order of sale of identical securities | first in, first out | a Bank Leumi explainer; a 2002 Tax Authority circular (not read) | **weak source**; only needed for lot-exact tax (J4) |
| Surtax on high incomes | 3 %, plus 2 % on capital income, above ILS 721,560 a year (2025) | PwC; Globes | **verify with the Tax Authority**; a field, off by default |
| Rent: exemption ceiling | about ILS 5,654 a month (2026) | press and CPA summaries | **verify with the Tax Authority**; the rent tax stays one rate field |
| Rent: flat track | 10 % of the gross rent | the same | the existing field's default |

What the literature says, as context for the learn page and not as engine rules: a fixed, inflation-indexed amount
is the classic "4 % rule" (Bengen 1994; the Trinity study 1998 turned it into success rates); the same rate was much
less safe outside the United States (Pfau 2010); rules that cut the amount after bad years allow a higher start at
the price of an income that moves. Those numbers are for US data and are not carried into the Planner.

## Architecture
- **`app/planner/withdraw.py`** (new, pure): the account state per asset (units, basis), the carried loss, the two
  rules, the net-to-fraction solve, depletion. The state is a few arrays, so it is **vectorised over the
  realizations**: one loop over the T months, each step on all worlds at once. Target: 1,000 worlds of 30 years in
  about a second.
- **`app/planner/home.py`:** two optional fields for an owned apartment's cost and purchase day; a helper for the
  cash an owned apartment gives and takes each month.
- **Reused as they are:** `market.growth` (dividends and their tax), `Fees`, `Taxes`, `inflation.CpiPath`,
  `paths` (worlds), `scenario_data` (windows, panels), `risk` (percentiles, drawdown), `study.effective_samples`.
- **API:** `POST /planner/withdraw` (one plan: summary, a row per month, the two tax bounds), `…/withdraw/study`
  (windows) and `…/withdraw/simulate` (worlds). Errors and warnings as in Phase H.
- **Frontend:** a fourth tab, **Withdraw**: the starting capital, the cost share, the rule, the horizon, the
  apartment's role; the cards, a chart of the balance and the income, a table by year, CSV; then the study and the
  simulation sections. The state joins the saved scenarios (a new state version with a reader for the old one).
- **Learn page** `withdrawals`, by ADR 0025's rules: its sections, a symbol table after every formula, the worked
  example pinned to the engine.

## Verification (known answers before the code)
- **An annuity in reverse.** A fixed amount from an asset that grows at a constant rate, with no tax: the balance
  after k months and the depletion month are `mortgage.annuity()`'s closed forms.
- **The floor.** With c = 0 and no fees, net = (1 − τ) × gross every month.
- **The ceiling on a flat asset.** With c = 1 and no growth, no tax is ever paid.
- **Order does not matter for a percent rule, and does for a fixed amount** (a hypothesis property test): the
  months of a path permuted leave the percent rule's end balance unchanged.
- **Conservation.** Every month: balance before = net paid + tax + fees + balance after; the basis never exceeds
  what was bought.
- **A golden scalar loop** of one plan (all months, `rtol=1e-9`), and the vectorised run of N worlds equal to N
  scalar runs.
- **Windows and worlds:** a window at shift 0 is the plan itself; history resampled in its own order reproduces
  the unshuffled run, as in H3b.
- **API, Vitest, E2E** on the synthetic e2e data, and the CI's Windows job checked after every push.

## Rounds
| Round | Content | Size |
|---|---|---|
| **J0** ✅ 2026-11-27 | The engine for an account: one lot per asset with a cost share, the two rules, net in hand, losses carried, depletion; the golden model and the known answers; `POST /planner/withdraw`; the Withdraw tab with the cards, the balance and income chart, the table and CSV; the two tax bounds on the page. | M |
| **J1** ✅ 2026-11-27 | The apartment in the balance: an owned apartment's cash flows, its three sale options and a forced sale, at most one mortgage track, the cost fields for betterment tax. | M |
| **J2** | Many realizations: windows of history and the simulated worlds; the survival curve, the depletion histogram, the income fan; the sustainable amount by bisection; the sequence-risk view; the evidence-depth notes. | L |
| **J3** | The learn page with its pinned example; the tab in saved scenarios; a UX pass. | S |
| **J4** (optional) | Lot-exact tax when the capital comes from a Market-tab plan (accumulate, then withdraw; first in, first out), after the order-of-sale rule is confirmed from a primary source; two withdrawal plans side by side. | M |

Order: J0 → J1 → J2 → J3. After J0 the tab already answers the user's core question for a market account. Each
round: the tests before the code, the cleanup pipeline, a demo checklist, and a stop.

## J0 results (2026-11-27, ADR 0026)
- The engine is a loop over months on a month grid, with the fraction for a net amount in closed form. It is not
  vectorised over realizations yet: one plan is three runs (the cost share and its two bounds) in well under a
  second, and J2 decides what its worlds need.
- With nothing withdrawn the engine ends where the Market tab's account does, dividends and the real base included.
- Chosen without asking: the first withdrawal is a month after the start; the fee, the sale and its tax are one
  event on the month date; an assumed return is an effective yearly rate in nominal shekels; less than half an agora
  is neither a balance nor a shortfall; the chart is in shekels of the first day by default, with a switch.
- Not in J0, as planned: the apartment (J1), many realizations (J2), the learn page and the tab in saved scenarios
  (J3).

## J1 results (2026-11-27, ADR 0027)
- The engine takes the apartment as two arrays (its cash and what its sale would leave) from `run_home`, so it knows
  nothing of rent, loans or betterment, and the J2 worlds can feed it the same way.
- A golden scalar model matches the engine across the three roles and both rules, with random cash and worth.
- One expectation was wrong before the code ran, not the engine: after a forced sale the apartment's costs stop too.

## Later, if wanted
Pension and study funds with their own tax rules; an annuity against a lump sum; age-based and guardrail rules;
selling the overweight asset first; a loan against the apartment; several accounts with an order of withdrawal.

## Risks
- **Thin history** for long horizons (the table above). The page must not let 1,000 worlds read as 1,000 samples.
- **The cost share is a guess** the user makes. The two bounds are always shown so the guess cannot hide.
- **Tax rules change**, and two of the facts above are unverified. They are fields with a date, not law.
- **A percent rule looks safe** because its withdrawals alone never end it. Its risk is the income, and the page must lead with it.
- **Monthly sales at the close** ignore intraday prices and the spread; the sell commission field stands for both.

## Decided by the user (2026-11-27)
The six questions of the plan, all at their defaults:
1. **The fixed amount** is what reaches the hand after tax.
2. **A fixed amount** rises with the CPI, with a switch.
3. **The percent** is of the account's value (not of the net worth with the apartment).
4. **The apartment's role** (J1): kept with its rent only, sold on a date, or sold when the account is empty.
5. **Two withdrawal plans side by side:** in J4 only.
6. **The mix** is the Market tab's.

Asked before J0:
- **The percent is what is sold**; the income is what is left after tax and costs.
- **An assumed yearly return** is added already in J0, beside the Market tab's mix.
- **The default cost share is 50 %**, with both bounds always beside it.

Asked before J1 (2026-11-27), all at the recommended answer:
- **Where the apartment is typed:** a short section of its own in the Withdraw tab, for an apartment already owned
  (its value today, its use, its costs, what is left of its mortgage, its role). The Apartment tab is not read: its
  form describes a purchase.
- **Its mortgage:** none, or one track (what is left, its rate, the months left, linked to the CPI or not). No prime
  or variable track, so no Bank of Israel rate path.
- **Betterment tax:** the Apartment tab's default, a single home exempt up to the ceiling, or 25 % of the real gain;
  with two optional fields, what it cost and when it was bought. Without them the cost is its value on the first day
  and it was bought then: only the growth from the start is taxed.
- **A kept apartment whose costs the account cannot pay** is sold that month (a forced sale), with a warning.

## J1: the conventions (chosen without asking, each stated on the page or in ADR 0027)
- **Cash only.** Each month the apartment gives `rent received - mortgage payment - owner costs`: the rent after
  vacancy and its tax when rented out, nothing when the owner lives in it. The rent follows the CPI.
- **The month's order.** The apartment's cash and the account fee come first; the withdrawal is what is left.
  - Fixed rule: the account sells what the amount, the fee and the apartment's shortfall need. A surplus of rent over
    all of that is invested in the account at the plan's weights, a new lot at cost (with the buy commission, as
    an H1 deposit).
  - Percent rule: the account sells p/12 (more only when the fee and the apartment's shortfall need more); the
    income is that sale's net plus the apartment's cash. So the J0 claim, that the balance does not depend on the
    cost share, holds only while the apartment's shortfall is paid by the p/12 sale; it is stated that way.
- **The three roles.** Kept: sold only when the account cannot pay the fee and the apartment's shortfall (a forced
  sale); a short withdrawal alone does not sell it. Sold after a number of years. Sold when the account cannot pay
  the month in full (the withdrawal included).
- **A sale** on month k: the value less the selling costs, the loan's balance and its early-repayment fee, and the
  betterment tax: `run_home`'s net worth of that month. It enters the account at the plan's weights as a new lot at
  cost, with the buy commission, before the month's sale of units.
- **Its value** grows by an assumed yearly rate, or by the national dwelling index over history.
- **Depletion** is the first month the rule could not be kept: a fixed amount not paid in full (as in J0), or under
  a percent rule an account empty with no apartment left. The sale month and its cause are reported for each of the
  three cost-share runs, which may differ.
- **The capital may be zero** when there is an apartment.
- **What is left** is the account plus the apartment's net worth while it is held.
