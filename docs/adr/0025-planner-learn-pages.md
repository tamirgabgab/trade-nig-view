# ADR 0025 — The planner's learn pages, their notation and the rate stress test

- Status: Accepted (2026-11-26)

## Context
H5 closes Phase H: the planner's numbers get learn pages, the apartment gets an interest stress test, and the page
is polished. The user's choices before the round: **eight** learn pages, each **with short derivations**, and above
all clear equations with the meaning of every variable.

The code's docstrings cannot be copied into the pages as they are: each module chose its letters alone. ρ is a
track's spread in `mortgage.py` and a correlation in `paths.py`; `r` is the XIRR and a monthly loan rate; `P` is a
price and a probability; `m`, `s`, `a`, `b` and `X` each mean two or three things.

## Decision
- **Eight pages** in `docs/indicators/`, registered as concept pages and opened in the learn drawer from the
  section of the Planner each one explains:

  | Slug | Title | Explains |
  |---|---|---|
  | `xirr` | Yearly return (XIRR) | the return of dated cash flows, and the planner's three kinds of yearly rate |
  | `mortgage-tracks` | Mortgage tracks | rates, linkage, the four repayments, the stress test |
  | `rent-or-buy` | The apartment's ledger | purchase, monthly flows, value, sale, taxes, net worth |
  | `same-money` | The same money rule | how two options are made comparable day by day |
  | `overlapping-windows` | Overlapping windows | history as many starts, and how few independent terms it holds |
  | `simulated-worlds` | Simulated worlds | block bootstrap and the modelled market |
  | `risk-metrics` | Risk metrics | the tail, regret, dominance, the certainty equivalent, the path risks |
  | `what-the-answer-depends-on` | What the answer depends on | return by source, sensitivity, breakeven, lead, liquidity |

- **One section order**, checked by a test as the indicator pages' is: *What it answers*, *Formula*, *Worked
  example*, *How to read it*, *Where it comes from* (the short derivation), *Limits*.
- **Every formula is followed by its symbol table** (`| Symbol | Meaning | Units / typical range |`) before the
  next heading. The test enforces it everywhere but in the worked example and the derivation, which use the
  symbols the formulas above them defined.
- **Every worked example is pinned twice.** A test writes the page's formula as a plain scalar loop, asserts that
  it equals the engine, and asserts that the number it formats is printed in the page. So neither the number nor
  the formula above it can drift from the code. The examples use assumed inputs only, so each can be retyped in the
  Planner.
- **One notation for all eight pages.** A letter means one thing everywhere; where letters ran out, a word is used.

  | Symbol | Meaning |
  |---|---|
  | $A$, $B$ | the two options (the API's `x` and `y`) |
  | $W$, $W_A$, $W_B$ | an end value: cash after every cost and tax |
  | $\Delta = W_A - W_B$ | the difference of the end values |
  | $r$ | a yearly return (XIRR): an effective rate |
  | $c_j$, $d_j$, $\tau_j$ | a cash flow, its day, and its time in years from the first day |
  | $f_A(d)$, $f_B(d)$, $F(d)$ | each option's own spending on day $d$, and what both spend |
  | $u_A(d)$, $u_B(d)$ | each option's top-up: what it invests to match the other |
  | $L$, $n$, $k$ | a track's loan, its term in months, a month's number |
  | $q_k$, $i_k = q_k/12$ | a track's quoted yearly rate in month $k$, and its monthly rate |
  | $s$ | a prime track's spread (a standard deviation is written $\operatorname{sd}(\cdot)$) |
  | $\mathrm{BoI}_k$, $\mathrm{CPI}_k$ | the Bank of Israel rate and the consumer price index at month $k$ |
  | $M_k$, $B_k$, $m_k$ | the payment of month $k$, the balance after it, the payments left |
  | $V_k$, $E$, $C_0$ | the apartment's value in month $k$ ($V_0$ is the price), the equity, the purchase costs |
  | $\mathrm{NW}_k$ | net worth if sold in month $k$ |
  | $J_k$, $Y_k$ | the index an apartment's value follows, and the one its rent follows |
  | $\theta_k$, $\kappa$ | the taxable share of a real gain; the discount of a forced sale |
  | $g$, $\pi$ | a constant yearly growth of a value; yearly inflation |
  | $\mu$, $\sigma$, $z$ | a model's expected yearly growth, its yearly log-volatility, a standard normal shock |
  | $x_k$, $G_k$ | a modelled series' monthly log step and its level |
  | $\rho$ | a correlation (never a rate) |
  | $\lambda$ | the block length of the bootstrap, in months |
  | $T$, $S$, $N$ | a plan's term in months, the span of the starts in months, a number of windows or worlds |
  | $n_{\text{eff}}$, $n_y$ | the independent terms a study holds; a number of years |
  | $Q_p$ | the percentile $p$ of a sample |
  | $\gamma$ | the risk aversion of the certainty equivalent |
  | $a$, $b$ | the two handles of the histogram, as the page labels them |
  | $\phi_j$, $v(K)$ | a source's share of the return, and the return with the sources in $K$ switched on |
  | $\beta$, $\beta^*$ | the input a breakeven searches, and its breakeven value |
  | $\delta$ | a move of one input: in the sensitivity, and the rise of the rate stress test |
  | $j$, $k$, $w$, $t$, $d$ | counters: an item of a list, a month, a world, a year, a day |

  Shares that are fields of the form are written as words inside the formulas (`sell`, `early`, `lawyer`,
  `broker`, `maint`, `rate` with the tax's name), so `c` and `t` keep one meaning each.

- **Three kinds of "yearly rate"**, each named where it is used and compared once, on the XIRR page:
  - an *effective* rate over 365.25 days (every return the planner reports);
  - a *quoted* rate divided by 12 (a mortgage track's: 4 % quoted is 4.07 % effective);
  - an *expected growth* $\mu$ with a log-volatility $\sigma$ (a model's: the median growth is lower than $\mu$).
- **The learn drawer opens over the Planner.** It lives in the chart area, which the Planner covers; opened from the
  Planner it is raised above it.
- **The interest stress test** (`/planner/home`, `stress`). The apartment is run again with the Bank of Israel
  rate 1, 2 and 3 points higher from the second month on, everything else as entered. For each rise: the highest
  payment **over the whole term of the loan** and what is paid until the sale.
  - The whole term, not "until the sale" like the summary's highest payment: a variable track moves only at its
    reset, and a reset after the planned sale would read as "no risk".
  - Only prime and variable tracks move. A plan without one has no stress rows, and the page says why.
  - It is a what-if on the rate alone: the CPI, the value and the rent stay as entered.
- **Polish (a UX audit of the Planner against the project's profile).** Three things changed:
  - making option B the same as option A again asks first when B's forms differ from A's, since they would be
    replaced ("Replace option B with option A" / "Keep both options");
  - the download buttons read "Download CSV" (a verb first), named "Download CSV: exit months" for a screen reader;
  - a note right above a grid of fields keeps its distance from the first row.
  Left as they are, by the profile: native checkboxes with their labels as the hit target, "Reset inputs" without a
  confirmation (the forms are a draft, not saved work), and no phone layout (the profile supports 960 px and up).

## Consequences
- A page's numbers cannot drift from the engine without a failing test; its prose still can, and is reviewed by
  reading.
- The pages are English, like the rest of the app's UI.
- Adding a ninth page means adding its slug to the test's list, its sections in order, and its pinned example.
