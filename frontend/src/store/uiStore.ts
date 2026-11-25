import { create } from 'zustand';
import { NARROW_QUERY } from '../components/useMediaQuery.ts';

/** How long a newly added indicator is drawn thicker. */
export const EMPHASIS_MS = 700;

export interface Toast {
  /** Bumped per toast, so a new toast restarts the timer even with the same text. */
  seq: number;
  message: string;
  undo: (() => void) | null;
}

export type SnapshotMode = 'copy' | 'download';

/** `openLearn(\`${PAGE_PREFIX}${slug}\`)` opens a learn page without its indicator on the chart. */
export const PAGE_PREFIX = 'page:';

/** What the right side panel shows. */
export type SidebarTab =
  | 'watchlist'
  | 'objects'
  | 'data'
  | 'gaps'
  | 'stats'
  | 'forecast'
  | 'volatility'
  | 'tradeplan'
  | 'risk'
  | 'regime';

/** The modal dialogs; at most one is open, so they can never stack. */
export type Modal =
  | 'symbols'
  | 'compare'
  | 'indicators'
  | 'shortcuts'
  | 'palette'
  | 'settings'
  | 'layouts'
  | 'layoutRename'
  | 'layoutCopy'
  | 'watchlistAdd'
  | 'watchlistNew'
  | 'watchlistRename'
  | 'watchlistDelete'
  | 'sectionAdd'
  | 'sectionRename'
  | 'learnIndex'
  | 'removeIndicators'
  | 'removeDrawings'
  | 'removeEverything';

/** Transient UI state (not persisted): which overlay is open. */
export interface UiState {
  /** The open modal dialog, or null. */
  modal: Modal | null;
  /** Text the symbol search opens with (the key typed on the chart). */
  symbolSeed: string;
  /** Open a modal (replacing any other); `symbolSeed` for the symbol search. */
  openModal: (modal: Modal, symbolSeed?: string) => void;
  /** Close `modal` if it is the open one. */
  closeModal: (modal: Modal) => void;
  /** Instance whose settings panel is open, or null. */
  settingsFor: string | null;
  openSettings: (uid: string | null) => void;
  /** Instance whose learn drawer is open, or null (one side panel at a time). */
  learnFor: string | null;
  /** Bumped by every openLearn, so following the same link twice scrolls again. */
  learnNav: number;
  openLearn: (uid: string | null) => void;
  /** Drawing whose settings panel is open, or null. */
  drawingSettingsFor: string | null;
  openDrawingSettings: (id: string | null) => void;
  /** Indicator whose legend row is hovered or focused: its lines stand out, the others dim. */
  legendFocus: string | null;
  setLegendFocus: (uid: string | null) => void;
  /** Indicator just added: drawn thicker for EMPHASIS_MS (ChartArea clears it). */
  emphasis: string | null;
  setEmphasis: (uid: string | null) => void;
  /** Forget panels, hover focus and emphasis of removed indicators (one uid, or all). */
  forgetIndicator: (uid?: string) => void;
  /** The right panel: open (docked on a wide window, floating below 1100 px, closed by default)
   *  and its tab. */
  watchlist: { docked: boolean; floating: boolean };
  sidebarTab: SidebarTab;
  /** A widget button: open the panel on `tab`, or close it when it already shows `tab`. */
  showSidebar: (tab: SidebarTab, narrow: boolean) => void;
  /** Open the panel on `tab` (never closes it), floating or docked by the window's width. */
  openSidebar: (tab: SidebarTab) => void;
  closeFloatingWatchlist: () => void;
  toast: Toast | null;
  showToast: (message: string, undo?: () => void) => void;
  /** Chart image asked for (toolbar, palette, context menu, Alt+S); `seq` makes each one new. */
  snapshot: { seq: number; mode: SnapshotMode } | null;
  requestSnapshot: (mode: SnapshotMode) => void;
  dismissToast: () => void;
}

/** Any modal dialog open: the global hotkeys stay quiet. */
export function selectModalOpen(s: UiState): boolean {
  return s.modal !== null;
}

export const useUiStore = create<UiState>()((set) => ({
  modal: null,
  symbolSeed: '',
  openModal: (modal, symbolSeed = '') => {
    set({ modal, symbolSeed });
  },
  closeModal: (modal) => {
    set((s) => (s.modal === modal ? { modal: null } : s));
  },
  settingsFor: null,
  openSettings: (uid) => {
    set(
      uid === null
        ? { settingsFor: null }
        : { settingsFor: uid, learnFor: null, drawingSettingsFor: null },
    );
  },
  learnFor: null,
  learnNav: 0,
  openLearn: (uid) => {
    set((s) =>
      uid === null
        ? { learnFor: null }
        : {
            learnFor: uid,
            learnNav: s.learnNav + 1,
            settingsFor: null,
            drawingSettingsFor: null,
          },
    );
  },
  drawingSettingsFor: null,
  openDrawingSettings: (id) => {
    set(
      id === null
        ? { drawingSettingsFor: null }
        : { drawingSettingsFor: id, settingsFor: null, learnFor: null },
    );
  },
  legendFocus: null,
  setLegendFocus: (uid) => {
    set({ legendFocus: uid });
  },
  emphasis: null,
  setEmphasis: (uid) => {
    set({ emphasis: uid });
  },
  forgetIndicator: (uid) => {
    // Forgetting every indicator keeps a learn page opened from the index (it needs none).
    const gone = (current: string | null) =>
      current === uid || (uid === undefined && !current?.startsWith(PAGE_PREFIX)) ? null : current;
    set((s) => ({
      settingsFor: gone(s.settingsFor),
      learnFor: gone(s.learnFor),
      legendFocus: gone(s.legendFocus),
      emphasis: gone(s.emphasis),
    }));
  },
  watchlist: { docked: true, floating: false },
  sidebarTab: 'watchlist',
  showSidebar: (tab, narrow) => {
    set(({ watchlist: w, sidebarTab }) => {
      const open = !((narrow ? w.floating : w.docked) && sidebarTab === tab);
      return {
        sidebarTab: tab,
        watchlist: narrow ? { ...w, floating: open } : { ...w, docked: open },
      };
    });
  },
  openSidebar: (tab) => {
    const narrow =
      typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches;
    set(({ watchlist: w }) => ({
      sidebarTab: tab,
      watchlist: narrow ? { ...w, floating: true } : { ...w, docked: true },
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
