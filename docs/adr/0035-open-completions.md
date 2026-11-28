# ADR 0035 — The open completions of Phases H and J (K4)

- Status: Accepted (2026-11-28)

## Context
K4 (`docs/ROADMAP.md`, Phase K) gathers what Phases H and J left open. The user asked for it without questions, each
choice the recommended one: every decision below is **chosen without asking** and recorded so it can be revisited.

## Decision
- **Each apartment sold on its own day.** A scenario option carries its apartment's own sale (`sold_on`, the last
  whole month from its purchase up to it; null: by the comparison's end). The comparison ends on the last sale
  (`build` and `world_spec` take the latest, not the first apartment's). An apartment sold before the end pays that
  month's bills as on any month date and puts what it nets into its option's account on its sale day (its own mix,
  else the other's; neither: a 422 that says so), held to the end. It is the option's own money, not new money: it
  is not part of the budget, so the other option does not match it. A sale that leaves a debt (the loan above what
  it nets) is paid like a bill, from the budget, and matched. Such an apartment has no forced sale at the end
  (liquidity and the forced exit values say so), and the net worth on the way follows the account after its sale.
  - A horizon (the exit months, the win map) moves every sale and the end by the same months, as before, so two
    sales keep the months between them; an exit that would hold one apartment for less than a month is skipped
    (the existing warning).
  - A request with every sale on the end is the old request: `/run`, `/study` and `/simulate` answer the same,
    byte for byte (tested). A saved scenario with two apartments of different "Sold on" dates now uses option B's
    date, which it ignored before, so its result changes.
- **Loading a saved scenario runs the basic comparison.** Once the loaded forms are on screen and the tax tables
  are in, from a timer an effect sets (`useEffectEvent`): the latest load wins; one that cannot run leaves Compare
  disabled, as when typed.
- **Net worth along the plan.** `/planner/run` returns each option's path (`paths`): its apartment's value less its
  loan while held, plus its account's market value, on the apartment's month dates and then the account's month
  ends (`study.worth_path`, the same the path risks use). The Compare tab draws both, with a CSV, next to the lead
  chart's what-if exits; a note says it is before exit costs and tax, unlike the cards. So two market accounts have
  their two paths.
- **Chart text at its own size.** The Planner's six SVG charts lay out on their measured width (`useChartWidth`, a
  ResizeObserver on the figure; 640 until measured, when hidden or in tests), one unit a pixel, so a 12 px label is
  12 px at 960 px (it was about 8, the J3 audit; an end-to-end test checks it).
- **A layout change made before the stored layout loads is kept.** After a reload the chart starts from the
  browser's copy and the stored layout arrives a moment later; applying it undid what the user did meanwhile (the
  flaky `U3: compare` end-to-end test: a compared symbol removed right away came back, about 1 run in 15). Now such
  a change wins and is saved on top of the stored revision, as after a save in another window.
- **Tax facts.** The surtax (3 % above ILS 721,560 a year, plus 2 % on capital income) and the rent exemption
  ceiling (ILS 5,654 a month) are confirmed in the Tax Authority's own 2026 withholding booklet; nothing changes.
  First in, first out stays from secondary sources (five that agree): the regulation's text could not be read from
  the cloud session, whose network blocks its hosts.
- **The run on real data** needs the user's machine (Yahoo and the Bank of Israel are not reachable from the cloud):
  a step-by-step guide is in `HANDOFF.md`; the ROADMAP box stays open until it is run.

## What holds (the tests)
- Engine: an apartment sold before the end puts what it nets into the account on its sale day and spends nothing
  after; a sale below the loan is paid from the budget and matched; a sale after the end, and an early sale with no
  mix, are refused.
- API: each apartment on its own day (the account holds the proceeds, no forced sale at the end, the same money);
  apartments bought on different days of the month run; every sale on the end equals the old request on all three
  endpoints; the net-worth paths of two market accounts and of an apartment.
- Frontend: the request carries each apartment's `sold_on` and ends on the later one; loading a scenario sends a
  comparison with its values; the net-worth chart and its CSV; a layout change before the stored one loads is kept
  and saved; at 960 px a chart label is 12 px (end to end).

## Consequences
- Phase K is done in code. Two things stay open for the user: the run on real data, and reading regulation 5 itself.

## What the review settled
- A load while a comparison, study or simulation is still going waits for it: the older run would otherwise end
  last over the loaded plan's results.
- The term (the exit months, the horizons, the windows' effective count) is the months held by the apartment sold
  last, which ends the comparison; on a tie, the first one's, so the old requests are unchanged.
- After an early sale the net worth on the way adds back the exit costs the sale paid (selling costs, early
  repayment fee, betterment tax): the apartment held to the end pays none on the way, so the sale is no fall in
  the path and no false drawdown.
- A scenario saved before K4 (version 1) with two apartments sold option B on A's "Sold on": it now reads with B's
  date set to A's, so it gives the result it gave (saved scenarios are version 2). The browser's working state is
  left as it is: B's "Sold on" was already used by B's own Apartment tab.
- The charts keep at least about 120 px to plot on a narrow column (the margins shrink); the width hook is a
  callback ref, so a chart that first rendered without its figure is measured once it has one.
- The account of an option shows what an early sale put in apart (`from_sale`); `deposited` is what came from the
  budget.
- `sold_on` needs its apartment and comes by the end date (a 422 otherwise); `end` is described as what it is with
  an apartment: the latest a sale may be.

