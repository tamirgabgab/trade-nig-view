# ADR 0004 — Own drawing framework on Lightweight Charts v5 primitives

- Status: Accepted (2026-11-22); re-confirmed at the Phase-1 review (2026-11-23), implementation details amended

## Context
Lightweight Charts has no drawing tools. Community v5 options found (2026-11-22):
- `lightweight-charts-drawing` — MIT, v0.11.1, 86 tools, very active, essentially single-maintainer, pre-1.0 API.
- `difurious/lightweight-charts-line-tools-core` — GitHub only (not on npm), young.
Our needs: a dozen tools in Phase 1, our own persistence schema (time/price anchors, versioned), undo/redo, replay
interaction, replaceable chart library, and fully unit-tested geometry.

## Decision
Build a small `DrawingManager` on **series primitives** (one primitive per drawing, `paneViews` for rendering,
`hitTest` for hover/selection, price/time axis views for labels). Geometry, snapping (magnet) and hit-testing live in
pure TS modules with unit tests. Study `lightweight-charts-drawing` for interaction details and defaults; do not depend on it.

## Consequences
- + Full control over schema, persistence, undo/redo and tests; no pre-1.0 dependency churn.
- − More work in R4 (estimated L). Scope is limited to ~12 tools in Phase 1; more tools are additive.
- Re-evaluate at the Phase-1 review: if `lightweight-charts-drawing` reaches 1.0 with a stable serialization API,
  consider adopting it for the long tail of tools (patterns, Gann) behind our `DrawingManager` interface.

## Alternatives
- Adopt `lightweight-charts-drawing` now: fastest path to many tools, but couples our persistence to a v0 API and a single maintainer. Rejected for now.
- HTML/SVG overlay on top of the canvas: easy to prototype but breaks the "no DOM hacks on the canvas" rule and drifts on pan/zoom. Rejected.

## Phase-1 review (2026-11-23)
Re-evaluated as planned. `lightweight-charts-drawing` (now under `deepentropy/`) is still pre-1.0 (v0.1.x on npm,
~68 tools, low download count); `lightweight-charts-line-tools-core` is still GitHub-only. Meanwhile our own framework
covers 14 tools with unit-tested geometry, our persistence schema, undo/redo and replay, and found and fixed one
real Lightweight Charts limitation (whole-index `logicalToCoordinate`, see ARCHITECTURE §5.2). **Decision unchanged.**
Revisit when a library reaches 1.0 with a stable serialization API, and only for the long tail (patterns, Gann),
behind `DrawingManager`.

As built (differs from the Decision text above): **one** series primitive, `chart/drawingLayer.ts` (`DrawingLayer`),
renders all drawings through its `paneViews`; there is no primitive per drawing, no primitive `hitTest` and no
price/time axis views. Hit-testing is pure TS (`drawings/shapes.ts` `hitTest`, called by `DrawingManager`), shared with
the canvas renderer. Phase 1 ships 14 tools (not ~12). Sources: github.com/deepentropy/lightweight-charts-drawing/releases, pkgstats.com.

## Second review (2026-11-26)
Our framework now holds 20+ tools, the long tail included (XABCD, ABCD, head and shoulders, icons), an eraser and a
zoom box, all through `DrawingManager` with pure, unit-tested geometry (`shapes.ts`, `patterns.ts`). Adopting a
library would now replace working code rather than add tools. **Decision unchanged; no further review planned**
unless a needed tool (e.g. Gann) turns out to be expensive to build.

