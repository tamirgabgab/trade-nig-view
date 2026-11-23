import { Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { defaultParams, useIndicatorList } from '../api/indicators.ts';
import { MAX_INSTANCES, useIndicatorStore } from '../store/indicatorStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import styles from './IndicatorsDialog.module.css';
import { searchIndicators } from './indicatorSearch.ts';
import dialog from './SymbolSearchDialog.module.css';
import { restoreFocus, usePresence } from './usePresence.ts';

/** Modal indicator picker: type to filter, arrows to move, Enter to add, Esc to close. */
export function IndicatorsDialog() {
  const open = useUiStore((s) => s.indicatorsDialog);
  const { shown, closing } = usePresence(open ? true : null);
  if (shown === null) return null;
  return <IndicatorsPanel closing={closing} />;
}

function IndicatorsPanel({ closing }: { closing: boolean }) {
  const setOpen = useUiStore((s) => s.setIndicatorsDialog);
  const add = useIndicatorStore((s) => s.add);
  const emphasize = useUiStore((s) => s.emphasize);
  const count = useIndicatorStore((s) => s.instances.length);
  const registry = useIndicatorList();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const titleId = useId();
  const full = count >= MAX_INSTANCES;

  const groups = useMemo(
    () => searchIndicators(registry.data ?? [], query),
    [registry.data, query],
  );
  const flat = useMemo(() => groups.flatMap((g) => g.indicators), [groups]);
  const activeIndex = Math.min(active, Math.max(flat.length - 1, 0));
  const activeSpec = flat[activeIndex];

  useEffect(() => {
    const previous = document.activeElement;
    const input = inputRef.current;
    input?.focus();
    return () => {
      restoreFocus(previous, input?.closest('[role="dialog"]'));
    };
  }, []);

  useEffect(() => {
    if (activeSpec === undefined) return;
    document
      .getElementById(`${listId}-${activeSpec.id}`)
      // jsdom has no scrollIntoView; real browsers always do.
      ?.scrollIntoView?.({ block: 'nearest' }); // eslint-disable-line @typescript-eslint/no-unnecessary-condition
  }, [activeSpec, listId]);

  const close = () => {
    setOpen(false);
  };
  const choose = (id: string) => {
    const spec = registry.data?.find((s) => s.id === id);
    if (spec === undefined || full) return;
    emphasize(add(spec.id, defaultParams(spec)));
    close();
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
        if (activeSpec !== undefined) choose(activeSpec.id);
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'Tab':
        event.preventDefault();
        break;
    }
  };

  let status: string | null = null;
  if (registry.isPending) status = 'Loading indicators…';
  else if (registry.isError)
    status = 'Could not load the indicator list. Check that the backend is running.';
  else if (flat.length === 0) status = `No indicator matches “${query.trim()}”.`;

  return (
    <div
      className={dialog.backdrop}
      data-closing={closing || undefined}
      inert={closing}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className={dialog.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={dialog.header}>
          <h2 id={titleId} className={dialog.title}>
            Indicators
          </h2>
          <button type="button" className={dialog.close} aria-label="Close" onClick={close}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className={dialog.field}>
          <Search size={16} aria-hidden="true" className={dialog.fieldIcon} />
          <input
            ref={inputRef}
            className={[dialog.input, styles.input].join(' ')}
            role="combobox"
            aria-label="Search indicators"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              activeSpec === undefined ? undefined : `${listId}-${activeSpec.id}`
            }
            placeholder="e.g. EMA or moving average"
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
        {full && (
          <p className={styles.notice} role="status">
            The chart has {MAX_INSTANCES} indicators, the maximum. Remove one to add another.
          </p>
        )}
        <div className={dialog.results}>
          <ul id={listId} role="listbox" aria-label="Indicators" className={dialog.list}>
            {groups.map((group) => (
              <li key={group.label} role="presentation">
                <p className={dialog.group} aria-hidden="true">
                  {group.label}
                </p>
                <ul role="group" aria-label={group.label} className={dialog.list}>
                  {group.indicators.map((spec) => (
                    <li
                      key={spec.id}
                      id={`${listId}-${spec.id}`}
                      role="option"
                      aria-selected={spec === activeSpec}
                      aria-disabled={full || undefined}
                      className={[dialog.option, styles.option].join(' ')}
                      onMouseMove={() => {
                        setActive(flat.indexOf(spec));
                      }}
                      onClick={() => {
                        choose(spec.id);
                      }}
                    >
                      <span className={styles.name}>{spec.name}</span>
                      <span className={styles.short}>{spec.shortName}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {status !== null && (
            <p className={dialog.empty} role="status">
              {status}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
