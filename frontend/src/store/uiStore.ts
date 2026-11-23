import { create } from 'zustand';

/** How long a newly added indicator is drawn thicker. */
export const EMPHASIS_MS = 700;

export interface Toast {
  /** Bumped per toast, so a new toast restarts the timer even with the same text. */
  seq: number;
  message: string;
  undo: (() => void) | null;
}

export type SnapshotMode = 'copy' | 'download';

/** Transient UI state (not persisted): which overlay is open. */
export interface UiState {
  /** Symbol search dialog; `seed` is the text it opens with (the key typed on the chart). */
  symbolSearch: { open: boolean; seed: string };
  openSymbolSearch: (seed?: string) => void;
  closeSymbolSearch: () => void;
  indicatorsDialog: boolean;
  setIndicatorsDialog: (open: boolean) => void;
  /** Instance whose settings panel is open, or null. */
  settingsFor: string | null;
  openSettings: (uid: string | null) => void;
  /** Instance whose learn drawer is open, or null (one side panel at a time). */
  learnFor: string | null;
  openLearn: (uid: string | null) => void;
  /** Indicator whose legend row is hovered or focused: its lines stand out, the others dim. */
  legendFocus: string | null;
  setLegendFocus: (uid: string | null) => void;
  /** Indicator just added: drawn thicker for EMPHASIS_MS (ChartArea clears it). */
  emphasis: string | null;
  setEmphasis: (uid: string | null) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  /** Watchlist column on a wide window; floating panel below 1100 px (closed by default). */
  watchlist: { docked: boolean; floating: boolean };
  toggleWatchlist: (narrow: boolean) => void;
  closeFloatingWatchlist: () => void;
  toast: Toast | null;
  showToast: (message: string, undo?: () => void) => void;
  /** Chart image asked for (toolbar, palette, context menu, Alt+S); `seq` makes each one new. */
  snapshot: { seq: number; mode: SnapshotMode } | null;
  requestSnapshot: (mode: SnapshotMode) => void;
  dismissToast: () => void;
}

/** Any modal dialog open: the global hotkeys stay quiet so modals never stack. */
export function selectModalOpen(s: UiState): boolean {
  return s.symbolSearch.open || s.indicatorsDialog || s.shortcutsOpen || s.paletteOpen;
}

export const useUiStore = create<UiState>()((set) => ({
  symbolSearch: { open: false, seed: '' },
  openSymbolSearch: (seed = '') => {
    set({ symbolSearch: { open: true, seed } });
  },
  closeSymbolSearch: () => {
    set({ symbolSearch: { open: false, seed: '' } });
  },
  indicatorsDialog: false,
  setIndicatorsDialog: (open) => {
    set({ indicatorsDialog: open });
  },
  settingsFor: null,
  openSettings: (uid) => {
    set(uid === null ? { settingsFor: null } : { settingsFor: uid, learnFor: null });
  },
  learnFor: null,
  openLearn: (uid) => {
    set(uid === null ? { learnFor: null } : { learnFor: uid, settingsFor: null });
  },
  legendFocus: null,
  setLegendFocus: (uid) => {
    set({ legendFocus: uid });
  },
  emphasis: null,
  setEmphasis: (uid) => {
    set({ emphasis: uid });
  },
  shortcutsOpen: false,
  setShortcutsOpen: (open) => {
    set({ shortcutsOpen: open });
  },
  paletteOpen: false,
  setPaletteOpen: (open) => {
    set({ paletteOpen: open });
  },
  watchlist: { docked: true, floating: false },
  toggleWatchlist: (narrow) => {
    set(({ watchlist: w }) => ({
      watchlist: narrow ? { ...w, floating: !w.floating } : { ...w, docked: !w.docked },
    }));
  },
  closeFloatingWatchlist: () => {
    set(({ watchlist: w }) => ({ watchlist: { ...w, floating: false } }));
  },
  toast: null,
  showToast: (message, undo) => {
    set((s) => ({ toast: { seq: (s.toast?.seq ?? 0) + 1, message, undo: undo ?? null } }));
  },
  snapshot: null,
  requestSnapshot: (mode) => {
    set((s) => ({ snapshot: { seq: (s.snapshot?.seq ?? 0) + 1, mode } }));
  },
  dismissToast: () => {
    set({ toast: null });
  },
}));
