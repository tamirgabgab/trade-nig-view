# ADR 0015 — Appearance: theme presets, a transparent chart over a static backdrop

- Status: Accepted (2026-11-25)

## Context
The user asked for more than black or white: desktop-style pictures, market-themed backgrounds, a chosen accent and
larger text. The UX profile bans ambient motion, gradients on controls and glassmorphism. The user chose (2026-11-25):
four extra presets (Midnight, Graphite, Amber terminal, Paper); an Appearance tab in Settings; the watermark, the
Market pulse, quiet volume and a watchlist heatmap on by default; topographic lines and a ghost history as built-in
backgrounds, plus their own image. Animated backgrounds were proposed and not taken.

## Decision
- **Presets are token sets** on `html[data-theme]` (`styles/tokens.css`): Midnight, Graphite and Amber override the
  dark base, Paper the light one. The canvas reads the same tokens (`chart/theme.ts`). The sun/moon button switches
  between the light and dark families (a light preset goes to Dark, a dark one to Light).
- **Accent** on `html[data-accent]`: one interactive hue at a time (blue, purple, teal, amber), as the profile asks.
- **Text size** is a `--text-scale` factor on the three font-size tokens and on the chart's axis font.
- **The chart canvas is transparent.** A `ChartBackdrop` inside the chart's isolated host (`ChartView`, z-index −1)
  draws, in order: the theme colour or a gradient; topographic lines (seeded rings, `backdrop.topoPaths`); the ghost
  history (the symbol's weekly closes, log scale, only up to the last shown bar so a replay never sees the future); or
  the user's image (shrunk to 1920 px JPEG on upload, kept in localStorage, dimmed 70–95 % by an overlay of the
  background colour and optionally blurred). On top: the Market pulse, a radial tint by the latest change (the chart's
  own bars: daily and longer against the previous bar, intraday against the previous day's last close; opacity up to
  0.12 at a 3 % move).
- **The symbol watermark** is the library's text watermark primitive on the price pane (6 % of the text colour), so
  it is drawn by the chart and appears in snapshots. CLAUDE.md §7 now says backgrounds are DOM *beneath* the canvas,
  overlays primitives.
- **The ghost history** keeps only the weeks that are over by the last shown bar, then that bar's close: a weekly
  bar carries its Friday close, which a replay in mid-week must not show.
- **Nothing moves on its own**: the backdrop changes only with a setting, the symbol or a price.
- **Snapshots** fill the theme background under the transparent canvas; the watermark is in the image, the other
  backdrop layers are not.
- **Quiet volume** (the default): the bottom 15 % of the price pane at 0.2 opacity (was 20 % at 0.35).
- **The bottom bar spans the sidebar's column too** (`'left bottom bottom'`): the learn drawer ends at the bottom bar,
  and the sidebar's symbol card no longer shows below it (reaching the window's bottom instead hid the bottom bar's
  scale buttons).
- **Accents** set their own `--color-on-accent` (dark text on amber; a darker teal) for 4.5:1; the theme and accent
  selectors match any element, so the Settings swatches show each preset from the tokens themselves.

## Consequences
- + New looks without new dependencies or licences; the chart stays the hero (dimming, low opacities).
- + Every backdrop is testable as pure functions (`backdrop.ts`) and DOM.
- − A data URL image takes localStorage space (about 0.2–0.5 MB).
- − The isolation lives on `ChartView`'s host: putting `isolation` on the chart area would trap the learn drawer and
  the context menu below the sidebar (found in E2E).
