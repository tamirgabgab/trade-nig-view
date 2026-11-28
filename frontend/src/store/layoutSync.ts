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
import { useReplayStore } from './replayStore.ts';
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

/** The view to save: a layout just opened keeps its own until its bars are in. */
function view(): Pick<LayoutState, 'stretches' | 'visibleRange'> {
  const pending = useLayoutStore.getState().pending;
  return pending === null
    ? captureView()
    : { stretches: pending.stretches, visibleRange: pending.visibleRange };
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
    compare: c.compare,
    indicators: useIndicatorStore.getState().instances,
    // A layout just opened shows its own view once its bars are in; until then that is the view.
    ...view(),
  };
}

/** What the user changes in a layout, as one string (the view moves by itself as bars load). */
function choices(): string {
  const c = useChartStore.getState();
  const chart = [
    c.symbol,
    c.interval,
    c.chartType,
    c.scaleMode,
    c.autoScale,
    c.adjusted,
    c.compare,
  ];
  return JSON.stringify([chart, useIndicatorStore.getState().instances]);
}

/** Show a saved layout: chart settings and indicators now, view once its bars are in. */
export function applyLayout(layout: SavedLayout): void {
  // Another chart: a replay of this one ends.
  useReplayStore.getState().exit();
  useChartStore.setState({
    symbol: layout.symbol,
    interval: layout.interval,
    chartType: layout.chartType,
    scaleMode: layout.scaleMode,
    autoScale: layout.autoScale,
    adjusted: layout.adjusted,
    compare: layout.compare,
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
/** A save asked for while the page closes: every save until then survives the unload. */
let keepaliveWanted = false;
let timer: number | undefined;
/** The open layout was read from the backend: saving it cannot overwrite what is stored. */
let loaded = false;

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
  keepaliveWanted ||= keepalive;
  if (!loaded) return Promise.resolve();
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
      await saveOnce(keepaliveWanted);
      more = changedMeanwhile();
    }
    inFlight = null;
    keepaliveWanted = false;
  })();
  return inFlight;
}

/** Save the open layout now and say so (Ctrl+S, the menu). */
export function saveLayoutNow(): void {
  if (!loaded) {
    useUiStore.getState().showToast('The layout is not loaded yet; it saves once it is');
    return;
  }
  void saveNow().then(() => {
    const { status, name } = useLayoutStore.getState();
    useUiStore
      .getState()
      .showToast(status === 'error' ? 'Could not save the layout' : `Saved “${name}”`);
  });
}

/** Save a moment after the last change. */
export function scheduleSave(): void {
  if (!loaded) return;
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
  // Pending saves of the old layout first, so its revision below is the last one.
  await saveNow();
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
export function startLayoutSync(retryMs = [2000, 5000, 10_000, 30_000]): () => void {
  const { name } = useLayoutStore.getState();
  useLayoutStore.setState({ status: 'loading' });
  loaded = false;
  let stopped = false;
  let retry: number | undefined;
  // Until the stored layout is read, nothing is saved (the backend may still be starting).
  // The chart starts from this browser's copy; a change made on it before the stored layout
  // arrives (a compared symbol removed right after a reload, say) wins over the stored one and is
  // saved on top of its revision, as after a save in another window.
  const before = choices();
  const load = (attempt: number) => {
    fetchLayout(name)
      .then((layout) => {
        if (stopped) return;
        const kept = layout !== null && choices() !== before;
        if (layout === null) useLayoutStore.setState({ revision: 0, status: 'saved' });
        else if (kept) useLayoutStore.setState({ revision: layout.revision, status: 'saved' });
        else applyLayout(layout);
        loaded = true;
        if (kept) scheduleSave();
      })
      .catch(() => {
        if (stopped) return;
        useLayoutStore.setState({ status: 'error' });
        retry = window.setTimeout(
          () => {
            load(attempt + 1);
          },
          retryMs[Math.min(attempt, retryMs.length - 1)],
        );
      });
  };
  load(0);
  const offChart = useChartStore.subscribe(scheduleSave);
  const offIndicators = useIndicatorStore.subscribe((s, prev) => {
    if (s.instances !== prev.instances) scheduleSave();
  });
  const onPageHide = () => {
    void saveNow(true);
  };
  window.addEventListener('pagehide', onPageHide);
  return () => {
    stopped = true;
    loaded = false;
    window.clearTimeout(retry);
    offChart();
    offIndicators();
    window.removeEventListener('pagehide', onPageHide);
    window.clearTimeout(timer);
  };
}
