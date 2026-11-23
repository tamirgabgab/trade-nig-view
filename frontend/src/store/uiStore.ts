import { create } from 'zustand';

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
    set({ settingsFor: uid });
  },
}));
