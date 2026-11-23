import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isRecord } from '../api/client.ts';

/** Gap sizes the Gaps panel offers, in percent of the previous close. */
export const GAP_MIN_PCTS = [0.5, 1, 2, 3, 5] as const;

interface Persisted {
  gaps: boolean;
  gapMinPct: number;
  gapPartial: boolean;
}

export interface StructureState extends Persisted {
  toggleGaps: () => void;
  setGapMinPct: (pct: number) => void;
  setGapPartial: (partial: boolean) => void;
}

/** Only well-formed settings survive from storage. */
export function sanitizePersisted(persisted: unknown): Persisted {
  const r = isRecord(persisted) ? persisted : {};
  const pct = GAP_MIN_PCTS.find((p) => p === r['gapMinPct']);
  return {
    gaps: r['gaps'] === true,
    gapMinPct: pct ?? 1,
    gapPartial: r['gapPartial'] === true,
  };
}

/**
 * Market-structure overlays that are not indicators: the gap zones and their settings
 * (previous-period levels and pivots are registry indicators). Remembered between visits.
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
    }),
    {
      name: 'chartlab.structure',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): Persisted => ({
        gaps: s.gaps,
        gapMinPct: s.gapMinPct,
        gapPartial: s.gapPartial,
      }),
      migrate: (persisted) => sanitizePersisted(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
    },
  ),
);
