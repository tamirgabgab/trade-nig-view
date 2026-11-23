import { useEffect } from 'react';

import { useUiStore } from '../store/uiStore.ts';
import styles from './Toast.module.css';
import { usePresence } from './usePresence.ts';

/** A toast stays this long unless dismissed or undone. */
const TOAST_MS = 5000;

/** Bottom-centre notice, with Undo when the action can be undone (removing an indicator). */
export function Toast() {
  const toast = useUiStore((s) => s.toast);
  const dismiss = useUiStore((s) => s.dismissToast);
  const { shown, attrs } = usePresence(toast);

  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(dismiss, TOAST_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [toast, dismiss]);

  if (shown === null) return null;
  return (
    <div className={styles.toast} role="status" {...attrs} key={shown.seq}>
      <span>{shown.message}</span>
      {shown.undo !== null && (
        <button
          type="button"
          className={styles.undo}
          onClick={() => {
            shown.undo?.();
            dismiss();
          }}
        >
          Undo
        </button>
      )}
      <span
        className={styles.timer}
        style={{ animationDuration: `${String(TOAST_MS)}ms` }}
        aria-hidden="true"
      />
    </div>
  );
}
