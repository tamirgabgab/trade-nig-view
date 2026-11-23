import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import { useUiStore } from '../store/uiStore.ts';
import { DRAWING_TOOL_GROUPS } from './drawingTools.ts';
import styles from './ShortcutsDialog.module.css';
import dialog from './SymbolSearchDialog.module.css';
import { restoreFocus, usePresence, type OverlayAttrs } from './usePresence.ts';

interface Shortcut {
  keys: string[];
  action: string;
}

const SECTIONS: { title: string; shortcuts: Shortcut[] }[] = [
  {
    title: 'Chart',
    shortcuts: [
      { keys: ['A–Z'], action: 'Search a symbol (start typing a ticker)' },
      { keys: ['/'], action: 'Add an indicator' },
      { keys: ['?'], action: 'Show keyboard shortcuts' },
      { keys: ['Esc'], action: 'Close a dialog, panel or menu' },
    ],
  },
  {
    title: 'Lists and menus',
    shortcuts: [
      { keys: ['↑', '↓'], action: 'Move the selection' },
      { keys: ['Enter'], action: 'Pick the selected item' },
      { keys: ['Tab'], action: 'Move to the next control' },
    ],
  },
  {
    title: 'Drawing tools (coming in R4)',
    shortcuts: DRAWING_TOOL_GROUPS.flatMap((tool) =>
      tool.shortcut === undefined ? [] : [{ keys: [tool.shortcut], action: tool.label }],
    ),
  },
];

/** `?` dialog listing every keyboard shortcut. */
export function ShortcutsDialog() {
  const open = useUiStore((s) => s.shortcutsOpen);
  const { shown, attrs, key } = usePresence(open ? true : null);
  if (shown === null) return null;
  return <ShortcutsPanel key={key} attrs={attrs} />;
}

function ShortcutsPanel({ attrs }: { attrs: OverlayAttrs }) {
  const setOpen = useUiStore((s) => s.setShortcutsOpen);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const close = () => {
    setOpen(false);
  };

  // The close button is the only stop: focus it on open, give focus back on close.
  useEffect(() => {
    const previous = document.activeElement;
    const button = closeRef.current;
    button?.focus();
    return () => {
      restoreFocus(previous, button?.closest('[role="dialog"]'));
    };
  }, []);

  return (
    <div
      className={dialog.backdrop}
      {...attrs}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Tab') event.preventDefault();
        if (event.key === 'Escape') close();
      }}
    >
      <div className={dialog.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={dialog.header}>
          <h2 id={titleId} className={dialog.title}>
            Keyboard shortcuts
          </h2>
          <button
            ref={closeRef}
            type="button"
            className={dialog.close}
            aria-label="Close"
            onClick={close}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.body}>
          {SECTIONS.map((section) => (
            <section key={section.title} aria-label={section.title}>
              <h3 className={styles.section}>{section.title}</h3>
              <dl className={styles.list}>
                {section.shortcuts.map((shortcut) => (
                  <div key={shortcut.action} className={styles.row}>
                    <dt className={styles.keys}>
                      {shortcut.keys.map((key) => (
                        <kbd key={key} className={styles.kbd}>
                          {key}
                        </kbd>
                      ))}
                    </dt>
                    <dd className={styles.action}>{shortcut.action}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
