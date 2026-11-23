import { create } from 'zustand';

import type { Bar } from '../api/bars.ts';
import type { Gap } from '../api/analysis.ts';
import type { IndicatorView } from '../components/useChartIndicators.ts';

/** What the chart shows, for the panels outside it (Data Window, Gaps). */
export interface ChartData {
  bars: readonly Bar[];
  decimals: number;
  hasVolume: boolean;
  views: readonly IndicatorView[];
  gaps: readonly Gap[];
}

export interface ChartDataState {
  data: ChartData | null;
  /** Bar under the crosshair; null when it is off the data. */
  hoverIndex: number | null;
  /** A request to scroll the chart to a bar (the Gaps panel); `seq` makes repeats distinct. */
  focus: { time: Bar['time']; seq: number } | null;
  setData: (data: ChartData) => void;
  setHoverIndex: (index: number | null) => void;
  focusBar: (time: Bar['time']) => void;
}

/** Not persisted: the chart publishes it, the side panels read it. */
export const useChartDataStore = create<ChartDataState>()((set) => ({
  data: null,
  hoverIndex: null,
  focus: null,
  setData: (data) => {
    set({ data });
  },
  setHoverIndex: (hoverIndex) => {
    set({ hoverIndex });
  },
  focusBar: (time) => {
    set((s) => ({ focus: { time, seq: (s.focus?.seq ?? 0) + 1 } }));
  },
}));
