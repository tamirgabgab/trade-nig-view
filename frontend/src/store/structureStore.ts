import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isRecord } from '../api/client.ts';

/** Gap sizes the Gaps panel offers, in percent of the previous close. */
export const GAP_MIN_PCTS = [0.5, 1, 2, 3, 5] as const;

/** The forecast's settings (P3 F2): k bars ahead, the model, auto-tuned or manual parameters. */
export interface ForecastSettings {
  k: number;
  model: 'a' | 'c';
  auto: boolean;
  /** Manual: training bars, 0 = all the history. */
  window: number;
  ridge: number;
  lags: number;
}

export const DEFAULT_FORECAST: ForecastSettings = {
  k: 5,
  model: 'c',
  auto: true,
  window: 500,
  ridge: 100,
  lags: 3,
};

interface Persisted {
  gaps: boolean;
  gapMinPct: number;
  gapPartial: boolean;
  forecast: boolean;
  forecastSettings: ForecastSettings;
}

export interface StructureState extends Persisted {
  toggleGaps: () => void;
  setGapMinPct: (pct: number) => void;
  setGapPartial: (partial: boolean) => void;
  toggleForecast: () => void;
  setForecastSettings: (change: Partial<ForecastSettings>) => void;
}

const inRange = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : fallback;

function sanitizeForecast(v: unknown): ForecastSettings {
  const r = isRecord(v) ? v : {};
  const d = DEFAULT_FORECAST;
  const window = inRange(r['window'], 0, 100_000, d.window);
  return {
    k: Math.round(inRange(r['k'], 1, 20, d.k)),
    model: r['model'] === 'a' ? 'a' : 'c',
    auto: r['auto'] !== false,
    // 1-59 bars cannot train a model (the backend refuses them).
    window: window > 0 && window < 60 ? d.window : Math.round(window),
    ridge: inRange(r['ridge'], 1e-6, 1e6, d.ridge),
    lags: Math.round(inRange(r['lags'], 1, 10, d.lags)),
  };
}

/** Only well-formed settings survive from storage. */
export function sanitizePersisted(persisted: unknown): Persisted {
  const r = isRecord(persisted) ? persisted : {};
  const pct = GAP_MIN_PCTS.find((p) => p === r['gapMinPct']);
  return {
    gaps: r['gaps'] === true,
    gapMinPct: pct ?? 1,
    gapPartial: r['gapPartial'] === true,
    forecast: r['forecast'] === true,
    forecastSettings: sanitizeForecast(r['forecastSettings']),
  };
}

/**
 * Market-structure overlays that are not indicators: the gap zones, the forecast (P3) and their
 * settings (previous-period levels and pivots are registry indicators). Remembered between visits.
 */
export const useStructureStore = create<StructureState>()(
  persist(
    (set) => ({
      gaps: false,
      gapMinPct: 1,
      gapPartial: false,
      toggleGaps: () => {
        set((s) => ({ gaps: !s.gaps }));
      },
      setGapMinPct: (gapMinPct) => {
        set({ gapMinPct });
      },
      setGapPartial: (gapPartial) => {
        set({ gapPartial });
      },
      forecast: false,
      forecastSettings: DEFAULT_FORECAST,
      toggleForecast: () => {
        set((s) => ({ forecast: !s.forecast }));
      },
      setForecastSettings: (change) => {
        set((s) => ({ forecastSettings: sanitizeForecast({ ...s.forecastSettings, ...change }) }));
      },
    }),
    {
      name: 'chartlab.structure',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): Persisted => ({
        gaps: s.gaps,
        gapMinPct: s.gapMinPct,
        gapPartial: s.gapPartial,
        forecast: s.forecast,
        forecastSettings: s.forecastSettings,
      }),
      migrate: (persisted) => sanitizePersisted(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
    },
  ),
);
