import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isRecord } from '../api/client.ts';
import { ESTIMATORS, type VolatilitySettings } from '../api/volatility.ts';

export const SQUEEZE_HORIZONS = ['week', 'month', 'quarter'] as const;

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

const inRange = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : fallback;

/** Only well-formed settings survive (from storage or a typed value), within the API's bounds. */
export function sanitizeVolatility(v: unknown): VolatilityPrefs {
  const r = isRecord(v) ? v : {};
  const d = DEFAULT_VOLATILITY;
  return {
    estimator: ESTIMATORS.find((e) => e.id === r['estimator'])?.id ?? d.estimator,
    horizon: SQUEEZE_HORIZONS.find((h) => h === r['horizon']) ?? d.horizon,
    threshold: inRange(r['threshold'], 1, 50, d.threshold),
    factor: inRange(r['factor'], 1.05, 5, d.factor),
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
