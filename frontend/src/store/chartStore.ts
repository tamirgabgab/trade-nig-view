import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isInterval, type Interval } from '../api/bars.ts';
import {
  DEFAULT_CHART_TYPE,
  isChartType,
  isScaleMode,
  type ChartType,
  type ScaleMode,
} from '../chart/chartTypes.ts';
import { RANGE_INTERVAL, type RangeId } from '../chart/visibleRange.ts';
import { useReplayStore } from './replayStore.ts';

export const DEFAULT_SYMBOL = 'AAPL';
export const DEFAULT_INTERVAL: Interval = '1D';
const MAX_SYMBOL_LENGTH = 20;

/** A range button click, applied by the chart once bars of its interval have loaded. */
export interface RangeRequest {
  id: RangeId;
  /** Increments on every click, so clicking the same range again re-applies it. */
  seq: number;
}

export interface ChartState {
  /** Provider symbol, e.g. 'AAPL' or '^GSPC' (the universe's `symbol`, not `display`). */
  symbol: string;
  interval: Interval;
  chartType: ChartType;
  scaleMode: ScaleMode;
  /** Price axis fits the visible bars (off after the user drags the axis). */
  autoScale: boolean;
  /** Dividend-adjusted history (ADJ). */
  adjusted: boolean;
  /** Symbols drawn as % lines over the chart (Compare), at most MAX_COMPARE. */
  compare: string[];
  addCompare: (symbol: string) => void;
  removeCompare: (symbol: string) => void;
  /** Highlighted range button; cleared when the user picks another interval or symbol. */
  range: RangeId | null;
  rangeRequest: RangeRequest | null;
  setSymbol: (symbol: string) => void;
  setInterval: (interval: Interval) => void;
  setChartType: (chartType: ChartType) => void;
  /** Toggle `%` or `log`; they are mutually exclusive, toggling the active one returns to normal. */
  toggleScaleMode: (mode: Exclude<ScaleMode, 'normal'>) => void;
  setAutoScale: (autoScale: boolean) => void;
  setAdjusted: (adjusted: boolean) => void;
  /** Range button: switch to the range's interval and show that span. */
  selectRange: (id: RangeId) => void;
}

type Persisted = Pick<
  ChartState,
  'symbol' | 'interval' | 'chartType' | 'scaleMode' | 'autoScale' | 'adjusted' | 'compare'
>;

/** Symbols a chart compares with at most (the backend's MAX_COMPARE). */
export const MAX_COMPARE = 3;

/** At most MAX_COMPARE distinct, well-formed symbols. */
export function sanitizeCompare(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const symbols = value.filter(
    (v): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_SYMBOL_LENGTH,
  );
  return [...new Set(symbols)].slice(0, MAX_COMPARE);
}

/** Keep only well-formed persisted values; anything else falls back to the defaults. */
export function sanitizePersisted(persisted: unknown): Persisted {
  const record =
    typeof persisted === 'object' && persisted !== null
      ? (persisted as Record<string, unknown>)
      : {};
  const symbol = record['symbol'];
  const interval = record['interval'];
  const chartType = record['chartType'];
  const scaleMode = record['scaleMode'];
  return {
    symbol:
      typeof symbol === 'string' && symbol.length > 0 && symbol.length <= MAX_SYMBOL_LENGTH
        ? symbol
        : DEFAULT_SYMBOL,
    interval: isInterval(interval) ? interval : DEFAULT_INTERVAL,
    chartType: isChartType(chartType) ? chartType : DEFAULT_CHART_TYPE,
    scaleMode: isScaleMode(scaleMode) ? scaleMode : 'normal',
    autoScale: record['autoScale'] !== false,
    adjusted: record['adjusted'] !== false,
    compare: sanitizeCompare(record['compare']),
  };
}

/**
 * Chart selection and display settings, remembered in localStorage between visits.
 * If storage is unavailable (private window, blocked site data) the app still works with defaults.
 */
export const useChartStore = create<ChartState>()(
  persist(
    (set) => ({
      symbol: DEFAULT_SYMBOL,
      interval: DEFAULT_INTERVAL,
      chartType: DEFAULT_CHART_TYPE,
      scaleMode: 'normal',
      autoScale: true,
      adjusted: true,
      compare: [],
      range: null,
      rangeRequest: null,
      addCompare: (symbol) => {
        set((s) =>
          s.compare.includes(symbol) || s.compare.length >= MAX_COMPARE || symbol === s.symbol
            ? s
            : // The lines start together on the % scale, as in TradingView.
              { compare: [...s.compare, symbol], scaleMode: 'percent' },
        );
      },
      removeCompare: (symbol) => {
        set((s) => ({ compare: s.compare.filter((c) => c !== symbol) }));
      },
      setSymbol: (symbol) => {
        set((s) => (s.symbol === symbol ? s : { symbol, range: null, rangeRequest: null }));
      },
      setInterval: (interval) => {
        // Locked during a bar replay (R7), whoever asks: buttons, palette, undo.
        if (useReplayStore.getState().mode !== 'off') return;
        set({ interval, range: null, rangeRequest: null });
      },
      setChartType: (chartType) => {
        set({ chartType });
      },
      toggleScaleMode: (mode) => {
        set((s) => ({ scaleMode: s.scaleMode === mode ? 'normal' : mode }));
      },
      setAutoScale: (autoScale) => {
        set({ autoScale });
      },
      setAdjusted: (adjusted) => {
        set({ adjusted });
      },
      selectRange: (id) => {
        if (useReplayStore.getState().mode !== 'off') return;
        set((s) => ({
          interval: RANGE_INTERVAL[id],
          range: id,
          rangeRequest: { id, seq: (s.rangeRequest?.seq ?? 0) + 1 },
        }));
      },
    }),
    {
      name: 'chartlab.chart',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): Persisted => ({
        symbol: state.symbol,
        interval: state.interval,
        chartType: state.chartType,
        scaleMode: state.scaleMode,
        autoScale: state.autoScale,
        adjusted: state.adjusted,
        compare: state.compare,
      }),
      // Version 1 stored only symbol + interval; sanitizing fills the new fields with defaults.
      migrate: (persisted) => sanitizePersisted(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
    },
  ),
);
