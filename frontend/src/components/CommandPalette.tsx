import { Command as CommandIcon, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { useUiStore } from '../store/uiStore.ts';
import { filterCommands, type Command } from './commands.ts';
import styles from './IndicatorsDialog.module.css';
import dialog from './SymbolSearchDialog.module.css';
import { usePaletteCommands } from './usePaletteCommands.ts';
import { restoreFocus, usePresence, type OverlayAttrs } from './usePresence.ts';

/** Ctrl+K: one search over symbols, indicators and actions; Enter runs the selected one. */
export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen);
  const { shown, attrs, key } = usePresence(open ? true : null);
  if (shown === null) return null;
  return <PalettePanel key={key} attrs={attrs} />;
}

function PalettePanel({ attrs }: { attrs: OverlayAttrs }) {
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const commands = usePaletteCommands();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const titleId = useId();

  const results = useMemo(() => filterCommands(commands, query), [commands, query]);
  const groups = useMemo(() => {
    const byGroup = new Map<string, Command[]>();
    for (const c of results) byGroup.set(c.group, [...(byGroup.get(c.group) ?? []), c]);
    return [...byGroup];
  }, [results]);
  // Keyboard order follows the grouped display.
  const flat = useMemo(() => groups.flatMap(([, list]) => list), [groups]);
  const activeIndex = Math.min(active, Math.max(flat.length - 1, 0));
  const activeCommand = flat[activeIndex];

  useEffect(() => {
    const previous = document.activeElement;
    const input = inputRef.current;
    input?.focus();
    return () => {
      restoreFocus(previous, input?.closest('[role="dialog"]'));
    };
  }, []);

  const close = () => {
    setOpen(false);
  };
  const runCommand = (command: Command) => {
    close();
    command.run();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive(Math.min(activeIndex + 1, flat.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive(Math.max(activeIndex - 1, 0));
        break;
      case 'Enter':
        event.preventDefault();
        if (activeCommand !== undefined) runCommand(activeCommand);
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
    }
  };

  useEffect(() => {
    document
      .getElementById(`${listId}-${activeCommand?.id ?? ''}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [listId, activeCommand]);

  return (
    <div
      className={dialog.backdrop}
      {...attrs}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className={dialog.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={dialog.header}>
          <h2 id={titleId} className={dialog.title}>
            Command palette
          </h2>
          <button type="button" className={dialog.close} aria-label="Close" onClick={close}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className={dialog.field}>
          <CommandIcon size={16} aria-hidden="true" className={dialog.fieldIcon} />
          <input
            ref={inputRef}
            className={[dialog.input, styles.input].join(' ')}
            role="combobox"
            aria-label="Search commands"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              activeCommand === undefined ? undefined : `${listId}-${activeCommand.id}`
            }
            placeholder="Symbol, indicator or action, e.g. NVDA, rsi, light"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className={dialog.results}>
          <ul id={listId} role="listbox" aria-label="Commands" className={dialog.list}>
            {groups.map(([group, list]) => (
              <li key={group} role="presentation">
                <p className={dialog.group} aria-hidden="true">
                  {group}
                </p>
                <ul role="group" aria-label={group} className={dialog.list}>
                  {list.map((command) => (
                    <li
                      key={command.id}
                      id={`${listId}-${command.id}`}
                      role="option"
                      aria-selected={command === activeCommand}
                      className={[dialog.option, styles.option].join(' ')}
                      onMouseMove={() => {
                        setActive(flat.indexOf(command));
                      }}
                      onClick={() => {
                        runCommand(command);
                      }}
                    >
                      <span className={styles.name}>{command.label}</span>
                      <span className={styles.short}>{command.hint}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {flat.length === 0 && (
            <p className={dialog.empty} role="status">
              Nothing matches “{query.trim()}”. Try a ticker, an indicator or a word like “log”.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
