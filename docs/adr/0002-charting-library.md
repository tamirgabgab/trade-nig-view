# ADR 0002 — Charting library: TradingView Lightweight Charts v5

- Status: Accepted (2026-11-22)

## Context
We need performant financial canvas charts (10k+ bars), multiple panes, and an extension point for custom drawings.

## Decision
Use `lightweight-charts` **^5.3.0** (Apache-2.0). All calls go through `frontend/src/chart/ChartEngine.ts`; no other
module may import `lightweight-charts`. Keep `layout.attributionLogo: true` and credit TradingView in the README.
Use v5 panes for oscillators, `createSeriesMarkers` for markers, series/pane primitives for drawings and zone overlays
(gaps).

## Consequences
- No built-in drawing tools, no time-zone support, no non-time chart types (Renko etc.) → we build those ourselves (ADR 0004, ARCHITECTURE §6).
- ESM-only package: fine with Vite and Vitest; unit tests of `ChartEngine` mock the module, real rendering is tested with Playwright.
- The wrapper keeps an upgrade/replacement path (e.g. to the licensed Advanced Charts) cheap.

## Alternatives
- TradingView Advanced Charts / Charting Library: complete feature set, but requires a license application and is not
  open-source. Rejected for now.
- ECharts / Plotly / uPlot / D3: general-purpose; financial interactions (crosshair, price scale, panning) would be rebuilt. Rejected.
- KLineChart (Apache-2.0, has drawings built in): viable, smaller ecosystem, less TradingView-like behavior. Rejected.
