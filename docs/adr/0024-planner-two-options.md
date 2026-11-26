# ADR 0024 — The planner's two options, saved scenarios and CSV

- Status: Accepted (2026-11-26)

## Context
Since H3a the engine compares any two options, but the page could only build one comparison: the Apartment tab's
apartment against the same money in the Market tab's mix. H4 opens the general one. The user's choices before the
round:
- **two options, each with full forms** (a switch at the top of the Market and the Apartment tabs; the Compare tab
  says what each option contains), not a second mix alone;
- scenarios are saved **by the local backend**, like layouts and watchlists, not in the browser;
- every results table can be downloaded.

## Decision
- **Two options, one set of forms until asked otherwise.** The Market and the Apartment tabs hold an option A and an
  option B. A box on both tabs, "Option B is the same as option A", is ticked at first: then one set of forms serves
  both options, and the page works as it did before (an apartment against the same money in that mix).
  - Unticked, option B gets forms of its own, which start as a copy of option A's; a switch, one for both tabs,
    picks the option on screen. Ticking the box again puts option A on screen and sets B's forms aside; unticking
    it once more replaces them by a new copy.
  - *Chosen without asking.* The first build had two always-separate options. The existing end-to-end test of the
    basic comparison then failed for a real reason: the mix edited in the Market tab was option A's, and the
    market side of the comparison read option B's. A flag that is resolved **when the options are read** (the
    comparison and a saved scenario take option A twice) fixes it without a second write path in every form.
- **What an option contains** is set in the Compare tab: its apartment, and its own market deposits. Its mix is
  always its own Market tab's: it is where the money it has to match is invested. The defaults are the old
  comparison (A: the apartment; B: nothing of its own, so it mirrors A in its mix).
  - The request names each option's mix even when it has no deposits. For the basic comparison that equals the
    old request (an apartment option with no market, which took the other's mix): a backend test holds the two
    responses equal for `/planner/run`, `/planner/study` and `/planner/simulate`, also when the rent leaves a
    surplus to invest.
  - The names in the results come from the contents: "Apartment", "Apartment and account", "Market", with a letter
    only when both are alike ("Apartment A" against "Apartment B").
  - One day ends everything: the sale of the first apartment ticked, or option A's market end with none. The
    inflation is one for the whole planner.
  - Where one number stood for "the apartment", two apartments are now possible: a breakeven appreciation and a
    breakeven rent move both alike (both rents are shown), and the return by source is option A's apartment, said
    on the page.
- **Mixes that differ.** With two mixes, part of "A minus B" is the difference between the mixes, not between an
  apartment and a market: `/planner/run` warns when the options hold different mixes, and `/planner/simulate` when
  they do under Monte Carlo, where one modelled market stands for both.
- **An apartment's own volatility** (`value.own_sd_pct`). An apartment that follows a dwelling index moves like the
  average of thousands of apartments. In a simulated world its value is the index times a driftless lognormal path
  of that apartment's own shocks. It changes nothing outside a simulation, and nothing when it is 0.
- **Saved scenarios** (`/api/planner/scenarios`, `app.db`). A scenario is the planner's state under a name: both
  options' forms, what each contains, the Compare tab's settings and the "same" flag. The backend keeps it as an
  opaque JSON document with a revision (the generic `DocumentStore`, optimistic locking, at most 256 kB) and does
  not read it: the page checks it on load and refuses one of a newer version by name.
  - A scenario carries its tax tables themselves, not their names: a saved table can be edited or deleted later.
  - The planner's working state stays in the browser (`localStorage`, version 2; a version-1 state becomes option A
    with B the same). Results are not saved: they are recomputed.
- **CSV.** Every results table has a download: deposits, the apartment's path, the mortgage schedule, the exit
  months, the sensitivity, the history windows and the simulation's samples. The file is UTF-8 with a byte-order
  mark and CRLF so Excel opens it as it is; numbers are raw (no separators, fractions not percent), dates ISO, the
  headers the API's field names (`x` is option A, `y` option B). A text cell that starts with `=`, `+`, `-` or `@`
  gets an apostrophe, so a ticker or a name can never run as a formula.

## Consequences
- The basic comparison is unchanged for someone who never unticks the box; the general one costs one click.
- A saved scenario is tied to the planner's state shape. A change of that shape needs a version bump and a reader
  for the old one.
- Two apartments with different purchase days start the comparison on the earlier one; the later option holds its
  money in its mix until it buys.
