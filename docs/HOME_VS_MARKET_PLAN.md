# Phase H — Home vs Market: plan (2026-11-26)

The user's goal: compare buying an apartment with investing in the stock market, alone or together, on the same
money, with history and with statistics. This phase runs **before Phase 4** (the user's choice). Phase 4 and 5 keep
their numbers.

## What the user asked for (summary)
- **Market side:** a mix of symbols (S&P 500 by default; e.g. 60 % S&P 500, 30 % Nasdaq, 10 % Apple), deposits on
  chosen dates (one-off, or recurring such as 2,000 ₪ a month for 10 years), with or
  without the USD/ILS rate (with: shekels are converted to dollars at each deposit and back at the end; without: the
  asset is treated as if it were priced in shekels). Accurate to the day, to the hour where possible.
- **A table per deposit:** buy price, sell price, gross and net profit (capital-gains tax, 25 % by default and
  editable).
- **Statistics:** many realizations of the same plan (e.g. 10,000 once plus 1,500 a month for 20 years, the first day
  anywhere from 1990-01-01 to 2000-01-01), a histogram of the final amounts (or of the annual net return) and the
  probability that the result lies between a and b.
- **Apartment side:** appreciation as a historical index or an assumed mean and variance, equity and mortgage, a mix
  of up to three tracks (Spitzer, equal principal, grace, balloon), the monthly payment of each track shown, the net
  worth at any time t (in the middle of the mortgage or after it) = assets − liabilities.
- **Modes:** apartment only, market only, or both together (A/B and A+B), each with its full set of inputs.
- **Rent:** a switch per scenario, **live in it** (the rent saved counts) or **rent it out** (rental income).
- **Metrics:** the final value and the average annual growth to t, plus proposals for more (below).

## Data (checked from this environment on 2026-11-26)
| Series | Source | Frequency | From | Use |
|---|---|---|---|---|
| USD/ILS official rate (`EXR/RER_USD_ILS`) | Bank of Israel SDMX API | daily | 1976 (sparse back to 1954) | the fallback before Yahoo's `ILS=X` (the planner's FX, H0) |
| Consumer price index, general (`PRI/CP`) | Bank of Israel (CBS data) | monthly | 1951-09 | optional: the "historical CPI from 1994" inflation mode (the default inflation is assumed, below) |
| Dwelling price index, national, quality-adjusted (`REAL_ES_DF/IND_FLT_M`), and by district (`IND_FLT_TELAVIV_M`, `…_CENTER_M`, `…_HAIFA_M`, `…_JERUSALEM_M`, `…_NORTH_M`, `…_SOUTH_M`) | Bank of Israel (CBS data) | monthly | 1994-01 | the historical apartment value |
| Mortgage rates by track (`BIR_MRTG_99`, about 114 series) | Bank of Israel | monthly | (to map in H0) | historical rates of new mortgages per track |
| Bank of Israel interest rate (`BR`) | Bank of Israel | — | (to map in H0) | prime = BoI rate + 1.5 % |
| Stocks and indices | the existing `BarService` (Yahoo) | daily (1h for the last ~2 years) | per symbol | the market side |

Notes:
- `^GSPC` on Yahoo is a **price** index (no dividends). A total-return series is needed for an honest market side:
  `SPY`'s adjusted close (dividends reinvested) from 1993, and for earlier starts a total-return index such as
  `^SP500TR`. Its depth on Yahoo is **unverified from here** and will be checked on the user's machine in H0. The same
  goes for a TA-125 series (`^TA125.TA`).
- The dwelling index is monthly, so the apartment side moves monthly (linear inside the month for daily dates).
- The BoI's official rate is fixed around midday in Israel, before the US close. A deposit on day d uses that day's
  rate and that day's close. The gap is a few hours, stated in the UI.
- Tests never touch the network: every series gets a committed CSV snapshot as a fixture.

## Architecture
- **`app/macro/`**: a small source for **macro series** (one value per date, not OHLC bars, so not a
  `DataProvider`). It has a `BoiSource` (SDMX CSV), its own cache table `macro_series(series, date, value)` in
  `bars.db` with the same freshness and rate-limit rules (token bucket, backoff, stale-while-error), and an offline
  fixture source. ADR 0018.
- **`app/planner/`**: pure functions, every formula in the docstrings:
  - `deposits.py`: schedules (one-off dates, recurring: amount, every month on day d, for N years, optional yearly
    indexation to CPI).
  - `market.py`: lots, FX, fees, taxes, liquidation value at t.
  - `mortgage.py`: tracks and amortization tables.
  - `home.py`: value path, purchase and owner costs, rent, sale.
  - `scenario.py`: modes A, B, A+B and the mirrored cash flows.
  - `stats.py`: realizations, XIRR, metrics, histograms, interval probabilities.
- **API:** `POST /planner/run` (one scenario → tables and paths), `POST /planner/study` (many realizations →
  distributions and metrics), `GET /macro/series/{id}`. Saved scenarios in a `DocumentStore("scenarios")`.
- **Frontend:** a separate **Planner** page (a top-bar button switches between the chart and the planner; the chart
  state is kept), with its own components and store. Charts reuse `DistributionChart` and the SVG style of the
  volatility cone. The app UI stays English. ADR 0019 records the conventions below.

## Conventions (defaults, each open to change)
**Market side**
- **The asset mix:** S&P 500 by default (total return), or any mix of universe symbols with weights summing to 100 %.
  Each deposit is split by the weights. **No rebalancing** by default; a yearly rebalance is an option, and its
  sales realise gains that are taxed when they happen.
  - Each symbol is marked price-only (`^GSPC`, `^NDX`) or total return (an adjusted close such as `SPY`, `QQQ`).
  - The feasible start range is the latest inception date in the mix (QQQ starts in 1999); the UI shows it.
- **The fill price** of a deposit (the section below explains the model): the day's **close** by default; options are
  the open, a known time of day, the expected price at an unknown time, and a random time drawn from the model.
- **With FX:** units = ILS ÷ rate(d) ÷ price(d); value at t = units × price(t) × rate(t). **Without FX:**
  units = ILS ÷ price(d), value = units × price(t).
- **Fees** (all 0 by default, each editable):
  - **deposit fee (%):** taken off each deposit before it buys;
  - **buy and sell commission (%):** added to the cost basis at a buy, taken off the proceeds at a sale, so they lower
    the taxable gain;
  - **yearly management fee (%):** accrues monthly on the value and is paid by selling units;
  - **monthly account fee (₪):** paid from the account by selling units (the user's choice), so the deposits stay as
    planned and the fee shows as a lower value.
- **Dividends:** reinvested through the adjusted close (total-return series). A dividend tax drag (e.g. 25 % of the
  yield) is an option, off by default.
- **Tax:** at the sale on t, on the **sum of the gains of all lots** (a loss in one lot offsets gains in another), at
  25 % by default (editable). The base is the **nominal** gain in shekels by default, or the **real** gain (the cost
  indexed by the model's CPI, below). The UI states that this is a model and not tax advice.
- **The table per deposit:** date, ILS in, fees, rate, fill price, units, value at t, gross gain, its share of the
  tax, net gain.

### The fill price inside a bar (the user's f(t) question)
Inside a bar the data gives only f(0) = O, f(1) = C, max f = H and min f = L. The model: the (log) price inside the
bar is a driftless Brownian motion. Normalised to the bar's range, the path's shape given u = (O − L)/(H − L) and
v = (C − L)/(H − L) does **not** depend on the volatility (Brownian scaling). So the conditional law of f(t) given
(O, H, L, C) is a table over (u, v, t), computed once by simulation.

A first simulation (2026-11-26: 400,000 paths of 390 one-minute steps, a separate 200,000 for testing) measured each
estimator's error in units of the bar's range:

| What is estimated | Estimator | RMSE |
|---|---|---|
| The price at an unknown time (the bar's time-average) | close or open | 0.33 |
| | (O + C)/2 | 0.19 |
| | OHLC4 = (O + H + L + C)/4 | 0.12 |
| | **(H + L)/2** | **0.073** |
| | the conditional table over (u, v) | 0.069 |
| The price at a known time t (0.25, 0.5, 0.75) | linear from O to C | 0.29–0.32 |
| | (H + L)/2 | 0.23–0.24 |
| | **the conditional table over (u, v, t)** | **0.21** |

Notes:
- HLC3 = (H + L + C)/3 is biased on trending bars (0.63 instead of 0.50 on a bar that rose from near L to near H).
- **The price at a uniformly random time** has a standard deviation of about 0.23–0.27 of the range, with 90 % of it
  between 0.08 and 0.92. A uniform draw on [L, H] (the user's first idea) is close but slightly too wide (0.289).
  Drawing between the close and the max is biased.
- **The biggest gain is finer data, not a better formula:** the fill uses the finest bar that contains the purchase
  time (1m inside the last 30 days, 5m inside 60 days, 1h inside about 2 years), so the estimation error shrinks to
  that bar's range.
- **Size of the effect:** a random fill's error is about 0.25 × the bar's range. For a daily bar of about 1–1.5 % (an
  assumption, to be measured from the data in H1), that is about 0.3 % per deposit, and it averages out: with 120
  monthly deposits about 0.03 % of the end value. The fill rule matters for one large deposit, and later for the
  Phase 4 Day profile, which reuses the same table.
- **Limits:** a constant volatility, no drift, and time weighting. Real intraday volatility and volume are U-shaped,
  and a volume-weighted fill would sit closer to the open and the close.
- **The generator (the user's algorithm, reviewed 2026-11-26):** Monte Carlo with rejection (ABC). Simulate random
  walks of n = 390 steps, normalise each to [0, 1], keep the paths whose start and end lie within δ = 0.025 of
  (u, v), average them over the purchase window. On (1/3, 2/3) it gives 0.5006 for the whole day, with m(t) = 0.333,
  0.375, 0.501, 0.622, 0.667 at t = 0, ¼, ½, ¾, 1. It needs 1.5 million paths and 24 s for one bar (1 path in 500
  is kept), too slow per deposit and per realization. So the same estimator is **amortised**:
  - one large offline simulation where every path is binned into its own (u, v) cell instead of being rejected;
  - the symmetries double or quadruple the samples;
  - m(t) and the quantiles are stored per cell;
  - a lookup with bilinear interpolation over (u, v) (a first-order correction like the user's step 4, without
    clipping) and prefix sums over t for any window costs microseconds.
- **Validation on real data:** daily and hourly bars rebuilt from real 1m bars (the collector's cache), the
  estimator against the true time-average of the 1m prices, scored together with (H+L)/2, OHLC4 and the close. The
  same data gives the intraday volatility profile σ(t) (U-shaped). The table can be built with steps of size σ(t):
  the shape stays scale-free, so it is still one table per profile.
- **Implementation:**
  - The table is computed offline with a fixed seed (a 20 × 20 (u, v) grid × 21 t points: the mean and the 5/25/50/75/95 %
    quantiles) and committed.
  - Tests check two symmetries: reflection, (u, v) → (1 − u, 1 − v) gives 1 − value; and time reversal, swapping u
    and v with t → 1 − t.
  - A bar with H = L (old close-only data) falls back to its close.
- **Fill options (the user picks one; speed first, 2026-11-26).** Every option costs O(1) per deposit: no
  simulation runs while the user waits.

  | Option | The fill price at time t in the bar (or its average over the purchase window) |
  |---|---|
  | **Close** [default] | C |
  | **Open** | O (realistic for an order placed in Israel before the US opens) |
  | **Mid-range** | (H + L)/2 |
  | **Linear O → C** | O + t (C − O) |
  | **Piecewise O → H → L → C or O → L → H → C** | straight lines through the four points, at t = 0, ⅓, ⅔, 1. The order is either by direction (an up bar goes O → L → H → C, a down bar O → H → L → C, the common backtester convention) or random (50/50, drawn anew in every realization) |
  | **Estimated (the ABC table)** | m(t) from the precomputed table, averaged over the window; in the statistics a draw from the stored quantiles instead of the mean |

  - **The granularity parameter** applies to the estimated option. It picks one of three committed tables, all
    precomputed offline:
    - coarse: a 10 × 10 (u, v) grid × 13 t points;
    - medium [default]: 20 × 20 × 27;
    - fine: 40 × 40 × 79, where 79 points means every 5 minutes of a US session.
  - A finer table means less interpolation error, more memory, and a lookup that is still microseconds.
  - With a known time, the finest bar that contains it (1m / 5m / 1h / 1D) is used first, whatever the option.

**Mortgage (up to 3 tracks)**
- Each track has an amount, a term, an **interest type** (fixed unlinked, fixed CPI-linked, prime = BoI rate +
  spread) and a **repayment type**:
  - **Spitzer:** $P = L\,r/(1-(1+r)^{-n})$, recomputed after a rate or CPI change;
  - **Equal principal:** principal $L/n$ a month plus the interest on the balance;
  - **Grace:** $g$ months of interest only, then Spitzer over $n-g$;
  - **Balloon:** interest only and the principal at the end (or a partial balloon).
- **CPI-linked** tracks: the balance is multiplied by the model CPI's ratio each month (below), and the payment is
  recomputed.
- **Prime:** the historical BoI rate in historical mode, an assumed path (a constant, or a shock of +2 or +3 %) in
  assumed mode.
- **The amortization table per track:** month, payment, interest, principal, CPI linkage, balance, and a sum of all
  tracks. A sale at t repays the remaining balance (an early-repayment fee is a parameter, 0 by default).

**Apartment**
- **Price and equity;** the loan = price − equity. Purchase costs: **purchase tax** by a bracket table (presets
  below, editable and saved), lawyer and broker (%), renovation.
- **Owner costs:** maintenance (% of value a year), insurance.
- **Rent switch:** *live in it* (the rent saved; the market side pays rent) or *rent it out* (the income, minus
  vacancy and a rent tax %). Rent grows with the CPI or with the dwelling index.
- **The value path:**
  - **historical:** the dwelling index (national or a district) over the same window as the market side, so the
    real correlation is kept;
  - **assumed:** lognormal with a yearly mean and σ, monthly steps, a correlation ρ with the stock returns (0 by
    default), plus an optional single-apartment σ on top of the index.
- **At a sale on t:** selling costs (%) and **betterment tax** (presets below).
- **Net worth** = value − remaining mortgage balance − selling costs − tax on the sale (+ the market account, in A+B).

**Taxes on the apartment (presets: editable, saved, each with its source and validity date)**
- **Purchase tax:** a bracket table, tax = Σ rate_k × (the part of the price inside bracket k). Saved as documents
  in the browser, beside the form (H2; see ADR 0020); the user creates, edits and saves their own tables. Built-in
  presets, checked in H2 against the Israel Tax Authority's directive 1/2026 (2026-01-18):
  - **Single home (2026):** 0 % up to 1,978,745 ₪; 3.5 % to 2,347,040; 5 % to 6,055,070; 8 % to 20,183,565; 10 %
    above. The brackets are frozen (not CPI-updated) until 2028-01-15.
  - **Additional home (2026):** 8 % up to 6,055,070 ₪, 10 % above. A temporary provision until 2026-12-31.
  - In historical mode the chosen table applies in every year, stated in the UI.
- **Betterment tax** is not a bracket schedule in the law. The default model follows the law's parameters:
  - **rate:** 25 % of the real gain (sale − purchase − recognised costs, the cost indexed by the model's CPI);
  - **single-home exemption:** on or off, with its ceiling (5,008,000 ₪ for 2025 to 2027, by the same directive);
  - **the linear rule:** for a home bought before 2014, the share of the gain from before 2014-01-01 is taxed at 0 %,
    by days held.
  - Presets: "single home (exempt up to the ceiling)" and "additional home (25 % of the real gain)".
  - The user's choice adds a **custom bracket table** on the gain, like the purchase tax, for any other assumption.

**Inflation (the model CPI)**
- **Default: assumed.** The user sets a yearly mean μ and standard deviation σ, and optionally a persistence φ
  (AR(1); φ = 0 gives independent years). Each year's rate is
  $\pi_y = \mu + \phi(\pi_{y-1} - \mu) + \sigma\sqrt{1-\phi^2}\,\varepsilon_y$, $\varepsilon_y \sim N(0,1)$,
  spread evenly over its months: $\text{CPI}_m = \text{CPI}_{m-1}(1+\pi_y)^{1/12}$, $\text{CPI}_0 = 100$.
  - Persistence matters because real inflation runs in multi-year waves. Independent years understate the spread
    over 20 years.
  - The UI shows how the index is built: the formula, one sample path and the band of many paths.
- **Option in historical mode: the actual CPI from 1994.** The dwelling index and the historical prime already
  contain Israel's actual inflation, so an assumed CPI in the same window would mix two inflations. From 1994 the
  series has no hyperinflation years: a yearly mean of 3.0 % (σ 3.6 %, from 14.5 % in 1994 to −1.9 % in 2003); from
  2000, a mean of 1.75 % (σ 2.0 %). Earlier years are never used.
- **The model CPI drives:** the CPI-linked mortgage tracks, the real tax bases (market and betterment), rent
  indexation (when chosen), and the "real" results.

**Fair comparison (mirrored cash flows)**
- Both sides spend the **same money at the same dates**. At the start, the market side invests the equity plus the
  purchase costs. Every month it invests the apartment's mortgage payments plus owner costs, minus the rent the
  apartment saves (living in it) or plus nothing and minus the rental income (renting out).
- If a month's difference favours the apartment (the rent exceeds its costs), the apartment side invests that
  surplus in the same market asset. Neither side ever has idle cash.
- **A+B:** an apartment plus a market account with its own deposits. It is compared with the same total money in
  the market only, or with another A+B.

## Realizations (the statistics)
- **Rolling history:** the plan starts on every month (or day) in the chosen range, for example 1990-01 to 2000-01
  with a 20-year term. Each start is one realization; the apartment uses the dwelling index of the same window when
  it exists (from 1994).
  - **Stated next to every probability:** windows that overlap are not independent. The effective number of
    independent samples is about (span + term) ÷ term. Ten years of starts with a 20-year term gives about 1.5. A
    verification engineer should see this.
- **Block bootstrap:** monthly joint returns (stocks, USD/ILS, CPI, dwelling index) resampled in blocks of 12 months,
  so correlations and short trends are kept. Many independent-looking paths, from history.
- **Monte Carlo:** the assumed parameters (mean, σ, ρ) for what history cannot show.
- **Outputs:** the histogram of the final net worth (nominal or real), or of the **annual net return** (XIRR);
  P(a ≤ X ≤ b) with its 95 % interval; the percentiles 5/25/50/75/95.

## Metrics (accepted by the user on 2026-11-26: all of them, for H3)
The page leads with five: P(A > B) with the median difference, the real net XIRR, the breakeven rates, the 5 %
percentile, and the win map. The rest sit in a detail tab.

**Layer 1: which is better**
1. **P(A > B)** on the same realization (same window, same draws), and the **median of A − B**: the most direct
   answer, with the uncertainty included.
2. **Annual net return = XIRR** (money-weighted), nominal and real, and the final net worth nominal and real. CAGR is
   wrong with many deposits.
3. **Breakeven rates:** the yearly apartment appreciation at which the apartment equals the market, and the yearly
   market return at which the market equals the apartment; the same for the mortgage rate and the rent. Solved by
   bisection on the deterministic scenario. No forecast is needed: the user compares the number with their own
   expectation.
4. **Win map:** start year × horizon, each cell coloured by the winner (and by how much). Shows whether the answer
   is stable or depends on timing.
5. **Time-averaged net worth** (the user's "sum up to t"): (1/t) ∫ net worth, the expected net worth at an exit
   time drawn uniformly before t. An apartment loses early because of its purchase costs.

**Layer 2: how risky**
6. **The bad tail:** the 5 % percentile and CVaR 5 % of the end value; P(end value < the money put in);
   P(a ≤ X ≤ b). Variance alone also punishes good surprises.
7. **Regret:** E[max(other − chosen, 0)] and its 95 % percentile: how much is lost by choosing the wrong side.
8. **Path risks**, which the end value hides:
   - negative equity: P(the apartment is worth less than the mortgage balance at some point);
   - payment stress: P(the payment exceeds a share of income), income being an optional input;
   - time under water: how long the market account is worth less than the deposits; max drawdown of net worth.
9. **Stochastic dominance:** first and second order between the two end-value distributions. If one dominates, it
   is better for every risk-averse investor; if neither does, the answer depends on the investor.
10. **Certainty equivalent** (CRRA utility, risk aversion γ = 2 by default), and Sharpe and Sortino of the yearly
    net-worth returns.

**Layer 3: what the answer depends on**
11. **Decomposition of the apartment's return:** appreciation, rent, the mortgage's leverage, and costs and taxes
    (each as a contribution to the XIRR, by switching one off at a time).
12. **Sensitivity (tornado):** the change of the result for a fixed move of each input (appreciation, interest,
    rent, market return, taxes).
13. **Breakeven time:** the first t after which one side stays ahead, and the share of the time each side leads.
14. **Liquidity:** the cash available at once, and the apartment's value in a forced sale at a discount the user
    sets.
15. **The benefit of combining (A+B):** the correlation between dwelling prices and stocks, and the combined
    portfolio's risk against each side alone.

**Also reported:** the interest paid over the term, the total cash out of pocket, the rent paid or received; the
interest stress test (+2 or +3 % on prime and the variable tracks) is H5.

**Not measurable, stated on the page:** the stability of living in one's own home, the freedom to move, the effort
of renting out; and the model assumes both sides keep to the plan (a mortgage forces saving, monthly deposits need
discipline).

## Rounds
| Round | What | Size |
|---|---|---|
| **H0** ✅ 2026-11-26 | Macro data: `app/macro`, BoI source (USD/ILS, the dwelling indices, the mortgage-rate series, the BoI rate, and the CPI from 1994 for the optional mode), cache, fixtures, `GET /macro/series`. Check the depth of `^SP500TR`, `SPY`, `^NDX`, `QQQ` and `^TA125.TA` on the user's machine (`make-fixtures`). ADR 0018. | M |
| **H1** ✅ 2026-11-26 | Market engine: deposit schedules, the symbol mix (rebalancing optional), lots, FX on/off, the four fees, the six fill options (close, open, mid-range, linear, piecewise by direction or random, the ABC table at three granularities, generated offline from the user's algorithm), the model CPI, taxes (nominal or real base), the table per deposit, XIRR. Tests: a scalar golden model of the whole account, hand-computed lots and fees, XIRR against known cash flows, "no FX" equals FX at a constant rate, each fill option's hand vectors, the fill table's symmetries and its agreement with direct rejection sampling within the Monte Carlo error, the CPI generator's mean, σ and autocorrelation. | L |
| **H2** ✅ 2026-11-26 | Mortgage and apartment engine: three tracks × four repayment types × three interest types, CPI linkage, prime path, purchase, owner and sale costs, the purchase-tax brackets and the betterment-tax model with saved presets, the rent switch, the value path (historical or assumed), net worth. Tests: closed-form Spitzer, equal principal sums to the loan, balance never negative, a golden scalar loop per track, CPI-linked with a flat CPI equals unlinked. ADR 0020. | L |
| **H3a** ✅ 2026-11-26 | Scenarios: modes A, B and A+B, mirrored cash flows (with an independent golden model), rolling historical windows with the effective-sample count, and layer 1 of the metrics (P(A > B) and the median difference, XIRR, breakeven rates, the win map, time-averaged net worth). Tests: known answers (constant returns), P(A > B) = 0.5 for identical sides, a breakeven rate that reproduces equality. | L |
| **H3b** ✅ 2026-11-26 | Statistics: block bootstrap and Monte Carlo on paired realizations, histograms, percentiles, P(a ≤ X ≤ b) with its interval, and layer 2 (the bad tail, regret, path risks, stochastic dominance, certainty equivalent). Tests: reproducibility by seed, zero regret for identical sides, dominance of X + c over X, the correlations kept by the blocks. | L |
| **H3c** ✅ 2026-11-26 | Layer 3: the decomposition of the apartment's return, sensitivity, breakeven time, liquidity, the benefit of combining. | M |
| **H4** ✅ 2026-11-26 | The Planner page: the A/B/A+B switch, input forms per side, the deposits and amortization tables, the net-worth paths, the histograms with a and b handles, the metric cards, saved scenarios, CSV export. Vitest + E2E. | L |
| **H5** | Learn pages (XIRR, mortgage tracks, rent vs buy, why overlapping windows overstate certainty), the interest stress test and the district indices, and polish. | M |

Order: H0 → H1 → H2 → H3a → H3b → H3c → H4 → H5. H3 is split in three (the user, 2026-11-26) so each round runs at
high effort: every metric gets its known-answer test before its code, and each round has its own review. After H1 the market side is usable on its own (through the API); after H4 the
whole page works.

## Risks
- **Total-return history before 1993** depends on Yahoo's `^SP500TR`, unverified from here.
- **The dwelling index starts in 1994;** apartment realizations before that are assumed-only.
- **Tax rules** (nominal vs real gain on foreign securities, rent tax tracks, purchase-tax brackets, betterment tax)
  are modelled as parameters and presets with their source and date, not as tax advice.
- **Overlapping windows** make history look more certain than it is; the effective sample size is always shown.

## H4 results (2026-11-26, ADR 0024)
- The user's choices before H4: two options with full forms each, scenarios saved by the local backend.
- The two options share one set of forms until "Option B is the same as option A" is unticked. This was chosen
  without asking, after two always-separate options broke the basic comparison: the mix edited in the Market tab
  was option A's and the market side read option B's. The existing end-to-end tests of the basic comparison pass
  with their steps unchanged.
- The page now names each option's mix in the request. A backend test holds that equal to the old request (an
  apartment option that takes the other's mix) on all three endpoints.
- Left out: a chart of the net-worth paths of two market accounts (the lead chart already shows both options by
  exit month), and loading a scenario does not rerun the comparison.
- H5 keeps: the learn pages, the interest stress test, polish.

## H3c results (2026-11-26, ADR 0023)
- The user's choices before H3c: the apartment's return shared by the Shapley value, so the four sources add up
  (the plan said one at a time); the benefit of combining as the same money split between the options over the
  simulated worlds, with the historical correlation; the sensitivity on the plan as entered; and the chart of who
  leads over time already now.
- A move of the sensitivity tilts the path in use; a breakeven rate replaces it. Both are on the page.
- The mortgage's share of the return can be negative even when borrowing pays: stated on the page.
- A run of the comparison takes about a second with everything in it.
- H4 keeps: the forms of a free second option, saved scenarios, CSV export.

## H3b results (2026-11-26, ADR 0022)
- The user's choices before H3b: the Bank of Israel rate's level travels with its block; a modelled market
  estimated from the mix's history and editable, with a correlation to a modelled apartment (a single apartment's
  own volatility is deferred); a histogram with draggable handles already now; payment stress against an income
  that rises with the CPI.
- One rule for both methods: what a tab marks historical is resampled, what it marks assumed is drawn from its
  model; the method decides only the market.
- A world depends only on the seed and its number, so both options, a longer plan and H3c's one-input changes all
  see the same worlds.
- The mean of a modelled series is its expected growth, on both sides.
- A world of a 10-year plan takes about 6 ms; 1,000 worlds are the default.
- The Compare tab now has the histogram with handles, so H4 keeps the net-worth path charts, the forms of a free
  second option, saved scenarios and CSV export.
- Still open: a single apartment's own volatility on top of the index; a simulation on real data on the user's
  machine.

## H3a results (2026-11-26, ADR 0021)
- The user's choices before H3a: a general engine (each option holds an apartment, a market account, both or
  neither) with the difference invested in the market; the tracks' rates following the Bank of Israel rate in
  windows of history, as a switch; the linear rule off in the windows; a Compare tab with a coloured win map.
- The mirror's rule in one line: on every day both options spend max(f_X, f_Y, 0), and each invests the rest.
- The day of the sale pays its own bills in cash, so the H1 engine did not change.
- One pair of a 20-year plan takes about 8 ms; a study over all of history a few seconds.
- The Planner page has three tabs (Market, Apartment, Compare), so H4 shrinks again: the forms of a free second
  option, the charts (net-worth paths, histograms with handles) and saved scenarios.
- Limits stated on the page: the same amounts and the same rent in every window; overlapping windows.
- Still open: a comparison on real data on the user's machine (the tests run on synthetic series).

## H2 results (2026-11-26, ADR 0020)
- The user's choices before H2: a variable-rate track, linked or not; the Bank of Israel rate both from history and
  assumed; the grace chosen per track; the rent grows as the user chooses, by the CPI by default.
- The tax amounts were checked against the primary source (the Tax Authority's directive 1/2026): the single-home
  and additional-home purchase brackets and the betterment exemption ceiling are exactly the built-in ones.
- Saved tax tables are kept in the browser, not in the backend's document store.
- The Planner page has two tabs (Market, Apartment), so H4 shrinks again: the A/B/A+B switch, the charts, the
  histograms and saved scenarios.
- A variable track follows the Bank of Israel rate (the bond-yield anchors banks use are not mapped; see H0).
- A hand check: 600,000 ₪ at a fixed 4 % over 20 years pays 3,635.88 ₪ a month.
- Still open: compare one real offer from a bank with the page (the user).

## H1 results (2026-11-26, ADR 0019)
- The user's choices before H1: free tickers typed in the planner; the start limited to the youngest asset of the
  mix; dividends net of 25 % tax by default; a basic Planner page already in H1 (so H4 shrinks to the apartment
  side, A/B, the charts and saved scenarios).
- The fill table was generated with 8 million paths (at least 3,412 samples in every fine cell).
- The tax base has a third option beside nominal and real: the gain in the asset's own currency (the cost indexed
  by USD/ILS).
- A price-only index can take an assumed dividend yield, since a total-return index cannot carry the dividend tax.
- A yearly management fee of μ takes 1 − (1 − μ)^(1/12) of the value each month, so a year leaves 1 − μ.
- "Check data history" reports the depth of every ticker in one call: no need to open them one by one.
- Still open: the depth of `^SP500TR`, `^XNDX`, `^TA125.TA` and `ILS=X` on Yahoo (read it from the page).

## H0 results (2026-11-26)
- The USD/ILS rate for the planner is **Yahoo's market rate** (`ILS=X`, in the universe; the user's choice). The BoI
  official rate (`usd_ils_boi`, daily from 1976) is the fallback before Yahoo's first bar, marked in the results.
- The district dwelling indices start in **2017-10** (the national one in 1994-01). The average rates of new fixed
  mortgages (unlinked and CPI-linked) start in 2011-07; the variable-rate series are not mapped (ambiguous codes).
- The Benchmarks group (`^SP500TR`, `^XNDX`, `^TA125.TA`) is in the universe. Its depth on Yahoo is read on the
  user's machine: open each symbol and press All, or read `history_start` from
  `/api/bars?symbol=^SP500TR&limit=1`.

## Decisions (the user, 2026-11-26)
- Rent: a switch, live in it or rent it out. The mortgage: a mix of up to three tracks. The apartment value: both the
  historical index and an assumed one. The phase runs before Phase 4.
- The market asset: S&P 500 by default, or a mix of symbols; no rebalancing by default.
- The tax base: nominal or real, the user's choice.
- Inflation: assumed (μ, σ, persistence) by default; the actual CPI from 1994 as an option in historical mode.
- Purchase tax: bracket presets (single home, additional home), editable and saved.
- Betterment tax: the law's parameters by default, and custom brackets as an option.
- Fees: deposit %, buy and sell commission %, yearly management %, a monthly account fee in ₪ paid from the account.
- The fill: the day's close by default, with the model-based options above.
