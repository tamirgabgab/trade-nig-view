import { Search } from 'lucide-react';

import { useIndicatorList } from '../api/indicators.ts';
import { MAX_INSTANCES, useIndicatorStore } from '../store/indicatorStore.ts';
import { useUiStore } from '../store/uiStore.ts';
import { addIndicator } from './indicatorActions.ts';
import styles from './IndicatorsDialog.module.css';
import { searchIndicators } from './indicatorSearch.ts';
import { SearchDialog } from './SearchDialog.tsx';
import { usePresence } from './usePresence.ts';

/** Modal indicator picker: type to filter, arrows to move, Enter to add, Esc to close. */
export function IndicatorsDialog() {
  const open = useUiStore((s) => s.modal === 'indicators');
  const closeModal = useUiStore((s) => s.closeModal);
  const full = useIndicatorStore((s) => s.instances.length >= MAX_INSTANCES);
  const registry = useIndicatorList();
  const { shown, attrs, key } = usePresence(open ? true : null);
  if (shown === null) return null;
  const close = () => {
    closeModal('indicators');
  };

  return (
    <SearchDialog
      key={key}
      title="Indicators"
      icon={<Search size={16} />}
      inputLabel="Search indicators"
      listLabel="Indicators"
      placeholder="e.g. EMA or moving average"
      attrs={attrs}
      classNames={{ option: styles.option }}
      search={(query) =>
        searchIndicators(registry.data ?? [], query).map((g) => ({
          label: g.label,
          items: g.indicators,
        }))
      }
      itemKey={(spec) => spec.id}
      itemAttrs={() => ({ 'aria-disabled': full || undefined })}
      renderItem={(spec) => (
        <>
          <span className={styles.name}>{spec.name}</span>
          <span className={styles.short}>{spec.shortName}</span>
        </>
      )}
      onPick={(spec) => {
        if (full) return;
        addIndicator(spec);
        close();
      }}
      onClose={close}
      notice={
        full && (
          <p className={styles.notice} role="status">
            The chart has {MAX_INSTANCES} indicators, the maximum. Remove one to add another.
          </p>
        )
      }
      status={(query, count) => {
        if (registry.isPending) return 'Loading indicators…';
        if (registry.isError)
          return 'Could not load the indicator list. Check that the backend is running.';
        return count === 0 ? `No indicator matches “${query.trim()}”.` : null;
      }}
    />
  );
}
