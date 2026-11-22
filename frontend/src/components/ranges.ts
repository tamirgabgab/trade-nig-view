/** Visible-range presets of the bottom bar (TradingView order). Wired to the chart in R2. */
export const RANGES = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'All'] as const;
export type RangeId = (typeof RANGES)[number];
