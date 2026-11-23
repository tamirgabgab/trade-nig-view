import {
  deleteLayout,
  fetchLayout,
  saveLayout,
  type LayoutState,
  type SavedLayout,
} from '../api/layouts.ts';
import { ApiError } from '../api/client.ts';
import { useChartStore } from './chartStore.ts';
import { useHistoryStore } from './historyStore.ts';
import { useIndicatorStore } from './indicatorStore.ts';
import { useLayoutStore } from './layoutStore.ts';
import { useUiStore } from './uiStore.ts';

/**
 * Layout persistence (R6): the open layout is saved to the backend a moment after every change
 * (and when the page closes); opening, renaming and copying layouts. Plain functions over the
 * stores, like `indicatorActions`.
 */

export const SAVE_DELAY_MS = 1000;

type ViewCapture = () => Pick<LayoutState, 'stretches' | 'visibleRange'>;
let captureView: ViewCapture = () => ({ stretches: {}, visibleRange: null });

/** The chart registers how to read its pane sizes and visible range (null on unmount). */
export function registerViewCapture(capture: ViewCapture | null): void {
  captureView = capture ?? (() => ({ stretches: {}, visibleRange: null }));
}

/** The chart as it is now, as a layout. */
export function currentLayout(): LayoutState {
  const c = useChartStore.getState();
  return {
    symbol: c.symbol,
    interval: c.interval,
    chartType: c.chartType,
    scaleMode: c.scaleMode,
    autoScale: c.autoScale,
    adjusted: c.adjusted,
    indicators: useIndicatorStore.getState().instances,
    ...captureView(),
  };
}

/** Show a saved layout: chart settings and indicators now, view once its bars are in. */
export function applyLayout(layout: SavedLayout): void {
  useChartStore.setState({
    symbol: layout.symbol,
    interval: layout.interval,
    chartType: layout.chartType,
    scaleMode: layout.scaleMode,
    autoScale: layout.autoScale,
    adjusted: layout.adjusted,
    range: null,
    rangeRequest: null,
  });
  const seq = Math.max(
    useIndicatorStore.getState().seq,
    ...layout.indicators.map((i) => Number(/-(\d+)$/.exec(i.uid)?.[1] ?? 0)),
  );
  useUiStore.getState().forgetIndicator();
  useIndicatorStore.setState({ instances: layout.indicators, seq });
  useLayoutStore.setState({
    name: layout.name,
    revision: layout.revision,
    status: 'saved',
    pending: {
      symbol: layout.symbol,
      interval: layout.interval,
      visibleRange: layout.visibleRange,
      stretches: layout.stretches,
    },
  });
  // Another chart: its history is not this one's.
  useHistoryStore.getState().clear();
}

let inFlight: Promise<void> | null = null;
let again = false;
let timer: number | undefined;

async function saveOnce(keepalive: boolean): Promise<void> {
  const { name, revision } = useLayoutStore.getState();
  useLayoutStore.setState({ status: 'saving' });
  try {
    let saved: SavedLayout;
    try {
      saved = await saveLayout(name, revision, currentLayout(), keepalive);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 409)) throw error;
      // Saved meanwhile in another window: this window's chart wins, on top of that revision.
      const latest = await fetchLayout(name);
      saved = await saveLayout(name, latest?.revision ?? 0, currentLayout(), keepalive);
    }
    if (useLayoutStore.getState().name === name) {
      useLayoutStore.setState({ revision: saved.revision, status: 'saved' });
    }
  } catch {
    useLayoutStore.setState({ status: 'error' });
  }
}

/** Save the open layout now (one save at a time; a change meanwhile saves again after it). */
export function saveNow(keepalive = false): Promise<void> {
  window.clearTimeout(timer);
  if (inFlight !== null) {
    again = true;
    return inFlight;
  }
  // A function, so the type checker does not keep `false` from the reset across the await.
  const changedMeanwhile = () => again;
  inFlight = (async () => {
    let more = true;
    while (more) {
      again = false;
      await saveOnce(keepalive);
      more = changedMeanwhile();
    }
    inFlight = null;
  })();
  return inFlight;
}

/** Save the open layout now and say so (Ctrl+S, the menu). */
export function saveLayoutNow(): void {
  void saveNow().then(() => {
    const { status, name } = useLayoutStore.getState();
    useUiStore
      .getState()
      .showToast(status === 'error' ? 'Could not save the layout' : `Saved “${name}”`);
  });
}

/** Save a moment after the last change. */
export function scheduleSave(): void {
  if (useLayoutStore.getState().status === 'loading') return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    void saveNow();
  }, SAVE_DELAY_MS);
}

/** Open a saved layout (the current one is saved first). */
export async function openLayout(name: string): Promise<void> {
  await saveNow();
  const layout = await fetchLayout(name);
  if (layout === null) {
    useUiStore.getState().showToast(`The layout “${name}” no longer exists`);
    return;
  }
  applyLayout(layout);
}

/** Save the chart under a new name and make it the open layout; false if the name is taken. */
export async function saveAs(name: string, { replace }: { replace: boolean }): Promise<boolean> {
  const old = useLayoutStore.getState();
  try {
    const saved = await saveLayout(name, 0, currentLayout());
    useLayoutStore.setState({ name, revision: saved.revision, status: 'saved' });
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) return false;
    throw error;
  }
  if (replace && old.revision > 0) await deleteLayout(old.name, old.revision);
  return true;
}

/** Load the open layout from the backend, then keep saving it; returns the stop function. */
export function startLayoutSync(): () => void {
  const { name } = useLayoutStore.getState();
  useLayoutStore.setState({ status: 'loading' });
  void fetchLayout(name)
    .then((layout) => {
      if (layout === null) useLayoutStore.setState({ revision: 0, status: 'saved' });
      else applyLayout(layout);
    })
    .catch(() => {
      useLayoutStore.setState({ status: 'error' });
    });
  const offChart = useChartStore.subscribe(scheduleSave);
  const offIndicators = useIndicatorStore.subscribe((s, prev) => {
    if (s.instances !== prev.instances) scheduleSave();
  });
  const onPageHide = () => {
    if (useLayoutStore.getState().status !== 'loading') void saveNow(true);
  };
  window.addEventListener('pagehide', onPageHide);
  return () => {
    offChart();
    offIndicators();
    window.removeEventListener('pagehide', onPageHide);
    window.clearTimeout(timer);
  };
}
