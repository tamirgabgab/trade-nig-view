# ADR 0012 — Trade plan: chances from normalised historical paths, with the exact Brownian bridge

- Status: Accepted (2026-11-25)

## Context
P3 round T1 (designed with the user): a drawing tool for an entry, a target and a stop, with the chance of each exit
over a holding time, the expected result, the position size, an EV heat map and a calibration on past plans. The user
chose one tool whose side follows the target, limit entries with a fill probability, the exact Brownian bridge for a
bar that touches both levels, and position sizing, the heat map and calibration (no commission model).

## Decision
- **Paths, not a model.** Every window of h bars before the entry, as log ratios to its start close, divided by the
  volatility at its start and multiplied by today's (Yang–Zhang over a month, ADR 0011): filtered historical
  simulation of whole paths. Deterministic (every window once), so the numbers are reproducible and testable.
- **Orders.** An entry at the origin's close is immediate; any other is an order that fills on touch (a gap through it
  fills at the open). The fill bar counts a stop touch, and a target touch only for an order above the close
  (cautious where the order is unknowable from OHLC).
- **Exits.** First touch from the bar after the fill; a gap beyond a level exits at the open; neither by h exits at
  the h-th close. R on prices, so shorts are measured on the price fall.
- **Two-level bars.** The exact Brownian bridge (open to close, both levels touched, variance from the bar's own range
  by Parkinson): an image series for the first exit and a reflection for the rest, Gauss–Legendre quadrature in
  time, tabulated once on a 35 × 35 × 69 grid (about a second) and interpolated (error below 0.002). Checked against
  continuity-corrected simulated bridges (within 0.02). The bounds with all such bars to either side are shown too.
- **Calibration.** At the last 500 origins, the 36 heat-map plans (immediate entry) forecast from the paths that ended
  by the last refit (every 50 bars), against each origin's own path; reliability in 10 % bins and the Brier score
  against the base rate.
- **API.** `GET /api/trade-plan` with the entry anchor's time, the three prices, h and an optional replay cursor in
  epoch seconds (not a date: intraday replays would leak the rest of the day). No cache: 0.3–0.4 s.

## Consequences
- + Gaps, fat tails and volatility clustering inside a path are real, not assumed; the textbook gambler's ruin is
  shown as a reference and reproduced on a driftless walk (33.6 % vs 1/3).
- − The paths carry the history's drift; overlapping windows are far fewer independent outcomes than paths.
- − Slippage beyond gaps and commissions are not modelled.

## Alternatives
- Closed-form first passage only: no gaps, no fat tails, no clustering. Kept as the reference.
- Random block bootstrap: needs random draws and a block length; whole windows are the natural block here.
- Stop-first or open-proximity rules for two-level bars: biased; the user chose the bridge.
