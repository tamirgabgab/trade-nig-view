import { useCallback, useEffect, useRef } from 'react';

import { ApiError } from '../api/client.ts';
import { fetchDrawings, saveDrawings } from '../api/drawings.ts';
import type { ChartEngine } from '../chart/ChartEngine.ts';
import { DrawingManager } from '../drawings/manager.ts';
import { useDrawingStore } from '../store/drawingStore.ts';
import { selectModalOpen, useUiStore } from '../store/uiStore.ts';

/** Saves wait this long after the last change (a drag is many changes). */
export const SAVE_DELAY_MS = 600;

/**
 * Load the symbol's drawings when it changes and save edits (debounced) on top of the revision
 * read. A save that lost a race (409) reloads the drawings and says so; any pending save of the
 * previous symbol is flushed before switching.
 */
export function useDrawingsSync(symbol: string): void {
  const edits = useDrawingStore((s) => s.edits);
  const loaded = useDrawingStore((s) => s.symbol);

  useEffect(() => {
    // The previous symbol's drawings must not show (or be edited) on this one meanwhile.
    useDrawingStore.getState().unload();
    const controller = new AbortController();
    fetchDrawings(symbol, controller.signal).then(
      (doc) => {
        useDrawingStore.getState().load(doc.symbol, doc.revision, doc.drawings);
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        useDrawingStore.getState().load(symbol, 0, []);
        const reason = error instanceof Error ? error.message : String(error);
        useUiStore.getState().showToast(`Could not load the drawings of ${symbol} (${reason})`);
      },
    );
    return () => {
      controller.abort();
    };
  }, [symbol]);

  // One save at a time: each builds on the revision the previous one returned. A change made
  // while a save is in flight is saved right after it.
  const inFlight = useRef(false);
  const again = useRef(false);
  const save = useCallback(() => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    void (async () => {
      // A function, so the type checker does not keep `false` from the reset across the await.
      const changedMeanwhile = () => again.current;
      let more = true;
      while (more) {
        again.current = false;
        more = (await saveOnce()) && changedMeanwhile();
      }
      inFlight.current = false;
    })();
  }, []);

  // A symbol switch (or unmount) with a save still pending: save it now, before the new
  // symbol's drawings are loaded. Declared before the debounce so its cleanup runs first.
  const pending = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      if (pending.current === undefined) return;
      window.clearTimeout(pending.current);
      pending.current = undefined;
      save();
    },
    [symbol, save],
  );

  // Debounced save after each change of the loaded drawings.
  useEffect(() => {
    if (edits === 0 || loaded === null) return;
    pending.current = window.setTimeout(() => {
      pending.current = undefined;
      save();
    }, SAVE_DELAY_MS);
    return () => {
      window.clearTimeout(pending.current);
      pending.current = undefined;
    };
  }, [edits, loaded, save]);
}

/** Save the loaded drawings once. False when it failed (a toast says why). */
async function saveOnce(): Promise<boolean> {
  const { symbol: owner, revision, drawings } = useDrawingStore.getState();
  if (owner === null) return true;
  try {
    const doc = await saveDrawings(owner, revision, drawings);
    if (useDrawingStore.getState().symbol === doc.symbol) {
      useDrawingStore.getState().saved(doc.revision);
    }
    return true;
  } catch (error: unknown) {
    const ui = useUiStore.getState();
    if (error instanceof ApiError && error.status === 409) {
      const fresh = await fetchDrawings(owner).catch(() => null);
      if (fresh !== null && useDrawingStore.getState().symbol === owner) {
        useDrawingStore.getState().load(fresh.symbol, fresh.revision, fresh.drawings);
      }
      ui.showToast('The drawings were changed in another window; showing that version');
    } else {
      const reason = error instanceof Error ? error.message : String(error);
      ui.showToast(`Could not save the drawings (${reason})`);
    }
    return false;
  }
}

/** A stable callback for ChartView's engine: runs a DrawingManager on it while it exists. */
export function useDrawingManager(): (engine: ChartEngine | null) => void {
  const manager = useRef<DrawingManager | null>(null);
  useEffect(
    () => () => {
      manager.current?.dispose();
    },
    [],
  );
  return useCallback((engine: ChartEngine | null) => {
    manager.current?.dispose();
    manager.current =
      engine === null
        ? null
        : new DrawingManager(engine, useDrawingStore, {
            blocked: () => selectModalOpen(useUiStore.getState()),
            openSettings: (id) => {
              useUiStore.getState().openDrawingSettings(id);
            },
            removed: (label, undo) => {
              useUiStore.getState().showToast(`Removed ${label}`, undo);
            },
          });
  }, []);
}
