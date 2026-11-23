import { Search } from 'lucide-react';

import { useSymbols } from '../api/market.ts';
import { useChartStore } from '../store/chartStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { SearchDialog } from './SearchDialog.tsx';
import { searchSymbols } from './symbolSearch.ts';
import styles from './SymbolSearchDialog.module.css';
import { usePresence } from './usePresence.ts';

/** Modal symbol search: type to filter, arrows to move, Enter to pick, Esc to close. */
export function SymbolSearchDialog() {
  const open = useUiStore((s) => s.modal === 'symbols');
  const seed = useUiStore((s) => s.symbolSeed);
  const closeModal = useUiStore((s) => s.closeModal);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const current = useChartStore((s) => s.symbol);
  const symbols = useSymbols().data;
  const { shown, attrs, key } = usePresence(open ? seed : null);
  if (shown === null) return null;
  const close = () => {
    closeModal('symbols');
  };

  return (
    <SearchDialog
      key={key}
      title="Symbol search"
      icon={<Search size={16} />}
      inputLabel="Symbol"
      listLabel="Matching symbols"
      placeholder="e.g. NVDA or nvidia"
      initialQuery={shown}
      normalize={(query) => query.toUpperCase()}
      attrs={attrs}
      classNames={{ input: styles.input, option: styles.option }}
      search={(query) =>
        searchSymbols(symbols ?? [], query).map((g) => ({ label: g.group, items: g.symbols }))
      }
      itemKey={(info) => info.symbol}
      itemAttrs={(info) => ({ 'aria-current': info.symbol === current ? 'true' : undefined })}
      renderItem={(info) => (
        <>
          <span className={styles.ticker}>{info.display}</span>
          <span className={styles.name}>{info.name}</span>
          <span className={styles.exchange}>{info.exchange}</span>
        </>
      )}
      onPick={(info) => {
        setSymbol(info.symbol);
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
