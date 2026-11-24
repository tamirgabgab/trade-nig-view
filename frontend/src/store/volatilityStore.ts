import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isRecord } from '../api/client.ts';
import { ESTIMATORS, type VolatilitySettings } from '../api/volatility.ts';

export const SQUEEZE_HORIZONS = ['week', 'month', 'quarter'] as const;
/** The squeeze ranks and expansion factors the tab offers. */
export const THRESHOLDS = [5, 10, 20, 30];
export const FACTORS = [1.25, 1.5, 2, 3];

export interface VolatilityPrefs extends VolatilitySettings {
  /** Show volatilities in % a year (else % a bar). */
  annual: boolean;
}

export const DEFAULT_VOLATILITY: VolatilityPrefs = {
  estimator: 'yang_zhang',
  horizon: 'month',
  threshold: 10,
  factor: 1.5,
  annual: true,
};

/** Only the offered settings survive (from storage too), so the selects show what is queried. */
export function sanitizeVolatility(v: unknown): VolatilityPrefs {
  const r = isRecord(v) ? v : {};
  const d = DEFAULT_VOLATILITY;
  return {
    estimator: ESTIMATORS.find((e) => e.id === r['estimator'])?.id ?? d.estimator,
    horizon: SQUEEZE_HORIZONS.find((h) => h === r['horizon']) ?? d.horizon,
    threshold: THRESHOLDS.find((t) => t === r['threshold']) ?? d.threshold,
    factor: FACTORS.find((f) => f === r['factor']) ?? d.factor,
    annual: r['annual'] !== false,
  };
}

interface VolatilityState {
  prefs: VolatilityPrefs;
  setPrefs: (change: Partial<VolatilityPrefs>) => void;
}

/** The Volatility tab's settings (P3 V1), remembered between visits. */
export const useVolatilityStore = create<VolatilityState>()(
  persist(
    (set) => ({
      prefs: DEFAULT_VOLATILITY,
      setPrefs: (change) => {
        set((s) => ({ prefs: sanitizeVolatility({ ...s.prefs, ...change }) }));
      },
    }),
    {
      name: 'chartlab.volatility',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ prefs: s.prefs }),
      merge: (persisted, current) => ({
        ...current,
        prefs: sanitizeVolatility(isRecord(persisted) ? persisted['prefs'] : undefined),
      }),
    },
  ),
);
