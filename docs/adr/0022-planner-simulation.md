# ADR 0022 — The planner's simulation: worlds, block bootstrap and the risk metrics

- Status: Accepted (2026-11-26)

## Context
H3a compares two options on the plan as entered and on every start history allows. History is short: about 1.6
independent 20-year terms since the dwelling index begins. H3b runs the same plan in many simulated worlds and
measures how risky each option is. The user's choices before the round:
- in a resampled world the Bank of Israel rate's **level travels with its block**;
- a modelled market's mean and volatility are **estimated from the mix's history and editable**, with a
  correlation between a modelled apartment and a modelled market; a single apartment's own volatility is deferred;
- a **histogram with draggable handles** a and b already in this round;
- **payment stress** with a monthly net income that rises with the CPI.

## Decision
- **A world, then the plan** (`app/planner/paths.py`). A world is one realization of every series a plan depends
  on, on the plan's month dates. It is drawn from the seed and the world's number alone, each kind of draw from
  its own stream and always for the longest plan allowed. So both options see the same world, a longer plan sees
  the same world further, fewer worlds are the first of the same worlds, and H3c can change one input against the
  same worlds.
- **One rule for both methods.** A series its tab marks "historical" (the dwelling index, the Bank of Israel rate,
  the CPI) is resampled from history; one marked "assumed" is drawn from its model, whatever its "draw a path" box
  says. The method decides only the market: *block bootstrap* resamples the mix's assets, *Monte Carlo* replaces
  every mix by one modelled asset in shekels.
- **Block bootstrap.** History is a panel of the months all the resampled series share: each series' growth over
  the month, and the rate's level in it. A world strings together blocks of 12 consecutive months (a parameter),
  each starting at a month drawn evenly; a month of the world is one month of history for every series at once, so
  what moved together stays together and trends shorter than a block survive.
  - The rate is a level, not a growth: the level of a month travels with its block. High inflation then comes
    with the high rate it had; the price is a jump where two blocks meet, which the page states.
  - An asset is three series (price, dividend factor, shekel rate), so the dividend tax still applies; resampling
    adjusted prices would drop it and the bootstrap would beat history on the same data.
  - Fewer than 24 shared months, or fewer than a block, refuse the simulation with the range found.
- **Models.** A modelled series is lognormal with a yearly mean growth μ and a yearly log-volatility σ; its monthly
  log step is ln(1 + μ)/12 − σ²/24 + (σ/√12)·z. The −σ²/24 makes μ the *expected* growth at any volatility: the
  convention the apartment's assumed value already had, so the two sides mean the same by "mean".
  - The market's μ and σ are estimated from the first account's mix (in shekels, with dividends, weights restored
    every month): σ = s√12 and μ = e^{12(m + s²/2)} − 1 from the monthly log growths' mean m and variance s².
  - A modelled apartment's shocks are ρ·z_market + √(1 − ρ²)·z_own. The correlation applies only between two
    modelled series; with a resampled market the months are history's own.
  - A modelled market pays no dividend tax (its growth is the total return); a warning says so.
- **Daily bars.** The market account buys on days, so a world's prices and shekel rates grow evenly between two
  month dates and dividends are paid on the month dates. History resampled in its own order reproduces the
  unshuffled run to 1e-9.
- **A world goes through the same builder as history** (`scenario_data.build`, `home_series`): the world's CPI is
  the plan's, its assets replace each mix, and each apartment takes its value index and its anchor rate from it.
  The linear rule is off and the rates follow, as in a window: by the world's rate on the purchase day minus the
  last published one.
- **Layer 2 of the metrics** (`app/planner/risk.py`) is pure functions on arrays, so they serve any set of
  realizations:
  - the bad tail: percentiles, CVaR 5 % (the mean of the worst ⌈0.05 n⌉ values), P(end below the money put in);
  - regret: max(other − chosen, 0), its mean and 95 % percentile;
  - stochastic dominance, first and second order, by the order statistics and their running sums; the samples are
    compared as they are, so sampling noise in a tail can break a dominance that holds in truth;
  - the certainty equivalent under CRRA utility (γ = 2 by default), undefined when any world ends at zero or less:
    reported as ruin, with its probability;
  - Sharpe and Sortino of yearly net-worth returns with the money put in taken out (modified Dietz), against zero.
- **Risks along a path** (`study.outcome`) come from what a run already returns, with no re-run per month:
  - net worth on the way is before any exit cost or tax, on one basis for both options: the apartment's value less
    its loan, plus the account's market value;
  - negative equity: the value below the loan in some month; payment stress: the highest payment over the income
    of its month; time under water: the share of months an account is below its deposits; the max drawdown of the
    net worth, a net worth below zero counting as zero;
  - the first year's return is charged the purchase costs: its starting point is the money put in so far.
- **The interval on P(a ≤ X ≤ b)** is the Wilson score interval of the simulation's own error. It shrinks with more
  worlds and says nothing of how little history they are cut from, so the months resampled and the independent
  terms they hold are shown beside it.
- **API.** `POST /api/planner/simulate`: the scenario of `/planner/run` plus the method, the worlds (1,000 by
  default, up to 10,000), the seed, the block length, the market model, the correlation, the income and its share.
  It returns who wins, the dominance, each option's distributions and risks, and the end values of every world for
  four measures, so the page counts any interval without another request.
- **The page.** The Compare tab gets a Simulation section and a Simulate button. The two distributions are two
  panels on one axis (small multiples, each named, in the app's two validated series colours), not overlaid bars.
  The handles a and b are sliders: they drag, move with the arrow keys (Shift for bigger steps, Home and End) and
  are set exactly from two fields. The axis is the middle 99 %; the tails are in the end bars, and a handle on an
  end counts its tail.

- **What the review settled.**
  - An option with an apartment is followed on the apartment's month dates from the purchase, its account's value
    on each being that of the last month end; an account alone is followed on its month ends.
  - The estimated market includes a price-only asset's assumed dividend yield.
  - The income of the payment stress rises from the scenario's first day; a partial last year is left out of the
    yearly returns.
  - Half a market model (a mean without a volatility) is refused; a modelled market warns about the "currency" tax
    base, and a correlation with no assumed apartment value to tie warns that it has no effect.
  - The block length is shown under both methods: it cuts whatever is historical.
  - An estimate fills the mean and volatility fields, so editing starts from it.
  - Where the two handles meet, a drag to the left moves a (b is on top and cannot go left); the handles keep
    their place in the document, so a focused one stays focused.

## Verification
- **Each metric before its code**, against arithmetic done by hand: percentiles, CVaR, the shortfall, regret (zero
  for identical options), dominance of X + c over X and of the same mean with less spread, the harmonic and
  geometric means as certainty equivalents, drawdown, Dietz returns, Sharpe and Sortino; the Wilson interval.
- **Worlds:** blocks are runs of consecutive months; every series of a world month comes from the same month of
  history and the rate's level with it; the model's mean is the expected growth (40,000 draws) and matches the
  apartment's path to 1e-12 on the same shocks; the estimate returns the model's parameters; a world depends only
  on the seed and its number.
- **Known answers for the whole pipeline:** a modelled market without volatility is a constant return; history in
  its own order reproduces the unshuffled run, dividend tax included; a correlation of 1 with equal parameters
  makes the apartment's path the market's; the world's rate reaches the tracks.
- **API and page:** the response adds up against its own samples (P, medians, the shortfall equal to the share of
  negative returns); Vitest for the statistics, the histogram's keyboard and fields, the results and the form; a
  Playwright run that drags a handle.

## Consequences
- The default request (1,000 worlds, three tracks) takes about 6.5 s for a 10-year plan and 9 s for 20 years on
  the e2e data; the page waits without a timeout and without a progress report yet.
- The e2e dwelling index and CPI grow at a constant rate, so joint variation is tested on built panels, not
  through the API.
- H3c changes one input at a time against the same worlds (decomposition, sensitivity); H4 adds charts of the
  paths and saved scenarios.
