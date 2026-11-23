import { useEffect } from 'react';

import { useUiStore } from '../store/uiStore.ts';
import styles from './Toast.module.css';
import { usePresence } from './usePresence.ts';

/** A toast stays this long unless dismissed or undone. */
export const TOAST_MS = 5000;

/** Bottom-centre notice with Undo, e.g. after removing an indicator. */
export function Toast() {
  const toast = useUiStore((s) => s.toast);
  const dismiss = useUiStore((s) => s.dismissToast);
  const { shown, closing } = usePresence(toast);

  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(dismiss, TOAST_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [toast, dismiss]);

  if (shown === null) return null;
  return (
    <div
      className={styles.toast}
      role="status"
      data-closing={closing || undefined}
      inert={closing}
      key={shown.seq}
    >
      <span>{shown.message}</span>
      <button
        type="button"
        className={styles.undo}
        onClick={() => {
          shown.undo();
          dismiss();
        }}
      >
        Undo
      </button>
      <span className={styles.timer} aria-hidden="true" />
    </div>
  );
}
