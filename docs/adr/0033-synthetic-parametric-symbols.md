# ADR 0033 — A parametric synthetic symbol: the user's statistics and distribution

- Status: Accepted (2026-11-27)

## Context
K2 (`docs/ROADMAP.md`, Phase K) is a synthetic symbol drawn from statistics the user sets, on the frame of K0 (ADR
0031) and the union of kinds of K1 (ADR 0032). The user's answers before K2: μ is the expected simple yearly return;
exactness is a field (in the distribution by default, or exact in the path); five families (normal, Student-t,
uniform, Laplace, skew-normal); three layers (AR(1) memory, Merton jumps, GARCH(1,1) volatility clusters) that keep
μ and σ; a preview in the dialog (the drawn daily returns under the family's density, and the realized moments); a
new part of the `synthetic-symbols` learn page; the hours as in K0; defaults μ 7 %, σ 18 %, normal.

## Decision
- **A third kind.** `ParametricDefinition` (`kind: "parametric"`) has the shared fields, K0's first date, length
  and currency, and a `ReturnShape`: `mean_pct` (−50 to 100, 7), `vol_pct` (1 to 100, 18), `distribution`, `df`
  (above 2, 5), `skew` (−20 to 20, −4), `exact` (false), `memory` (−0.9 to 0.9, 0), `jumps_per_year` (0 to 50, 0),
  `jump_mean_pct` (−5), `jump_sd_pct` (5), `garch_alpha` (0 to 0.5, 0), `garch_beta` (0 to 0.99, 0). Two rules
  across fields: α + β < 1 (a finite long-run variance), and the jumps' yearly variance λ(μ_J² + σ_J²) below σ²
  (the diffusion keeps a share). It has volume.
- **The year** is `YEAR_BARS` = 365.25 × 5/7 ≈ 260.89 bars (the weekdays of an average calendar year), and
  n = 261 the days a year's sum adds. **σ is the annualised daily standard deviation** without memory, and the
  standard deviation of a year's summed returns with it.
- **The returns** (`app/data/synthetic_returns.py`): standardised shocks of the family (mean 0, variance 1),
  the diffusion D (GARCH variance from its long-run q, AR(1) on top), compensated Merton jumps (a Poisson count,
  normal sizes), and the daily mean m with (1 + m)^N = 1 + μ, corrected for memory's covariances (exact without
  memory, second order with it). The formulas are in the module's docstring and on the learn page.
- **Exact in the path**: the whole path is shifted and scaled so its own daily mean and standard deviation are the
  targets m and s; each day's diffusion standard deviation and jump are scaled by the same factor, so the open's gap
  and the wicks follow the scaled close. It is not prefix-stable (the whole path sets them); without it a longer path starts with the
  shorter one (separate seeded streams per draw kind: `[seed, 1]` shocks, `[seed, 2]` counts, `[seed, 3]` sizes).
- **The floor**: 1 + R ≥ 0.01, applied last (after Exact), counted for the preview.
- **The bars** reuse K0's hours: seven 1h bars a day along a bridge from the open to the close, with the day's
  diffusion standard deviation √h for the wicks and the gap; the day's raw jump enters the **open** (a jump is a
  gap), floored at 5 % of the last close; the volume grows with the day's move. The daily close is exactly the
  drawn return's. As K0's, the hours are memoised for the last four definitions and the daily bars for every one
  (`MAX_DEFINITIONS`), so a quote poll does not redraw them.
- **The preview**: `POST /api/synthetic/preview` with the shape, the seed and the length (no name, nothing
  stored) returns a 40-bin histogram of the drawn daily returns over mean ± 5 sd (the tails in the end bins), the
  family's density as expected counts at 161 points, the realized yearly mean ((1 + r̄)^N − 1) and daily sd × √N,
  the realized skewness and excess kurtosis next to the family's (null when it has no finite value: a t's
  skewness with ν ≤ 3, its kurtosis with ν ≤ 4), and the floored days. The dialog asks for it 300 ms after the last change and keeps the last one while the next loads.
- **The dialog** gets the kind "Statistics (parametric)": the targets, the family (and only its own field: ν for
  the t, α for the skew-normal; a hidden one that is not valid goes back to its default when the family changes),
  Exact, the layers (folded at first while all are off, then opened and closed only by the user), the preview, and
  the reason when there is none. The length, first date and currency are shared with the lab scenario's draft. The form checks every
  rule itself (`noValidate`: a typed 7.3 % is off the spinner's step but valid).

## What holds (the tests)
- Each family's shocks have mean 0, variance 1 and the documented skewness and kurtosis (400,000 draws); each
  density integrates to 1 with mean 0 and variance 1.
- Golden model: a scalar loop of the recursions on the module's own draws, `rtol=1e-9`, over eight layer mixes;
  without layers the returns are exactly m + √q z.
- Calibration (Monte Carlo, written tolerances): the mean simple yearly return is μ within 1.6 points and the
  yearly volatility σ within 6 %, for every layer, over 2,000 years; μ over calendar years of the app's own bars.
- Exact mode hits m and s to 1e-12, also with a t of ν = 2.5 and jumps; the floor; prefix stability (property);
  valid bars that aggregate their hours; inconsistent statistics refused; the learn page's worked example.
- API: a created symbol's 800 daily bars and their 1h hours, with volume; replay at 1h, 4h and 1D cut at the cursor
  in both modes; inconsistent statistics as 422; the preview (counts, the family's skewness, σ, the floor, 422).
  Dialog tests and an E2E test (preview, create, chart with volume, 1h).

## Consequences
- K3 (a shuffled copy of a real symbol) is a fourth `kind` on the same union and the same hours.
- With memory, μ is an approximation (second order); the learn page says so, and Exact gives the path's own
  numbers when they must be the targets.
