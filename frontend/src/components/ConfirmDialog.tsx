import { useRef } from 'react';

import styles from './ConfirmDialog.module.css';
import { ModalShell } from './ModalShell.tsx';

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
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <ModalShell
      title={title}
      role="alertdialog"
      closeButton={false}
      className={styles.confirm}
      initialFocus={cancelRef}
      onClose={onCancel}
    >
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        <button ref={cancelRef} type="button" className={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={styles.danger} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}
