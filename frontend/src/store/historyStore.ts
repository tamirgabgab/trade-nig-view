import { create } from 'zustand';

import type { Interval } from '../api/bars.ts';
import type { Drawing } from '../drawings/types.ts';
import { useChartStore } from './chartStore.ts';
import { useDrawingStore } from './drawingStore.ts';
import { useIndicatorStore, type IndicatorInstance } from './indicatorStore.ts';
import { useUiStore } from './uiStore.ts';

/**
 * One undo/redo history for the whole chart (R6): symbol and interval switches, indicator changes
 * and drawing changes, in the order they happened. Each step keeps the state before and after
 * (snapshots, not commands), so undo and redo just put one of them back. Changes in quick
 * succession of the same kind (a drag, typing a length) merge into one step.
 */

export type HistoryEntry =
  | { kind: 'chart'; before: ChartSnap; after: ChartSnap }
  | { kind: 'indicators'; before: IndicatorInstance[]; after: IndicatorInstance[] }
  | { kind: 'drawings'; symbol: string; before: Drawing[]; after: Drawing[] };

interface ChartSnap {
  symbol: string;
  interval: Interval;
}

export const MAX_STEPS = 100;
/** Changes of one kind closer together than this are one step. */
export const MERGE_MS = 600;

export interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
  undo: () => void;
  redo: () => void;
  /** Forget everything (a layout was loaded). */
  clear: () => void;
}

/** True while a step is being put back: the store changes it makes are not new steps. */
let applying = false;
let lastAt = 0;

function apply(entry: HistoryEntry, side: 'before' | 'after'): boolean {
  applying = true;
  try {
    if (entry.kind === 'chart') {
      const { symbol, interval } = entry[side];
      const chart = useChartStore.getState();
      chart.setSymbol(symbol);
      if (chart.interval !== interval) chart.setInterval(interval);
      return true;
    }
    if (entry.kind === 'indicators') {
      const instances = entry[side];
      const keep = new Set(instances.map((i) => i.uid));
      for (const i of useIndicatorStore.getState().instances) {
        if (!keep.has(i.uid)) useUiStore.getState().forgetIndicator(i.uid);
      }
      useIndicatorStore.setState({ instances });
      return true;
    }
    const drawings = useDrawingStore.getState();
    // The drawings of a symbol switched back to are still loading: try again in a moment.
    if (drawings.symbol !== entry.symbol) return false;
    drawings.replaceAll(entry[side]);
    return true;
  } finally {
    applying = false;
  }
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  past: [],
  future: [],
  undo: () => {
    const entry = get().past.at(-1);
    if (entry === undefined || !apply(entry, 'before')) return;
    set((s) => ({ past: s.past.slice(0, -1), future: [...s.future, entry] }));
    lastAt = 0;
  },
  redo: () => {
    const entry = get().future.at(-1);
    if (entry === undefined || !apply(entry, 'after')) return;
    set((s) => ({ future: s.future.slice(0, -1), past: [...s.past, entry] }));
    lastAt = 0;
  },
  clear: () => {
    set({ past: [], future: [] });
  },
}));

/** Add a step, or merge it into the last one when it continues it. */
function record(entry: HistoryEntry, now: number): void {
  if (applying) return;
  useHistoryStore.setState((s) => {
    const last = s.past.at(-1);
    const continues =
      last !== undefined &&
      last.kind === entry.kind &&
      entry.kind !== 'chart' &&
      now - lastAt < MERGE_MS &&
      (entry.kind !== 'drawings' || (last.kind === 'drawings' && last.symbol === entry.symbol));
    lastAt = now;
    const merged = continues ? ({ ...last, after: entry.after } as HistoryEntry) : entry;
    const past = continues ? [...s.past.slice(0, -1), merged] : [...s.past, merged];
    return { past: past.slice(-MAX_STEPS), future: [] };
  });
}

/** Start recording the stores' changes; returns the stop function. */
export function recordHistory(now: () => number = Date.now): () => void {
  const offChart = useChartStore.subscribe((s, prev) => {
    if (s.symbol === prev.symbol && s.interval === prev.interval) return;
    record(
      {
        kind: 'chart',
        before: { symbol: prev.symbol, interval: prev.interval },
        after: { symbol: s.symbol, interval: s.interval },
      },
      now(),
    );
  });
  const offIndicators = useIndicatorStore.subscribe((s, prev) => {
    if (s.instances === prev.instances) return;
    record({ kind: 'indicators', before: prev.instances, after: s.instances }, now());
  });
  const offDrawings = useDrawingStore.subscribe((s, prev) => {
    // An edit of the loaded drawings (loads reset `edits`, a switch changes the symbol).
    if (s.symbol === null || s.symbol !== prev.symbol || s.edits <= prev.edits) return;
    if (s.drawings === prev.drawings) return;
    record({ kind: 'drawings', symbol: s.symbol, before: prev.drawings, after: s.drawings }, now());
  });
  return () => {
    offChart();
    offIndicators();
    offDrawings();
  };
}
