import { useEffect, useId, useRef } from 'react';

import styles from './ConfirmDialog.module.css';
import dialog from './SymbolSearchDialog.module.css';
import { restoreFocus } from './usePresence.ts';

interface ConfirmDialogProps {
  title: string;
  message: string;
  /** Verb-first label of the destructive button, e.g. "Remove 4 indicators". */
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal confirmation for a bulk or irreversible action; Cancel has the focus, Esc cancels. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    const cancel = cancelRef.current;
    cancel?.focus();
    return () => {
      restoreFocus(previous, cancel?.closest('[role="alertdialog"]'));
    };
  }, []);

  return (
    <div
      className={dialog.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <div
        className={[dialog.dialog, styles.confirm].join(' ')}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button ref={cancelRef} type="button" className={styles.cancel} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={styles.danger} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
