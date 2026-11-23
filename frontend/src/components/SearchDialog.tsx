import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { ModalShell } from './ModalShell.tsx';
import styles from './ModalShell.module.css';
import type { OverlayAttrs } from './usePresence.ts';

export interface SearchGroup<T> {
  label: string;
  items: readonly T[];
}

interface SearchDialogProps<T> {
  title: string;
  icon: ReactNode;
  inputLabel: string;
  listLabel: string;
  placeholder: string;
  initialQuery?: string;
  /** Applied to what is typed (symbol search upper-cases tickers). */
  normalize?: (query: string) => string;
  /** Results for a query, grouped; arrows move through them in display order. */
  search: (query: string) => readonly SearchGroup<T>[];
  /** Stable, unique key of an item (also its option id). */
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** Extra attributes of an option (aria-current, aria-disabled). */
  itemAttrs?: (item: T) => Record<string, string | boolean | undefined>;
  onPick: (item: T) => void;
  onClose: () => void;
  /** Text under the list when there is nothing to show (no match, loading, error), or null. */
  status: (query: string, count: number) => ReactNode;
  /** Shown between the field and the list (e.g. "the chart is full"). */
  notice?: ReactNode;
  attrs?: OverlayAttrs;
  /** Classes of the dialog's own CSS module (input, option) on top of the shared ones. */
  classNames?: { input?: string | undefined; option?: string | undefined };
}

/**
 * A search dialog: a combobox field over a grouped listbox. Type to filter, arrows to move,
 * Enter or a click to pick, Esc to close (symbol search, indicators, command palette).
 */
export function SearchDialog<T>({
  title,
  icon,
  inputLabel,
  listLabel,
  placeholder,
  initialQuery = '',
  normalize = (query) => query,
  search,
  itemKey,
  renderItem,
  itemAttrs,
  onPick,
  onClose,
  status,
  notice,
  attrs,
  classNames,
}: SearchDialogProps<T>) {
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const optionId = (item: T) => `${listId}-${itemKey(item).replace(/[^A-Za-z0-9_-]/g, '_')}`;

  const groups = search(query);
  const flat = groups.flatMap((g) => g.items);
  const activeIndex = Math.min(active, Math.max(flat.length - 1, 0));
  const activeItem = flat[activeIndex];
  const activeId = activeItem === undefined ? undefined : optionId(activeItem);

  useEffect(() => {
    if (activeId !== undefined)
      document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = activeIndex + (event.key === 'ArrowDown' ? 1 : -1);
      setActive(Math.min(Math.max(next, 0), flat.length - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (activeItem !== undefined) onPick(activeItem);
    }
  };

  return (
    <ModalShell title={title} onClose={onClose} attrs={attrs} initialFocus={inputRef}>
      <div className={styles.field}>
        <span className={styles.fieldIcon} aria-hidden="true">
          {icon}
        </span>
        <input
          ref={inputRef}
          className={[styles.input, classNames?.input].filter(Boolean).join(' ')}
          role="combobox"
          aria-label={inputLabel}
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(normalize(event.target.value));
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      {notice}
      <div className={styles.results}>
        <ul id={listId} role="listbox" aria-label={listLabel} className={styles.list}>
          {groups.map((group) => (
            <li key={group.label} role="presentation">
              <p className={styles.group} aria-hidden="true">
                {group.label}
              </p>
              <ul role="group" aria-label={group.label} className={styles.list}>
                {group.items.map((item) => (
                  <li
                    key={itemKey(item)}
                    id={optionId(item)}
                    role="option"
                    aria-selected={item === activeItem}
                    {...itemAttrs?.(item)}
                    className={[styles.option, classNames?.option].filter(Boolean).join(' ')}
                    onMouseMove={() => {
                      setActive(flat.indexOf(item));
                    }}
                    onClick={() => {
                      onPick(item);
                    }}
                  >
                    {renderItem(item)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        {(() => {
          const text = status(query, flat.length);
          return text === null || text === undefined ? null : (
            <p className={styles.empty} role="status">
              {text}
            </p>
          );
        })()}
      </div>
    </ModalShell>
  );
}
