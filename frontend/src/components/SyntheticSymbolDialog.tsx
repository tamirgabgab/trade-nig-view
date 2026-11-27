import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { getSynthetic } from '../api/synthetic.ts';
import { useUiStore } from '../store/uiStore.ts';
import { ModalShell } from './ModalShell.tsx';
import { SyntheticForm } from './SyntheticForm.tsx';
import styles from './SyntheticSymbolDialog.module.css';
import { usePresence } from './usePresence.ts';

/** Create or edit a synthetic symbol (opened from the symbol search, the legend or the
 *  watchlist): its definition, and, for a stored one, Save as copy and Delete. */
export function SyntheticSymbolDialog() {
  const modal = useUiStore((s) =>
    s.modal === 'synthetic' || s.modal === 'syntheticDelete' ? s.modal : null,
  );
  const seed = useUiStore((s) => s.symbolSeed);
  const closeModal = useUiStore((s) => s.closeModal);
  // Stable while open: a new object every render would reopen the dialog forever.
  const request = useMemo(() => (modal === null ? null : { modal, symbol: seed }), [modal, seed]);
  const { shown, attrs, key } = usePresence(request);
  const symbol = shown?.symbol ?? '';
  const stored = useQuery({
    queryKey: ['synthetic', symbol],
    queryFn: ({ signal }) => getSynthetic(symbol, signal),
    enabled: symbol !== '',
    // Never from a cache: the form starts from what is stored now (or a save would undo an edit).
    gcTime: 0,
  });

  if (shown === null) return null;
  const close = () => {
    closeModal(shown.modal);
  };
  return (
    <ModalShell
      key={key}
      title={symbol === '' ? 'New synthetic symbol' : `Edit ${symbol}`}
      attrs={attrs}
      onClose={close}
      className={styles.dialog}
    >
      {symbol !== '' && stored.error !== null ? (
        <p className={styles.error} role="alert">
          {stored.error.message}
        </p>
      ) : symbol !== '' && stored.data === undefined ? (
        <p className={styles.hint}>Loading…</p>
      ) : (
        <SyntheticForm
          stored={symbol === '' ? null : (stored.data ?? null)}
          deleteFirst={shown.modal === 'syntheticDelete'}
          onClose={close}
        />
      )}
    </ModalShell>
  );
}
