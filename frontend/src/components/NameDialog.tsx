import { useRef, useState } from 'react';

import confirm from './ConfirmDialog.module.css';
import panel from './IndicatorSettingsPanel.module.css';
import shell from './ModalShell.module.css';
import { ModalShell } from './ModalShell.tsx';
import type { OverlayAttrs } from './usePresence.ts';
import styles from './NameDialog.module.css';

interface NameDialogProps {
  title: string;
  label: string;
  initial: string;
  /** Verb-first, e.g. "Rename layout". */
  submitLabel: string;
  attrs?: OverlayAttrs | undefined;
  /** Longest name the backend accepts (section titles: 40). */
  maxLength?: number;
  /** Resolves to an error to show (e.g. the name is taken), or null when done. */
  onSubmit: (name: string) => Promise<string | null>;
  onClose: () => void;
}

/** Ask for a name (layout, watchlist, section): validated on submit, Enter submits. */
export function NameDialog({
  title,
  label,
  initial,
  submitLabel,
  attrs,
  maxLength = 60,
  onSubmit,
  onClose,
}: NameDialogProps) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = name.trim();

  const submit = async () => {
    // "." and ".." would be read as path steps in the URL.
    if (trimmed === '' || trimmed.includes('/') || /^\.+$/.test(trimmed)) {
      setError(`Use 1 to ${String(maxLength)} characters, without "/" and not only dots.`);
      return;
    }
    setBusy(true);
    const problem = await onSubmit(trimmed).catch((e: unknown) =>
      e instanceof Error ? e.message : String(e),
    );
    setBusy(false);
    if (problem === null) onClose();
    else setError(problem);
  };

  return (
    <ModalShell
      title={title}
      attrs={attrs}
      initialFocus={inputRef}
      onClose={onClose}
      className={confirm.confirm}
    >
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className={styles.label} htmlFor="name-dialog-input">
          {label}
        </label>
        <input
          id="name-dialog-input"
          ref={inputRef}
          className={shell.input}
          value={name}
          maxLength={maxLength}
          aria-invalid={error !== null || undefined}
          aria-describedby={error === null ? undefined : 'name-dialog-error'}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
        {error !== null && (
          <p id="name-dialog-error" className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={confirm.actions}>
          <button type="button" className={confirm.cancel} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={panel.primary} disabled={busy}>
            {submitLabel}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
