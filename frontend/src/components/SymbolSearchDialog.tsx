import { Search } from 'lucide-react';
import { useCallback, useMemo } from 'react';

import { useSymbols } from '../api/market.ts';
import { useChartStore } from '../store/chartStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { SearchDialog } from './SearchDialog.tsx';
import { searchSymbols } from './symbolSearch.ts';
import styles from './SymbolSearchDialog.module.css';
import { usePresence } from './usePresence.ts';
import { useWatchlistEditor } from './useWatchlistEditor.ts';
import { addSymbol } from './watchlistEdit.ts';

/** Modal symbol search: type to filter, arrows to move, Enter to pick, Esc to close. */
export function SymbolSearchDialog() {
  const mode = useUiStore((s) =>
    s.modal === 'symbols' || s.modal === 'watchlistAdd' ? s.modal : null,
  );
  const editor = useWatchlistEditor();
  const seed = useUiStore((s) => s.symbolSeed);
  const closeModal = useUiStore((s) => s.closeModal);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const current = useChartStore((s) => s.symbol);
  const symbols = useSymbols().data;
  const search = useCallback(
    (query: string) =>
      searchSymbols(symbols ?? [], query).map((g) => ({ label: g.group, items: g.symbols })),
    [symbols],
  );
  // Stable while open: a new object every render would reopen the dialog forever.
  const request = useMemo(() => (mode === null ? null : { mode, seed }), [mode, seed]);
  const { shown, attrs, key } = usePresence(request);
  if (shown === null) return null;
  const adding = shown.mode === 'watchlistAdd';
  const inList = new Set(editor.active?.sections.flatMap((s) => s.symbols) ?? []);
  const close = () => {
    closeModal(shown.mode);
  };

  return (
    <SearchDialog
      key={key}
      title={adding ? `Add to ${editor.active?.name ?? 'the watchlist'}` : 'Symbol search'}
      icon={<Search size={16} />}
      inputLabel="Symbol"
      listLabel="Matching symbols"
      placeholder="e.g. NVDA or nvidia"
      initialQuery={shown.seed}
      normalize={(query) => query.toUpperCase()}
      attrs={attrs}
      classNames={{ input: styles.input, option: styles.option }}
      search={search}
      itemKey={(info) => info.symbol}
      itemAttrs={(info) => ({
        'aria-current': (adding ? inList.has(info.symbol) : info.symbol === current)
          ? 'true'
          : undefined,
      })}
      renderItem={(info) => (
        <>
          <span className={styles.ticker}>{info.display}</span>
          <span className={styles.name}>{info.name}</span>
          <span className={styles.exchange}>{info.exchange}</span>
        </>
      )}
      onPick={(info) => {
        if (adding) {
          editor.edit((s) => addSymbol(s, info.symbol));
          useUiStore
            .getState()
            .showToast(`Added ${info.display} to ${editor.active?.name ?? 'the watchlist'}`);
        } else {
          setSymbol(info.symbol);
        }
        close();
      }}
      onClose={close}
      status={(query, count) =>
        symbols !== undefined && count === 0 ? (
          <>
            No symbol matches “{query.trim()}”. Symbols come from{' '}
            <code>backend/config/universe.toml</code>.
          </>
        ) : null
      }
    />
  );
}
