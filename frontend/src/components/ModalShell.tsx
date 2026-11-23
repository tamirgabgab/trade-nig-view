import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';

import styles from './ModalShell.module.css';
import { restoreFocus, type OverlayAttrs } from './usePresence.ts';

/** Focusable elements, for the Tab trap. */
const FOCUSABLE =
  'button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface ModalShellProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Exit animation attributes from usePresence. */
  attrs?: OverlayAttrs | undefined;
  /** Focused on open (the first control when omitted). */
  initialFocus?: RefObject<HTMLElement | null>;
  role?: 'dialog' | 'alertdialog';
  /** Show the × button in the header. */
  closeButton?: boolean;
  className?: string | undefined;
}

/**
 * A modal dialog: dimmed backdrop (a click on it closes), titled header, Esc closes, Tab stays
 * inside, focus goes in on open and back to the opener on close.
 */
export function ModalShell({
  title,
  onClose,
  children,
  attrs,
  initialFocus,
  role = 'dialog',
  closeButton = true,
  className,
}: ModalShellProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    const dialog = dialogRef.current;
    const target = initialFocus?.current ?? dialog?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();
    return () => {
      restoreFocus(previous, dialog);
    };
  }, [initialFocus]);

  return (
    <div
      className={styles.backdrop}
      {...attrs}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        } else if (event.key === 'Tab') {
          const stops = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
          const first = stops[0];
          const last = stops.at(-1);
          if (first === undefined || last === undefined) return;
          if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
          }
        }
      }}
    >
      <div
        ref={dialogRef}
        className={[styles.dialog, className].filter(Boolean).join(' ')}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {closeButton && (
            <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
