import { useDrawingStore } from '../store/drawingStore.ts';
import { useIndicatorStore } from '../store/indicatorStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import type { IndicatorView } from './useChartIndicators.ts';

const plural = (n: number, word: string) => `${String(n)} ${word}${n === 1 ? '' : 's'}`;

/** Remove the chosen objects at once; one toast can put them all back. */
function removeObjects(drawings: boolean, indicators: boolean): void {
  const ui = useUiStore.getState();
  const parts: string[] = [];
  const undo: (() => void)[] = [];
  if (drawings) {
    const { removeAll, restoreAll } = useDrawingStore.getState();
    const removed = removeAll();
    parts.push(plural(removed.drawings.length, 'drawing'));
    undo.push(() => {
      restoreAll(removed);
    });
  }
  if (indicators) {
    const { removeAll, restoreAll } = useIndicatorStore.getState();
    ui.forgetIndicator();
    const removed = removeAll();
    parts.push(plural(removed.length, 'indicator'));
    undo.push(() => {
      restoreAll(removed);
    });
  }
  ui.showToast(`Removed ${parts.join(' and ')}`, () => {
    for (const fn of undo) fn();
  });
}

/**
 * The confirmation of the bulk removals (the trash menu, the chart menu): it names what goes.
 * Rendered while one of the remove modals is open.
 */
export function RemoveConfirm({ views }: { views: readonly IndicatorView[] }) {
  const modal = useUiStore((s) => s.modal);
  const closeModal = useUiStore((s) => s.closeModal);
  const drawingCount = useDrawingStore((s) => s.drawings.length);
  if (modal !== 'removeIndicators' && modal !== 'removeDrawings' && modal !== 'removeEverything') {
    return null;
  }
  const drawings = modal !== 'removeIndicators';
  const indicators = modal !== 'removeDrawings';
  const what = [
    ...(drawings ? [plural(drawingCount, 'drawing')] : []),
    ...(indicators ? [plural(views.length, 'indicator')] : []),
  ].join(' and ');
  const names = indicators && views.length > 0 ? ` (${views.map((v) => v.label).join(', ')})` : '';
  const close = () => {
    closeModal(modal);
  };
  return (
    <ConfirmDialog
      title={
        modal === 'removeEverything'
          ? 'Remove all drawings and indicators?'
          : `Remove all ${drawings ? 'drawings' : 'indicators'}?`
      }
      message={`This removes ${what}${names} from the chart.`}
      confirmLabel={`Remove ${what}`}
      onCancel={close}
      onConfirm={() => {
        close();
        removeObjects(drawings, indicators);
      }}
    />
  );
}
