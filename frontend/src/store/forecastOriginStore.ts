import { create } from 'zustand';

import type { Bar } from '../api/bars.ts';

export interface ForecastOrigin {
  symbol: string;
  interval: string;
  time: Bar['time'];
}

/**
 * A forecast made at a past bar outside replay ("Forecast from this bar"): the chart then shows
 * the actual bars after it against the forecast. Only for its symbol and interval; not saved.
 */
export const useForecastOriginStore = create<{
  origin: ForecastOrigin | null;
  setOrigin: (origin: ForecastOrigin | null) => void;
}>()((set) => ({
  origin: null,
  setOrigin: (origin) => {
    set({ origin });
  },
}));
