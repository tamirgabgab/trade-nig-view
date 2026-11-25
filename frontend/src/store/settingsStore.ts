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

/** The one interactive hue (styles/tokens.css, data-accent). */
export const ACCENTS = ['blue', 'purple', 'teal', 'amber'] as const;
export type Accent = (typeof ACCENTS)[number];
/** Text size: a factor on every text token. */
export const TEXT_SCALES = [1, 1.1, 1.25] as const;
export type TextScale = (typeof TEXT_SCALES)[number];
/** What is drawn behind the chart. */
export const BACKDROPS = [
  'solid',
  'gradient',
  'topo',
  'ghost',
  'image',
  'candles',
  'ticker',
  'aurora',
] as const;
export type Backdrop = (typeof BACKDROPS)[number];
/** How much an image background is dimmed (0.7-0.95) and blurred (0-12 px). */
export const DIM_RANGE = [0.7, 0.95] as const;
export const BLUR_MAX = 12;

interface Persisted {
  timeZone: TimeZoneSetting;
  /** Candle colours; null = the theme's up/down colour. */
  upColor: string | null;
  downColor: string | null;
  lastPriceLine: boolean;
  volume: boolean;
  /** Volume in the bottom 15 % of the price pane, fainter (else 20 %). */
  quietVolume: boolean;
  accent: Accent;
  textScale: TextScale;
  backdrop: Backdrop;
  /** The symbol and interval written large behind the bars. */
  watermark: boolean;
  /** A faint green or red tint of the chart by the day's change. */
  pulse: boolean;
  /** Watchlist tiles coloured by the day's change, under the list. */
  heatmap: boolean;
  imageDim: number;
  imageBlur: number;
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
  quietVolume: true,
  accent: 'blue',
  textScale: 1,
  backdrop: 'solid',
  watermark: true,
  pulse: true,
  heatmap: true,
  imageDim: 0.85,
  imageBlur: 0,
};

const inRange = (v: unknown, lo: number, hi: number) =>
  typeof v === 'number' && v >= lo && v <= hi ? v : undefined;

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
    quietVolume: r['quietVolume'] !== false,
    accent: ACCENTS.find((a) => a === r['accent']) ?? DEFAULTS.accent,
    textScale: TEXT_SCALES.find((t) => t === r['textScale']) ?? DEFAULTS.textScale,
    backdrop: BACKDROPS.find((b) => b === r['backdrop']) ?? DEFAULTS.backdrop,
    watermark: r['watermark'] !== false,
    pulse: r['pulse'] !== false,
    heatmap: r['heatmap'] !== false,
    imageDim: inRange(r['imageDim'], DIM_RANGE[0], DIM_RANGE[1]) ?? DEFAULTS.imageDim,
    imageBlur: inRange(r['imageBlur'], 0, BLUR_MAX) ?? DEFAULTS.imageBlur,
  };
}

/** Chart and appearance settings (the gear in the top bar), remembered between visits. */
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
      partialize: (s): Persisted => sanitizePersisted(s),
      migrate: (persisted) => sanitizePersisted(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
    },
  ),
);
