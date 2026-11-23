import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ParamValue, Params } from '../api/indicators.ts';

/** Colour and width of one plotted output, as chosen in the settings panel. */
export interface OutputStyle {
  color: string;
  lineWidth: number;
}

/** One indicator on the chart. `params` and `styles` are overrides of the registry defaults. */
export interface IndicatorInstance {
  uid: string;
  id: string;
  params: Params;
  styles: Record<string, OutputStyle>;
  visible: boolean;
}

export const MAX_INSTANCES = 20;
export const LINE_WIDTHS = [1, 2, 3, 4] as const;

export interface IndicatorState {
  instances: IndicatorInstance[];
  /** Counter for instance uids (never reused, so a removed instance's queries never collide). */
  seq: number;
  add: (id: string, params: Params) => string;
  setParams: (uid: string, params: Params) => void;
  setStyle: (uid: string, output: string, style: OutputStyle) => void;
  resetStyles: (uid: string) => void;
  toggleVisible: (uid: string) => void;
  remove: (uid: string) => void;
}

type Persisted = Pick<IndicatorState, 'instances' | 'seq'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isParamValue(value: unknown): value is ParamValue {
  return (
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

const COLOR = /^#[0-9a-f]{6}$/i;

function sanitizeInstance(value: unknown): IndicatorInstance | null {
  if (!isRecord(value)) return null;
  const { uid, id, params, styles, visible } = value;
  if (typeof uid !== 'string' || typeof id !== 'string' || uid === '' || id === '') return null;
  const cleanParams: Params = {};
  if (isRecord(params)) {
    for (const [name, v] of Object.entries(params)) if (isParamValue(v)) cleanParams[name] = v;
  }
  const cleanStyles: Record<string, OutputStyle> = {};
  if (isRecord(styles)) {
    for (const [name, s] of Object.entries(styles)) {
      if (!isRecord(s)) continue;
      const { color, lineWidth } = s;
      if (typeof color === 'string' && COLOR.test(color) && typeof lineWidth === 'number') {
        cleanStyles[name] = { color, lineWidth: Math.min(Math.max(Math.round(lineWidth), 1), 4) };
      }
    }
  }
  return { uid, id, params: cleanParams, styles: cleanStyles, visible: visible !== false };
}

/** Keep only well-formed saved instances (unique uids); anything else is dropped. */
export function sanitizePersisted(persisted: unknown): Persisted {
  const record = isRecord(persisted) ? persisted : {};
  const raw = Array.isArray(record['instances']) ? (record['instances'] as unknown[]) : [];
  const seen = new Set<string>();
  const instances: IndicatorInstance[] = [];
  for (const item of raw) {
    const instance = sanitizeInstance(item);
    if (instance === null || seen.has(instance.uid)) continue;
    seen.add(instance.uid);
    instances.push(instance);
  }
  const seq = record['seq'];
  return {
    instances: instances.slice(0, MAX_INSTANCES),
    seq: typeof seq === 'number' && Number.isInteger(seq) && seq >= 0 ? seq : instances.length,
  };
}

function update(
  instances: IndicatorInstance[],
  uid: string,
  change: (instance: IndicatorInstance) => IndicatorInstance,
): IndicatorInstance[] {
  return instances.map((instance) => (instance.uid === uid ? change(instance) : instance));
}

/** Indicators on the chart, remembered between visits (like TradingView's chart layout). */
export const useIndicatorStore = create<IndicatorState>()(
  persist(
    (set, get) => ({
      instances: [],
      seq: 0,
      add: (id, params) => {
        const seq = get().seq + 1;
        const uid = `${id}-${String(seq)}`;
        set((s) =>
          s.instances.length >= MAX_INSTANCES
            ? s
            : {
                seq,
                instances: [...s.instances, { uid, id, params, styles: {}, visible: true }],
              },
        );
        return uid;
      },
      setParams: (uid, params) => {
        set((s) => ({ instances: update(s.instances, uid, (i) => ({ ...i, params })) }));
      },
      setStyle: (uid, output, style) => {
        set((s) => ({
          instances: update(s.instances, uid, (i) => ({
            ...i,
            styles: { ...i.styles, [output]: style },
          })),
        }));
      },
      resetStyles: (uid) => {
        set((s) => ({ instances: update(s.instances, uid, (i) => ({ ...i, styles: {} })) }));
      },
      toggleVisible: (uid) => {
        set((s) => ({
          instances: update(s.instances, uid, (i) => ({ ...i, visible: !i.visible })),
        }));
      },
      remove: (uid) => {
        set((s) => ({ instances: s.instances.filter((i) => i.uid !== uid) }));
      },
    }),
    {
      name: 'chartlab.indicators',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): Persisted => ({ instances: state.instances, seq: state.seq }),
      migrate: (persisted) => sanitizePersisted(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
    },
  ),
);
