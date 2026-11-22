import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isInterval, type Interval } from '../api/bars.ts';

export const DEFAULT_SYMBOL = 'AAPL';
export const DEFAULT_INTERVAL: Interval = '1D';
const MAX_SYMBOL_LENGTH = 20;

export interface ChartState {
  /** Provider symbol, e.g. 'AAPL' or '^GSPC' (the universe's `symbol`, not `display`). */
  symbol: string;
  interval: Interval;
  setSymbol: (symbol: string) => void;
  setInterval: (interval: Interval) => void;
}

/** Keep only well-formed persisted values; anything else falls back to the defaults. */
export function sanitizePersisted(persisted: unknown): Pick<ChartState, 'symbol' | 'interval'> {
  const record =
    typeof persisted === 'object' && persisted !== null
      ? (persisted as Record<string, unknown>)
      : {};
  const symbol = record['symbol'];
  const interval = record['interval'];
  return {
    symbol:
      typeof symbol === 'string' && symbol.length > 0 && symbol.length <= MAX_SYMBOL_LENGTH
        ? symbol
        : DEFAULT_SYMBOL,
    interval: isInterval(interval) ? interval : DEFAULT_INTERVAL,
  };
}

/**
 * Chart selection (symbol + interval), remembered in localStorage between visits.
 * If storage is unavailable (private window, blocked site data) the app still works with defaults.
 */
export const useChartStore = create<ChartState>()(
  persist(
    (set) => ({
      symbol: DEFAULT_SYMBOL,
      interval: DEFAULT_INTERVAL,
      setSymbol: (symbol) => {
        set({ symbol });
      },
      setInterval: (interval) => {
        set({ interval });
      },
    }),
    {
      name: 'chartlab.chart',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ symbol: state.symbol, interval: state.interval }),
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
    },
  ),
);
