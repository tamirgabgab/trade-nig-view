import { isChartType, isScaleMode, type ChartType, type ScaleMode } from '../chart/chartTypes.ts';
import {
  sanitizePersisted as sanitizeIndicators,
  type IndicatorInstance,
} from '../store/indicatorStore.ts';
import { isInterval, type Interval } from './bars.ts';
import { apiDelete, apiGet, apiPut, ApiError, isRecord } from './client.ts';

/** A layout: everything that makes the chart look the way it does (ARCHITECTURE §5.3). */
export interface LayoutState {
  symbol: string;
  interval: Interval;
  chartType: ChartType;
  scaleMode: ScaleMode;
  autoScale: boolean;
  adjusted: boolean;
  indicators: IndicatorInstance[];
  /** Height factor of each own-pane indicator's pane, by instance uid. */
  stretches: Record<string, number>;
  /** First and last visible bar, in the bars' own time format. */
  visibleRange: { from: string | number; to: string | number } | null;
}

export interface SavedLayout extends LayoutState {
  name: string;
  revision: number;
}

export interface LayoutSummary {
  name: string;
  revision: number;
  updatedAt: string;
  symbol: string;
  interval: string;
}

const path = (name: string) => `/layouts/${encodeURIComponent(name)}`;
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const time = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? v : null);

/** The PUT body (snake_case, the backend's LayoutUpdate). */
export function layoutBody(revision: number, state: LayoutState): Record<string, unknown> {
  return {
    revision,
    symbol: state.symbol,
    interval: state.interval,
    chart_type: state.chartType,
    scale_mode: state.scaleMode,
    auto_scale: state.autoScale,
    adjusted: state.adjusted,
    indicators: state.indicators.map((i) => ({
      uid: i.uid,
      id: i.id,
      params: i.params,
      styles: Object.fromEntries(
        Object.entries(i.styles).map(([name, s]) => [
          name,
          { color: s.color, line_width: s.lineWidth },
        ]),
      ),
      visible: i.visible,
      pane_stretch: state.stretches[i.uid] ?? null,
    })),
    visible_range: state.visibleRange,
  };
}

/** A stored layout; malformed parts fall back to defaults instead of failing the load. */
export function parseLayout(body: unknown): SavedLayout {
  if (!isRecord(body) || typeof body['name'] !== 'string' || typeof body['symbol'] !== 'string') {
    throw new Error('Unexpected layout response');
  }
  const raw = Array.isArray(body['indicators']) ? (body['indicators'] as unknown[]) : [];
  const stretches: Record<string, number> = {};
  const instances = raw.flatMap((item) => {
    if (!isRecord(item)) return [];
    const styles = isRecord(item['styles']) ? item['styles'] : {};
    const stretch = item['pane_stretch'];
    if (typeof item['uid'] === 'string' && typeof stretch === 'number') {
      stretches[item['uid']] = stretch;
    }
    return [
      {
        ...item,
        styles: Object.fromEntries(
          Object.entries(styles).map(([name, s]) => [
            name,
            isRecord(s) ? { color: s['color'], lineWidth: s['line_width'] } : s,
          ]),
        ),
      },
    ];
  });
  const range = body['visible_range'];
  const from = isRecord(range) ? time(range['from']) : null;
  const to = isRecord(range) ? time(range['to']) : null;
  const { interval, chart_type: chartType, scale_mode: scaleMode } = body;
  return {
    name: body['name'],
    revision: typeof body['revision'] === 'number' ? body['revision'] : 0,
    symbol: body['symbol'],
    interval: isInterval(interval) ? interval : '1D',
    chartType: isChartType(chartType) ? chartType : 'candles',
    scaleMode: isScaleMode(scaleMode) ? scaleMode : 'normal',
    autoScale: body['auto_scale'] !== false,
    adjusted: body['adjusted'] !== false,
    indicators: sanitizeIndicators({ instances }).instances,
    stretches,
    visibleRange: from === null || to === null ? null : { from, to },
  };
}

function parseSummaries(body: unknown): LayoutSummary[] {
  if (!isRecord(body) || !Array.isArray(body['layouts'])) throw new Error('Unexpected layouts');
  return (body['layouts'] as unknown[]).flatMap((l) =>
    isRecord(l) && typeof l['name'] === 'string'
      ? [
          {
            name: l['name'],
            revision: Number(l['revision']),
            updatedAt: text(l['updated_at']),
            symbol: text(l['symbol']),
            interval: text(l['interval']),
          },
        ]
      : [],
  );
}

export function fetchLayouts(signal?: AbortSignal): Promise<LayoutSummary[]> {
  return apiGet('/layouts', parseSummaries, signal ? { signal } : {});
}

/** The layout, or null when there is none of that name. */
export async function fetchLayout(name: string): Promise<SavedLayout | null> {
  try {
    return await apiGet(path(name), parseLayout);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/** Save on top of `revision` (0 = a new layout); `keepalive` survives the page closing. */
export function saveLayout(
  name: string,
  revision: number,
  state: LayoutState,
  keepalive = false,
): Promise<SavedLayout> {
  return apiPut(
    path(name),
    layoutBody(revision, state),
    parseLayout,
    keepalive ? { keepalive } : {},
  );
}

export function deleteLayout(name: string, revision: number): Promise<void> {
  return apiDelete(path(name), revision);
}
