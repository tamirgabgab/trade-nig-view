import { Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { useSymbols } from '../api/market.ts';
import { useChartStore } from '../store/chartStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { searchSymbols } from './symbolSearch.ts';
import { usePresence } from './usePresence.ts';
import styles from './SymbolSearchDialog.module.css';

/** Modal symbol search: type to filter, arrows to move, Enter to pick, Esc to close. */
export function SymbolSearchDialog() {
  const { open, seed } = useUiStore((s) => s.symbolSearch);
  const { shown, closing } = usePresence(open ? seed : null);
  if (shown === null) return null;
  return <SearchPanel seed={shown} closing={closing} />;
}

function SearchPanel({ seed, closing }: { seed: string; closing: boolean }) {
  const close = useUiStore((s) => s.closeSymbolSearch);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const current = useChartStore((s) => s.symbol);
  const symbols = useSymbols().data;
  const [query, setQuery] = useState(seed);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const titleId = useId();

  const groups = useMemo(() => searchSymbols(symbols ?? [], query), [symbols, query]);
  const flat = useMemo(() => groups.flatMap((g) => g.symbols), [groups]);
  const activeIndex = Math.min(active, Math.max(flat.length - 1, 0));
  const activeSymbol = flat[activeIndex];

  // Focus the input on open and give focus back to where it was on close (focus restore).
  useEffect(() => {
    const previous = document.activeElement;
    inputRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    if (activeSymbol === undefined) return;
    document
      .getElementById(optionId(listId, activeSymbol.symbol))
      // jsdom has no scrollIntoView; real browsers always do.
      ?.scrollIntoView?.({ block: 'nearest' }); // eslint-disable-line @typescript-eslint/no-unnecessary-condition
  }, [activeSymbol, listId]);

  const choose = (symbol: string) => {
    setSymbol(symbol);
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
        if (activeSymbol !== undefined) choose(activeSymbol.symbol);
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'Tab':
        // The input is the only stop inside the dialog: keep focus trapped here.
        event.preventDefault();
        break;
    }
  };

  return (
    <div
      className={styles.backdrop}
      data-closing={closing || undefined}
      inert={closing}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            Symbol search
          </h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={close}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className={styles.field}>
          <Search size={16} aria-hidden="true" className={styles.fieldIcon} />
          <input
            ref={inputRef}
            className={styles.input}
            role="combobox"
            aria-label="Symbol"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              activeSymbol === undefined ? undefined : optionId(listId, activeSymbol.symbol)
            }
            placeholder="e.g. NVDA or nvidia"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value.toUpperCase());
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className={styles.results}>
          <ul id={listId} role="listbox" aria-label="Matching symbols" className={styles.list}>
            {groups.map((group) => (
              <li key={group.group} role="presentation">
                <p className={styles.group} aria-hidden="true">
                  {group.group}
                </p>
                <ul role="group" aria-label={group.group} className={styles.list}>
                  {group.symbols.map((info) => (
                    <li
                      key={info.symbol}
                      id={optionId(listId, info.symbol)}
                      role="option"
                      aria-selected={info === activeSymbol}
                      aria-current={info.symbol === current ? 'true' : undefined}
                      className={styles.option}
                      onMouseMove={() => {
                        setActive(flat.indexOf(info));
                      }}
                      onClick={() => {
                        choose(info.symbol);
                      }}
                    >
                      <span className={styles.ticker}>{info.display}</span>
                      <span className={styles.name}>{info.name}</span>
                      <span className={styles.exchange}>{info.exchange}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {symbols !== undefined && flat.length === 0 && (
            <p className={styles.empty} role="status">
              No symbol matches “{query.trim()}”. Symbols come from{' '}
              <code>backend/config/universe.toml</code>.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function optionId(listId: string, symbol: string): string {
  return `${listId}-${symbol.replace(/[^A-Za-z0-9]/g, '_')}`;
}
