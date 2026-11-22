/** Chart types of the top-toolbar menu. Heikin Ashi bars are computed by the backend. */
export const CHART_TYPES = [
  { id: 'candles', label: 'Candles' },
  { id: 'hollow', label: 'Hollow candles' },
  { id: 'bars', label: 'Bars' },
  { id: 'line', label: 'Line' },
  { id: 'area', label: 'Area' },
  { id: 'heikin_ashi', label: 'Heikin Ashi' },
] as const;

export type ChartType = (typeof CHART_TYPES)[number]['id'];

export const DEFAULT_CHART_TYPE: ChartType = 'candles';

export function isChartType(value: unknown): value is ChartType {
  return typeof value === 'string' && CHART_TYPES.some((t) => t.id === value);
}

export function chartTypeLabel(type: ChartType): string {
  return CHART_TYPES.find((t) => t.id === type)?.label ?? type;
}

/** `/api/bars?transform=` for a chart type: only Heikin Ashi rebuilds the bars themselves. */
export type BarTransform = 'none' | 'heikin_ashi';

export function transformFor(type: ChartType): BarTransform {
  return type === 'heikin_ashi' ? 'heikin_ashi' : 'none';
}

/** Price-scale mode of the right axis (the bottom-bar `%` and `log` toggles). */
export type ScaleMode = 'normal' | 'percent' | 'log';

export function isScaleMode(value: unknown): value is ScaleMode {
  return value === 'normal' || value === 'percent' || value === 'log';
}
