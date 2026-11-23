# ADR 0007 — Styling: CSS Modules + CSS custom properties

- Status: Accepted (2026-11-22), amended at the Phase-1 review (2026-11-23)

## Context
The UI is a dense, app-like, dark-by-default shell (toolbars, sidebars, dialogs). Chart canvas colors must come from the
same theme tokens (they are passed to `lightweight-charts` as JS values). Themes (dark/light) and user candle colors are
switchable at runtime (R6).

## Decision
CSS Modules (built into Vite) for component styles, and a single `styles/tokens.css` defining design tokens as CSS
custom properties (`--color-bg`, `--color-up`, `--color-down`, spacing on a 4 px grid, font sizes). `chart/theme.ts`
reads the same tokens via `getComputedStyle` so canvas and DOM stay in sync. No CSS-in-JS runtime.

## Consequences
- + No extra dependency or build plugin; plain CSS is easy to read and debug; runtime theme switching = swap a `data-theme` attribute.
- − More files than utility classes; we keep a small set of shared primitives (`Button`, `IconButton`, `Dialog`, `Tooltip`).

## Alternatives
- Tailwind v4: fast to write, but class-heavy markup in a dense app, and canvas colors still need a JS token bridge. Rejected (not wrong, just no clear win).
- CSS-in-JS (styled-components/emotion): runtime cost, React 19 friction. Rejected.

## Amendment (Phase-1 review, 2026-11-23)
Decision holds. The shared primitives as built are `IconButton` (with a built-in tooltip and shortcut hint),
`ModalShell` (dialog frame) and `SearchDialog`; there are no separate `Button` or `Tooltip` components.
