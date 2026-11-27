# ADR 0030 — The learn pages of the withdrawals, saved scenarios with them, and the Withdraw tab's polish

- Status: Accepted (2026-11-27)

## Context
J3 closes Phase J (`docs/WITHDRAWAL_PLAN.md`), after J4 at the user's request. The user's answers:
- **three** learn pages, by ADR 0025's rules;
- saved scenarios keep both options' Withdraw settings, and one saved before them loads without touching the
  settings on screen;
- a UX pass on the Withdraw tab: a learn link under each section, the apartment and the studies as sections that
  fold, a full `ux-audit`, and the order of the results.

## Decision
- **Three pages** in `docs/indicators/`, registered as concept pages:

  | Slug | Title | Explains |
  |---|---|---|
  | `withdrawals` | Withdrawals: what is left, and for how long | the month as one event, net in hand, the two rules, when the money ends, an owned apartment |
  | `cost-basis` | The cost of what is sold | the cost share and its two bounds, the carried loss, lots first in first out, the handover from a Market plan |
  | `sustainable-withdrawals` | How much can be taken | the share still paying, the sustainable amount, the order of the months, the income fan, the evidence |

  The windows and the worlds keep their own pages (`overlapping-windows`, `simulated-worlds`); these link to them.
- **The notation extends ADR 0025's.** The engine's docstrings use letters that ADR 0025 already gives another
  meaning (c, τ, N, φ, σ, μ, L, G, V, W, u, q, b), so the pages use these, and nothing else means them:

  | Symbol | Meaning |
  |---|---|
  | $H_k$ | the account's value on month date $k$, before the month's sale; $H_0$ is the starting capital |
  | $\eta$ | the cost share: the part of the account's value that is cost (0 to 1) |
  | $\psi_k$ | the fraction of every asset sold in month $k$ |
  | $U_k$ | the gain if all of the account were sold on month date $k$ |
  | $R$, $R_k$ | a fixed rule's net amount a month in shekels of the first day, and what month $k$ owes |
  | $R^*$ | the sustainable amount |
  | $\omega$ | a percent rule's yearly share of the account sold ($\omega/12$ a month) |
  | $\alpha$ | the share of the realizations an amount must last in |
  | $D_k$ | what the account owes in month $k$ before the withdrawal: the fee and what the apartment does not pay |
  | $k_{\text{end}}$ | the month the money ends |

  Fields and running amounts are words, as in ADR 0025: $\text{sell}$, $\text{buy}$, $\text{mgmt}$,
  $\text{monthly}$, $\text{rate}_{\text{gains}}$, $\text{fee}_k$, $\text{tax}_k$, $\text{net}_k$, $\text{cost}_k$,
  $\text{carried}_k$, $\text{cash}_k$, $\text{debt}_k$, $\text{growth}_k$, $\text{units}_j$, $\text{paying}(k)$.
  ADR 0025's $\mathrm{NW}_k$ (what an apartment's sale leaves), $\mathrm{CPI}_k$, $T$, $N$, $n_{\text{eff}}$, $Q_p$
  and the counters keep their meaning.
- **Each worked example is pinned through the engine** (`test_learn_examples.py`), as ADR 0025 asks: a million
  at half cost lasting 87 months, the same with an apartment sold when it runs out, two lots against one, the
  sustainable amount of two worlds, and two months in either order. The lots cannot be retyped in the Planner (they
  come from a Market plan on real prices); the page says so.
- **Saved scenarios** keep `withdraw` (both options, linked while option B is the same as A) beside the forms, read
  field by field. The version stays 1: a scenario saved before is still read, and loads without touching the
  Withdraw settings on screen.
- **The tab's polish** (a `ux-audit` at 960 and 1280 px against `.ux-profile.md`):
  - a learn link under each section (the account, the apartment, the withdrawals, the studies);
  - the apartment and the studies fold (`PlannerFold`, a native `details`), their summary saying what will run;
    the apartment opens by itself when it is included;
  - the study a button ran leads the plan it was run with; within each block the answer comes first, then the
    tables, then the charts, and the file last;
  - the tab keeps its results when the other option is put on screen (it is keyed by loaded scenarios only), and
    while the two are apart the results name the option they were run for;
  - from the audit: every results table of the Planner is a framed surface that scrolls sideways in a narrow column
    (it was cut at 960 px), two rows of fields keep their gap, and the histogram's two marks never print over each
    other.

## What the review settled
- After switching options, the results kept from the other one were unnamed: they now name their option.
- Two close marks' labels go outward only when both fit inside the chart; otherwise they stack on two rows.
- The apartment's section opens for an option that has one, not only on the tab's first render.
- A damaged Withdraw entry in a saved scenario counts as missing, so it leaves the settings on screen alone.
- A framed table inside a scrolling pane is framed to its full width.

## Consequences
- Left for K4: the Planner's SVG charts scale their text with the chart; at 960 px the results column makes it about
  8 px.
- Adding a fourth page of Phase J means its slug in `PLANNER_PAGES` and `CONCEPT_PAGES`, its sections in order and
  its pinned example.
