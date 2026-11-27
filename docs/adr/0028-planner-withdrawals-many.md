# ADR 0028 — A withdrawal plan over many realizations: one engine, a batch at a time

- Status: Accepted (2026-11-27)

## Context
J2 runs one withdrawal plan many times (`docs/WITHDRAWAL_PLAN.md`): on every start history allows, and on
simulated worlds. The user's answers:
- one round, not two;
- a histogram of what is left over all the windows sampled, in shekels or as a percent of the start; with an
  apartment "the portfolio" is the net worth;
- the tax bounds as numbers beside one histogram, at the cost share entered.

## Decision
- **One engine.** `run_many` is the loop over months of J0 and J1 with a leading axis: one row a realization, every
  step taken by all of them together. `run` is a batch of one. So the golden scalar models of J0 and J1, which check
  `run`, check the code the studies run; a test checks that a batch equals its realizations one by one (a sale in
  one world must not touch another).
  - 1,000 worlds of 30 years are about 0.15 s a run; a study is three runs (the cost shares) and about twenty more
    for the sustainable amount.
- **A pure module for what a study reports**, `app/planner/withdraw_study.py`: what is left against what there
  was, the share still paying, the income fan, the sustainable amount, the months in reverse.
- **What is left** of a realization. Without an apartment: the balance at the end against the starting capital (the
  "Left at the end" card). With one: the liquidation against the liquidation of the first day (the "Net worth at the
  end" card). Each matches the card the user already reads.
- **Windows** (`POST /planner/withdraw/study`): the plan shifted by whole months, each start read from the mix's
  whole history; a start whose data is missing is skipped, and the reasons before the first and after the last are
  shown. The CPI in a window is the Market tab's: published (a window past it is skipped) or assumed (then the page
  says every window has the same inflation). On an assumed return they are refused.
- **Worlds** (`POST /planner/withdraw/simulate`) are H3b's `make_world`: a block bootstrap of the mix (with the CPI
  and the dwelling index when they are historical), or a modelled market whose mean and volatility are estimated
  from the mix or typed (on an assumed return the mean is that return). A world starts on the plan's own first day,
  so a plan can start in the future.
- **The apartment** in a realization follows its "It grows by": the window's or the world's dwelling index, or the
  assumed rate. Its cost is fixed once, in shekels of the entered first day. In the windows the betterment tax's
  linear rule is off, as in H3a: it depends on the calendar date 2014-01-01 and would tax the windows unevenly (the
  page says so). The worlds start on the plan's own day and keep it.
- **A realization lasts** when its last month is paid in full. Those that ran out are a bar of their own beside the
  histogram, on its scale, and are not in its bins. With an apartment they still hold its worth, so they stay in
  the bins and their count is in the note.
- **The sustainable amount**: the largest amount with which the target share lasts, by bisection to half a shekel,
  at the cost share entered.
- **The months in reverse** is part of the single plan's answer: the market's monthly growths last first, the CPI
  and the apartment as they were.
- **One study at a time** beside the plan, as in the Compare tab: Run history and Simulate each run the plan too.

## What the review settled
- **A study stands without the single plan.** Run history and Simulate run the plan of the entered start too, but
  when it cannot run on its own (worlds for a plan that ends after the mix's last bar) the study is shown with the
  reason, not thrown away with it.
- **With none that lasted** the histogram keeps an axis from nothing to the start (it printed `NaN%`).
- **The starting worth is on the liquidation's basis.** An apartment owned before the plan (its cost given) is taxed
  on a sale on the first day too; `run_home` left month 0 untaxed, so "what there was" was too high by the
  betterment tax and an unchanged world read below 100 %.
- **The earliest window's shekel rate.** The note that USD/ILS before the market rate is the official one is checked
  against the first window, not only the entered start.
- **Whole numbers** for the worlds, the seed and the block, whatever was typed.
- **The target share is met without a float's last digit** (0.55 of 100 is not 56 worlds).
- **A percent rule with an apartment** may end differently in reverse (a sale buys at another month's price): the
  note under the table says so.
- **One year of income** is not drawn as a fan (a single point has no line).
- **A modelled market has no currency to follow**: the "currency" tax base is nominal there, and the page says so.

## Consequences
- The report prints its evidence: the independent terms the starts hold, or the months of history a bootstrap was
  cut from; a modelled market says it is a model and where its numbers came from.
- Not built: a separate histogram of the depletion month (the share still paying by year shows the same, and the
  file has the month of every realization); a fan for a fixed rule; worlds for a district index.
- shortcut: a world is built on daily bars and sampled back to months (H3b's worlds, reused as they are), about
  4 ms a world; build the month grid directly if 5,000 worlds become routine.
