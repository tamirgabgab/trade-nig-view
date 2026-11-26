# ADR 0019 — The planner's market account and fill model

- Status: Accepted (2026-11-26)

## Context
Phase H compares an apartment with the stock market. H1 builds the market side: deposits into a mix of assets, sold
on one day, with a row per deposit and gross and net results. The user's choices:
- any Yahoo ticker, typed freely;
- a plan may start only when every asset of the mix has data;
- dividends net of a 25 % tax by default;
- a basic page already in H1;
- the fill price inside a bar chosen from fast models, one of them the user's own Monte Carlo estimator.

## Decision
- **Package `app/planner`**, pure functions with the formulas in the docstrings:
  - `fills`: the price inside a bar;
  - `inflation`: the planner's CPI;
  - `deposits`: schedules;
  - `xirr`: the money-weighted return;
  - `market`: the account;
  - `data`: loading.
- **Tickers.** A universe symbol is used as it is. Any other ticker becomes an ad-hoc symbol in the currency the
  request states (USD or ILS); the bar cache keys it by its Yahoo symbol. The universe and the chart are unchanged.
- **USD/ILS.** Yahoo's `ILS=X` daily close. Before its first bar, or when it cannot be loaded, the Bank of Israel's
  official rate (ADR 0018), with a warning. A bar's rate is the last one on or before its day.
- **The account** (`market.run_market`):
  - *A purchase.* A deposit is split by the weights. The deposit fee comes off first; the rest pays the trade and
    its buy commission, and that amount is the lot's cost basis.
  - *Dividends.* Units grow by the dividend factor of the adjusted close, net of the dividend tax. The net dividend
    is a purchase, so it joins the cost basis. A price-only series can take an assumed yearly yield.
  - *Account fees.* A yearly management fee μ takes 1 − (1 − μ)^(1/12) of the value at each month end. The monthly
    fee is in shekels. Both are paid by selling the same fraction of every lot. The fee is not deductible.
  - *The sale.* Everything is sold on the end date, less the sell commission.
  - *The tax.* The rate times the **sum** of the lots' gains, so a loss offsets a gain; nothing is paid on a total
    loss. The gain is everything sold minus everything bought. Costs are optionally indexed by the CPI (real) or by
    the asset's currency (the dollar gain).
  - *A simplification.* The gains of the fee sales are taxed at the end too.
- **The fill price** (`fills.fill_prices`): close [default], open, mid-range, linear, piecewise through H and L by
  the bar's direction or at random, and **estimated**.
  - *How a model is used.* At a known time; as its expectation over an unknown time; or as a draw.
  - *The estimated model.* It reads `fill_table.npz`, built offline by `scripts/make_fill_table.py`. This is the
    user's rejection-sampling algorithm with every path binned by its own (u, v) instead of rejected: 8 million
    paths of 390 steps, quadrupled by reflection and time reversal.
  - *What the table stores.* The mean and five quantiles of the residual from the straight line between the open and
    the close, so the ends are exact.
  - *Granularity.* Coarse 10 × 10 cells × 14 times, medium 20 × 20 × 27, fine 40 × 40 × 79.
  - *A deposit with a time of day.* It is filled inside the finest intraday bar that holds it (1m, 5m, 1h). Without
    such a bar it is placed inside the daily bar by the exchange's session.
- **Inflation.**
  - *Assumed, by default.* Yearly rates π_y = μ + φ(π_{y−1} − μ) + σ√(1 − φ²)ε, spread evenly over months. The
    mean path is used unless a draw is asked for.
  - *Historical, as an option.* The CBS index from 1994.
  - *What it drives.* The real tax base, the real results, and CPI-indexed deposits.
- **API.**
  - `POST /api/planner/assets`: the depth of each ticker's history in one call.
  - `POST /api/planner/market`: the summary, the deposits with their lots, the monthly value path, and warnings.
  - A plan that cannot run is a 422 `invalid_plan`.
- **The page.** `src/planner/`: a Planner button in the top bar opens it over the chart, which stays mounted. The
  inputs persist in the browser. The chart's hotkeys are quiet while it is open.

## Verification
- **The account** equals an independent day-by-day golden model (per-lot state, a calendar loop) to 1e-9, for the
  three tax bases. Every fee, tax base and dividend case also has a hand-computed vector.
- **The fill table:**
  - it is symmetric under both symmetries;
  - it is exact at the ends;
  - it agrees with direct rejection sampling at (1/3, 2/3) within 0.02 of the range;
  - its draws have the conditional mean and spread.
- **XIRR** recovers a known constant rate.
- **The CPI model** has the asked mean, σ and lag-1 correlation.

## Consequences
- + The market side is usable alone, on any ticker, with the depth of every ticker visible before a run.
- − Picking today's successful stocks and testing them backwards is survivorship bias; the page does not correct it.
- − A total-return index (`^SP500TR`) holds gross dividends: the dividend tax cannot be applied to it. A fund (SPY)
  or a price index with an assumed yield can.
- − Tax rules are a model with parameters, not tax advice.
- − `fill_table.npz` is a 2.9 MB binary in the repo, regenerated only by the script (fixed seed).
