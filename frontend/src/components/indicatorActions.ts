import { defaultParams, type IndicatorInfo } from '../api/indicators.ts';
import { MAX_INSTANCES, useIndicatorStore } from '../store/indicatorStore.ts';
import { useUiStore } from '../store/uiStore.ts';

/**
 * Indicator actions shared by the legend, the dialogs, the palette and the context menu. Plain
 * functions over the stores (no React state), so every caller behaves the same.
 */

/** Add with default inputs and the "just added" emphasis; says so when the chart is full. */
export function addIndicator(spec: IndicatorInfo): boolean {
  const { instances, add } = useIndicatorStore.getState();
  const ui = useUiStore.getState();
  if (instances.length >= MAX_INSTANCES) {
    ui.showToast(
      `The chart has ${String(MAX_INSTANCES)} indicators, the maximum. Remove one first.`,
    );
    return false;
  }
  ui.setEmphasis(add(spec.id, defaultParams(spec)));
  return true;
}

/** Remove one indicator, closing its panels; the toast can undo it. */
export function removeIndicator(uid: string, label: string): void {
  const { remove, restore } = useIndicatorStore.getState();
  const ui = useUiStore.getState();
  ui.forgetIndicator(uid);
  const removed = remove(uid);
  if (removed !== null) {
    ui.showToast(`Removed ${label}`, () => {
      restore(removed);
    });
  }
}

/** Remove every indicator (after the confirm dialog); the toast can undo it. */
export function removeAllIndicators(): void {
  const { removeAll, restoreAll } = useIndicatorStore.getState();
  const ui = useUiStore.getState();
  ui.forgetIndicator();
  const removed = removeAll();
  const n = removed.length;
  ui.showToast(`Removed ${String(n)} indicator${n === 1 ? '' : 's'}`, () => {
    restoreAll(removed);
  });
}
