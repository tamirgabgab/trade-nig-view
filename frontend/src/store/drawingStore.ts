import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isRecord } from '../api/client.ts';
import type { MagnetMode } from '../drawings/snap.ts';
import type { Drawing, DrawingType } from '../drawings/types.ts';

/**
 * Drawings of the charted symbol plus the drawing tool state. The drawings come from and go to
 * the backend (useDrawingsSync); the tool preferences (magnet, stay in drawing mode, last tool of
 * each toolbar group) are remembered in localStorage.
 */
export interface DrawingState {
  /** Symbol the drawings belong to (null until loaded) and the revision they were read at. */
  symbol: string | null;
  revision: number;
  drawings: Drawing[];
  /** Bumped by every user change, so the sync knows what to save. */
  edits: number;

  /** Tool being drawn with, or null for the cursor. */
  tool: DrawingType | null;
  /** Last tool picked in each toolbar group (the group button repeats it). */
  lastTool: Record<string, DrawingType>;
  magnet: MagnetMode;
  stayInDrawing: boolean;
  lockAll: boolean;
  hideAll: boolean;
  selectedId: string | null;
  hoverId: string | null;

  load: (symbol: string, revision: number, drawings: Drawing[]) => void;
  saved: (revision: number) => void;
  setTool: (tool: DrawingType | null, group?: string) => void;
  setMagnet: (mode: MagnetMode) => void;
  toggle: (flag: 'stayInDrawing' | 'lockAll' | 'hideAll') => void;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  add: (drawing: Drawing) => void;
  update: (id: string, change: (drawing: Drawing) => Drawing) => void;
  /** Remove one drawing; returns it and its position so `restore` can undo the removal. */
  remove: (id: string) => { drawing: Drawing; index: number } | null;
  restore: (removed: { drawing: Drawing; index: number }) => void;
}

type Persisted = Pick<DrawingState, 'lastTool' | 'magnet' | 'stayInDrawing'>;

const MAGNETS: readonly MagnetMode[] = ['off', 'weak', 'strong'];

/** Only well-formed preferences survive from storage. */
export function sanitizePersisted(persisted: unknown): Persisted {
  const r = isRecord(persisted) ? persisted : {};
  const last = isRecord(r['lastTool']) ? r['lastTool'] : {};
  return {
    lastTool: Object.fromEntries(
      Object.entries(last).filter((e): e is [string, DrawingType] => typeof e[1] === 'string'),
    ),
    magnet: MAGNETS.find((m) => m === r['magnet']) ?? 'off',
    stayInDrawing: r['stayInDrawing'] === true,
  };
}

const now = () => new Date().toISOString();

export const useDrawingStore = create<DrawingState>()(
  persist(
    (set, get) => ({
      symbol: null,
      revision: 0,
      drawings: [],
      edits: 0,
      tool: null,
      lastTool: {},
      magnet: 'off',
      stayInDrawing: false,
      lockAll: false,
      hideAll: false,
      selectedId: null,
      hoverId: null,

      load: (symbol, revision, drawings) => {
        set({ symbol, revision, drawings, edits: 0, selectedId: null, hoverId: null });
      },
      saved: (revision) => {
        set({ revision });
      },
      setTool: (tool, group) => {
        set((s) => ({
          tool,
          selectedId: tool === null ? s.selectedId : null,
          lastTool:
            tool !== null && group !== undefined ? { ...s.lastTool, [group]: tool } : s.lastTool,
        }));
      },
      setMagnet: (magnet) => {
        set({ magnet });
      },
      toggle: (flag) => {
        set((s) => ({ [flag]: !s[flag] }));
      },
      select: (selectedId) => {
        set({ selectedId });
      },
      hover: (hoverId) => {
        if (get().hoverId !== hoverId) set({ hoverId });
      },
      add: (drawing) => {
        const stamp = now();
        set((s) => ({
          drawings: [...s.drawings, { ...drawing, created_at: stamp, updated_at: stamp }],
          edits: s.edits + 1,
        }));
      },
      update: (id, change) => {
        set((s) => ({
          drawings: s.drawings.map((d) => (d.id === id ? { ...change(d), updated_at: now() } : d)),
          edits: s.edits + 1,
        }));
      },
      remove: (id) => {
        const drawings = get().drawings;
        const index = drawings.findIndex((d) => d.id === id);
        const drawing = drawings[index];
        if (drawing === undefined) return null;
        set((s) => ({
          drawings: drawings.filter((d) => d.id !== id),
          edits: s.edits + 1,
          selectedId: s.selectedId === id ? null : s.selectedId,
          hoverId: s.hoverId === id ? null : s.hoverId,
        }));
        return { drawing, index };
      },
      restore: ({ drawing, index }) => {
        set((s) => {
          if (s.drawings.some((d) => d.id === drawing.id)) return s;
          const drawings = [...s.drawings];
          drawings.splice(index, 0, drawing);
          return { drawings, edits: s.edits + 1 };
        });
      },
    }),
    {
      name: 'chartlab.drawingTools',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): Persisted => ({
        lastTool: s.lastTool,
        magnet: s.magnet,
        stayInDrawing: s.stayInDrawing,
      }),
      migrate: (persisted) => sanitizePersisted(persisted),
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
    },
  ),
);
