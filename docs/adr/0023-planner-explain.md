# ADR 0023 — The planner's layer 3: what the answer depends on

- Status: Accepted (2026-11-26)

## Context
H3a says which option ends ahead and H3b how risky each is. H3c says what that answer rests on: where the
apartment's return comes from, how far each input moves the result, when the lead changes hands, what a forced
sale costs, and whether holding both lowers the risk. The user's choices before the round:
- the apartment's return is shared between its sources so that the shares **add up** (the Shapley value), not by
  switching one source off at a time as the plan first said;
- the benefit of combining is the **same money split** between the two options over the simulated worlds, with the
  historical correlation beside it;
- the sensitivity is measured **on the plan as entered**, on every Compare;
- the page gets tables, a tornado chart **and a chart of who leads over time**, which was H4's.

## Decision
- **The apartment's return by source** (`app/planner/explain.py`). Four sources can each be switched off:
  appreciation (the value stays at the price), rent (none), leverage (bought in cash), and costs (no purchase tax,
  lawyer, broker, renovation, maintenance, insurance, selling cost, early-repayment fee, betterment tax, vacancy or
  rent tax). With all four off the apartment is bought and sold at one price and earns exactly nothing.
  - A source's contribution is what it adds to the yearly return (XIRR, nominal, of the apartment alone) when it is
    switched on, averaged over every order of switching the four on. The four add up to the return, with no
    remainder: 15 runs of the apartment.
  - One-at-a-time does not add up because leverage multiplies whatever the others earn. The price of adding up is a
    harder reading: the mortgage's share can be negative even when borrowing pays, because it also averages the
    orders in which the apartment does not yet earn its rent or its appreciation and a loan only costs. The page
    says so.
  - An apartment that ends with nothing or a debt counts as −100 %, as in the comparison.
- **Sensitivity** (`scenario_data.sensitivity`). Each input the scenario has is moved down and up by a step and the
  change of "x minus y" at the end is reported: appreciation and market return by 1 point a year, the mortgage
  rates by 1 point, the rent by 10 %, the capital-gains and betterment tax rates by 5 points.
  - A move *tilts the path in use*, it does not replace it: the value index is multiplied by (1 + d)^(k/12) and
    every asset's price by (1 + d)^(days/365.25), whether the path is history, a model or a world. (The breakeven
    rates replace the path by a constant one; that is another question.) A move of nothing is the plan itself.
  - Both directions are computed: a rate does not go below zero, so a move down is not the mirror of a move up.
  - A tax rate is held inside 0 to 100 %; a custom betterment bracket table is not moved.
- **Who leads, and from when.** On the exit months the time average already runs (about 60, the step stated): the
  share of exits x ends ahead, and the first exit after which the leader at the end stays ahead. A tie at the last
  exit has no leader. A re-run per month would be exact and sixty times dearer.
- **Liquidity.** At the end: the account after its tax is cash at once; the apartment in a normal sale; and in a
  forced sale at a discount (10 % by default, a field). The betterment tax is recomputed on the lower price, so the
  loss is the discount less the tax it saves. Each exit month also gets the forced-sale end value, for the chart.
- **Do the two move together.** The correlation of the *yearly* returns of the dwelling index (the apartment's own
  when it follows one, the national one otherwise) and the mix in shekels, with Fisher's interval and the number of
  years. Monthly returns of a smoothed monthly index would read near zero whatever the truth. Fewer than four
  years, or a series that does not move, give none.
- **The same money in both** (`risk.split`, in a simulation). Both options put in the same money, so a share w of
  it in x ends at w·X + (1 − w)·Y in each world: the median, the 5 % percentile and CVaR 5 % for w = 0, 25, 50, 75
  and 100 %. A middle row with a better tail than both ends means holding both lowers the risk. An indication only:
  half an apartment cannot be bought, and fixed fees and tax brackets do not scale.
- **API.** `/planner/run` adds `decomposition`, `sensitivity`, `lead`, `liquidity`, `correlation` and the
  forced-sale value of every exit point, and takes `forced_discount_pct`; `/planner/simulate` adds `split`. A run
  takes about a second.
- **The page.** Under the breakeven rates: the return by source (a table), the moves (a tornado chart, the largest
  effect on top, with the same numbers in a table), who leads (cards, and a line chart of both options' end value
  by exit month with the forced sale dashed and the month of the lead marked), and the liquidity table. The
  simulation gets the split table.

- **What the review settled.**
  - With appreciation off, a rent that follows the value stays flat too: its rise is part of the appreciation,
    and the tornado already moved the two together.
  - A return that does not exist is not turned into a number: an apartment bought with no money down (or one whose
    rate is beyond what XIRR searches) has no decomposition, where it used to show shares of hundreds of points.
  - The correlation reads the national dwelling index even when the apartment's value is assumed. That is a new
    dependency of `/planner/run` on a macro series; when it is unavailable the correlation is left out, after the
    macro service's own retries.
  - The forced sale's label shows the discount as typed; the lead chart marks whole years (months on a plan under
    four years), keeps the two names apart, and only the chart with handles takes the touch for itself.
  - The parsers reject a response without the new fields, so an older backend gives an error, not a blank page.

## Verification
- **All the round's tests were committed before its code** (`892c80f`), hand arithmetic first: the Shapley value of
  a two-player game by hand; everything off earns nothing; an apartment bought outright earns its appreciation and
  the other three exactly nothing; the four add up to `run_home`'s return to 1e-12; a forced sale without a
  discount is the sale, and with one loses the discount less the tax saved; the lead by hand, with a tie; a
  correlation of 0.6 with its interval by hand; the split at its ends and for two mirrored options.
- **Moves:** a drift on a historical index gives exactly (1 + d)^10 over ten years; a market drift exactly
  (1 + d)^years on one deposit; a rent that follows the value follows the drift; the tax shift moves both taxes by
  hand; the rate floor makes a move down smaller.
- Three expectations were corrected after the code ran: a sign claimed for the mortgage's share (it has none, see
  above), and two fixtures that did not describe what their test meant.
- **API and page:** the response adds up against itself; Vitest for the tornado, the lead chart and the tables; a
  Playwright run through the new section with the discount set to zero.

## Consequences
- The Compare tab now holds the lead chart, so H4 keeps the forms of a free second option, saved scenarios and CSV
  export, and can add paths of single worlds.
- The sensitivity and the decomposition are of the plan as entered; over worlds they would cost about ten
  simulations and are not done.
