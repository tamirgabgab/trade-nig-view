import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isRecord } from '../api/client.ts';
import { DISPLAY_TIME_ZONE } from '../chart/timeZone.ts';

/** 'exchange' = the charted symbol's own exchange time zone. */
export const TIME_ZONES = [
  'exchange',
  'UTC',
  'Asia/Jerusalem',
  'America/New_York',
  'America/Chicago',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Hong_Kong',
  'Australia/Sydney',
] as const;
export type TimeZoneSetting = (typeof TIME_ZONES)[number];

const COLOR = /^#[0-9a-f]{6}$/i;

interface Persisted {
  timeZone: TimeZoneSetting;
  /** Candle colours; null = the theme's up/down colour. */
  upColor: string | null;
  downColor: string | null;
  lastPriceLine: boolean;
  volume: boolean;
}

export interface SettingsState extends Persisted {
  set: (patch: Partial<Persisted>) => void;
}

const DEFAULTS: Persisted = {
  timeZone: DISPLAY_TIME_ZONE,
  upColor: null,
  downColor: null,
  lastPriceLine: true,
  volume: true,
};

/** Only well-formed settings survive from storage; anything else is the default. */
export function sanitizePersisted(persisted: unknown): Persisted {
  const r = isRecord(persisted) ? persisted : {};
  const color = (v: unknown) => (typeof v === 'string' && COLOR.test(v) ? v : null);
  return {
    timeZone: TIME_ZONES.find((z) => z === r['timeZone']) ?? DEFAULTS.timeZone,
    upColor: color(r['upColor']),
    downColor: color(r['downColor']),
    lastPriceLine: r['lastPriceLine'] !== false,
    volume: r['volume'] !== false,
  };
}

/** Chart settings (the gear in the top bar), remembered between visits. */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (patch) => {
        set(patch);
      },
    }),
    {
      name: 'chartlab.settings',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): Persisted => ({
        timeZone: s.timeZone,
        upColor: s.upColor,
        downColor: s.downColor,
        lastPriceLine: s.lastPriceLine,
        volume: s.volume,
      }),
      migrate: (persisted) => sanitizePersisted(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
    },
  ),
);
