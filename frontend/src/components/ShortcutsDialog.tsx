import { useUiStore } from '../store/uiStore.ts';
import { DRAWING_TOOL_GROUPS } from './drawingTools.ts';
import { ModalShell } from './ModalShell.tsx';
import styles from './ShortcutsDialog.module.css';
import { usePresence } from './usePresence.ts';

interface Shortcut {
  keys: string[];
  action: string;
}

const SECTIONS: { title: string; shortcuts: Shortcut[] }[] = [
  {
    title: 'Chart',
    shortcuts: [
      { keys: ['Ctrl+K'], action: 'Open the command palette (symbols, indicators, actions)' },
      { keys: ['A–Z'], action: 'Search a symbol (start typing a ticker)' },
      { keys: ['/'], action: 'Add an indicator' },
      { keys: ['?'], action: 'Show keyboard shortcuts' },
      { keys: ['Alt+S'], action: 'Copy the chart image' },
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
  const open = useUiStore((s) => s.modal === 'shortcuts');
  const closeModal = useUiStore((s) => s.closeModal);
  const { shown, attrs, key } = usePresence(open ? true : null);
  if (shown === null) return null;
  return (
    <ModalShell
      key={key}
      title="Keyboard shortcuts"
      attrs={attrs}
      onClose={() => {
        closeModal('shortcuts');
      }}
    >
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
    </ModalShell>
  );
}
