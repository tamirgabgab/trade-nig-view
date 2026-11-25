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
  background colour and optionally blurred). On top: the Market pulse, a radial tint by the day's change (the chart's
  own bars: daily against the previous bar, intraday against the previous day's last close; opacity up to 0.12 at a
  3 % move), and the symbol watermark at 5 % opacity.
- **Nothing moves on its own**: the backdrop changes only with a setting, the symbol or a price.
- **Snapshots** fill the theme background under the transparent canvas; the backdrop is not in the image.
- **Quiet volume** (the default): the bottom 15 % of the price pane at 0.2 opacity (was 20 % at 0.35).
- **The learn drawer** reaches the window's bottom: the sidebar runs there, and its symbol card showed below it.

## Consequences
- + New looks without new dependencies or licences; the chart stays the hero (dimming, low opacities).
- + Every backdrop is testable as pure functions (`backdrop.ts`) and DOM.
- − A data URL image takes localStorage space (about 0.2–0.5 MB).
- − The isolation lives on `ChartView`'s host: putting `isolation` on the chart area would trap the learn drawer and
  the context menu below the sidebar (found in E2E).
