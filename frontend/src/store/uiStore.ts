import { create } from 'zustand';

/** How long a newly added indicator is drawn thicker. */
export const EMPHASIS_MS = 700;

export interface Toast {
  /** Bumped per toast, so a new toast restarts the timer even with the same text. */
  seq: number;
  message: string;
  undo: (() => void) | null;
}

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
  /** Indicator just added: drawn thicker for EMPHASIS_MS. */
  emphasis: string | null;
  emphasize: (uid: string) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  toast: Toast | null;
  showToast: (message: string, undo?: () => void) => void;
  dismissToast: () => void;
}

let emphasisTimer: number | undefined;

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
  emphasize: (uid) => {
    window.clearTimeout(emphasisTimer);
    set({ emphasis: uid });
    emphasisTimer = window.setTimeout(() => {
      set({ emphasis: null });
    }, EMPHASIS_MS);
  },
  shortcutsOpen: false,
  setShortcutsOpen: (open) => {
    set({ shortcutsOpen: open });
  },
  toast: null,
  showToast: (message, undo) => {
    set((s) => ({ toast: { seq: (s.toast?.seq ?? 0) + 1, message, undo: undo ?? null } }));
  },
  dismissToast: () => {
    set({ toast: null });
  },
}));
