# Phase H — Home vs Market: plan (2026-11-26)

The user's goal: compare buying an apartment with investing in the stock market, alone or together, on the same
money, with history and with statistics. This phase runs **before Phase 4** (the user's choice). Phase 4 and 5 keep
their numbers.

## What the user asked for (summary)
- **Market side:** deposits on chosen dates (one-off, or recurring such as 2,000 ₪ a month for 10 years), with or
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
| USD/ILS official rate (`EXR/RER_USD_ILS`) | Bank of Israel SDMX API | daily | 1980-01-02 | converting deposits and the final value |
| Consumer price index, general (`PRI/CP`) | Bank of Israel (CBS data) | monthly | 1951-09 | real returns, CPI-linked mortgage tracks, rent indexation |
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
- A deposit on date d buys at **d's close** (the next trading day's close if the market was shut). With a time of
  day and a date inside the ~2-year 1h window, it buys at that hour's bar.
- **With FX:** units = ILS ÷ rate(d) ÷ price(d); value at t = units × price(t) × rate(t). **Without FX:**
  units = ILS ÷ price(d), value = units × price(t).
- **Dividends:** reinvested through the adjusted close (total-return series). A dividend tax drag (e.g. 25 % of the
  yield) is an option, off by default.
- **Fees:** buy commission (% or fixed), yearly management fee (%), both 0 by default.
- **Tax:** at the sale on t, on the **sum of the gains of all lots** (a loss in one lot offsets gains in another), at
  25 % by default (editable). The default base is the **nominal gain in shekels**; a **real** gain (CPI-indexed) is an
  option. The UI states that this is a model and not tax advice.
- **The table per deposit:** date, ILS in, rate, price, units, value at t, gross gain, its share of the tax, net gain.

**Mortgage (up to 3 tracks)**
- Each track has an amount, a term, an **interest type** (fixed unlinked, fixed CPI-linked, prime = BoI rate +
  spread) and a **repayment type**:
  - **Spitzer:** $P = L\,r/(1-(1+r)^{-n})$, recomputed after a rate or CPI change;
  - **Equal principal:** principal $L/n$ a month plus the interest on the balance;
  - **Grace:** $g$ months of interest only, then Spitzer over $n-g$;
  - **Balloon:** interest only and the principal at the end (or a partial balloon).
- **CPI-linked** tracks: the balance is multiplied by the CPI ratio each month, and the payment is recomputed.
- **Prime:** the historical BoI rate in historical mode, an assumed path (a constant, or a shock of +2 or +3 %) in
  assumed mode.
- **The amortization table per track:** month, payment, interest, principal, CPI linkage, balance, and a sum of all
  tracks. A sale at t repays the remaining balance (an early-repayment fee is a parameter, 0 by default).

**Apartment**
- **Price and equity;** the loan = price − equity. Purchase costs: purchase tax (an amount or %, 0 by default: it
  depends on the buyer and the year), lawyer and broker (%), renovation.
- **Owner costs:** maintenance (% of value a year), insurance.
- **Rent switch:** *live in it* (the rent saved; the market side pays rent) or *rent it out* (the income, minus
  vacancy and a rent tax %). Rent grows with the CPI or with the dwelling index.
- **The value path:**
  - **historical:** the dwelling index (national or a district) over the same window as the market side, so the
    real correlation is kept;
  - **assumed:** lognormal with a yearly mean and σ, monthly steps, a correlation ρ with the stock returns (0 by
    default), plus an optional single-apartment σ on top of the index.
- **At a sale on t:** selling costs (%) and a betterment-tax % (0 by default, typical of a single home).
- **Net worth** = value − remaining mortgage balance − selling costs − tax on the sale (+ the market account, in A+B).

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

## Metrics (proposals for the user; the basic two first)
**Return**
1. Final net worth at t, nominal and **real** (in today's shekels by the CPI).
2. **Annual net return = XIRR** (money-weighted). CAGR is wrong with many deposits; XIRR answers "what yearly rate
   gives these cash flows this end value". Nominal and real.

**Comparison**
3. **P(A > B)** on the same realization (same window, same draws), and the **median of A − B**: the most direct
   answer to "which is better", with the uncertainty included.
4. **Breakeven time:** the first t after which one side stays ahead, and the share of the time each side leads.

**Risk**
5. **Tail of the end value:** the 5 % percentile and CVaR 5 % (the mean of the worst 5 %).
6. P(end value < the money put in); P(a ≤ X ≤ b).
7. **Max drawdown of net worth** and the time under water. Leverage makes the apartment's equity swing more than its
   price.
8. **Risk-adjusted:** Sharpe and Sortino of the yearly net-worth returns. A **certainty equivalent**: the sure amount
   worth as much as the distribution to a risk-averse investor (CRRA utility, risk aversion γ = 2 by default).

**Liquidity and pressure**
9. **Cash available at t:** a market account can be sold in days, an apartment in months.
10. **The mortgage payment as % of income** (income is an optional input).
11. **Interest stress:** +2 or +3 % on prime and on the variable tracks; the new payment and the net worth after.

**Totals**
12. The interest paid over the term, the total cash out of pocket, and the total rent paid or received.

## Rounds
| Round | What | Size |
|---|---|---|
| **H0** | Macro data: `app/macro`, BoI source, cache, fixtures, `GET /macro/series`. Check `^SP500TR`, `SPY` and `^TA125.TA` depth on the user's machine (`make-fixtures`). ADR 0018. | M |
| **H1** | Market engine: deposit schedules, lots, FX on/off, fees, taxes (nominal or real base), the table per deposit, XIRR. Tests: a scalar golden model of the whole account, hand-computed lots, XIRR against known cash flows, "no FX" equals FX at a constant rate. | M |
| **H2** | Mortgage and apartment engine: three tracks × four repayment types × three interest types, CPI linkage, prime path, purchase, owner and sale costs, the rent switch, the value path (historical or assumed), net worth. Tests: closed-form Spitzer, equal principal sums to the loan, balance never negative, a golden scalar loop per track, CPI-linked with a flat CPI equals unlinked. ADR 0019. | L |
| **H3** | Scenarios and statistics: modes A, B and A+B, mirrored cash flows, rolling windows, block bootstrap, Monte Carlo, every metric above, histograms and P(a ≤ X ≤ b) with its interval. Tests: known answers (constant returns), bootstrap reproducibility by seed, the effective-sample count, P(A > B) = 0.5 for identical sides. | L |
| **H4** | The Planner page: the A/B/A+B switch, input forms per side, the deposits and amortization tables, the net-worth paths, the histograms with a and b handles, the metric cards, saved scenarios, CSV export. Vitest + E2E. | L |
| **H5** | Learn pages (XIRR, mortgage tracks, rent vs buy, why overlapping windows overstate certainty), the interest stress test and the district indices, and polish. | M |

Order: H0 → H1 → H2 → H3 → H4 → H5. After H1 the market side is usable on its own (through the API); after H4 the
whole page works.

## Risks
- **Total-return history before 1993** depends on Yahoo's `^SP500TR`, unverified from here.
- **The dwelling index starts in 1994;** apartment realizations before that are assumed-only.
- **Tax rules** (nominal vs real gain on foreign securities, rent tax tracks, purchase tax brackets) are modelled as
  parameters with defaults, not as tax advice.
- **Overlapping windows** make history look more certain than it is; the effective sample size is always shown.

## Questions still open (defaults in brackets)
1. The default market asset: [S&P 500 total return in USD with FX], TA-125 in ILS, or any universe symbol.
2. The tax base: [nominal gain in shekels] or real.
3. The purchase tax: [entered by the user] or the current brackets built in.
4. The deposit time: [the day's close], or also an hour when the date is inside the 1h window.
