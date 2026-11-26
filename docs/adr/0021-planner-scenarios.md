# ADR 0021 — The planner's scenarios: two options on the same money

- Status: Accepted (2026-11-26)

## Context
H1 built the market account and H2 the apartment, each on its own. H3a compares them: the same money, at the same
dates, in two options, for one plan and over history. The user's choices before the round:
- the basic comparison is an apartment against the stock market, and the engine is general: each option may hold an
  apartment, a market account, both, or neither (the user: "another apartment and another investment");
- an option that spends less invests the difference in the market;
- in windows of history, the tracks' rates follow the Bank of Israel rate, as a switch;
- in windows of history, the betterment tax's linear rule is off;
- a Compare tab already in this round, with a coloured win map.

## Decision
- **An option's own spending.** An apartment spends the equity and the purchase costs on the purchase day, and on
  each month date the payment plus the owner costs minus the rent (saved or received); a market account spends its
  deposits. A month whose rent exceeds its costs spends a negative amount.
- **The same money.** On every day before the end both options spend the budget
  b(d) = max(f_X(d), f_Y(d), 0), and each invests b(d) minus its own spending in its market account (in the other
  option's mix when it names none). So:
  - an empty option is a *mirror*: it invests everything the other option costs, when it costs it;
  - a month of surplus is invested by the option that has it, and nobody takes cash out before the end;
  - the two ledgers of money put in are equal day by day. This is the mirror's definition, and what the golden
    model checks.
  - Flows on different days do not offset each other: both options then spend both. The API warns when this adds
    more than 0.5 % to the money put in. Matching by month instead would weaken the day-by-day equality.
- **The end.** Every apartment and every account is sold on one day, and all apartments must be sold on it. That
  day's own flows are settled in cash, not invested: an option's end value is the apartment's net worth, plus the
  account's value after its tax, minus that day's spending. `run_market` does not take a deposit on its end day,
  and this keeps it unchanged.
- **The return** is the XIRR of the budget going out and the end value coming in. The outflows are equal, so the
  higher end value is the higher return. Real results divide every flow by the CPI's rise since the first day.
  An option that ends with nothing or with a debt (an apartment sold below its loan) has no such rate: its return
  is reported as −100 %, so a wiped-out window counts as a loss in the medians and in the win map.
- **One CPI path per realization** serves the linked tracks, the indexed costs, the real tax bases and the real
  results of both options.
- **Layer 1 of the metrics** (`app/planner/study.py`) takes a callable that runs one pair, so rolling history now
  and resampled or simulated paths later (H3b) use the same code:
  - P(X > Y) over paired end values, a tie counting as half (two identical options score 0.5);
  - the median difference, nominal and real, and the median yearly return of each option;
  - the effective number of independent terms, (span + term) / term: overlapping windows are not independent;
  - breakeven rates by bisection on the difference of the end values, for the apartment's appreciation, the market
    return, the mortgage rates and the rent; "none" when the difference has one sign over the whole range;
  - the win map: a start every year by a set of horizons;
  - the net worth averaged over the exit months, on the plan as entered.
- **A window of history** (`app/planner/scenario_data.py`) moves every date by whole months and:
  - refuses a series that would be held flat past its last published value (one plan alone only warns);
  - needs every asset's bars from the window's first day, so the youngest asset limits the starts, as in H1;
  - turns the linear rule off: it depends on the calendar date 2014-01-01, and a window stands for a plan that
    starts today;
  - with the switch on, adds to the rate of a fixed or variable track that is not CPI-linked the move of the Bank
    of Israel rate between the plan's own purchase day and the window's. The user's rates belong to their own day;
    a 4 % fixed loan in 1994, at a Bank of Israel rate above 10 %, would make every early window win. Prime tracks
    follow the rate by themselves; linked tracks keep a real rate. It needs historical rates for the apartment.
  - keeps the same shekel amounts in every window, so the ratios (tax to price, rent to price, fee to deposit) are
    the plan's own. There is no historical rent series: the rent yield is the same in every window.
- **Breakeven inputs.** One input is replaced: a constant yearly growth for every apartment's value; one asset
  growing at a constant yearly rate in shekels for every account; a constant added to every track's rate; a
  multiple of every rent. The market-return breakeven need not be unique, because an apartment's surplus is
  invested in the market too.
- **API.**
  - `POST /api/planner/run`: both options' end values and returns, the breakeven rates, the time average.
  - `POST /api/planner/study`: the windows, their summary, why the starts before and after them cannot run, and the
    win map. Both take two options, each with an optional apartment and an optional market account.
  - The market and the apartment requests share their option models (`MarketOptionIn`, `HomeOptionIn`); a macro
    series is loaded once per request.
  - Deposit times of day are not used in a comparison (a warning says so): each deposit buys by its day's bar.
  - Nothing is left out silently: deposits on or after the sale, exit months the time average could not run, and
    the warnings of every window of a study are in the response's warnings.
  - A study's starts are cut to history (1900 to today); a plan shorter than a month cannot be studied.
- **The page.** A third tab, Compare: the Apartment tab's apartment against the same money in the Market tab's mix,
  with a switch that gives the apartment's side the Market tab's deposits too (A+B). Two forms for two free options
  wait for H4. The win map tints each cell by the gap of the yearly returns; the sign carries the winner too.

## Verification
- **Hand answers** on assets that grow at a constant rate: at a zero return the mirror ends where the apartment
  does; the mirror of a constant return earns exactly that return; a surplus month, the cheaper option's top-up and
  flows on different days by hand.
- **A golden model** of the pair (three seeds): a plain loop over dated flows, each account valued by H1's
  day-by-day golden model of the market account; the end values agree to 1e-9, and on every day each option's own
  spending plus its top-up is the budget.
- **Each metric before its code:** P = 0.5 for identical options and by a hand count; the effective terms; a
  breakeven that reproduces equality; the breakeven appreciation of an apartment bought outright equals the
  market's return (to 1e-5: months against calendar days); the win map's cells; the time average by hand.
- **Windows:** what moves with a shift and with another horizon; the rate move from a stepped Bank of Israel
  series; the linear rule's exact share of the tax; every refusal with its reason.
- **API and page:** the run against `/planner/home` for the same apartment; the first and last window from the
  data's edges; Vitest for the tab and the map; a Playwright run over the synthetic e2e data.

## Consequences
- A study of 20-year plans over all of history is a few hundred pairs at about 8 ms each: a few seconds.
- The time average re-runs the pair for about 60 exit months, so the H1 engine needs no after-tax value path.
- H3b adds resampled and simulated realizations and layer 2 on the same `study` functions; H4 adds the forms of a
  free second option, the charts and saved scenarios.
